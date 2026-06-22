// Server-side "nearby" geo query. Calls the DB function places_nearby (bounding
// box + haversine on the indexed lat/lng) so distance is computed on the server,
// not by shipping every coordinate to the browser. Falls back to a server-side
// haversine over the catalog when the function isn't present yet (pre-migration).
import { haversineKm } from './geo.ts';
import { getAllPlacesFromDb, places as staticPlaces, type Place } from './places.ts';

export interface NearbyPlace {
  slug: string;
  name: string;
  area: string;
  category: string;
  categoryLabel: string;
  fee: string | null;
  img: string | null;
  imgFallback: string | null;
  mapUrl: string | null;
  lat: number;
  lng: number;
  nearestStation: string | null;
  stationWalkMinutes: number | null;
  openingHours: Record<string, unknown> | null;
  closedDays: string[] | null;
  temporaryStatus: string | null;
  priceType: string | null;
  priceMin: number | null;
  priceMax: number | null;
  currency: string | null;
  distanceKm: number;
}

/** Bounding box (deg) around a point for a radius in km. Pure & testable. */
export function boundingBox(lat: number, lng: number, radiusKm: number): { minLat: number; maxLat: number; minLng: number; maxLng: number } {
  const dLat = radiusKm / 111.045;
  const dLng = radiusKm / (111.320 * Math.cos((lat * Math.PI) / 180));
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
}

interface DbRow {
  slug: string; name: string; area: string; category: string; category_label: string;
  fee: string | null; img: string | null; img_fallback: string | null; map_url: string | null;
  lat: number; lng: number; nearest_station: string | null; station_walk_minutes: number | null;
  opening_hours: Record<string, unknown> | null; closed_days: string[] | null; temporary_status: string | null;
  price_type: string | null; price_min: number | null; price_max: number | null; currency: string | null;
  distance_km: number;
}

function mapRow(r: DbRow): NearbyPlace {
  return {
    slug: r.slug, name: r.name, area: r.area, category: r.category, categoryLabel: r.category_label,
    fee: r.fee, img: r.img, imgFallback: r.img_fallback, mapUrl: r.map_url,
    lat: r.lat, lng: r.lng, nearestStation: r.nearest_station, stationWalkMinutes: r.station_walk_minutes,
    openingHours: r.opening_hours, closedDays: r.closed_days, temporaryStatus: r.temporary_status,
    priceType: r.price_type, priceMin: r.price_min, priceMax: r.price_max, currency: r.currency,
    distanceKm: r.distance_km,
  };
}

function placeToNearby(p: Place, distanceKm: number): NearbyPlace {
  return {
    slug: p.slug, name: p.name, area: p.area, category: p.category, categoryLabel: p.categoryLabel,
    fee: p.fee, img: p.img, imgFallback: p.imgFallback, mapUrl: p.mapUrl,
    lat: p.lat as number, lng: p.lng as number, nearestStation: p.nearestStation ?? null, stationWalkMinutes: p.stationWalkMinutes ?? null,
    openingHours: (p.openingHours as Record<string, unknown> | null) ?? null, closedDays: p.closedDays ?? null, temporaryStatus: p.temporaryStatus ?? null,
    priceType: p.priceType ?? null, priceMin: p.priceMin ?? null, priceMax: p.priceMax ?? null, currency: p.currency ?? null,
    distanceKm,
  };
}

/** Server-side fallback when the DB function is missing — still NOT in the browser. */
async function nearbyFallback(center: { lat: number; lng: number }, radiusKm: number, maxResults: number): Promise<NearbyPlace[]> {
  const all = (await getAllPlacesFromDb()) ?? staticPlaces;
  const out: NearbyPlace[] = [];
  for (const p of all) {
    if (typeof p.lat !== 'number' || typeof p.lng !== 'number') continue;
    if (p.searchEligible === false) continue;
    const d = haversineKm(center, { lat: p.lat, lng: p.lng });
    if (d <= radiusKm) out.push(placeToNearby(p, d));
  }
  out.sort((a, b) => a.distanceKm - b.distanceKm);
  return out.slice(0, maxResults);
}

export async function getNearbyPlaces(center: { lat: number; lng: number }, radiusKm = 5, maxResults = 200): Promise<NearbyPlace[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return [];
  try {
    const { createPublicClient } = await import('@/lib/supabase/public');
    const sb = createPublicClient();
    const { data, error } = await sb.rpc('places_nearby', {
      center_lat: center.lat, center_lng: center.lng, radius_km: radiusKm, max_results: maxResults,
    });
    if (!error && Array.isArray(data)) return (data as DbRow[]).map(mapRow);
  } catch {
    /* fall through to server-side fallback */
  }
  return nearbyFallback(center, radiusKm, maxResults);
}
