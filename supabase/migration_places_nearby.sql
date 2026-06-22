-- ============================================================
-- CHỢ CÓC FKO — Explore Platform Phase 3
-- Truy vấn địa lý "gần đây" CHẠY TRÊN DB (không tải toàn bộ toạ độ
-- về trình duyệt rồi tính). Bounding-box prefilter (dùng index lat/lng
-- từ migration Phase 1) + haversine để tính khoảng cách & xếp gần→xa.
--
-- AN TOÀN: chỉ TẠO function (idempotent, CREATE OR REPLACE). Không đụng
-- dữ liệu. SECURITY INVOKER → tuân RLS của places (public read).
-- ROLLBACK: drop function public.places_nearby(double precision,double precision,double precision,int);
-- ============================================================

create or replace function public.places_nearby(
  center_lat  double precision,
  center_lng  double precision,
  radius_km   double precision default 5,
  max_results int default 200
)
returns table (
  id                   uuid,
  slug                 text,
  name                 text,
  area                 text,
  category             text,
  category_label       text,
  fee                  text,
  img                  text,
  img_fallback         text,
  map_url              text,
  lat                  double precision,
  lng                  double precision,
  nearest_station      text,
  station_walk_minutes integer,
  opening_hours        jsonb,
  closed_days          text[],
  temporary_status     text,
  price_type           text,
  price_min            integer,
  price_max            integer,
  currency             text,
  distance_km          double precision
)
language sql
stable
security invoker
as $$
  with params as (
    select
      greatest(radius_km, 0.05)                                    as r,
      greatest(radius_km, 0.05) / 111.045                          as dlat,
      greatest(radius_km, 0.05) / (111.320 * cos(radians(center_lat))) as dlng
  ),
  candidates as (
    select
      p.id, p.slug, p.name, p.area, p.category, p.category_label, p.fee,
      p.img, p.img_fallback, p.map_url, p.lat, p.lng,
      p.nearest_station, p.station_walk_minutes, p.opening_hours, p.closed_days,
      p.temporary_status, p.price_type, p.price_min, p.price_max, p.currency,
      2 * 6371 * asin(sqrt(
        power(sin(radians(p.lat - center_lat) / 2), 2) +
        cos(radians(center_lat)) * cos(radians(p.lat)) *
        power(sin(radians(p.lng - center_lng) / 2), 2)
      )) as distance_km
    from public.places p, params pa
    where p.lat is not null and p.lng is not null
      and p.lat between center_lat - pa.dlat and center_lat + pa.dlat
      and p.lng between center_lng - pa.dlng and center_lng + pa.dlng
      and coalesce(p.status, 'approved') = 'approved'
      and coalesce(p.search_eligible, true) = true
  )
  select c.* from candidates c, params pa
  where c.distance_km <= pa.r
  order by c.distance_km asc
  limit greatest(max_results, 1);
$$;

grant execute on function public.places_nearby(double precision, double precision, double precision, int) to anon, authenticated;

notify pgrst, 'reload schema';
