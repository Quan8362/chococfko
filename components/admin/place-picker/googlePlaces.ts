'use client'

// Thin client wrapper around the NEW Google Places API (Places library of the
// Maps JS API), loaded lazily via the Phase-3 bootstrap loader. Browser-only.
//
// Non-legacy surface (verified against current docs):
//   AutocompleteSuggestion.fetchAutocompleteSuggestions({ input, sessionToken, … })
//   → suggestion.placePrediction.toPlace() → place.fetchFields({ fields })
// Session tokens group typing + one selection into one billable session; a NEW
// token must be created after each selection (fetchFields concludes the session).

import { loadGoogleMaps } from '@/lib/maps/google/loader'
import { PLACE_DETAIL_FIELDS, type PlaceLike } from '@/lib/maps/placeDetails'

// Loosely-typed handles (no @types/google.maps dependency).
/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyObj = Record<string, any>

export interface Suggestion {
  placeId: string | null
  mainText: string
  secondaryText: string
  types: string[]
  /** The underlying placePrediction (used to call toPlace()). */
  prediction: AnyObj
}

async function placesLib(apiKey: string | null): Promise<AnyObj> {
  const maps = await loadGoogleMaps({ apiKey })
  return (await maps.importLibrary('places')) as AnyObj
}

/** Create a fresh autocomplete session token. */
export async function newSessionToken(apiKey: string | null): Promise<AnyObj> {
  const places = await placesLib(apiKey)
  return new places.AutocompleteSessionToken()
}

const fmtText = (t: any): string =>
  (typeof t === 'string' ? t : (t?.text ?? '')) || ''

export interface AutocompleteOpts {
  language?: string
  /** Bias results toward a region (rectangle) — used to favour Japan/Fukuoka. */
  locationBias?: { north: number; south: number; east: number; west: number }
  signal?: AbortSignal
}

/** Fetch autocomplete predictions for `input`. Renders WITHOUT any details fetch. */
export async function fetchSuggestions(
  apiKey: string | null,
  input: string,
  sessionToken: AnyObj,
  opts: AutocompleteOpts = {},
): Promise<Suggestion[]> {
  const places = await placesLib(apiKey)
  const request: AnyObj = { input, sessionToken, language: opts.language, region: 'jp' }
  if (opts.locationBias) request.locationBias = opts.locationBias
  const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions(request)
  if (opts.signal?.aborted) return []
  return (suggestions ?? [])
    .map((s: AnyObj): Suggestion | null => {
      const p = s.placePrediction
      if (!p) return null // skip queryPrediction-only rows
      return {
        placeId: p.placeId ?? null,
        mainText: fmtText(p.mainText) || fmtText(p.text),
        secondaryText: fmtText(p.secondaryText),
        types: p.types ?? [],
        prediction: p,
      }
    })
    .filter((x: Suggestion | null): x is Suggestion => x !== null)
}

/** Fetch the minimal Place Details for a chosen prediction (concludes the session). */
export async function fetchPlaceFromPrediction(prediction: AnyObj): Promise<PlaceLike> {
  const place = prediction.toPlace()
  await place.fetchFields({ fields: [...PLACE_DETAIL_FIELDS] })
  return place as PlaceLike
}

/** Fetch the minimal Place Details by Place ID (used when a link yields an id). */
export async function fetchPlaceById(
  apiKey: string | null,
  placeId: string,
  sessionToken?: AnyObj,
): Promise<PlaceLike> {
  const places = await placesLib(apiKey)
  const place = new places.Place({ id: placeId, ...(sessionToken ? { sessionToken } : {}) })
  await place.fetchFields({ fields: [...PLACE_DETAIL_FIELDS] })
  return place as PlaceLike
}

export interface ReverseResult {
  formattedAddress: string | null
  addressComponents: AnyObj[]
  placeId: string | null
}

/** Reverse-geocode a coordinate (billable Geocoding call — debounce the caller). */
export async function reverseGeocode(apiKey: string | null, lat: number, lng: number): Promise<ReverseResult | null> {
  const maps = await loadGoogleMaps({ apiKey })
  const { Geocoder } = (await maps.importLibrary('geocoding')) as AnyObj
  const geocoder = new Geocoder()
  const { results } = await geocoder.geocode({ location: { lat, lng } })
  const r = results?.[0]
  if (!r) return null
  return {
    formattedAddress: r.formatted_address ?? null,
    addressComponents: r.address_components ?? [],
    placeId: r.place_id ?? null,
  }
}
