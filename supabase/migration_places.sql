-- ============================================================
-- CHỢ CÓC FKO — Bảng places (Địa điểm)
-- Chạy trong Supabase SQL Editor
-- ============================================================

create table if not exists public.places (
  id             uuid default gen_random_uuid() primary key,
  slug           text unique not null,
  name           text not null,
  area           text not null,
  description    text,
  body           text,            -- rich text HTML, mô tả chi tiết
  category       text not null,
  category_label text not null,
  fee            text,            -- 'free' | 'paid' | null
  map_url        text,
  photo_url      text,
  img            text,            -- URL ảnh bìa (upload lên Storage)
  img_fallback   text,
  sort_order     int  default 0,
  updated_at     timestamptz default now()
);

alter table public.places enable row level security;

-- Mọi người đọc được địa điểm
create policy "places_public_read"
  on public.places for select using (true);

-- Tự động cập nhật updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists places_set_updated_at on public.places;
create trigger places_set_updated_at
  before update on public.places
  for each row execute procedure public.set_updated_at();

-- Index tìm kiếm theo slug và category
create index if not exists places_slug_idx on public.places (slug);
create index if not exists places_category_idx on public.places (category);
create index if not exists places_sort_idx on public.places (sort_order);
