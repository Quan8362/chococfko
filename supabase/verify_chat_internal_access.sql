-- ============================================================
-- VERIFY — Chat community/fko_internal scope separation
-- Run AFTER migration_chat_internal_access.sql. Read-only; re-runnable.
-- Raises on any hard invariant violation; otherwise prints a summary.
-- ============================================================

do $$
declare
  v_missing_scope    bigint;
  v_comm_rooms       bigint;
  v_dm_missing_scope bigint;
  v_helper           int;
  v_trigger          int;
  v_msg_open_policy  int;
  v_rooms_total      bigint;
  v_rooms_internal   bigint;
  v_rooms_comm       bigint;
  v_dm_total         bigint;
  v_dm_internal      bigint;
begin
  -- 1. Every room has a scope; the 5 clean community rooms exist.
  select count(*) into v_missing_scope from public.community_chat_rooms where community_scope is null;
  if v_missing_scope > 0 then
    raise exception '[verify] % room(s) have NULL community_scope', v_missing_scope;
  end if;

  select count(*) into v_comm_rooms
  from public.community_chat_rooms
  where community_scope = 'community'
    and key in ('general','food','travel','games','help')
    and is_private = false;
  if v_comm_rooms < 5 then
    raise exception '[verify] expected 5 clean community rooms, found %', v_comm_rooms;
  end if;

  -- 2. Every DM conversation has a scope.
  select count(*) into v_dm_missing_scope from public.community_dm_conversations where community_scope is null;
  if v_dm_missing_scope > 0 then
    raise exception '[verify] % DM conversation(s) have NULL community_scope', v_dm_missing_scope;
  end if;

  -- 3. Access helpers + scope-lock triggers present.
  if to_regprocedure('public.can_access_chat_room(uuid)') is null then
    raise exception '[verify] can_access_chat_room(uuid) missing';
  end if;
  if to_regprocedure('public.can_access_dm_conversation(uuid)') is null then
    raise exception '[verify] can_access_dm_conversation(uuid) missing';
  end if;

  select count(*) into v_trigger from pg_trigger
  where tgname in ('chat_rooms_scope_lock','chat_dm_scope_lock') and not tgisinternal;
  if v_trigger < 2 then
    raise exception '[verify] scope-lock triggers missing (found %)', v_trigger;
  end if;

  -- 4. No leftover wide-open message SELECT policy (the pre-migration gap).
  select count(*) into v_msg_open_policy from pg_policies
  where schemaname = 'public'
    and tablename = 'community_chat_messages'
    and cmd = 'SELECT'
    and qual = '(is_deleted = false)';
  if v_msg_open_policy > 0 then
    raise exception '[verify] open message SELECT policy still present — RLS not hardened';
  end if;

  -- Summary
  select count(*) into v_rooms_total    from public.community_chat_rooms;
  select count(*) into v_rooms_internal from public.community_chat_rooms where community_scope = 'fko_internal';
  select count(*) into v_rooms_comm     from public.community_chat_rooms where community_scope = 'community';
  select count(*) into v_dm_total       from public.community_dm_conversations;
  select count(*) into v_dm_internal    from public.community_dm_conversations where community_scope = 'fko_internal';

  raise notice '[verify] OK — rooms total=% internal=% community=%', v_rooms_total, v_rooms_internal, v_rooms_comm;
  raise notice '[verify] OK — dm total=% internal=%', v_dm_total, v_dm_internal;
  raise notice '[verify] OK — helpers + % scope-lock trigger(s) present, message RLS hardened', v_trigger;
end $$;

-- Per-table policy inventory (eyeball that each chat table has gated policies).
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename like 'community_chat_%' or tablename like 'community_dm_%'
order by tablename, cmd, policyname;
