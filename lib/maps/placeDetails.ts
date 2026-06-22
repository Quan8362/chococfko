// ============================================================
// Pure mapping from a Google Place (New Places API) to our location domain
// (Map UX Phase 5). Operates on PLAIN objects so it is unit-testable without the
// Google SDK — the client component passes the Place's fields straight in.
//
// Cost control: PLACE_DETAIL_FIELDS is the MINIMAL field mask we request on
// selection. Autocomplete predictions are rendered WITHOUT any details fetch.
// ============================================================

import { isValidCoordinate } from '../coordinates.ts';

/** Minimal Place Details field mask (Essentials-tier fields only). */
export const PLACE_DETAIL_FIELDS = [
  'id',
  'displayName',
  'formattedAddress',
  'location',
  'addressComponents',
  'googleMapsURI',
] as const;

export interface AddressParts {
  postalCode: string | null;
  countryCode: string | null;
  prefecture: string | null;
  city: string | null;
  ward: string | null;
}

export interface SelectedLocation extends AddressParts {
  lat: number;
  lng: number;
  providerPlaceId: string | null;
  formattedAddress: string | null;
  mapsUrl: string | null;
  name: string | null;
}

// Tolerant shapes — the New API returns camelCase (longText/shortText), but we
// also accept legacy snake_case (long_name/short_name) and method-style LatLng.
interface AddressComponentLike {
  types?: string[];
  longText?: string | null;
  shortText?: string | null;
  long_name?: string | null;
  short_name?: string | null;
}
interface LatLngLike {
  lat?: number | (() => number);
  lng?: number | (() => number);
}
export interface PlaceLike {
  id?: string | null;
  displayName?: string | { text?: string } | null;
  formattedAddress?: string | null;
  googleMapsURI?: string | null;
  location?: LatLngLike | null;
  addressComponents?: AddressComponentLike[] | null;
}

function coord(v: number | (() => number) | undefined): number | null {
  if (typeof v === 'function') { const n = v(); return Number.isFinite(n) ? n : null; }
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Extract a {lat,lng} from a Place's location (literal or method-style). */
export function placeLatLng(place: PlaceLike): { lat: number; lng: number } | null {
  const loc = place.location;
  if (!loc) return null;
  const lat = coord(loc.lat);
  const lng = coord(loc.lng);
  return isValidCoordinate(lat, lng) ? { lat: lat as number, lng: lng as number } : null;
}

function compText(c: AddressComponentLike, prefer: 'long' | 'short' = 'long'): string {
  const long = c.longText ?? c.long_name ?? '';
  const short = c.shortText ?? c.short_name ?? '';
  return (prefer === 'short' ? short || long : long || short).trim();
}

/** Map Google addressComponents → our structured parts (Japan-aware). */
export function addressComponentsToParts(components: AddressComponentLike[] | null | undefined): AddressParts {
  const out: AddressParts = { postalCode: null, countryCode: null, prefecture: null, city: null, ward: null };
  for (const c of components ?? []) {
    const types = c.types ?? [];
    if (types.includes('postal_code')) out.postalCode ||= compText(c) || null;
    if (types.includes('country')) out.countryCode ||= (compText(c, 'short') || null);
    if (types.includes('administrative_area_level_1')) out.prefecture ||= compText(c) || null;
    // City: locality (e.g. 福岡市) preferred; fall back to admin_area_level_2.
    if (types.includes('locality')) out.city ||= compText(c) || null;
    if (!out.city && types.includes('administrative_area_level_2')) out.city = compText(c) || null;
    // Ward: sublocality_level_1 / ward (e.g. 博多区).
    if (types.includes('sublocality_level_1') || types.includes('ward')) out.ward ||= compText(c) || null;
  }
  return out;
}

function displayNameText(d: PlaceLike['displayName']): string | null {
  if (!d) return null;
  if (typeof d === 'string') return d.trim() || null;
  return (d.text ?? '').trim() || null;
}

/**
 * Map a fetched Place into our SelectedLocation, or null if it has no valid
 * coordinate (a selection without coordinates is unusable for the map).
 */
export function mapPlaceToLocation(place: PlaceLike): SelectedLocation | null {
  const ll = placeLatLng(place);
  if (!ll) return null;
  const parts = addressComponentsToParts(place.addressComponents);
  return {
    lat: ll.lat,
    lng: ll.lng,
    providerPlaceId: (place.id ?? '').trim() || null,
    formattedAddress: (place.formattedAddress ?? '').trim() || null,
    mapsUrl: (place.googleMapsURI ?? '').trim() || null,
    name: displayNameText(place.displayName),
    ...parts,
  };
}
