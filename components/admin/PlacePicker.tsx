'use client'

// ============================================================
// Admin place picker (Map UX Phase 5).
//
// Workflow: Search → Select → Review marker → Adjust → Confirm → Save.
// Lat/lng live in a collapsed "Advanced technical location data" section. When
// Google is not configured (flag off / no key) the picker degrades to the
// Phase-2 manual coordinate experience, so Admin editing always works.
//
// Emits hidden form fields consumed by the `updatePlace` server action, so the
// existing <form action={updatePlace}> persists everything on Save.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { parseCoordinate, isValidCoordinate, latFieldError, lngFieldError, coordinateWarnings } from '@/lib/coordinates'
import type { LocationSource } from '@/lib/placeLocation'
import { mapPlaceToLocation, addressComponentsToParts, type SelectedLocation } from '@/lib/maps/placeDetails'
import { parseGoogleMapsUrl } from '@/lib/maps/links'
import {
  fetchSuggestions, fetchPlaceFromPrediction, fetchPlaceById, reverseGeocode,
  newSessionToken, type Suggestion,
} from './place-picker/googlePlaces'
import PickerMap from './place-picker/PickerMap'

const I = 'w-full text-[14px] px-3.5 py-2.5 border-[1.5px] border-line rounded-xl bg-white focus:outline-none focus:border-rose'
const LBL = 'block text-[13px] font-semibold mb-1.5 text-[#5c4d44]'
const HELP = 'text-[11.5px] text-muted mt-1'
const JAPAN_BIAS = { north: 45.7, south: 24.0, east: 146.0, west: 122.9 }
const MIN_CHARS = 2
const DEBOUNCE_MS = 300

interface InitialLocation {
  lat: number | null; lng: number | null; address: string | null; mapUrl: string | null
  provider: string | null; providerPlaceId: string | null; formattedAddress: string | null
  countryCode: string | null; source: string | null; manuallyAdjusted: boolean
}
interface Props {
  initial: InitialLocation
  googleAvailable: boolean
  apiKey: string | null
  mapId: string | null
}

type Parts = { postalCode: string | null; prefecture: string | null; city: string | null; ward: string | null }
interface LocState {
  lat: number | null; lng: number | null
  provider: 'manual' | 'google' | null
  providerPlaceId: string | null
  formattedAddress: string | null
  mapsUrl: string | null
  countryCode: string | null
  name: string | null
  source: LocationSource | null
  manuallyAdjusted: boolean
  confirmed: boolean
  parts: Parts | null
}

function initState(i: InitialLocation): LocState {
  return {
    lat: i.lat, lng: i.lng,
    provider: i.provider === 'google' ? 'google' : i.provider === 'manual' ? 'manual' : null,
    providerPlaceId: i.providerPlaceId, formattedAddress: i.formattedAddress, mapsUrl: i.mapUrl,
    countryCode: i.countryCode, name: null, source: (i.source as LocationSource) ?? null,
    manuallyAdjusted: i.manuallyAdjusted, confirmed: false, parts: null,
  }
}

