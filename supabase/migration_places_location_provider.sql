-- ============================================================
-- CHỢ CÓC FKO — Map UX Phase 4
-- Location data model: provider-derived place data + coordinate provenance.
--
-- Adds the columns needed for: manually selected coordinates, Google-selected
-- places, external provider IDs, a provider-normalized address, and an audit
-- trail of HOW/WHEN/BY-WHOM a coordinate was set — WITHOUT touching the existing
-- editorial location fields (lat/lng/address/map_url/prefecture/city/area_*).
--
-- DESIGN PRINCIPLES (see docs/map-ux-phase-4-database.md):
--   • Editorial Chợ Cóc data (address, map_url) is kept SEPARATE from
--     provider-derived data (provider_formatted_address, provider_maps_url).
--   • NO PostGIS — current scale (≈78 places, 0 with coords) does not justify it;
--     the existing partial B-tree places_geo_idx(lat,lng) serves bbox + radius.
--     A ready-but-NOT-applied PostGIS path is in migration_places_postgis_optional.sql.
--   • NO raw Google API JSON is stored (Google ToS + no documented need). Only
--     place_id (storable indefinitely) and minimal derived fields (TTL'd via
--     provider_data_updated_at).
--
-- SAFETY:
--   • Idempotent: ADD COLUMN IF NOT EXISTS / DROP+ADD constraint / CREATE INDEX
--     IF NOT EXISTS — safe to run multiple times.
--   • Non-destructive: only ADDS columns/indexes; never drops/renames/overwrites.
--   • NULL-safe CHECKs: every constraint allows NULL → existing rows pass.
--   • Coordinate-safe: does NOT write lat/lng; never invents coordinates.
--   • Publication-safe: does NOT touch status / published content.
--   • RLS-safe: does NOT change any policy. (Optional column-privilege hardening
--     for audit metadata lives in migration_places_location_privacy_optional.sql.)
--   • Google-independent: pure DDL; needs no external API.
--
-- ROLLBACK: migration_places_location_provider_rollback.sql
-- ============================================================

-- ── 1) PROVIDER-DERIVED PLACE DATA ─────────────────────────────────────────
-- Which provider supplied the place identity / coordinates.
--   manual = a human typed/clicked it; google = Google Places (New); osm/other
--   reserved for future providers. NULL = unknown / legacy.
alter table public.places add column if not exists location_provider text;

-- External provider place ID (e.g. Google Place ID). Per Google ToS the place_id
-- may be stored indefinitely (unlike lat/lng, which are TTL'd). Used for stable
-- re-lookups and duplicate detection.
alter table public.places add column if not exists provider_place_id text;

-- Provider-normalized address (display + drift detection). DISTINCT from the
-- editorial `address` column, which stays admin-authored.
alter table public.places add column if not exists provider_formatted_address text;

-- Provider canonical maps URL. DISTINCT from editorial `map_url`.
alter table public.places add column if not exists provider_maps_url text;

-- When provider-derived fields were last refreshed (drives the 30-day cache TTL
-- required by Google ToS for cached lat/lng & address).
alter table public.places add column if not exists provider_data_updated_at timestamptz;

-- ── 2) STRUCTURED ADDRESS (only what's genuinely missing) ──────────────────
-- ISO-3166-1 alpha-2. Enables multi-country queries later; today every place is
-- in Japan, so the backfill below is a CERTAIN derivation, not a fake default.
-- (prefecture / city / postal_code / nearest_station already exist — NOT re-added.
--  municipality / ward intentionally NOT added — covered by city + area_main +
--  address; see Phase 4 doc "Rejected fields".)
alter table public.places add column if not exists country_code text default 'JP';

-- ── 3) COORDINATE PROVENANCE & AUDIT TRAIL ─────────────────────────────────
-- HOW the coordinate was obtained.
alter table public.places add column if not exists location_source text;

-- Was the provider coordinate later hand-adjusted (dragged/edited)? New rows
-- default false; existing rows truthfully = false (they weren't adjusted).
alter table public.places add column if not exists location_manually_adjusted boolean not null default false;

-- WHEN/BY-WHOM the coordinate was confirmed correct by an admin (private audit
-- metadata — see optional privacy migration to hide from public selects).
alter table public.places add column if not exists location_confirmed_at timestamptz;
alter table public.places add column if not exists location_confirmed_by uuid; -- auth.users id (no FK: decoupled from auth schema)

-- ── 4) NULL-SAFE CHECK CONSTRAINTS ─────────────────────────────────────────
alter table public.places drop constraint if exists places_location_provider_check;
alter table public.places add  constraint places_location_provider_check
  check (location_provider is null or location_provider in ('manual', 'google', 'osm', 'other'));

alter table public.places drop constraint if exists places_location_source_check;
alter table public.places add  constraint places_location_source_check
  check (location_source is null or location_source in
    ('existing', 'admin_search', 'map_click', 'marker_drag', 'current_location', 'imported', 'manually_entered'));

alter table public.places drop constraint if exists places_country_code_check;
alter table public.places add  constraint places_country_code_check
  check (country_code is null or country_code ~ '^[A-Z]{2}$');

-- A provider place ID must name its provider. NULL-safe: a manual/legacy row
-- with no place_id passes; a row WITH a place_id must set location_provider.
alter table public.places drop constraint if exists places_provider_pair_check;
alter table public.places add  constraint places_provider_pair_check
  check (provider_place_id is null or location_provider is not null);

-- ── 5) INDEXES ─────────────────────────────────────────────────────────────
-- Enforce + speed up duplicate provider-id detection. Partial (only real ids),
-- composite with provider so two providers can't false-collide.
create unique index if not exists places_provider_place_uidx
  on public.places (location_provider, provider_place_id)
  where provider_place_id is not null;

-- (Existing places_geo_idx(lat,lng) WHERE lat IS NOT NULL AND lng IS NOT NULL
--  already backs viewport bounding-box + radius prefilter — NOT re-created here.)

-- ── 6) BACKFILL (only CERTAIN derivations; never invents data) ─────────────
-- country_code: every existing place is in Japan (all have a Japanese
-- prefecture / region). This is a certain, reversible derivation.
update public.places
   set country_code = 'JP'
 where country_code is null;

-- location_source = 'existing' for rows that ALREADY have coordinates, so the new
-- flow can distinguish pre-Phase-4 coordinates from ones it captured. (Currently
-- 0 rows have coordinates; this is future-safe and a no-op today.)
update public.places
   set location_source = 'existing'
 where lat is not null and lng is not null and location_source is null;

-- ── 7) Reload PostgREST schema cache so new columns are visible ────────────
notify pgrst, 'reload schema';
