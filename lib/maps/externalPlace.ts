// ============================================================
// External Google place → minimal preview model (Map UX Phase 7). PURE/testable.
//
// COST CONTROL is the whole point of this file: EXTERNAL_PREVIEW_FIELDS is the
// MINIMAL Essentials field mask we ever request for a public external preview.
// We DELIBERATELY never request the expensive fields enumerated in
// EXPENSIVE_FIELDS_NEVER_DEFAULT (reviews/ratings/photos/phone/hours/atmosphere).
// A build-time test asserts the two sets are disjoint.
//
// An external preview must NEVER be styled as Chợ Cóc FKO editorial content —
// the UI carries provider attribution and external styling instead.
// ============================================================

import { placeLatLng, type PlaceLike as DetailsPlaceLike } from './placeDetails.ts';

/** Minimal field mask for a PUBLIC external preview (Essentials tier only). */
export const EXTERNAL_PREVIEW_FIELDS = [
  'id',
  'displayName',
  'formattedAddress',
  'location',
  'types',
  'googleMapsURI',
] as const;

/**
 * Fields we must NOT request by default (expensive / Pro / atmosphere). Listed
 * explicitly so the cost contract is enforceable by a unit test and reviewable.
 */
export const EXPENSIVE_FIELDS_NEVER_DEFAULT = [
  'reviews',
  'rating',
  'userRatingCount',
  'photos',
  'nationalPhoneNumber',
  'internationalPhoneNumber',
  'regularOpeningHours',
  'currentOpeningHours',
  'editorialSummary',
  'priceLevel',
  'businessStatus',
] as const;

/** Provider attribution token (rendered, never omitted, on external results). */
export const EXTERNAL_PROVIDER = 'google' as const;

export interface ExternalPlacePreview {
  /** Discriminates external state from internal state in the UI. */
  source: 'google';
  providerPlaceId: string | null;
  name: string | null;
  formattedAddress: string | null;
  /** First (primary) Google place type, humanized for display. */
  primaryType: string | null;
  types: string[];
  lat: number | null;
  lng: number | null;
  mapsUrl: string | null;
}

interface ExternalPlaceLike extends DetailsPlaceLike {
  types?: string[] | null;
}

function nameText(d: ExternalPlaceLike['displayName']): string | null {
  if (!d) return null;
  if (typeof d === 'string') return d.trim() || null;
  return (d.text ?? '').trim() || null;
}

/** Humanize a Google place type token ("food_court" → "food court"). */
export function humanizeType(t: string | null | undefined): string | null {
  const s = (t ?? '').trim();
  return s ? s.replace(/_/g, ' ') : null;
}

/**
 * Map a fetched Google Place (minimal mask) into our external preview model.
 * Returns the preview even without coordinates (name/address can still show),
 * but lat/lng are null when absent so the map layer can skip placing a pin.
 */
export function mapPlaceToExternalPreview(place: ExternalPlaceLike): ExternalPlacePreview {
  const ll = placeLatLng(place);
  const types = Array.isArray(place.types) ? place.types.filter((x): x is string => typeof x === 'string') : [];
  return {
    source: 'google',
    providerPlaceId: (place.id ?? '').trim() || null,
    name: nameText(place.displayName),
    formattedAddress: (place.formattedAddress ?? '').trim() || null,
    primaryType: humanizeType(types[0]),
    types,
    lat: ll ? ll.lat : null,
    lng: ll ? ll.lng : null,
    mapsUrl: (place.googleMapsURI ?? '').trim() || null,
  };
}

/** "Open in Google Maps" deep link (free — no API). Prefers the canonical URI. */
export function externalOpenInMapsUrl(p: Pick<ExternalPlacePreview, 'mapsUrl' | 'providerPlaceId' | 'lat' | 'lng' | 'name'>): string {
  if (p.mapsUrl) return p.mapsUrl;
  if (p.providerPlaceId) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name ?? '')}&query_place_id=${encodeURIComponent(p.providerPlaceId)}`;
  if (p.lat != null && p.lng != null) return `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name ?? '')}`;
}

/** Directions deep link (free — no API). */
export function externalDirectionsUrl(p: Pick<ExternalPlacePreview, 'providerPlaceId' | 'lat' | 'lng' | 'name'>): string {
  const base = 'https://www.google.com/maps/dir/?api=1';
  if (p.lat != null && p.lng != null) {
    const dest = `${base}&destination=${p.lat},${p.lng}`;
    return p.providerPlaceId ? `${dest}&destination_place_id=${encodeURIComponent(p.providerPlaceId)}` : dest;
  }
  if (p.providerPlaceId) return `${base}&destination=${encodeURIComponent(p.name ?? '')}&destination_place_id=${encodeURIComponent(p.providerPlaceId)}`;
  return `${base}&destination=${encodeURIComponent(p.name ?? '')}`;
}
