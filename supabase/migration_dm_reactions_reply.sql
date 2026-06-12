-- ============================================================
-- CHỢ CÓC FKO — DM: reaction + reply + xoá + sửa (feature parity với chat nhóm)
-- Chạy trong Supabase SQL Editor. Idempotent.
-- ============================================================

-- ── 1. Cột reply cho DM messages ────────────────────────────
alter table public.community_dm_messages
  add column if not exists reply_to_id           uuid references public.community_dm_messages(id) on delete set null,
  add column if not exists reply_to_message      text,
  add column if not exists reply_to_display_name text;

-- ── 2. Cho phép SELECT cả tin đã xoá (để realtime UPDATE is_deleted
--      lan tới client kia — RLS cũ chặn is_deleted=false nên xoá không
--      đồng bộ). App vẫn lọc/ẩn tin đã xoá khi load & ở handler realtime.
drop policy if exists "dm_msg_select" on public.community_dm_messages;
create policy "dm_msg_select"
  on public.community_dm_messages for select to authenticated
  using (
    exists (
      select 1 from public.community_dm_conversations c
      where c.id = conversation_id
        and (c.user1_id = auth.uid() or c.user2_id = auth.uid())
    )
  );

-- (Xoá/sửa thực hiện qua service-role trong server action sau khi đã
--  kiểm tra quyền sở hữu, nên không cần policy UPDATE cho authenticated.)

-- ── 3. Bảng reaction cho DM ─────────────────────────────────
create table if not exists public.community_dm_reactions (
  id              uuid        primary key default gen_random_uuid(),
  message_id      uuid        not null references public.community_dm_messages(id) on delete cascade,
  conversation_id uuid        not null references public.community_dm_conversations(id) on delete cascade,
  user_id         uuid        not null references auth.users(id) on delete cascade,
  emoji           text        not null,
  created_at      timestamptz not null default now(),
  constraint dm_reaction_unique unique (message_id, user_id, emoji)
);

create index if not exists idx_dm_reaction_msg  on public.community_dm_reactions(message_id);
create index if not exists idx_dm_reaction_conv on public.community_dm_reactions(conversation_id);

alter table public.community_dm_reactions enable row level security;

-- Chỉ thành viên của cuộc trò chuyện được xem reaction
drop policy if exists "dm_reaction_select" on public.community_dm_reactions;
create policy "dm_reaction_select"
  on public.community_dm_reactions for select to authenticated
  using (
    exists (
      select 1 from public.community_dm_conversations c
      where c.id = conversation_id
        and (c.user1_id = auth.uid() or c.user2_id = auth.uid())
    )
  );

-- Tự thả reaction của chính mình (phải là thành viên)
drop policy if exists "dm_reaction_insert" on public.community_dm_reactions;
create policy "dm_reaction_insert"
  on public.community_dm_reactions for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.community_dm_conversations c
      where c.id = conversation_id
        and (c.user1_id = auth.uid() or c.user2_id = auth.uid())
    )
  );

-- Tự gỡ reaction của chính mình
drop policy if exists "dm_reaction_delete" on public.community_dm_reactions;
create policy "dm_reaction_delete"
  on public.community_dm_reactions for delete to authenticated
  using (user_id = auth.uid());

NOTIFY pgrst, 'reload schema';
