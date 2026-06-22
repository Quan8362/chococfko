-- ============================================================
-- CHỢ CÓC FKO — Map UX Phase 6
-- Viewport (bounding-box) query for the public Map V2.
--
-- Mirrors places_nearby() but selects by a rectangle (the visible viewport)
-- instead of a radius, using the existing partial B-tree places_geo_idx(lat,lng).
-- Optional filters: category + a simple case/diacritic-insensitive name match.
-- Distance from the viewport centre is returned for sensible default ordering.
--
-- SAFE: CREATE OR REPLACE only (idempotent), SECURITY INVOKER (respects RLS),
-- STABLE, reads only. No schema/data changes. The app already works WITHOUT this
-- (server-side fallback in lib/placesNearby.placesWithinBounds) — applying it just
-- moves the filtering into the DB for scale.
--
-- ROLLBACK:
--   drop function if exists public.places_in_bbox(double precision,double precision,
--     double precision,double precision,text,text,int);
-- ============================================================

create or replace function public.places_in_bbox(
  min_lat        double precision,
  max_lat        double precision,
  min_lng        double precision,
  max_lng        double precision,
  filter_category text default null,
  search_query    text default null,
  max_results     int  default 200
)
returns table (
  id uuid, slug text, name text, area text, category text, category_label text,
  fee text, img text, img_fallback text, map_url text,
  lat double precision, lng double precision,
  nearest_station text, station_walk_minutes integer,
  opening_hours jsonb, closed_days text[], temporary_status text,
  price_type text, price_min integer, price_max integer, currency text,
  distance_km double precision
)
language sql
stable
security invoker
as $$
  with c as (select (min_lat + max_lat) / 2 as clat, (min_lng + max_lng) / 2 as clng)
  select
    p.id, p.slug, p.name, p.area, p.category, p.category_label, p.fee,
    p.img, p.img_fallback, p.map_url, p.lat, p.lng,
    p.nearest_station, p.station_walk_minutes, p.opening_hours, p.closed_days,
    p.temporary_status, p.price_type, p.price_min, p.price_max, p.currency,
    2 * 6371 * asin(sqrt(
      power(sin(radians(p.lat - c.clat) / 2), 2) +
      cos(radians(c.clat)) * cos(radians(p.lat)) *
      power(sin(radians(p.lng - c.clng) / 2), 2)
    )) as distance_km
  from public.places p, c
  where p.lat is not null and p.lng is not null
    and p.lat between min_lat and max_lat
    and p.lng between min_lng and max_lng
    and coalesce(p.status, 'approved') = 'approved'
    and coalesce(p.search_eligible, true) = true
    and (filter_category is null or p.category = filter_category)
    and (
      search_query is null
      or unaccent(lower(p.name || ' ' || p.area || ' ' || p.category_label))
         like '%' || unaccent(lower(search_query)) || '%'
    )
  order by distance_km asc
  limit greatest(max_results, 1);
$$;

grant execute on function public.places_in_bbox(double precision, double precision, double precision, double precision, text, text, int) to anon, authenticated;

-- NOTE: the `unaccent` filter needs the unaccent extension:
--   create extension if not exists unaccent;
-- If you prefer not to enable it, replace the search_query clause with a plain
-- lower(...) like, and rely on the app-side normalizeText for diacritics.

notify pgrst, 'reload schema';
