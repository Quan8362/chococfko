// ============================================================
// Map V2 viewport-result helpers — PURE, testable.
//
// When a user selects an internal search result that lives OUTSIDE the currently
// loaded viewport, the map flies there and reloads the viewport. Two correctness
// rules live here so they can be unit-tested away from Leaflet/React:
//
//   1. internalToNearby — adapt a search result into the viewport-list shape so
//      the marker / preview / list row appear immediately (no flash 1 → 0).
//   2. mergePinnedPlace — keep that pinned selection visible across the next
//      viewport fetch when the refreshed bounds still cover it but the server
//      response happened to omit it (status/eligibility edge, or race).
// ============================================================

import type { NearbyPlace } from '../placesNearby.ts';
import type { InternalResultItem } from './unifiedSearch.ts';

/** Adapt an internal search result to a viewport place. Unknown viewport-only
 *  fields (hours, price, distance) default to null/0 until the real row loads. */
export function internalToNearby(item: InternalResultItem): NearbyPlace {
  return {
    slug: item.slug,
    name: item.name,
    area: item.area,
    category: item.categoryCode,
    categoryLabel: item.categoryLabel,
    fee: null,
    img: item.img,
    imgFallback: null,
    mapUrl: null,
    lat: item.lat as number,
    lng: item.lng as number,
    nearestStation: item.nearestStation,
    stationWalkMinutes: null,
    openingHours: null,
    closedDays: null,
    temporaryStatus: null,
    priceType: null,
    priceMin: null,
    priceMax: null,
    currency: null,
    distanceKm: 0,
  };
}

/**
 * Keep a pinned (just-selected, out-of-view) place visible after a viewport
 * refresh: prepend it when the new bounds still contain it and the server list
 * doesn't already include it. Otherwise return the server list unchanged.
 */
export function mergePinnedPlace(
  serverPlaces: NearbyPlace[],
  pin: NearbyPlace | null,
  withinBounds: (lat: number, lng: number) => boolean,
): NearbyPlace[] {
  if (!pin) return serverPlaces;
  if (!withinBounds(pin.lat, pin.lng)) return serverPlaces;
  if (serverPlaces.some((p) => p.slug === pin.slug)) return serverPlaces;
  return [pin, ...serverPlaces];
}

/**
 * Union two place lists by stable slug, preserving order (primary first, then any
 * extras not already present). Used ONLY on the initial committed load: the SSR
 * results come from a generous fixed box, while the client's first viewport query
 * reflects the actual rendered (often narrower) map. Unioning them guarantees a
 * transiently narrow first viewport can never DROP a valid SSR place — without
 * hardcoding anything. Later user-committed fetches replace normally.
 */
export function unionBySlug(primary: NearbyPlace[], extra: NearbyPlace[]): NearbyPlace[] {
  const seen = new Set(primary.map((p) => p.slug));
  const out = [...primary];
  for (const p of extra) {
    if (seen.has(p.slug)) continue;
    seen.add(p.slug);
    out.push(p);
  }
  return out;
}
