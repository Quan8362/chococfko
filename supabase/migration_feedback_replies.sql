-- migration_feedback_replies.sql
-- Thêm trạng thái xử lý cho góp ý + bảng lưu lịch sử phản hồi của admin.
-- Additive, an toàn chạy lại nhiều lần (idempotent). Chạy SAU migration_feedback.sql.

-- 1) Trạng thái xử lý trên bảng feedback: 'new' (Mới) | 'replied' (Đã trả lời)
alter table public.feedback add column if not exists status text not null default 'new';

create index if not exists feedback_status_idx on public.feedback (status);

-- 2) Bảng lưu phản hồi của admin (cho phép nhiều phản hồi / 1 góp ý)
create table if not exists public.feedback_replies (
  id           uuid primary key default gen_random_uuid(),
  feedback_id  uuid not null references public.feedback(id) on delete cascade,
  message      text not null,
  admin_email  text,                 -- email admin đã gửi phản hồi
  created_at   timestamptz not null default now()
);

create index if not exists feedback_replies_feedback_idx
  on public.feedback_replies (feedback_id, created_at desc);

-- RLS bật, KHÔNG mở policy công khai. Mọi thao tác qua service-role (createAdminClient).
alter table public.feedback_replies enable row level security;
