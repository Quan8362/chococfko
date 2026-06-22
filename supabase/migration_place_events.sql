-- ============================================================
-- CHỢ CÓC FKO — Explore Platform Phase 7 (part 1/3)
-- Events (sự kiện) — Admin-curated, public read, service-role write.
--
-- An toàn / mô hình:
--   • Sự kiện do Admin tạo + xác minh nguồn (source_url). KHÔNG scrape.
--   • Public CHỈ đọc bản đã publish (status='published'). Ghi qua service_role
--     (Admin server action) — giống bảng `places`.
--   • Thời gian lưu timestamptz (UTC); phân loại today/weekend theo Asia/Tokyo
--     ở tầng app (lib/events.ts). Sự kiện hết hạn KHÔNG hiển thị là "sắp diễn ra".
--   • Chỉ THÊM (idempotent). ROLLBACK ở cuối file.
-- ============================================================

create table if not exists public.place_events (
  id               uuid        primary key default gen_random_uuid(),
  slug             text        unique,
  title            text        not null check (char_length(title) between 1 and 200),
  description      text,
  -- Optional link to an existing place (by slug; no FK so an event can name a
  -- venue that isn't in `places` yet).
  place_slug       text,
  venue            text,
  area             text,
  prefecture       text,
  starts_at        timestamptz not null,
  ends_at          timestamptz,
  price_type       text        check (price_type in ('free','paid','varies')),
  price_min        integer     check (price_min is null or price_min >= 0),
  price_max        integer     check (price_max is null or price_max >= 0),
  currency         text        check (currency is null or currency ~ '^[A-Z]{3}$'),
  -- Trust: verified official source + optional registration/reservation link.
  source_url       text,
  registration_url text,
  last_verified_at date,
  status           text        not null default 'draft' check (status in ('draft','published')),
  is_cancelled     boolean     not null default false,
  created_by       uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint place_events_time_check check (ends_at is null or ends_at >= starts_at)
);

create index if not exists place_events_published_idx on public.place_events (status, starts_at);
create index if not exists place_events_starts_idx    on public.place_events (starts_at);
create index if not exists place_events_prefecture_idx on public.place_events (prefecture);
create index if not exists place_events_place_slug_idx on public.place_events (place_slug);

-- updated_at auto-touch (reuse set_updated_at from migration_places.sql)
drop trigger if exists place_events_set_updated_at on public.place_events;
create trigger place_events_set_updated_at
  before update on public.place_events
  for each row execute procedure public.set_updated_at();

alter table public.place_events enable row level security;

-- Public reads ONLY published events. Drafts/edits via service-role (Admin).
drop policy if exists "place_events_select_published" on public.place_events;
create policy "place_events_select_published"
  on public.place_events for select
  using (status = 'published');

notify pgrst, 'reload schema';

-- ROLLBACK:
--   drop table if exists public.place_events;
