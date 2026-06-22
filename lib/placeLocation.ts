// ============================================================
// Place location domain model (Map UX Phase 4).
//
// Pure helpers over the Phase-4 location columns: provider provenance, coordinate
// source, and the data-quality checks that power BOTH the read-only audit script
// and the unit tests (single source of truth).
//
// Back-compat: every helper treats a row that LACKS the new columns (old row /
// pre-migration) the same as one with them set to null — nothing throws.
//
// Depends only on the canonical coordinate model (lib/coordinates). No IO.
// ============================================================

import {
  isValidCoordinate, isInJapanBounds, isBlankCoordinate, parseCoordinate,
} from './coordinates.ts';

// ── Option lists (mirror the DB CHECK constraints) ─────────────────────────
export const LOCATION_PROVIDERS = ['manual', 'google', 'osm', 'other'] as const;
export type LocationProvider = (typeof LOCATION_PROVIDERS)[number];

export const LOCATION_SOURCES = [
  'existing',          // coordinates that predate the Phase-4 capture flow
  'admin_search',      // admin picked a search result (geocode / autocomplete)
  'map_click',         // admin clicked the map
  'marker_drag',       // admin dragged the marker
  'current_location',  // captured from device geolocation
  'imported',          // bulk import
  'manually_entered',  // admin typed lat/lng by hand
] as const;
export type LocationSource = (typeof LOCATION_SOURCES)[number];

export function isLocationProvider(v: unknown): v is LocationProvider {
  return typeof v === 'string' && (LOCATION_PROVIDERS as readonly string[]).includes(v);
}
export function isLocationSource(v: unknown): v is LocationSource {
  return typeof v === 'string' && (LOCATION_SOURCES as readonly string[]).includes(v);
}
/** Restrict a raw value to a valid provider/source, else null. */
export function parseLocationProvider(v: unknown): LocationProvider | null {
  return isLocationProvider(v) ? v : null;
}
export function parseLocationSource(v: unknown): LocationSource | null {
  return isLocationSource(v) ? v : null;
}

// ── Normalized domain object ───────────────────────────────────────────────
/** Minimal raw row shape — every field optional so OLD rows work unchanged. */
export interface RawPlaceLocation {
  slug?: string;
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  map_url?: string | null;
  location_provider?: string | null;
  provider_place_id?: string | null;
  provider_formatted_address?: string | null;
  provider_maps_url?: string | null;
  country_code?: string | null;
  location_source?: string | null;
  location_manually_adjusted?: boolean | null;
  location_confirmed_at?: string | null;
  location_confirmed_by?: string | null;
  status?: string | null;
}

export interface PlaceLocation {
  lat: number | null;
  lng: number | null;
  hasValidCoordinates: boolean;
  provider: LocationProvider | null;
  providerPlaceId: string | null;
  source: LocationSource | null;
  countryCode: string | null;
  manuallyAdjusted: boolean;
  confirmedAt: string | null;
  confirmedBy: string | null;
  hasAddress: boolean;
}

/** Normalize a (possibly legacy) row into the canonical location domain object. */
export function normalizePlaceLocation(row: RawPlaceLocation): PlaceLocation {
  const lat = parseCoordinate(row.lat ?? null);
  const lng = parseCoordinate(row.lng ?? null);
  return {
    lat,
    lng,
    hasValidCoordinates: isValidCoordinate(lat, lng),
    provider: parseLocationProvider(row.location_provider),
    providerPlaceId: (row.provider_place_id ?? '').trim() || null,
    source: parseLocationSource(row.location_source),
    countryCode: (row.country_code ?? '').trim() || null,
    manuallyAdjusted: row.location_manually_adjusted === true,
    confirmedAt: row.location_confirmed_at ?? null,
    confirmedBy: row.location_confirmed_by ?? null,
    hasAddress: !!(row.address && row.address.trim()) ||
      !!(row.provider_formatted_address && row.provider_formatted_address.trim()),
  };
}

// ── Geospatial predicates (mirror the SQL bbox / radius behaviour) ─────────
export interface ViewportBounds { north: number; south: number; east: number; west: number }

/** Is a point inside a viewport rectangle? Used by "search this area". */
export function pointInViewport(b: ViewportBounds, p: { lat: number; lng: number }): boolean {
  return p.lat >= b.south && p.lat <= b.north && p.lng >= b.west && p.lng <= b.east;
}

