-- ============================================================
-- CHỢ CÓC FKO — Explore Platform Phase 2
-- Intent-based search & practical filters
--
-- 1) places.created_at   — cho sort "Mới thêm" + lọc "Mới cập nhật".
-- 2) search_concepts.maps_to — ánh xạ khái niệm → bộ lọc/thuộc tính (Admin).
-- 3) search_queries      — log truy vấn (privacy-safe) để Admin phân tích:
--    zero-result, unmatched, low click-through. KHÔNG lưu toạ độ GPS chính xác.
--
-- AN TOÀN: chỉ THÊM (idempotent). Không sửa/xoá dữ liệu cũ. RLS đầy đủ.
-- ROLLBACK:
--   ALTER TABLE public.places DROP COLUMN IF EXISTS created_at;
--   ALTER TABLE public.search_concepts DROP COLUMN IF EXISTS maps_to;
--   DROP TABLE IF EXISTS public.search_queries;
-- ============================================================

-- ── 1) created_at trên places ──────────────────────────────────────
alter table public.places add column if not exists created_at timestamptz default now();
-- Backfill: dùng updated_at nếu có, nếu không thì now() (không bịa quá khứ).
update public.places
   set created_at = coalesce(created_at, updated_at, now())
 where created_at is null;
create index if not exists places_created_at_idx on public.places (created_at desc);

-- ── 2) maps_to trên search_concepts ────────────────────────────────
-- {filter:'parking'|'open_now'|'children'|..., value?:..., attribute?:'...'} —
-- cho phép Admin gắn 1 khái niệm vào 1 BỘ LỌC có cấu trúc (ngoài alias text).
alter table public.search_concepts add column if not exists maps_to jsonb;

-- ── 3) search_queries (analytics truy vấn) ─────────────────────────
create table if not exists public.search_queries (
  id                   uuid PRIMARY KEY default gen_random_uuid(),
  raw_query            text,                         -- chuỗi người dùng gõ
  normalized_query     text,                         -- đã chuẩn hoá (gộp biến thể)
  locale               text,
  result_count         integer NOT NULL default 0,
  has_results          boolean NOT NULL default false,
  -- bộ lọc đang bật (KHÔNG chứa toạ độ; "nearby" chỉ là cờ boolean).
  filters              jsonb,
  -- ý định trích xuất được (để chẩn đoán intent), KHÔNG chứa toạ độ.
  intent               jsonb,
  -- 1 nếu người dùng mở 1 kết quả sau truy vấn (đo click-through ở mức tổng hợp).
  clicked              boolean NOT NULL default false,
  user_id              uuid,
  anonymous_visitor_id text,
  session_id           text,
  created_at           timestamptz NOT NULL default now()
);

create index if not exists search_queries_created_idx   on public.search_queries (created_at desc);
create index if not exists search_queries_zero_idx      on public.search_queries (has_results, created_at desc);
create index if not exists search_queries_norm_idx      on public.search_queries (normalized_query);

alter table public.search_queries enable row level security;

-- INSERT mở cho mọi client (như analytics_events). KHÔNG có policy SELECT cho
-- anon/authenticated → Admin đọc bằng service role (bypass RLS).
drop policy if exists "search_queries_insert" on public.search_queries;
create policy "search_queries_insert"
  on public.search_queries for insert
  with check (true);

-- Cho phép cập nhật cờ clicked theo session (đánh dấu click-through) — chỉ cột
-- này; không lộ dữ liệu (không có SELECT). An toàn: chỉ set clicked=true.
drop policy if exists "search_queries_mark_clicked" on public.search_queries;
create policy "search_queries_mark_clicked"
  on public.search_queries for update
  using (true) with check (true);

notify pgrst, 'reload schema';
