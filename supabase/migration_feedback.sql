-- migration_feedback.sql
-- Bảng lưu góp ý người dùng từ trang /feedback.
-- Nguồn sự thật (source of truth) cho góp ý — email (Resend) chỉ là kênh thông báo best-effort.
-- An toàn để chạy lại nhiều lần (idempotent).

create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text not null,
  message     text not null,
  type        text not null default 'general',   -- 'general' | 'feature' | 'bug'
  user_id     uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- Thêm cột nếu bảng đã tồn tại từ phiên bản cũ (chỉ có name/email/message)
alter table public.feedback add column if not exists type    text not null default 'general';
alter table public.feedback add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists feedback_created_at_idx on public.feedback (created_at desc);
create index if not exists feedback_type_idx       on public.feedback (type);

-- RLS bật, KHÔNG mở policy nào cho anon/authenticated.
-- Mọi thao tác đọc/ghi đi qua service-role client (createAdminClient) — service role bypass RLS.
-- => Người dùng thường không thể đọc email của người khác qua API công khai.
alter table public.feedback enable row level security;

-- Dọn policy cũ (nếu migration trước đã tạo) để khóa hoàn toàn bảng với client công khai.
drop policy if exists "Anyone can insert feedback" on public.feedback;
drop policy if exists "Admins can read feedback"   on public.feedback;
