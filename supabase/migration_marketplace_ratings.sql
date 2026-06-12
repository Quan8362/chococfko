-- ============================================================
-- CHỢ CÓC FKO — Đánh giá người bán (seller ratings) cho Chợ đồ cũ
-- Chạy trong Supabase SQL Editor. Idempotent.
-- ============================================================

create table if not exists public.marketplace_ratings (
  id          uuid default gen_random_uuid() primary key,
  listing_id  uuid references public.marketplace_listings on delete cascade not null,
  seller_id   uuid references auth.users on delete cascade not null,
  rater_id    uuid references auth.users on delete cascade not null,
  stars       smallint not null check (stars between 1 and 5),
  review      text,
  created_at  timestamptz not null default now(),
  unique (listing_id, rater_id),
  constraint mr_not_self check (seller_id <> rater_id)
);

create index if not exists mr_seller  on public.marketplace_ratings (seller_id);
create index if not exists mr_listing on public.marketplace_ratings (listing_id);

alter table public.marketplace_ratings enable row level security;

drop policy if exists "mr_select" on public.marketplace_ratings;
create policy "mr_select" on public.marketplace_ratings
  for select using (true);

drop policy if exists "mr_insert_own" on public.marketplace_ratings;
create policy "mr_insert_own" on public.marketplace_ratings
  for insert with check (auth.uid() = rater_id);

drop policy if exists "mr_update_own" on public.marketplace_ratings;
create policy "mr_update_own" on public.marketplace_ratings
  for update using (auth.uid() = rater_id) with check (auth.uid() = rater_id);