/** A finite (0,0) pair is almost always a data error ("null island"). */
export function isSuspiciousCoordinate(lat: unknown, lng: unknown): boolean {
  return isValidCoordinate(lat, lng) && lat === 0 && lng === 0;
}

// ── Data-quality scans (power the audit + tests) ───────────────────────────
export interface DuplicateGroup<T> { key: string; rows: T[] }

/**
 * Group rows by (provider, provider_place_id) — any group with >1 row is what
 * the DB unique index `places_provider_place_uidx` forbids.
 */
export function findDuplicateProviderPlaceIds<T extends RawPlaceLocation>(rows: T[]): DuplicateGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const id = (r.provider_place_id ?? '').trim();
    if (!id) continue;
    const key = `${r.location_provider ?? ''}::${id}`;
    (map.get(key) ?? map.set(key, []).get(key)!).push(r);
  }
  return Array.from(map.entries()).filter(([, rs]) => rs.length > 1).map(([key, rows]) => ({ key, rows }));
}

/**
 * Group rows by rounded coordinate (default 5 dp ≈ 1.1 m). Groups with >1 row
 * are likely duplicate pins. Only considers rows with a valid coordinate pair.
 */
export function findDuplicateCoordinates<T extends RawPlaceLocation>(rows: T[], decimals = 5): DuplicateGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const lat = parseCoordinate(r.lat ?? null);
    const lng = parseCoordinate(r.lng ?? null);
    if (!isValidCoordinate(lat, lng)) continue;
    const key = `${(lat as number).toFixed(decimals)},${(lng as number).toFixed(decimals)}`;
    (map.get(key) ?? map.set(key, []).get(key)!).push(r);
  }
  return Array.from(map.entries()).filter(([, rs]) => rs.length > 1).map(([key, rows]) => ({ key, rows }));
}

/** Exactly one of lat/lng set — the form/persisted "could disagree" class. */
export function hasIncompleteCoordinatePair(row: RawPlaceLocation): boolean {
  const latSet = !isBlankCoordinate(row.lat ?? null);
  const lngSet = !isBlankCoordinate(row.lng ?? null);
  return latSet !== lngSet;
}

export interface LocationAuditCounts {
  total: number;
  published: number;
  draft: number;
  validCoordinates: number;
  missingCoordinates: number;
  invalidRange: number;
  incompletePair: number;
  suspiciousZero: number;
  outsideJapan: number;
  publishedMissingCoordinates: number;
  addressButNoCoordinates: number;
  coordinatesButNoAddress: number;
}

/** A place is "published" unless its status is explicitly pending/rejected. */
export function isPublished(row: RawPlaceLocation): boolean {
  const s = row.status ?? null;
  return s === null || s === 'approved';
}

/** Compute the full audit tally over a set of rows. Pure & deterministic. */
export function auditPlaceLocations(rows: RawPlaceLocation[]): LocationAuditCounts {
  const c: LocationAuditCounts = {
    total: rows.length, published: 0, draft: 0, validCoordinates: 0, missingCoordinates: 0,
    invalidRange: 0, incompletePair: 0, suspiciousZero: 0, outsideJapan: 0,
    publishedMissingCoordinates: 0, addressButNoCoordinates: 0, coordinatesButNoAddress: 0,
  };

  for (const r of rows) {
    const loc = normalizePlaceLocation(r);
    const published = isPublished(r);
    if (published) c.published++; else c.draft++;

    if (loc.hasValidCoordinates) {
      c.validCoordinates++;
      if (isSuspiciousCoordinate(loc.lat, loc.lng)) c.suspiciousZero++;
      if (!isInJapanBounds(loc.lat, loc.lng)) c.outsideJapan++;
      if (!loc.hasAddress) c.coordinatesButNoAddress++;
    } else {
      c.missingCoordinates++;
      if (published) c.publishedMissingCoordinates++;
      if (loc.hasAddress) c.addressButNoCoordinates++;
    }

    // Out-of-range = a non-blank value that fails validity (distinct from blank/missing).
    const latNum = parseCoordinate(r.lat ?? null);
    const lngNum = parseCoordinate(r.lng ?? null);
    const anyNonBlank = !isBlankCoordinate(r.lat ?? null) || !isBlankCoordinate(r.lng ?? null);
    if (anyNonBlank && !isValidCoordinate(latNum, lngNum) && !hasIncompleteCoordinatePair(r)) c.invalidRange++;
    if (hasIncompleteCoordinatePair(r)) c.incompletePair++;
  }
  return c;
}
