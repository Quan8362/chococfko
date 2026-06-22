'use client'

// ============================================================
// Public external Google search (Map UX Phase 7). Browser-only, FLAG-GATED.
//
// Kept SEPARATE from the Admin picker's googlePlaces.ts so public and internal
// concerns never bleed together, but it reuses the same Phase-3 bootstrap loader
// and the New Places API surface (no legacy). Cost controls live here:
//   • predictions render with NO Place Details fetch;
//   • a SHARED session token bundles typing + one details call (reset after each
//     selection — fetchFields concludes the session);
//   • the MINIMAL EXTERNAL_PREVIEW_FIELDS mask (never reviews/photos/phone/hours);
//   • a per-session detailsCache so re-selecting / re-clicking the SAME place id
//     does not bill a second Place Details call within the session.
// ============================================================

import { loadGoogleMaps } from '@/lib/maps/google/loader'
import { EXTERNAL_PREVIEW_FIELDS, mapPlaceToExternalPreview, type ExternalPlacePreview } from '@/lib/maps/externalPlace'

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyObj = Record<string, any>

export interface ExternalSuggestion {
  placeId: string | null
  mainText: string
  secondaryText: string
  types: string[]
  prediction: AnyObj
}

const fmtText = (t: any): string => (typeof t === 'string' ? t : (t?.text ?? '')) || ''

async function placesLib(apiKey: string | null): Promise<AnyObj> {
  const maps = await loadGoogleMaps({ apiKey })
  return (await maps.importLibrary('places')) as AnyObj
}

export async function newExternalSessionToken(apiKey: string | null): Promise<AnyObj> {
  const places = await placesLib(apiKey)
  return new places.AutocompleteSessionToken()
}

export interface ExternalAutocompleteOpts {
  language?: string
  locationBias?: { north: number; south: number; east: number; west: number }
  signal?: AbortSignal
}

/** Autocomplete predictions (rendered WITHOUT any details fetch). */
export async function fetchExternalSuggestions(
  apiKey: string | null,
  input: string,
  sessionToken: AnyObj,
  opts: ExternalAutocompleteOpts = {},
): Promise<ExternalSuggestion[]> {
  const places = await placesLib(apiKey)
  const request: AnyObj = { input, sessionToken, language: opts.language, region: 'jp' }
  if (opts.locationBias) request.locationBias = opts.locationBias
  const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions(request)
  if (opts.signal?.aborted) return []
  return (suggestions ?? [])
    .map((s: AnyObj): ExternalSuggestion | null => {
      const p = s.placePrediction
      if (!p) return null
      return {
        placeId: p.placeId ?? null,
        mainText: fmtText(p.mainText) || fmtText(p.text),
        secondaryText: fmtText(p.secondaryText),
        types: p.types ?? [],
        prediction: p,
      }
    })
    .filter((x: ExternalSuggestion | null): x is ExternalSuggestion => x !== null)
}

/** A per-session details cache — avoids re-billing the SAME place id. */
export function createDetailsCache() {
  const cache = new Map<string, ExternalPlacePreview>()
  return {
    get: (id: string | null): ExternalPlacePreview | undefined => (id ? cache.get(id) : undefined),
    set: (preview: ExternalPlacePreview): void => { if (preview.providerPlaceId) cache.set(preview.providerPlaceId, preview) },
    has: (id: string | null): boolean => !!id && cache.has(id),
  }
}
export type DetailsCache = ReturnType<typeof createDetailsCache>

/** Minimal Place Details for a chosen prediction (concludes the session). */
export async function fetchExternalPreviewFromPrediction(prediction: AnyObj, cache?: DetailsCache): Promise<ExternalPlacePreview> {
  const cached = cache?.get(prediction.placeId ?? null)
  if (cached) return cached
  const place = prediction.toPlace()
  await place.fetchFields({ fields: [...EXTERNAL_PREVIEW_FIELDS] })
  const preview = mapPlaceToExternalPreview(place)
  cache?.set(preview)
  return preview
}

/** Minimal Place Details by Place ID (base-map POI click / link resolve). */
export async function fetchExternalPreviewById(
  apiKey: string | null,
  placeId: string,
  cache?: DetailsCache,
): Promise<ExternalPlacePreview> {
  const cached = cache?.get(placeId)
  if (cached) return cached
  const places = await placesLib(apiKey)
  const place = new places.Place({ id: placeId })
  await place.fetchFields({ fields: [...EXTERNAL_PREVIEW_FIELDS] })
  const preview = mapPlaceToExternalPreview(place)
  cache?.set(preview)
  return preview
}
