-- ============================================================
-- CHỢ CÓC FKO — Hệ thống Tags (tái sử dụng cho mọi loại nội dung)
-- Chạy toàn bộ file này trong Supabase Dashboard → SQL Editor.
-- Idempotent: dùng IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS.
-- ============================================================
--
-- Mô hình chuẩn hoá, dùng chung cho nhiều loại nội dung qua bảng join
-- đa hình (content_tags). Không trùng lặp logic tag cho từng trang.
--   content_type ∈ ('place','post','listing')   -- mở rộng sau nếu cần
--   content_id   = id (uuid) của bản ghi trong bảng tương ứng
--
-- Tag không phân biệt hoa/thường & an toàn trùng lặp: 'Kumamoto', 'kumamoto',
-- ' KUMAMOTO ' đều quy về cùng một tag nhờ cột normalized_name (unique).

-- ── 1. tag_normalize() — chuẩn hoá tên tag (khớp với logic ở lib/tags.ts) ──
-- lower + trim + gộp khoảng trắng. Dùng làm khoá so trùng case-insensitive.
create or replace function public.tag_normalize(p_name text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(lower(trim(p_name)), '\s+', ' ', 'g'), '');
$$;

-- ── 2. Bảng tags ────────────────────────────────────────────
create table if not exists public.tags (
  id              uuid default gen_random_uuid() primary key,
  name            text not null,                 -- tên hiển thị (giữ nguyên dạng người dùng nhập lần đầu)
  slug            text not null unique,           -- dùng cho URL: /tags/<slug>
  normalized_name text not null unique,           -- khoá so trùng (không phân biệt hoa/thường)
  usage_count     integer not null default 0,     -- số nội dung đang gắn tag (đã duyệt + chờ duyệt)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.tags enable row level security;

-- Ai cũng đọc được danh mục tag (tag không phải dữ liệu nhạy cảm).
drop policy if exists "tags_public_read" on public.tags;
create policy "tags_public_read" on public.tags
  for select using (true);
-- Không có policy insert/update/delete cho anon/authenticated:
-- mọi thao tác ghi đi qua server action dùng service-role (bypass RLS).

create index if not exists tags_slug_idx            on public.tags (slug);
create index if not exists tags_normalized_name_idx on public.tags (normalized_name);
create index if not exists tags_usage_idx           on public.tags (usage_count desc);

-- ── 3. Bảng join đa hình content_tags ──────────────────────
create table if not exists public.content_tags (
  id           uuid default gen_random_uuid() primary key,
  tag_id       uuid not null references public.tags (id) on delete cascade,
  content_type text not null check (content_type in ('place','post','listing')),
  content_id   uuid not null,
  created_at   timestamptz not null default now(),
  unique (tag_id, content_type, content_id)
);

alter table public.content_tags enable row level security;

-- Đọc công khai: việc "nội dung X có tag Y" không nhạy cảm. Khả năng hiển thị
-- của chính nội dung vẫn do RLS của bảng gốc (places/posts/marketplace_listings)
-- và bộ lọc status='approved' trong query quyết định.
drop policy if exists "content_tags_public_read" on public.content_tags;
create policy "content_tags_public_read" on public.content_tags
  for select using (true);
-- Ghi (insert/update/delete) chỉ qua service-role trong server action.

create index if not exists content_tags_content_idx on public.content_tags (content_type, content_id);
create index if not exists content_tags_tag_idx     on public.content_tags (tag_id);

-- ── 4. refresh_tag_usage() — tính lại usage_count cho các tag đã đổi ───
create or replace function public.refresh_tag_usage(p_tag_ids uuid[])
returns void
language sql
security definer
set search_path = public
as $$
  update public.tags t
     set usage_count = (
           select count(*) from public.content_tags ct where ct.tag_id = t.id
         ),
         updated_at = now()
   where t.id = any(p_tag_ids);
$$;

grant execute on function public.tag_normalize(text)        to anon, authenticated, service_role;
grant execute on function public.refresh_tag_usage(uuid[])  to service_role;

-- ── 5. Reload PostgREST schema cache ────────────────────────
notify pgrst, 'reload schema';

-- ── XONG ────────────────────────────────────────────────────