export default function PlacePicker({ initial, googleAvailable, apiKey, mapId }: Props) {
  const t = useTranslations('place_picker')
  const tf = useTranslations('place_fields')
  const locale = useLocale()

  const [loc, setLoc] = useState<LocState>(() => initState(initial))
  const [advancedOpen, setAdvancedOpen] = useState(!googleAvailable)
  const [dirty, setDirty] = useState(false)

  // search state
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [searchState, setSearchState] = useState<'' | 'loading' | 'zero' | 'error'>('')
  const [activeIdx, setActiveIdx] = useState(-1)
  const [linkError, setLinkError] = useState(false)
  const [mapStatus, setMapStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [geoStatus, setGeoStatus] = useState<'' | 'locating' | 'denied' | 'error' | 'unsupported' | 'insecure'>('')
  const [suggestedAddress, setSuggestedAddress] = useState<string | null>(null)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessionRef = useRef<any>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reqIdRef = useRef(0)
  const reverseRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const update = useCallback((patch: Partial<LocState>) => {
    setLoc((s) => ({ ...s, ...patch }))
    setDirty(true)
  }, [])

  // Reset when a different place is loaded.
  useEffect(() => { setLoc(initState(initial)); setDirty(false); setQuery(''); setSuggestions([]) }, [initial])

  // Warn before leaving with unsaved location changes.
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  const valid = isValidCoordinate(loc.lat, loc.lng)
  const warnings = coordinateWarnings({ lat: loc.lat, lng: loc.lng, hasMapUrl: !!loc.mapsUrl, hasAddress: !!(initial.address || loc.formattedAddress) })

  // ── Autocomplete (debounced, min chars, stale-cancel, session token) ──
  const runSearch = useCallback(async (input: string) => {
    if (!sessionRef.current) sessionRef.current = await newSessionToken(apiKey)
    const myId = ++reqIdRef.current
    setSearchState('loading')
    try {
      const res = await fetchSuggestions(apiKey, input, sessionRef.current, {
        language: locale, locationBias: JAPAN_BIAS,
      })
      if (myId !== reqIdRef.current) return // stale
      setSuggestions(res); setActiveIdx(-1); setSearchState(res.length ? '' : 'zero')
    } catch {
      if (myId !== reqIdRef.current) return
      setSuggestions([]); setSearchState('error')
    }
  }, [apiKey, locale])

  const onQueryChange = (v: string) => {
    setQuery(v); setLinkError(false)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const trimmed = v.trim()
    // A pasted URL is handled on explicit action (Enter / paste button), not as you type.
    if (trimmed.length < MIN_CHARS || /^https?:\/\//i.test(trimmed) || /^geo:/i.test(trimmed)) {
      setSuggestions([]); setSearchState(''); return
    }
    debounceRef.current = setTimeout(() => void runSearch(trimmed), DEBOUNCE_MS)
  }

  const applySelected = useCallback((d: SelectedLocation, source: LocationSource) => {
    update({
      lat: d.lat, lng: d.lng, provider: 'google', providerPlaceId: d.providerPlaceId,
      formattedAddress: d.formattedAddress, mapsUrl: d.mapsUrl, countryCode: d.countryCode,
      name: d.name, source, manuallyAdjusted: false, confirmed: false,
      parts: { postalCode: d.postalCode, prefecture: d.prefecture, city: d.city, ward: d.ward },
    })
    setSuggestions([]); setSearchState(''); setSuggestedAddress(null)
    sessionRef.current = null // session concluded by fetchFields → next search starts a new one
  }, [update])

  const selectSuggestion = useCallback(async (s: Suggestion) => {
    setQuery(s.mainText)
    try {
      const place = await fetchPlaceFromPrediction(s.prediction)
      const d = mapPlaceToLocation(place)
      if (d) applySelected(d, 'admin_search')
      else setSearchState('error')
    } catch { setSearchState('error') }
  }, [applySelected])

  // ── Keyboard navigation ──
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!suggestions.length) {
      if (e.key === 'Enter' && /^(https?:\/\/|geo:)/i.test(query.trim())) { e.preventDefault(); void handleLink(query.trim()) }
      return
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); const s = suggestions[activeIdx] ?? suggestions[0]; if (s) void selectSuggestion(s) }
    else if (e.key === 'Escape') { setSuggestions([]); setSearchState('') }
  }

  // ── Google Maps link paste ──
  const handleLink = useCallback(async (raw: string) => {
    setLinkError(false)
    const parsed = parseGoogleMapsUrl(raw)
    if (!parsed) { setLinkError(true); return }
    if (parsed.kind === 'short') {
      // Short links need a server-side redirect follow — not resolved here.
      setLinkError(true); return
    }
    try {
      if (parsed.kind === 'placeId') {
        const place = await fetchPlaceById(apiKey, parsed.placeId)
        const d = mapPlaceToLocation(place)
        if (d) { applySelected(d, 'admin_search'); setQuery(d.name ?? '') ; return }
        setLinkError(true); return
      }
      if (parsed.kind === 'coords') {
        update({
          lat: parsed.lat, lng: parsed.lng, provider: 'manual',
          providerPlaceId: parsed.placeId ?? null, source: 'imported', manuallyAdjusted: true, confirmed: false,
          name: parsed.name, parts: null,
        })
        setQuery(parsed.name ?? `${parsed.lat}, ${parsed.lng}`); setSuggestions([])
        return
      }
      // kind === 'query' → run a normal autocomplete on the extracted text
      setQuery(parsed.query); void runSearch(parsed.query)
    } catch { setLinkError(true) }
  }, [apiKey, applySelected, runSearch, update])

  // ── Map click / POI / marker drag ──
  const onMapPick = useCallback(async (lat: number, lng: number, placeId: string | null) => {
    if (placeId && googleAvailable) {
      // A base-map POI was clicked → fetch its details like a selection.
      try {
        const place = await fetchPlaceById(apiKey, placeId)
        const d = mapPlaceToLocation(place)
        if (d) { applySelected(d, 'map_click'); update({ manuallyAdjusted: false }); return }
      } catch { /* fall through to a plain point */ }
    }
    update({ lat, lng, provider: 'manual', providerPlaceId: null, source: 'map_click', manuallyAdjusted: true, confirmed: false })
    scheduleReverse(lat, lng)
    // scheduleReverse is a stable-enough closure; intentionally omitted from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, applySelected, googleAvailable, update])

  const onMarkerContext = useCallback((lat: number, lng: number) => {
    update({ lat, lng, source: 'marker_drag', manuallyAdjusted: true, confirmed: false })
    scheduleReverse(lat, lng)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [update])

  // Debounced reverse geocode → SUGGEST an address (never auto-overwrites editorial).
  const scheduleReverse = (lat: number, lng: number) => {
    if (!googleAvailable) return
    if (reverseRef.current) clearTimeout(reverseRef.current)
    reverseRef.current = setTimeout(async () => {
      try {
        const r = await reverseGeocode(apiKey, lat, lng)
        if (!r) return
        setSuggestedAddress(r.formattedAddress)
        const parts = addressComponentsToParts(r.addressComponents)
        setLoc((s) => ({ ...s, parts, countryCode: s.countryCode ?? parts.countryCode }))
      } catch { /* reverse geocode is best-effort */ }
    }, 600)
  }

  // The map onPick handles both click and drag (drag reports placeId=null).
  const handlePick = (lat: number, lng: number, placeId: string | null) => {
    if (placeId) void onMapPick(lat, lng, placeId)
    else onMarkerOrClick(lat, lng)
  }
  // Distinguish a fresh click vs a marker nudge is not reliable from coords alone;
  // both are "manual adjust". Treat as map_click when there's no prior point, else drag.
  const onMarkerOrClick = (lat: number, lng: number) => {
    if (loc.lat == null) update({ lat, lng, provider: 'manual', providerPlaceId: null, source: 'map_click', manuallyAdjusted: true, confirmed: false })
    else onMarkerContext(lat, lng)
  }

  // ── Current location (only on explicit click) ──
  const useMyLocation = () => {
    if (typeof window !== 'undefined' && !window.isSecureContext) { setGeoStatus('insecure'); return }
    if (!('geolocation' in navigator)) { setGeoStatus('unsupported'); return }
    setGeoStatus('locating')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoStatus('')
        update({ lat: pos.coords.latitude, lng: pos.coords.longitude, provider: 'manual', providerPlaceId: null, source: 'current_location', manuallyAdjusted: true, confirmed: false })
        scheduleReverse(pos.coords.latitude, pos.coords.longitude)
      },
      (err) => setGeoStatus(err.code === err.PERMISSION_DENIED ? 'denied' : err.code === err.TIMEOUT ? 'error' : 'error'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    )
  }

  const clearLocation = () => {
    setLoc({ lat: null, lng: null, provider: null, providerPlaceId: null, formattedAddress: null, mapsUrl: loc.mapsUrl, countryCode: null, name: null, source: null, manuallyAdjusted: false, confirmed: false, parts: null })
    setQuery(''); setSuggestions([]); setSuggestedAddress(null); setDirty(true)
  }
  const confirmLocation = () => { if (valid) update({ confirmed: true }) }

  // Advanced raw lat/lng editing.
  const latStr = loc.lat == null ? '' : String(loc.lat)
  const lngStr = loc.lng == null ? '' : String(loc.lng)
  const setLatStr = (v: string) => { const n = parseCoordinate(v); update({ lat: n, source: 'manually_entered', manuallyAdjusted: true, confirmed: false, provider: loc.provider ?? 'manual' }) }
  const setLngStr = (v: string) => { const n = parseCoordinate(v); update({ lng: n, source: 'manually_entered', manuallyAdjusted: true, confirmed: false, provider: loc.provider ?? 'manual' }) }
  const latErr = latFieldError(latStr)
  const lngErr = lngFieldError(lngStr)

  const statusBadge = useMemo(() => {
    if (!valid) return { text: t('status_none'), cls: 'bg-cream text-muted border-line' }
    if (loc.confirmed) return { text: t('status_confirmed'), cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
    return { text: t('status_selected'), cls: 'bg-amber-50 text-amber-700 border-amber-200' }
  }, [valid, loc.confirmed, t])

  return (
    <div className="space-y-3">
      {/* hidden fields consumed by updatePlace */}
      <input type="hidden" name="lat" value={latStr} readOnly />
      <input type="hidden" name="lng" value={lngStr} readOnly />
      <input type="hidden" name="location_provider" value={loc.provider ?? ''} readOnly />
      <input type="hidden" name="provider_place_id" value={loc.providerPlaceId ?? ''} readOnly />
      <input type="hidden" name="provider_formatted_address" value={loc.formattedAddress ?? ''} readOnly />
      <input type="hidden" name="provider_maps_url" value={loc.provider === 'google' ? (loc.mapsUrl ?? '') : ''} readOnly />
      <input type="hidden" name="country_code" value={loc.countryCode ?? ''} readOnly />
      <input type="hidden" name="location_source" value={loc.source ?? ''} readOnly />
      <input type="hidden" name="location_manually_adjusted" value={loc.manuallyAdjusted ? 'true' : 'false'} readOnly />
      <input type="hidden" name="location_confirmed" value={loc.confirmed ? '1' : '0'} readOnly />

      {googleAvailable ? (
        <>
          {/* Search */}
          <div className="relative">
            <label className={LBL} htmlFor="place-search">{t('search_label')}</label>
            <div className="flex gap-2">
              <input
                id="place-search" type="text" role="combobox" aria-expanded={suggestions.length > 0}
                aria-controls="place-suggestions" aria-autocomplete="list"
                aria-activedescendant={suggestions.length > 0 && activeIdx >= 0 ? `pp-opt-${activeIdx}` : undefined}
                value={query} onChange={(e) => onQueryChange(e.target.value)} onKeyDown={onKeyDown}
                placeholder={t('search_placeholder')} autoComplete="off"
                className={I}
              />
              {/^(https?:\/\/|geo:)/i.test(query.trim()) && (
                <button type="button" onClick={() => void handleLink(query.trim())}
                  className="flex-none px-3.5 rounded-xl bg-teal text-white text-[13px] font-semibold hover:bg-teal/90">{t('resolve_link')}</button>
              )}
            </div>
            {searchState === 'loading' && <p className={HELP}>{t('searching')}</p>}
            {searchState === 'zero' && <p className={HELP}>{t('no_results')}</p>}
            {searchState === 'error' && <p className="text-[11.5px] text-rose mt-1">{t('search_error')}</p>}
            {linkError && <p className="text-[11.5px] text-rose mt-1">{t('link_error')}</p>}

            {suggestions.length > 0 && (
              <ul id="place-suggestions" role="listbox"
                className="absolute z-[60] left-0 right-0 mt-1 bg-white border border-line rounded-xl shadow-lg overflow-hidden max-h-[300px] overflow-y-auto">
                {suggestions.map((s, i) => (
                  <li key={`${s.placeId ?? s.mainText}-${i}`} id={`pp-opt-${i}`} role="option" aria-selected={i === activeIdx}>
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); void selectSuggestion(s) }}
                      onMouseEnter={() => setActiveIdx(i)}
                      className={`w-full text-left px-3.5 py-2.5 ${i === activeIdx ? 'bg-rose-soft' : 'bg-white'} hover:bg-rose-soft`}>
                      <div className="text-[14px] font-semibold text-ink truncate">{s.mainText}</div>
                      {s.secondaryText && <div className="text-[12px] text-muted truncate">{s.secondaryText}</div>}
                      <div className="text-[10px] text-teal mt-0.5">{t('provider_google')}{s.types[0] ? ` · ${s.types[0].replace(/_/g, ' ')}` : ''}</div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Map preview */}
          <div className="relative w-full h-[44vh] sm:h-[360px] rounded-2xl overflow-hidden border border-line">
            <PickerMap apiKey={apiKey} mapId={mapId} lat={loc.lat} lng={loc.lng} onPick={handlePick} onStatus={setMapStatus} />
            {mapStatus !== 'ready' && (
              <div className="absolute inset-0 grid place-items-center bg-cream/60 text-[12.5px] text-muted">
                {mapStatus === 'loading' ? t('map_loading') : t('map_error')}
              </div>
            )}
          </div>

          {/* Action row */}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={useMyLocation} className="text-[12.5px] font-semibold px-3 py-1.5 rounded-full bg-teal text-white hover:bg-teal/90">{t('use_my_location')}</button>
            {valid && !loc.confirmed && <button type="button" onClick={confirmLocation} className="text-[12.5px] font-semibold px-3 py-1.5 rounded-full bg-emerald-500 text-white hover:bg-emerald-600">{t('confirm_location')}</button>}
            {valid && <button type="button" onClick={clearLocation} className="text-[12.5px] font-semibold px-3 py-1.5 rounded-full border border-line text-muted hover:text-rose">{t('clear_location')}</button>}
            <span className={`text-[11.5px] font-semibold px-2.5 py-1 rounded-full border ${statusBadge.cls}`}>{statusBadge.text}</span>
            {loc.manuallyAdjusted && valid && <span className="text-[11px] text-amber-700">{t('manually_adjusted')}</span>}
            {geoStatus === 'locating' && <span className="text-[11.5px] text-muted">{t('geo_locating')}</span>}
            {geoStatus && geoStatus !== 'locating' && <span className="text-[11.5px] text-rose">{t(`geo_${geoStatus}` as 'geo_denied')}</span>}
          </div>

          {/* Selected-place summary */}
          {valid && (
            <div className="bg-paper border border-line rounded-xl p-3.5 text-[12.5px] space-y-1">
              {loc.name && <p className="font-semibold text-ink text-[14px]">{loc.name}</p>}
              {loc.formattedAddress && <p className="text-muted">{loc.formattedAddress}</p>}
              <p className="text-muted">{loc.lat?.toFixed(6)}, {loc.lng?.toFixed(6)}</p>
              {loc.parts && (loc.parts.prefecture || loc.parts.city || loc.parts.ward || loc.parts.postalCode) && (
                <p className="text-muted">
                  {[loc.parts.postalCode, loc.parts.prefecture, loc.parts.city, loc.parts.ward].filter(Boolean).join(' · ')}
                </p>
              )}
              {suggestedAddress && suggestedAddress !== loc.formattedAddress && (
                <button type="button" onClick={() => update({ formattedAddress: suggestedAddress })}
                  className="text-[12px] text-teal hover:underline">{t('apply_suggested_address', { address: suggestedAddress })}</button>
              )}
            </div>
          )}
        </>
      ) : (
        <p className="text-[12.5px] text-muted bg-cream/50 border border-line rounded-xl px-3 py-2">{t('search_unavailable')}</p>
      )}

      {/* Advanced technical location data */}
      <details open={advancedOpen} onToggle={(e) => setAdvancedOpen((e.target as HTMLDetailsElement).open)}
        className="border border-line rounded-xl overflow-hidden">
        <summary className="px-4 py-2.5 cursor-pointer select-none font-semibold text-[13px] text-ink bg-cream/40 hover:bg-cream/70">
          {t('advanced_title')}
        </summary>
        <div className="px-4 py-4 bg-white space-y-3">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={LBL} htmlFor="adv-lat">{tf('lat')}</label>
              <input id="adv-lat" type="number" step="any" inputMode="decimal" value={latStr}
                onChange={(e) => setLatStr(e.target.value)} placeholder={tf('coords_example_lat')}
                aria-invalid={latErr ? true : undefined} className={`${I} ${latErr ? 'border-rose' : ''}`} />
              {latErr && <p className="text-[11.5px] text-rose mt-1">{tf('warn_invalid_lat')}</p>}
            </div>
            <div>
              <label className={LBL} htmlFor="adv-lng">{tf('lng')}</label>
              <input id="adv-lng" type="number" step="any" inputMode="decimal" value={lngStr}
                onChange={(e) => setLngStr(e.target.value)} placeholder={tf('coords_example_lng')}
                aria-invalid={lngErr ? true : undefined} className={`${I} ${lngErr ? 'border-rose' : ''}`} />
              {lngErr && <p className="text-[11.5px] text-rose mt-1">{tf('warn_invalid_lng')}</p>}
            </div>
          </div>
          <div className="grid sm:grid-cols-3 gap-3 text-[12px] text-muted">
            <div><span className="font-semibold text-ink">{t('adv_provider')}:</span> {loc.provider ?? '—'}</div>
            <div className="truncate"><span className="font-semibold text-ink">{t('adv_place_id')}:</span> {loc.providerPlaceId ?? '—'}</div>
            <div><span className="font-semibold text-ink">{t('adv_source')}:</span> {loc.source ?? '—'}</div>
          </div>
          <div aria-live="polite">
            {valid ? (
              <p className="text-[12px] font-semibold text-emerald-700">✓ {tf('coords_set')}</p>
            ) : (
              <ul className="list-disc pl-5">
                {warnings.map((w) => <li key={w} className="text-[12px] text-amber-700">{tf(`warn_${w}` as 'warn_missing_coordinates')}</li>)}
              </ul>
            )}
          </div>
          <p className={HELP}>{t('advanced_help')}</p>
        </div>
      </details>
    </div>
  )
}
