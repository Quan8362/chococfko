// ============================================================
// Directions — PURE helpers (Map UX Phase 8).
//
// (A) "Open in Google Maps" deep-link generation: safe, correctly-encoded
//     https://www.google.com/maps/dir/?api=1 URLs. Prefers destination Place ID,
//     falls back to coordinates, then the destination name as context. Origin is
//     included ONLY when explicitly provided (selected origin / current location).
//     No open-redirect surface — the host is a hard-coded Google constant.
//
// Travel modes follow the current api=1 Directions URL + Routes API capabilities.
// ============================================================

import { haversineKm } from '../geo.ts';

/** UI / api=1 travel modes we support (regionally common, non-legacy). */
export const TRAVEL_MODES = ['walking', 'driving', 'bicycling', 'transit'] as const;
export type TravelMode = (typeof TRAVEL_MODES)[number];

export function isTravelMode(v: unknown): v is TravelMode {
  return typeof v === 'string' && (TRAVEL_MODES as readonly string[]).includes(v);
}

/** api=1 `travelmode` values are exactly our UI tokens. */
export const URL_TRAVEL_MODE: Record<TravelMode, string> = {
  walking: 'walking', driving: 'driving', bicycling: 'bicycling', transit: 'transit',
};

/** Routes API `travelMode` enum for each UI mode. */
export const ROUTES_API_MODE: Record<TravelMode, 'WALK' | 'DRIVE' | 'BICYCLE' | 'TRANSIT'> = {
  walking: 'WALK', driving: 'DRIVE', bicycling: 'BICYCLE', transit: 'TRANSIT',
};

export interface DirectionsEndpoint {
  placeId?: string | null;
  lat?: number | null;
  lng?: number | null;
  name?: string | null;
}

/** Origin: an explicit endpoint, or `'current'` (omit → Google uses device location), or none. */
export type OriginSpec = DirectionsEndpoint | 'current' | null | undefined;

const MAPS_DIR_BASE = 'https://www.google.com/maps/dir/?api=1';
const MAPS_SEARCH_BASE = 'https://www.google.com/maps/search/?api=1';

function hasCoords(e: DirectionsEndpoint): e is DirectionsEndpoint & { lat: number; lng: number } {
  return typeof e.lat === 'number' && Number.isFinite(e.lat) && typeof e.lng === 'number' && Number.isFinite(e.lng);
}
const enc = (s: string) => encodeURIComponent(s);
/** Coordinates are URL-safe as `lat,lng` (comma is a query sub-delimiter). */
const coordStr = (lat: number, lng: number) => `${lat},${lng}`;

/** A point's primary `destination`/`origin` text value (coords preferred, else name). */
function endpointValue(e: DirectionsEndpoint): string | null {
  if (hasCoords(e)) return coordStr(e.lat, e.lng);
  if (e.name && e.name.trim()) return e.name.trim();
  if (e.placeId && e.placeId.trim()) return e.placeId.trim();
  return null;
}

/**
 * Build a safe "Open in Google Maps" directions URL. Always returns a valid
 * Google URL; never throws. When the destination has neither coords, name, nor
 * Place ID, falls back to a maps search on whatever name is present.
 */
export function buildGoogleMapsDirectionsUrl(opts: {
  destination: DirectionsEndpoint;
  origin?: OriginSpec;
  mode?: TravelMode | null;
}): string {
  const { destination, origin, mode } = opts;
  const destValue = endpointValue(destination);
  if (!destValue) {
    // Nothing usable to route to → degrade to a name search (still a Google URL).
    return `${MAPS_SEARCH_BASE}&query=${enc((destination.name ?? '').trim() || 'place')}`;
  }

  const parts: string[] = [];
  // Destination is required; Place ID is a companion to the text value.
  parts.push(`destination=${hasCoords(destination) ? coordStr(destination.lat, destination.lng) : enc(destValue)}`);
  if (destination.placeId && destination.placeId.trim()) parts.push(`destination_place_id=${enc(destination.placeId.trim())}`);

  // Origin only when explicitly provided. 'current' → omit (device location).
  if (origin && origin !== 'current') {
    const oValue = endpointValue(origin);
    if (oValue) {
      parts.push(`origin=${hasCoords(origin) ? coordStr(origin.lat as number, origin.lng as number) : enc(oValue)}`);
      if (origin.placeId && origin.placeId.trim()) parts.push(`origin_place_id=${enc(origin.placeId.trim())}`);
    }
  }

  if (mode && isTravelMode(mode)) parts.push(`travelmode=${URL_TRAVEL_MODE[mode]}`);
  return `${MAPS_DIR_BASE}&${parts.join('&')}`;
}

/** Straight-line distance (km) between two points — an APPROXIMATION, not a route. */
export function straightLineKm(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
): number {
  return haversineKm(origin, destination);
}

/** Human duration from seconds ("8 min", "1 h 5 min"). Locale-agnostic units. */
export function formatDurationSeconds(seconds: number): { hours: number; minutes: number } {
  const total = Math.max(0, Math.round(seconds / 60));
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}

/** Distance in metres → { km } rounded to one decimal (for display formatting). */
export function metresToKm(m: number): number {
  return Math.round((m / 1000) * 10) / 10;
}
