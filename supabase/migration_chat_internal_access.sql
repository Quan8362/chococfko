-- ============================================================
-- CHỢ CÓC FKO — Chat: Community vs FKO-Internal scope separation
--
-- Extends the community/fko_internal model (migration_internal_access.sql)
-- to the Chat system. Scope lives on the PARENT (room / DM conversation);
-- every message + child row inherits it via SECURITY DEFINER helpers in RLS.
--
-- Run AFTER migration_internal_access.sql in the Supabase SQL Editor.
-- Safe to run repeatedly (idempotent). Never deletes rooms/messages/members.
--
-- Order:
--   1. community_scope on community_chat_rooms (+ backfill existing -> fko_internal)
--   2. community_scope on community_dm_conversations (+ backfill -> fko_internal)
--   3. Room key uniqueness -> (community_scope, key)
--   4. Seed CLEAN community rooms (no employee history)
--   5. SECURITY DEFINER access helpers
--   6. Scope-immutability trigger
--   7. RLS rewrite for every chat table (scope + membership gated)
--   8. Storage: lock private attachment buckets to owner-only reads
--   9. Self-verification NOTICEs
-- ============================================================

-- Hard requirement: the internal-access primitives must already exist.
do $$ begin
  if to_regprocedure('public.is_fko_internal_member(uuid)') is null then
    raise exception '[chat_internal] is_fko_internal_member(uuid) missing — run migration_internal_access.sql first';
  end if;
end $$;


-- ── 1. community_scope on rooms ─────────────────────────────
-- Same safe backfill as confessions/marketplace: existing employee rooms become
-- fko_internal; brand-new rooms default to community.
alter table public.community_chat_rooms add column if not exists community_scope text;
update public.community_chat_rooms set community_scope = 'fko_internal' where community_scope is null;
alter table public.community_chat_rooms alter column community_scope set default 'community';
do $$ begin
  alter table public.community_chat_rooms
    add constraint community_chat_rooms_scope_check
    check (community_scope in ('community','fko_internal'));
exception when duplicate_object then null; end $$;
alter table public.community_chat_rooms alter column community_scope set not null;
create index if not exists community_chat_rooms_scope_active_idx
  on public.community_chat_rooms(community_scope, is_active, sort_order);


-- ── 2. community_scope on DM conversations ──────────────────
-- Existing employee DMs stay internal. New pairs default to community.
alter table public.community_dm_conversations add column if not exists community_scope text;
update public.community_dm_conversations set community_scope = 'fko_internal' where community_scope is null;
alter table public.community_dm_conversations alter column community_scope set default 'community';
do $$ begin
  alter table public.community_dm_conversations
    add constraint community_dm_conv_scope_check
    check (community_scope in ('community','fko_internal'));
exception when duplicate_object then null; end $$;
alter table public.community_dm_conversations alter column community_scope set not null;
create index if not exists community_dm_conv_scope_idx
  on public.community_dm_conversations(community_scope);


-- ── 3. Room key uniqueness -> (community_scope, key) ────────
-- The original UNIQUE was on key alone, so a community room could not reuse the
-- clean keys ('general'/'food'/...) that the internal rooms hold. Make the key
-- unique PER SCOPE so the same key (and its UI emoji / i18n label) works in both
-- tabs. Drop any single-column unique on key, then add the composite.
do $$
declare r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'community_chat_rooms'
      and con.contype = 'u'
      and array_length(con.conkey, 1) = 1
      and (
        select attname from pg_attribute
        where attrelid = con.conrelid and attnum = con.conkey[1]
      ) = 'key'
  loop
    execute format('alter table public.community_chat_rooms drop constraint %I', r.conname);
  end loop;
end $$;
do $$ begin
  alter table public.community_chat_rooms
    add constraint community_chat_rooms_scope_key_uniq unique (community_scope, key);
exception when duplicate_object then null; when duplicate_table then null; end $$;


-- ── 4. Seed CLEAN community rooms ───────────────────────────
-- Fresh UUIDs, community scope, no employee message history.
insert into public.community_chat_rooms (key, name, sort_order, is_active, is_private, community_scope)
values
  ('general', 'Chat chung', 0, true, false, 'community'),
  ('food',    'Ăn uống',    1, true, false, 'community'),
  ('travel',  'Du lịch',    2, true, false, 'community'),
  ('games',   'Mini Game',  3, true, false, 'community'),
  ('help',    'Hỏi đáp',    4, true, false, 'community')
