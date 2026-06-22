-- ============================================================
-- CHỢ CÓC FKO — Explore Platform Phase 6
-- Hỏi–đáp theo địa điểm + báo cáo thông tin + "đã ghé".
--
-- TÁI SỬ DỤNG hệ thống bình luận sẵn có: MỞ RỘNG public.place_comments thay vì
-- tạo nền tảng bình luận mới. kind phân biệt comment/question/answer; answer trỏ
-- tới question qua parent_id; helpful đánh dấu câu trả lời hữu ích.
--
-- Báo cáo thông tin (place_reports) KHÔNG sửa dữ liệu địa điểm — chỉ là HÀNG ĐỢI
-- để Admin duyệt rồi tự áp dụng. "Đã ghé" (place_visits) chống spam bằng PK.
--
-- AN TOÀN: chỉ THÊM cột/bảng (idempotent). ROLLBACK ở cuối file.
-- ============================================================

-- ── 1) Mở rộng place_comments thành Q&A ────────────────────────────
alter table public.place_comments add column if not exists kind text not null default 'comment';
alter table public.place_comments add column if not exists parent_id uuid references public.place_comments(id) on delete cascade;
alter table public.place_comments add column if not exists helpful boolean not null default false;
alter table public.place_comments add column if not exists helpful_marked_by uuid;

alter table public.place_comments drop constraint if exists place_comments_kind_check;
alter table public.place_comments add  constraint place_comments_kind_check
  check (kind in ('comment', 'question', 'answer'));

create index if not exists place_comments_kind_idx on public.place_comments (place_slug, kind, created_at);
create index if not exists place_comments_parent_idx on public.place_comments (parent_id);

-- Recreate the author view to expose the new columns. DROP first: CREATE OR
-- REPLACE cannot reorder/insert columns before existing ones (would try to rename
-- author_name → kind → error 42P16). Dropping + recreating is safe & idempotent.
drop view if exists public.place_comments_with_author;
create view public.place_comments_with_author
  with (security_invoker = true)
as
  select
    c.id, c.place_slug, c.user_id, c.content, c.status, c.created_at,
    c.kind, c.parent_id, c.helpful, c.helpful_marked_by,
    pr.display_name as author_name,
    pr.avatar_url   as author_avatar
  from public.place_comments c
  left join public.profiles pr on pr.id = c.user_id;

-- ── 2) place_reports — phản hồi thông tin có cấu trúc (hàng đợi duyệt) ──
create table if not exists public.place_reports (
  id          uuid        primary key default gen_random_uuid(),
  place_slug  text        not null,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  kind        text        not null,
  detail      text,
  status      text        not null default 'pending'
                check (status in ('pending', 'resolved', 'rejected')),
  admin_note  text,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at  timestamptz not null default now(),
  constraint place_reports_kind_check check (kind in (
    'price_changed','hours_changed','temporarily_closed','permanently_closed',
    'reservation_invalid','wrong_address','wrong_map','facility_incorrect','image_outdated','other'
  ))
);

create index if not exists place_reports_status_idx on public.place_reports (status, created_at desc);
create index if not exists place_reports_slug_idx   on public.place_reports (place_slug);

alter table public.place_reports enable row level security;

-- Người dùng tạo & xem báo cáo CỦA MÌNH; Admin đọc/duyệt qua service role (bypass RLS).
drop policy if exists "place_reports_insert_own" on public.place_reports;
create policy "place_reports_insert_own" on public.place_reports for insert
  with check (auth.uid() = user_id);
drop policy if exists "place_reports_select_own" on public.place_reports;
create policy "place_reports_select_own" on public.place_reports for select
  using (auth.uid() = user_id);

-- ── 3) place_visits — "tôi đã ghé" (chống lặp bằng PK) ──────────────
create table if not exists public.place_visits (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  place_slug text        not null,
  created_at timestamptz not null default now(),
  primary key (user_id, place_slug)   -- 1 user / 1 place: chống spam lặp
);
create index if not exists place_visits_slug_idx on public.place_visits (place_slug);

alter table public.place_visits enable row level security;

-- Chỉ chủ sở hữu thấy bản ghi ghé thăm của mình (KHÔNG lộ user/ngày cho người khác).
-- Tổng số "đã ghé" công khai lấy qua server action service-role (chỉ trả về count).
drop policy if exists "place_visits_insert_own" on public.place_visits;
create policy "place_visits_insert_own" on public.place_visits for insert with check (auth.uid() = user_id);
drop policy if exists "place_visits_select_own" on public.place_visits;
create policy "place_visits_select_own" on public.place_visits for select using (auth.uid() = user_id);
drop policy if exists "place_visits_delete_own" on public.place_visits;
create policy "place_visits_delete_own" on public.place_visits for delete using (auth.uid() = user_id);

notify pgrst, 'reload schema';

-- ROLLBACK:
--   drop table if exists public.place_visits;
--   drop table if exists public.place_reports;
--   alter table public.place_comments drop column if exists helpful_marked_by, drop column if exists helpful,
--     drop column if exists parent_id, drop column if exists kind;
