-- ── COMMUNITY GROUP CHAT ─────────────────────────────────────────────────────
-- Phase 1: bảng tin nhắn + RLS + Realtime
-- Run this migration in Supabase SQL Editor

-- 1. Bảng tin nhắn
create table if not exists public.community_chat_messages (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        references auth.users(id) on delete set null,
  display_name text        not null,
  avatar_url   text,
  message      text        not null,
  is_deleted   boolean     not null default false,
  created_at   timestamptz not null default now(),

  constraint community_chat_msg_length
    check (char_length(trim(message)) between 1 and 500)
);

-- 2. Indexes
create index if not exists community_chat_created_idx
  on public.community_chat_messages (created_at desc);

create index if not exists community_chat_user_idx
  on public.community_chat_messages (user_id);

create index if not exists community_chat_deleted_idx
  on public.community_chat_messages (is_deleted);

-- 3. Row Level Security
alter table public.community_chat_messages enable row level security;

-- SELECT: chỉ authenticated user xem được tin nhắn chưa bị xóa
-- Anonymous user hoàn toàn không SELECT được
drop policy if exists "community_chat_select" on public.community_chat_messages;
create policy "community_chat_select"
  on public.community_chat_messages
  for select
  to authenticated
  using (is_deleted = false);

-- INSERT: chỉ authenticated user gửi được, phải là chính mình
drop policy if exists "community_chat_insert" on public.community_chat_messages;
create policy "community_chat_insert"
  on public.community_chat_messages
  for insert
  to authenticated
  with check (user_id = auth.uid());

-- Không có policy UPDATE/DELETE cho user thường.
-- Admin soft-delete sẽ dùng createAdminClient() (service role) ở phase sau — bypass RLS.

-- 4. Realtime
-- Dùng DO block để không fail nếu bảng đã có trong publication
do $$
begin
  alter publication supabase_realtime add table public.community_chat_messages;
exception when others then
  -- Bảng đã có trong publication hoặc publication không tồn tại — bỏ qua
  null;
end;
$$;

notify pgrst, 'reload schema';