on conflict (community_scope, key) do nothing;


-- ── 5. Access helpers (SECURITY DEFINER) ────────────────────
-- These run with the owner's rights, so the EXISTS lookups on rooms/members
-- inside them do NOT recurse into the RLS policies below (same pattern as
-- can_access_listing in migration_internal_access.sql).

-- A room is accessible when its scope is allowed AND, if private, the caller is
-- an actual member. Inactive rooms are never accessible.
create or replace function public.can_access_chat_room(p_room_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.community_chat_rooms r
    where r.id = p_room_id
      and r.is_active = true
      and (r.community_scope = 'community' or public.is_fko_internal_member(auth.uid()))
      and (
        r.is_private = false
        or exists (
          select 1 from public.community_chat_room_members m
          where m.room_id = r.id and m.user_id = auth.uid()
        )
      )
  );
$$;
revoke all on function public.can_access_chat_room(uuid) from public;
grant execute on function public.can_access_chat_room(uuid) to anon, authenticated, service_role;

-- Message-level gate (used by reaction/report/poll children that key off a message).
create or replace function public.can_access_chat_message(p_message_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.community_chat_messages msg
    where msg.id = p_message_id
      and public.can_access_chat_room(msg.room_id)
  );
$$;
revoke all on function public.can_access_chat_message(uuid) from public;
grant execute on function public.can_access_chat_message(uuid) to anon, authenticated, service_role;

-- Poll-level gate (poll options / votes derive access through the poll's message).
create or replace function public.can_access_chat_poll(p_poll_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.community_chat_polls p
    where p.id = p_poll_id
      and public.can_access_chat_message(p.message_id)
  );
$$;
revoke all on function public.can_access_chat_poll(uuid) from public;
grant execute on function public.can_access_chat_poll(uuid) to anon, authenticated, service_role;

-- A DM conversation is accessible when the caller is a participant AND the scope
-- is allowed. A revoked internal member fails the scope test on an internal DM.
create or replace function public.can_access_dm_conversation(p_conv_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.community_dm_conversations c
    where c.id = p_conv_id
      and (c.user1_id = auth.uid() or c.user2_id = auth.uid())
      and (c.community_scope = 'community' or public.is_fko_internal_member(auth.uid()))
  );
$$;
revoke all on function public.can_access_dm_conversation(uuid) from public;
grant execute on function public.can_access_dm_conversation(uuid) to anon, authenticated, service_role;


-- ── 6. Scope-immutability trigger ───────────────────────────
-- A normal/internal user may never move a room or DM between scopes. The admin
-- workflow uses the service-role client (auth.uid() IS NULL) and is allowed.
create or replace function public.chat_prevent_scope_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.community_scope is distinct from old.community_scope
     and auth.uid() is not null then
    raise exception 'community_scope is immutable for non-admin callers';
  end if;
  return new;
end;
$$;

drop trigger if exists chat_rooms_scope_lock on public.community_chat_rooms;
create trigger chat_rooms_scope_lock
  before update on public.community_chat_rooms
  for each row execute function public.chat_prevent_scope_change();

drop trigger if exists chat_dm_scope_lock on public.community_dm_conversations;
create trigger chat_dm_scope_lock
  before update on public.community_dm_conversations
  for each row execute function public.chat_prevent_scope_change();


-- ── 7. RLS rewrite ──────────────────────────────────────────
-- Wipe every existing policy on the chat tables (permissive policies are OR'd,
-- so a leftover open SELECT would defeat the gate) and recreate the scoped set.
do $$
declare t text; r record;
begin
  foreach t in array array[
    'community_chat_rooms','community_chat_messages','community_chat_room_members',
    'community_chat_reactions','community_chat_reports','community_chat_read_states',
    'community_chat_mentions','community_chat_attachments','community_chat_polls',
    'community_chat_poll_options','community_chat_poll_votes',
    'community_dm_conversations','community_dm_messages','community_dm_reactions'
  ] loop
    if to_regclass('public.'||t) is not null then
      execute format('alter table public.%I enable row level security', t);
      for r in select policyname from pg_policies where schemaname='public' and tablename=t loop
        execute format('drop policy if exists %I on public.%I', r.policyname, t);
      end loop;
    end if;
  end loop;
end $$;

-- rooms: hide internal rooms + non-member private rooms.
create policy "chat_rooms_select" on public.community_chat_rooms
  for select to authenticated
  using (
    is_active = true
    and (community_scope = 'community' or public.is_fko_internal_member(auth.uid()))
    and (
      is_private = false
      or exists (
        select 1 from public.community_chat_room_members m
        where m.room_id = community_chat_rooms.id and m.user_id = auth.uid()
      )
    )
  );
create policy "chat_rooms_insert" on public.community_chat_rooms
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and (community_scope = 'community' or public.is_fko_internal_member(auth.uid()))
  );

