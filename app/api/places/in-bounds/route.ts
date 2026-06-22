import { NextResponse } from 'next/server';
import { getPlacesInBounds } from '@/lib/placesNearby';

export const dynamic = 'force-dynamic';

/**
 * GET /api/places/in-bounds?north&south&east&west&category&q&limit
 * Returns published, search-eligible places with valid coordinates INSIDE the
 * viewport rectangle (distance-from-centre sorted, bounded). Powers Map V2's
 * viewport-based loading + "Search this area". No coordinates leave the box.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const north = Number(searchParams.get('north'));
  const south = Number(searchParams.get('south'));
  const east = Number(searchParams.get('east'));
  const west = Number(searchParams.get('west'));
  const finite = [north, south, east, west].every((n) => Number.isFinite(n));
  if (!finite || north < south || east < west || north > 90 || south < -90 || east > 180 || west < -180) {
    return NextResponse.json({ error: 'invalid_bounds' }, { status: 400 });
  }
  const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 200, 1), 500);
  const places = await getPlacesInBounds(
    { north, south, east, west },
    { category: searchParams.get('category'), q: searchParams.get('q'), limit },
  );
  return NextResponse.json({ places, count: places.length });
}
