-- ============================================================
-- CHỢ CÓC FKO — Đấu giá (auction) cho Chợ đồ cũ
-- Chạy trong Supabase SQL Editor. Idempotent.
-- ============================================================

-- ── 1. Cột đấu giá trên marketplace_listings ────────────────
alter table public.marketplace_listings
  add column if not exists start_price       integer,
  add column if not exists min_increment     integer not null default 1000,
  add column if not exists buy_now_price      integer,
  add column if not exists auction_ends_at    timestamptz,
  add column if not exists current_bid        integer,
  add column if not exists current_bidder_id  uuid,
  add column if not exists bid_count          integer not null default 0,
  add column if not exists winner_id          uuid;

-- Cho phép listing_type = 'auction'
alter table public.marketplace_listings drop constraint if exists marketplace_listings_listing_type_check;
alter table public.marketplace_listings add constraint marketplace_listings_listing_type_check
  check (listing_type in ('sell','free','auction'));

-- Giá: bán cần price>0; đấu giá cần start_price>0; tặng không cần
alter table public.marketplace_listings drop constraint if exists marketplace_price_required;
alter table public.marketplace_listings add constraint marketplace_price_required check (
  (listing_type = 'free')
  or (listing_type = 'sell'    and price is not null and price > 0)
  or (listing_type = 'auction' and start_price is not null and start_price > 0)
);

-- Realtime cho cập nhật giá hiện tại trên hàng listing
alter table public.marketplace_listings replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.marketplace_listings;
exception when duplicate_object then null; when others then null; end $$;

-- ── 2. Bảng lượt đấu giá ────────────────────────────────────
create table if not exists public.marketplace_bids (
  id          uuid default gen_random_uuid() primary key,
  listing_id  uuid references public.marketplace_listings on delete cascade not null,
  bidder_id   uuid references auth.users on delete cascade not null,
  amount      integer not null check (amount > 0),
  created_at  timestamptz not null default now()
);

create index if not exists mb_listing_amount on public.marketplace_bids (listing_id, amount desc);

alter table public.marketplace_bids enable row level security;

drop policy if exists "mb_select" on public.marketplace_bids;
create policy "mb_select" on public.marketplace_bids for select using (true);

drop policy if exists "mb_insert_own" on public.marketplace_bids;
create policy "mb_insert_own" on public.marketplace_bids
  for insert with check (auth.uid() = bidder_id);

alter table public.marketplace_bids replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.marketplace_bids;
exception when duplicate_object then null; when others then null; end $$;