-- messages: read/write only in accessible rooms; cannot move a message's room.
create policy "chat_messages_select" on public.community_chat_messages
  for select to authenticated
  using (is_deleted = false and public.can_access_chat_room(room_id));
create policy "chat_messages_insert" on public.community_chat_messages
  for insert to authenticated
  with check (user_id = auth.uid() and public.can_access_chat_room(room_id));
create policy "chat_messages_update_own" on public.community_chat_messages
  for update to authenticated
  using (user_id = auth.uid() and public.can_access_chat_room(room_id))
  with check (user_id = auth.uid() and public.can_access_chat_room(room_id));

-- room_members: always see your OWN membership; see co-members of rooms you can
-- access. Writes go through the service-role room-actions (bypass RLS).
create policy "chat_members_select" on public.community_chat_room_members
  for select to authenticated
  using (user_id = auth.uid() or public.can_access_chat_room(room_id));

-- reactions: gated through the parent message's room.
create policy "chat_reactions_select" on public.community_chat_reactions
  for select to authenticated
  using (public.can_access_chat_message(message_id));
create policy "chat_reactions_insert" on public.community_chat_reactions
  for insert to authenticated
  with check (user_id = auth.uid() and public.can_access_chat_message(message_id));
create policy "chat_reactions_delete_own" on public.community_chat_reactions
  for delete to authenticated
  using (user_id = auth.uid());

-- reports: insert own for an accessible message; read own.
create policy "chat_reports_select_own" on public.community_chat_reports
  for select to authenticated
  using (reporter_id = auth.uid());
create policy "chat_reports_insert" on public.community_chat_reports
  for insert to authenticated
  with check (reporter_id = auth.uid() and public.can_access_chat_message(message_id));

-- read_states: own rows only, and only for rooms you can access (no internal
-- last-seen rows can be created by a community user).
create policy "chat_read_states_select_own" on public.community_chat_read_states
  for select to authenticated
  using (user_id = auth.uid());
create policy "chat_read_states_insert_own" on public.community_chat_read_states
  for insert to authenticated
  with check (user_id = auth.uid() and public.can_access_chat_room(room_id));
create policy "chat_read_states_update_own" on public.community_chat_read_states
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.can_access_chat_room(room_id));

-- mentions: read/mark-read your own, only in accessible rooms; insert by the
-- sender for an accessible room.
create policy "chat_mentions_select_own" on public.community_chat_mentions
  for select to authenticated
  using (mentioned_user_id = auth.uid() and public.can_access_chat_room(room_id));
create policy "chat_mentions_update_own" on public.community_chat_mentions
  for update to authenticated
  using (mentioned_user_id = auth.uid())
  with check (mentioned_user_id = auth.uid());
create policy "chat_mentions_insert" on public.community_chat_mentions
  for insert to authenticated
  with check (mentioned_by = auth.uid() and public.can_access_chat_room(room_id));

-- attachments: carry room_id directly -> gate on it.
create policy "chat_attachments_select" on public.community_chat_attachments
  for select to authenticated
  using (public.can_access_chat_room(room_id));
create policy "chat_attachments_insert" on public.community_chat_attachments
  for insert to authenticated
  with check (public.can_access_chat_room(room_id));

-- polls / options / votes: derive access through the poll's message.
create policy "chat_polls_select" on public.community_chat_polls
  for select to authenticated
  using (public.can_access_chat_message(message_id));
create policy "chat_polls_insert" on public.community_chat_polls
  for insert to authenticated
  with check (public.can_access_chat_message(message_id));

create policy "chat_poll_options_select" on public.community_chat_poll_options
  for select to authenticated
  using (public.can_access_chat_poll(poll_id));
create policy "chat_poll_options_insert" on public.community_chat_poll_options
  for insert to authenticated
  with check (public.can_access_chat_poll(poll_id));

