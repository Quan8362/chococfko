-- ============================================================
-- OPTIONAL / NOT RECOMMENDED YET — Map UX Phase 4: PostGIS geospatial path.
--
-- ⚠️ DO NOT RUN unless the adoption criteria in docs/map-ux-phase-4-database.md
--    are met. At the current scale (≈78 places, 0 with coordinates) PostGIS is
--    NOT justified — the existing partial B-tree places_geo_idx(lat,lng) +
--    haversine in places_nearby() handles bbox + radius fine.
--
-- Adopt PostGIS only when ALL of these become true:
--   • coordinate-bearing places ≳ 50k AND national-scale viewport KNN is slow; OR
--   • you need polygon/prefecture containment, true nearest-N regardless of
--     radius (`<->` KNN), or isochrones.
--
-- Provided here, ready and reversible, so the future migration is a known
-- quantity. It is ADDITIVE: a GENERATED `geog` column derived from lat/lng, so
-- lat/lng remain the source of truth and the app keeps working unchanged.
-- ============================================================

-- 1) Enable PostGIS (Supabase ships it; enabling is idempotent).
create extension if not exists postgis;

-- 2) Generated geography point from existing lat/lng (NULL when either is null).
--    STORED generated column → no app writes needed; auto-updates with lat/lng.
alter table public.places
  add column if not exists geog geography(Point, 4326)
  generated always as (
    case when lat is not null and lng is not null
         then st_setsrid(st_makepoint(lng, lat), 4326)::geography
         else null end
  ) stored;

-- 3) GiST index for radius / KNN / bbox.
create index if not exists places_geog_gist on public.places using gist (geog);

-- 4) (Optional) a PostGIS-backed nearby function that mirrors places_nearby()'s
--    output but uses ST_DWithin + <-> ordering. Left commented; wire in only
--    after benchmarking against the B-tree version.
-- create or replace function public.places_nearby_geo(
--   center_lat double precision, center_lng double precision,
--   radius_km double precision default 5, max_results int default 200)
-- returns table (slug text, name text, lat double precision, lng double precision,
--                distance_km double precision)
-- language sql stable security invoker as $$
--   select p.slug, p.name, p.lat, p.lng,
--          st_distance(p.geog, st_setsrid(st_makepoint(center_lng, center_lat),4326)::geography)/1000
--   from public.places p
--   where p.geog is not null
--     and st_dwithin(p.geog, st_setsrid(st_makepoint(center_lng, center_lat),4326)::geography, radius_km*1000)
--     and coalesce(p.status,'approved')='approved' and coalesce(p.search_eligible,true)
--   order by p.geog <-> st_setsrid(st_makepoint(center_lng, center_lat),4326)::geography
--   limit greatest(max_results,1);
-- $$;

-- BACKFILL: none needed — `geog` is generated from lat/lng automatically.

-- ── ROLLBACK ───────────────────────────────────────────────────────────────
-- drop index if exists public.places_geog_gist;
-- alter table public.places drop column if exists geog;
-- -- (leave the postgis extension installed; dropping it may affect other objects)

notify pgrst, 'reload schema';
