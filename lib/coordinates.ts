// ============================================================
// Canonical coordinate model — single source of truth for lat/lng across
// Supabase rows, server responses, Admin form state, save/update payloads,
// public-map queries, and radius search.
//
// Representation contract:
//   • A valid coordinate is a FINITE number in range.
//   • Missing is `null` (never undefined in persisted payloads, never '').
//   • Empty string / whitespace / undefined normalize to `null`.
//   • 0 is a VALID latitude AND longitude; negatives are valid.
//   • Latitude  ∈ [-90, 90];  Longitude ∈ [-180, 180].
//
// NEVER use truthy checks (`if (!lat || !lng)`) — that rejects 0. Use the
// helpers here, which test finiteness and range explicitly.
//
// PURE & dependency-free so it is unit-testable with `node --test` and reusable
// from server actions, client components, and the map libs alike.
// ============================================================

export const LAT_MIN = -90;
export const LAT_MAX = 90;
export const LNG_MIN = -180;
export const LNG_MAX = 180;

/** True when `raw` carries no value (null/undefined/empty/whitespace string). */
export function isBlankCoordinate(raw: unknown): boolean {
  return raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '');
}

/**
 * Normalize ANY input (string from a form, number from the DB, null/undefined,
 * empty string) to a finite number or `null`. Strict: rejects trailing garbage
 * ("12abc" → null) so a malformed field never silently becomes a partial number.
 * `0`, `-0`, negatives and decimals are preserved.
 */
export function parseCoordinate(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (s === '') return null;
  // Only a clean decimal/scientific number — no leading/trailing junk.
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** A finite latitude within [-90, 90]. `null`/`undefined`/strings → false. */
export function isValidLat(lat: unknown): lat is number {
  return typeof lat === 'number' && Number.isFinite(lat) && lat >= LAT_MIN && lat <= LAT_MAX;
}

/** A finite longitude within [-180, 180]. `null`/`undefined`/strings → false. */
export function isValidLng(lng: unknown): lng is number {
  return typeof lng === 'number' && Number.isFinite(lng) && lng >= LNG_MIN && lng <= LNG_MAX;
}

/**
 * A valid coordinate PAIR — both must be finite numbers in range. Strings are
 * NOT coerced here (use `parseCoordinate` first); this is the post-normalization
 * validity gate. Stable contract: `isValidCoordinate('33','130') === false`.
 */
export function isValidCoordinate(lat: unknown, lng: unknown): boolean {
  return isValidLat(lat) && isValidLng(lng);
}

/** Rough bounding box of Japan — flags coordinates likely entered wrong. */
export function isInJapanBounds(lat: unknown, lng: unknown): boolean {
  return (
    isValidCoordinate(lat, lng) &&
    (lat as number) >= 20 && (lat as number) <= 46 &&
    (lng as number) >= 122 && (lng as number) <= 154
  );
}

/** Does a place row carry a valid coordinate pair? (zero-safe; for map filters.) */
export function hasValidCoordinates(p: { lat?: number | null; lng?: number | null } | null | undefined): boolean {
  return !!p && isValidCoordinate(p.lat ?? null, p.lng ?? null);
}

export interface CoordinateValidation {
  /** Normalized latitude (finite number) or null. */
  lat: number | null;
  /** Normalized longitude (finite number) or null. */
  lng: number | null;
  /** i18n error codes (server-side hard validation): incomplete/invalid pair. */
  errors: string[];
}

/**
 * Validate a raw lat/lng pair from a form/payload into the canonical model.
 *   • both blank            → { null, null, [] }            (cleared / not set)
 *   • exactly one provided  → 'incomplete_coordinates'      (lat without lng …)
 *   • both provided, bad    → 'invalid_coordinates'         (NaN or out of range)
 *   • both provided, good   → { lat, lng, [] }
 * Pure; used by the Admin server action and unit tests.
 */
export function validateCoordinateInput(latRaw: unknown, lngRaw: unknown): CoordinateValidation {
  const latBlank = isBlankCoordinate(latRaw);
  const lngBlank = isBlankCoordinate(lngRaw);

  if (latBlank && lngBlank) return { lat: null, lng: null, errors: [] };

  const lat = latBlank ? null : parseCoordinate(latRaw);
  const lng = lngBlank ? null : parseCoordinate(lngRaw);

  if (latBlank !== lngBlank) return { lat, lng, errors: ['incomplete_coordinates'] };

  if (!isValidCoordinate(lat, lng)) return { lat, lng, errors: ['invalid_coordinates'] };
  return { lat, lng, errors: [] };
}

export interface CoordinateWarningContext {
  lat?: number | null;
  lng?: number | null;
  hasMapUrl?: boolean;
  hasAddress?: boolean;
}

/**
 * Advisory completeness warnings tied to coordinates (i18n keys under
 * `place_fields.warn_*`). Single source of truth shared by the server-rendered
 * editor and the live client field so they can never disagree:
 *   • 'missing_location'    — no coords AND no map link AND no address.
 *   • 'missing_coordinates' — no valid coordinate pair.
 * Order matches the legacy `placeCompletenessWarnings` output.
 */
export function coordinateWarnings(ctx: CoordinateWarningContext): string[] {
  const valid = isValidCoordinate(ctx.lat ?? null, ctx.lng ?? null);
  const warnings: string[] = [];
  if (!valid && !ctx.hasMapUrl && !ctx.hasAddress) warnings.push('missing_location');
  if (!valid) warnings.push('missing_coordinates');
  return warnings;
}

/**
 * Per-field range error for live form feedback (returns an i18n code or null).
 * Used by the Admin coordinate inputs to flag an out-of-range value as the user
 * types, independently of the pair-level completeness warnings.
 */
export function latFieldError(raw: unknown): 'invalid_lat' | null {
  if (isBlankCoordinate(raw)) return null;
  return isValidLat(parseCoordinate(raw)) ? null : 'invalid_lat';
}
export function lngFieldError(raw: unknown): 'invalid_lng' | null {
  if (isBlankCoordinate(raw)) return null;
  return isValidLng(parseCoordinate(raw)) ? null : 'invalid_lng';
}