create policy "chat_poll_votes_select" on public.community_chat_poll_votes
  for select to authenticated
  using (public.can_access_chat_poll(poll_id));
create policy "chat_poll_votes_insert" on public.community_chat_poll_votes
  for insert to authenticated
  with check (user_id = auth.uid() and public.can_access_chat_poll(poll_id));
create policy "chat_poll_votes_delete_own" on public.community_chat_poll_votes
  for delete to authenticated
  using (user_id = auth.uid());

-- DM conversations: participant + scope. An internal DM requires BOTH users be
-- active internal members; the scope-lock trigger blocks scope flips.
create policy "chat_dm_conv_select" on public.community_dm_conversations
  for select to authenticated
  using (
    (user1_id = auth.uid() or user2_id = auth.uid())
    and (community_scope = 'community' or public.is_fko_internal_member(auth.uid()))
  );
create policy "chat_dm_conv_insert" on public.community_dm_conversations
  for insert to authenticated
  with check (
    (user1_id = auth.uid() or user2_id = auth.uid())
    and user1_id <> user2_id
    and user1_id < user2_id
    and (
      community_scope = 'community'
      or (public.is_fko_internal_member(user1_id) and public.is_fko_internal_member(user2_id))
    )
  );
create policy "chat_dm_conv_update" on public.community_dm_conversations
  for update to authenticated
  using (user1_id = auth.uid() or user2_id = auth.uid())
  with check (user1_id = auth.uid() or user2_id = auth.uid());

-- DM messages: gated through the conversation.
create policy "chat_dm_msg_select" on public.community_dm_messages
  for select to authenticated
  using (is_deleted = false and public.can_access_dm_conversation(conversation_id));
create policy "chat_dm_msg_insert" on public.community_dm_messages
  for insert to authenticated
  with check (sender_id = auth.uid() and public.can_access_dm_conversation(conversation_id));

-- DM reactions: gated through the conversation; delete only your own.
create policy "chat_dm_react_select" on public.community_dm_reactions
  for select to authenticated
  using (public.can_access_dm_conversation(conversation_id));
create policy "chat_dm_react_insert" on public.community_dm_reactions
  for insert to authenticated
  with check (user_id = auth.uid() and public.can_access_dm_conversation(conversation_id));
create policy "chat_dm_react_delete_own" on public.community_dm_reactions
  for delete to authenticated
  using (user_id = auth.uid());


-- ── 8. Storage: lock private attachment buckets ─────────────
-- Previously these buckets allowed ANY authenticated user to mint a signed URL
-- (path-guessing risk). Restrict direct reads to the file OWNER; all cross-user
-- viewing goes through an access-checked server action that mints via the
-- service-role client. The attachment ROW RLS above already prevents a community
-- user from ever learning an internal file's path.
drop policy if exists "authenticated can view chat images" on storage.objects;
drop policy if exists "chat_images_owner_read" on storage.objects;
create policy "chat_images_owner_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'community-chat-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "authenticated can view chat files" on storage.objects;
drop policy if exists "chat_files_owner_read" on storage.objects;
create policy "chat_files_owner_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'community-chat-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "cca_owner_read" on storage.objects;
create policy "cca_owner_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'community-chat-audio'
    and (storage.foldername(name))[1] = auth.uid()::text
  );


-- ── 9. Self-verification (informational NOTICEs) ────────────
do $$
declare
  v_rooms_total    bigint;
  v_rooms_internal bigint;
  v_rooms_comm     bigint;
  v_dm_total       bigint;
  v_dm_internal    bigint;
begin
  select count(*) into v_rooms_total    from public.community_chat_rooms;
  select count(*) into v_rooms_internal from public.community_chat_rooms where community_scope = 'fko_internal';
  select count(*) into v_rooms_comm     from public.community_chat_rooms where community_scope = 'community';
  select count(*) into v_dm_total       from public.community_dm_conversations;
  select count(*) into v_dm_internal    from public.community_dm_conversations where community_scope = 'fko_internal';

  raise notice '[chat_internal] rooms: total=% internal=% community=%', v_rooms_total, v_rooms_internal, v_rooms_comm;
  raise notice '[chat_internal] dm_conversations: total=% internal=%', v_dm_total, v_dm_internal;
end $$;

notify pgrst, 'reload schema';
-- ── DONE ────────────────────────────────────────────────────
