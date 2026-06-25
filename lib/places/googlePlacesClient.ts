// ============================================================
// Google Places API (New) server client — the ONLY place that talks to Google for
// enrichment. Called exclusively by the enrichment orchestrator (backfill script,
// cron, on-create hook) — NEVER during a user page render (see lib/places/enrichPlace.ts).
//
// COST / SAFETY:
//   • Server-only. The key is read from GOOGLE_PLACES_API_KEY, falling back to the
//     existing restricted GOOGLE_MAPS_SERVER_KEY. If neither is set, every call
//     NO-OPS (returns null / []) so the app and build never crash.
//   • The Place Details field mask requests the Enterprise + Atmosphere fields
//     needed for enrichment (hours/price/parking/reservable/goodForChildren).
//     Text Search uses a minimal Essentials mask (id/name/location/types).
//   • All calls are wrapped so a network/HTTP error returns null instead of throwing.
// ============================================================

import type { GooglePlaceDetails } from './googleEnrich.ts';

const PLACES_BASE = 'https://places.googleapis.com/v1';

/** Full field mask for the enrichment Place Details (New) call. */
export const DETAILS_FIELD_MASK = [
  'id', 'displayName', 'types', 'primaryType', 'location',
  'regularOpeningHours', 'currentOpeningHours',
  'priceLevel', 'priceRange', 'reservable', 'parkingOptions', 'goodForChildren',
].join(',');

/** Minimal Essentials mask for Text Search resolution (cheap). */
export const TEXT_SEARCH_FIELD_MASK = [
  'places.id', 'places.displayName', 'places.location', 'places.types', 'places.primaryType',
].join(',');

/** Fukuoka-area rectangle for Text Search location bias. */
export const FUKUOKA_BIAS_RECTANGLE = {
  low: { latitude: 33.0, longitude: 129.9 },
  high: { latitude: 34.1, longitude: 131.3 },
} as const;

export function resolveApiKey(env: NodeJS.ProcessEnv = process.env): string | null {
  const k = (env.GOOGLE_PLACES_API_KEY || env.GOOGLE_MAPS_SERVER_KEY || '').trim();
  return k || null;
}

export function isEnrichmentConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return resolveApiKey(env) !== null;
}

export interface TextSearchResult {
  id: string | null;
  name: string | null;
  location: { latitude?: number; longitude?: number } | null;
  types: string[];
  primaryType: string | null;
}

function displayText(d: GooglePlaceDetails['displayName']): string | null {
  if (!d) return null;
  if (typeof d === 'string') return d.trim() || null;
  return (d.text ?? '').trim() || null;
}

/**
 * Resolve a place to its Google place ID via Text Search (New). Returns the top
 * results (caller scores confidence). No-ops to [] when unconfigured or on error.
 */
export async function textSearchPlaces(
  textQuery: string,
  opts: { apiKey?: string | null; signal?: AbortSignal; maxResults?: number } = {},
): Promise<TextSearchResult[]> {
  const key = opts.apiKey ?? resolveApiKey();
  if (!key || !textQuery.trim()) return [];
  try {
    const res = await fetch(`${PLACES_BASE}/places:searchText`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': TEXT_SEARCH_FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery,
        languageCode: 'en',
        regionCode: 'JP',
        maxResultCount: opts.maxResults ?? 5,
        locationBias: { rectangle: FUKUOKA_BIAS_RECTANGLE },
      }),
      signal: opts.signal,
    });
    if (!res.ok) {
      console.error(`[googlePlaces] textSearch HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return [];
    }
    const json = (await res.json()) as { places?: GooglePlaceDetails[] };
    return (json.places ?? []).map((p) => ({
      id: (p.id ?? '').trim() || null,
      name: displayText(p.displayName),
      location: p.location ? { latitude: p.location.latitude, longitude: p.location.longitude } : null,
      types: Array.isArray(p.types) ? p.types.filter((t): t is string => typeof t === 'string') : [],
      primaryType: (p.primaryType ?? '').trim() || null,
    }));
  } catch (err) {
    console.error('[googlePlaces] textSearch error:', (err as Error).message);
    return [];
  }
}

/**
 * Fetch Place Details (New) for a place ID with the enrichment field mask.
 * Returns null when unconfigured, on HTTP error, or on a malformed response.
 */
export async function fetchPlaceDetails(
  placeId: string,
  opts: { apiKey?: string | null; signal?: AbortSignal } = {},
): Promise<GooglePlaceDetails | null> {
  const key = opts.apiKey ?? resolveApiKey();
  if (!key || !placeId.trim()) return null;
  try {
    const res = await fetch(`${PLACES_BASE}/places/${encodeURIComponent(placeId)}`, {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': DETAILS_FIELD_MASK,
      },
      signal: opts.signal,
    });
    if (!res.ok) {
      console.error(`[googlePlaces] details HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    return (await res.json()) as GooglePlaceDetails;
  } catch (err) {
    console.error('[googlePlaces] details error:', (err as Error).message);
    return null;
  }
}
