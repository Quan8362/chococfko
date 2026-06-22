import { NextResponse } from 'next/server';
import { getNearbyPlaces } from '@/lib/placesNearby';

export const dynamic = 'force-dynamic';

const ALLOWED_RADIUS = [0.5, 1, 3, 5, 10, 20];

/**
 * GET /api/places/nearby?lat=..&lng=..&radius=..&limit=..
 * Returns places within `radius` km of (lat,lng), distance computed on the DB
 * (places_nearby). The bounded result set is small; the client applies any
 * further attribute/open-now filtering. No coordinates are persisted.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get('lat'));
  const lng = Number(searchParams.get('lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json({ error: 'invalid_coordinates' }, { status: 400 });
  }
  const radiusRaw = Number(searchParams.get('radius'));
  const radius = ALLOWED_RADIUS.includes(radiusRaw) ? radiusRaw : 5;
  const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 200, 1), 500);

  const places = await getNearbyPlaces({ lat, lng }, radius, limit);
  return NextResponse.json({ places, radius, count: places.length });
}
