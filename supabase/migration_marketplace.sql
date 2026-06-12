-- ============================================================
-- CHỢ CÓC FKO — Chợ đồ cũ (Used-goods Marketplace)
-- Chạy toàn bộ file này trong Supabase SQL Editor.
-- Idempotent: dùng IF NOT EXISTS / DO blocks.
-- ============================================================

-- ── 1. LISTINGS ─────────────────────────────────────────────
create table if not exists public.marketplace_listings (
  id                uuid default gen_random_uuid() primary key,
  user_id           uuid references auth.users on delete cascade not null,
  title             text not null,
  description       text,
  listing_type      text not null default 'sell' check (listing_type in ('sell','free')),
  price             integer,                         -- JPY, null cho 'free'
  is_negotiable     boolean not null default false,
  condition         text not null default 'used' check (condition in ('new','used')),
  condition_percent smallint check (condition_percent between 0 and 100),
  category          text not null default 'other',
  area              text,
  images            text[] not null default '{}',    -- public URLs trong bucket 'marketplace'
  cover_image       text,
  status            text not null default 'pending'  check (status in ('pending','approved','rejected')),
  sale_status       text not null default 'available' check (sale_status in ('available','reserved','sold')),
  view_count        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz,
  sold_at           timestamptz,
  -- Bán thì bắt buộc có giá > 0; tặng thì không có giá
  constraint marketplace_price_required check (
    (listing_type = 'free')
    or (listing_type = 'sell' and price is not null and price > 0)
  )
);

alter table public.marketplace_listings enable row level security;

-- Public chỉ xem tin đã duyệt; chủ tin xem được tin của mình (mọi trạng thái)
drop policy if exists "ml_select_public" on public.marketplace_listings;
create policy "ml_select_public" on public.marketplace_listings
  for select using (status = 'approved' or auth.uid() = user_id);

drop policy if exists "ml_insert_own" on public.marketplace_listings;
create policy "ml_insert_own" on public.marketplace_listings
  for insert with check (auth.uid() = user_id);

drop policy if exists "ml_update_own" on public.marketplace_listings;
create policy "ml_update_own" on public.marketplace_listings
  for update using (auth.uid() = user_id);

drop policy if exists "ml_delete_own" on public.marketplace_listings;
create policy "ml_delete_own" on public.marketplace_listings
  for delete using (auth.uid() = user_id);

create index if not exists ml_status_created   on public.marketplace_listings (status, created_at desc);
create index if not exists ml_category         on public.marketplace_listings (category);
create index if not exists ml_user             on public.marketplace_listings (user_id);
create index if not exists ml_type             on public.marketplace_listings (listing_type);


-- ── 2. COMMENTS ─────────────────────────────────────────────
create table if not exists public.marketplace_comments (
  id            uuid default gen_random_uuid() primary key,
  listing_id    uuid references public.marketplace_listings on delete cascade not null,
  user_id       uuid references auth.users on delete cascade not null,
  content       text not null,
  status        text not null default 'approved' check (status in ('approved','hidden')),
  created_at    timestamptz not null default now()
);

alter table public.marketplace_comments enable row level security;

drop policy if exists "mc_select" on public.marketplace_comments;
create policy "mc_select" on public.marketplace_comments
  for select using (status = 'approved' or auth.uid() = user_id);

drop policy if exists "mc_insert_own" on public.marketplace_comments;
create policy "mc_insert_own" on public.marketplace_comments
  for insert with check (auth.uid() = user_id);

drop policy if exists "mc_delete_own" on public.marketplace_comments;
create policy "mc_delete_own" on public.marketplace_comments
  for delete using (auth.uid() = user_id);

create index if not exists mc_listing_created on public.marketplace_comments (listing_id, created_at);

-- View: comment kèm tên + avatar tác giả
create or replace view public.marketplace_comments_with_author as
  select
    c.*,
    pr.display_name as author_name,
    pr.avatar_url   as author_avatar
  from public.marketplace_comments c
  left join public.profiles pr on pr.id = c.user_id;


-- ── 3. REPORTS ──────────────────────────────────────────────
create table if not exists public.marketplace_reports (
  id            uuid default gen_random_uuid() primary key,
  listing_id    uuid references public.marketplace_listings on delete cascade not null,
  reporter_id   uuid references auth.users on delete cascade not null,
  reason        text,
  created_at    timestamptz not null default now(),
  unique (listing_id, reporter_id)
);

alter table public.marketplace_reports enable row level security;

drop policy if exists "mr_insert_own" on public.marketplace_reports;
create policy "mr_insert_own" on public.marketplace_reports
  for insert with check (auth.uid() = reporter_id);

-- (admin đọc reports qua service-role, không cần SELECT policy public)


-- ── 4. STORAGE BUCKET 'marketplace' (public) ────────────────
insert into storage.buckets (id, name, public)
values ('marketplace', 'marketplace', true)
on conflict (id) do nothing;

drop policy if exists "marketplace_public_read" on storage.objects;
create policy "marketplace_public_read"
  on storage.objects for select
  using (bucket_id = 'marketplace');

drop policy if exists "marketplace_owner_insert" on storage.objects;
create policy "marketplace_owner_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'marketplace'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "marketplace_owner_delete" on storage.objects;
create policy "marketplace_owner_delete"
  on storage.objects for delete
  using (
    bucket_id = 'marketplace'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── XONG ────────────────────────────────────────────────────
