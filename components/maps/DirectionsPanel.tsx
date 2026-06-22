'use client'

// ============================================================
// Directions panel / bottom sheet (Map UX Phase 8).
//
// (B) basic directions: origin, destination, travel mode, approximate (straight-
//     line) distance, and a prominent "Open in Google Maps" handoff — ALL with no
//     API. (C) in-site route preview (real distance/duration/polyline) behind the
//     route-preview flag, computed ONLY on an explicit "Preview route" click.
//
// "Open in Google Maps" stays available even when route preview is unavailable or
// fails. No precise location is persisted/logged; only aggregated, coordinate-free
// events are sent.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  TRAVEL_MODES, type TravelMode, buildGoogleMapsDirectionsUrl, straightLineKm,
  formatDurationSeconds, metresToKm,
} from '@/lib/maps/directions'
import type { LatLngTuple } from '@/lib/maps/polyline'
import { decodePolyline } from '@/lib/maps/polyline'
import type { RouteStatus } from '@/lib/maps/routeRequest'
import { emitMapMetric } from '@/lib/maps/metrics'

const MODE_EMOJI: Record<TravelMode, string> = { walking: '🚶', driving: '🚗', bicycling: '🚲', transit: '🚆' }
const RECENT_ORIGIN_KEY = 'fko_recent_origin_label' // label ONLY — never precise coords

export interface DirectionsDestination {
  name: string
  lat: number | null
  lng: number | null
  placeId: string | null
  mapUrl?: string | null
}

export interface PreviewRoute {
  points: LatLngTuple[]
  distanceMeters: number
  durationSeconds: number
  summary: string | null
  origin: { lat: number; lng: number }
  destination: { lat: number; lng: number }
}

interface Props {
  destination: DirectionsDestination
  routePreviewAvailable: boolean
  locale: string
  /** Origin coordinate captured by a map click in route mode (parent-supplied). */
  pickedOrigin: { lat: number; lng: number } | null
  onRequestPickOrigin: () => void
  onRoute: (route: PreviewRoute | null) => void
  onClose: () => void
}

type GeoStatus = '' | 'locating' | 'denied' | 'error' | 'unsupported' | 'insecure'

export default function DirectionsPanel({
  destination, routePreviewAvailable, locale, pickedOrigin, onRequestPickOrigin, onRoute, onClose,
}: Props) {
  const t = useTranslations('directions')
  const panelRef = useRef<HTMLDivElement>(null)
  const reqId = useRef(0)

  const [mode, setMode] = useState<TravelMode>('transit')
  const [currentCoords, setCurrentCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [typedOrigin, setTypedOrigin] = useState('')
  const [originMode, setOriginMode] = useState<'current' | 'map' | 'typed'>('current')
  const [geoStatus, setGeoStatus] = useState<GeoStatus>('')
  const [previewStatus, setPreviewStatus] = useState<'' | 'loading' | RouteStatus>('')
  const [preview, setPreview] = useState<PreviewRoute | null>(null)

  const destHasCoords = typeof destination.lat === 'number' && typeof destination.lng === 'number'

  // Resolved origin coordinates (for in-site preview): current or map-click.
  const originCoords = useMemo(() => {
    if (originMode === 'map') return pickedOrigin
    if (originMode === 'current') return currentCoords
    return null // typed origin → Google Maps handoff only, not in-site preview
  }, [originMode, pickedOrigin, currentCoords])

  const originLabel = useMemo(() => {
    if (originMode === 'typed' && typedOrigin.trim()) return typedOrigin.trim()
    if (originMode === 'map' && pickedOrigin) return t('origin_map_point')
    if (originMode === 'current' && currentCoords) return t('origin_your_location')
    return t('origin_your_location')
  }, [originMode, typedOrigin, pickedOrigin, currentCoords, t])

  // Focus the panel on open; restore recent typed origin (label only) from session.
  useEffect(() => {
    panelRef.current?.focus()
    try {
      const r = sessionStorage.getItem(RECENT_ORIGIN_KEY)
      if (r) setTypedOrigin(r)
    } catch { /* sessionStorage unavailable */ }
  }, [])

  // Changing destination invalidates any drawn route.
  useEffect(() => { setPreview(null); setPreviewStatus(''); onRoute(null) }, [destination.name, destination.lat, destination.lng]) // eslint-disable-line react-hooks/exhaustive-deps

  const beacon = useCallback((event: 'route_preview_requested' | 'open_in_google_maps_clicked') => {
    emitMapMetric(event, { mode })
  }, [mode])

  const straightKm = useMemo(
    () => (originCoords && destHasCoords ? straightLineKm(originCoords, { lat: destination.lat as number, lng: destination.lng as number }) : null),
    [originCoords, destHasCoords, destination.lat, destination.lng],
  )

  const useCurrentLocation = () => {
    if (typeof window !== 'undefined' && !window.isSecureContext) { setGeoStatus('insecure'); emitMapMetric('geolocation', { permission: 'insecure' }); return }
    if (!('geolocation' in navigator)) { setGeoStatus('unsupported'); emitMapMetric('geolocation', { permission: 'unsupported' }); return }
    setGeoStatus('locating'); setOriginMode('current')
    navigator.geolocation.getCurrentPosition(
      // NOTE: precise coords stay in component state only — never logged or emitted.
      (pos) => { setGeoStatus(''); setCurrentCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); emitMapMetric('geolocation', { permission: 'granted' }) },
      (err) => { const p = err.code === err.PERMISSION_DENIED ? 'denied' : err.code === err.TIMEOUT ? 'timeout' : 'error'; setGeoStatus(p === 'timeout' ? 'error' : p); emitMapMetric('geolocation', { permission: p }) },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    )
  }

  const pickOnMap = () => { setOriginMode('map'); onRequestPickOrigin() }

  const onTypedChange = (v: string) => {
    setOriginMode('typed'); setTypedOrigin(v)
    try { if (v.trim()) sessionStorage.setItem(RECENT_ORIGIN_KEY, v.trim()); else sessionStorage.removeItem(RECENT_ORIGIN_KEY) } catch { /* ignore */ }
  }

  const clearRoute = () => { setPreview(null); setPreviewStatus(''); onRoute(null) }

  // ── In-site route preview (explicit click only) ──
  const previewRoute = useCallback(async () => {
    if (!routePreviewAvailable || !originCoords || !destHasCoords) return
    const myId = ++reqId.current
    setPreviewStatus('loading')
    beacon('route_preview_requested')
    try {
      const res = await fetch('/api/maps/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin: originCoords, destination: { lat: destination.lat, lng: destination.lng }, mode, alternatives: false, languageCode: locale }),
      })
      const json = await res.json()
      if (myId !== reqId.current) return // stale
      const status = json.status as RouteStatus
      if (status === 'ok' && Array.isArray(json.routes) && json.routes[0]) {
        const r = json.routes[0]
        const route: PreviewRoute = {
          points: decodePolyline(r.encodedPolyline),
          distanceMeters: r.distanceMeters ?? 0,
          durationSeconds: r.durationSeconds ?? 0,
          summary: r.summary ?? null,
          origin: originCoords,
          destination: { lat: destination.lat as number, lng: destination.lng as number },
        }
        setPreview(route); setPreviewStatus('ok'); onRoute(route)
      } else {
        setPreview(null); setPreviewStatus(status || 'unavailable'); onRoute(null)
      }
    } catch {
      if (myId !== reqId.current) return
      setPreview(null); setPreviewStatus('unavailable'); onRoute(null)
    }
  }, [routePreviewAvailable, originCoords, destHasCoords, destination.lat, destination.lng, mode, locale, onRoute, beacon])

  const openInGoogleMaps = () => {
    beacon('open_in_google_maps_clicked')
    const url = buildGoogleMapsDirectionsUrl({
      destination: { placeId: destination.placeId, lat: destination.lat, lng: destination.lng, name: destination.name },
      origin: originMode === 'typed' && typedOrigin.trim()
        ? { name: typedOrigin.trim() }
        : originCoords
          ? { lat: originCoords.lat, lng: originCoords.lng }
          : 'current',
      mode,
    })
    window.open(url, '_blank', 'noopener')
  }

  const dur = preview ? formatDurationSeconds(preview.durationSeconds) : null
  const statusMessage = useMemo(() => {
    if (previewStatus === '' || previewStatus === 'ok') return null
    if (previewStatus === 'loading') return t('status_loading')
    const key: Record<string, string> = {
      no_route: 'status_no_route', unsupported_mode: 'status_unsupported_mode', unavailable: 'status_unavailable',
      quota: 'status_quota', invalid: 'status_invalid', region_unsupported: 'status_region_unsupported',
    }
    return t(key[previewStatus] ?? 'status_unavailable')
  }, [previewStatus, t])

  const canPreview = routePreviewAvailable && !!originCoords && destHasCoords

  return (
    <div ref={panelRef} tabIndex={-1} role="dialog" aria-label={t('title')}
      className="bg-paper border border-line rounded-2xl shadow-card-hover overflow-hidden outline-none">
      <div className="flex items-center justify-between px-4 py-2.5 bg-cream/60 border-b border-line">
        <h3 className="font-serif font-bold text-[15px] text-ink">{t('title')}</h3>
        <button type="button" onClick={onClose} aria-label={t('close')}
          className="w-8 h-8 grid place-items-center rounded-full bg-paper text-ink text-[13px] border border-line hover:bg-cream">✕</button>
      </div>

      <div className="p-3.5 space-y-3" style={{ paddingBottom: 'max(0.875rem, env(safe-area-inset-bottom))' }}>
        {/* Origin → Destination */}
        <div className="space-y-1.5 text-[13px]">
          <div className="flex items-center gap-2"><span aria-hidden>🟢</span><span className="text-muted">{t('from')}:</span> <span className="font-semibold text-ink truncate">{originLabel}</span></div>
          <div className="flex items-center gap-2"><span aria-hidden>📍</span><span className="text-muted">{t('to')}:</span> <span className="font-semibold text-ink truncate">{destination.name}</span></div>
        </div>

        {/* Origin controls */}
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={useCurrentLocation}
            className={`text-[12px] font-semibold px-3 py-1.5 rounded-full border ${originMode === 'current' && currentCoords ? 'bg-teal text-white border-teal' : 'bg-paper border-line text-ink'}`}>
            {t('use_current_location')}
          </button>
          <button type="button" onClick={pickOnMap}
            className={`text-[12px] font-semibold px-3 py-1.5 rounded-full border ${originMode === 'map' ? 'bg-teal text-white border-teal' : 'bg-paper border-line text-ink'}`}>
            {t('pick_on_map')}
          </button>
        </div>
        <input type="text" value={typedOrigin} onChange={(e) => onTypedChange(e.target.value)}
          placeholder={t('origin_placeholder')} aria-label={t('change_origin')}
          className="w-full text-[13px] px-3 py-2 border border-line rounded-xl bg-white focus:outline-none focus:border-rose" />
        <div aria-live="polite" className="min-h-[16px]">
          {geoStatus === 'locating' && <p className="text-[11.5px] text-muted">{t('geo_locating')}</p>}
          {geoStatus && geoStatus !== 'locating' && <p className="text-[11.5px] text-rose">{t(`geo_${geoStatus}` as 'geo_denied')}</p>}
        </div>

        {/* Travel modes (radiogroup) */}
        <div role="radiogroup" aria-label={t('travel_mode')} className="grid grid-cols-4 gap-1.5">
          {TRAVEL_MODES.map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} aria-label={t(`mode_${m}`)}
              onClick={() => { setMode(m); clearRoute() }}
              className={`flex flex-col items-center gap-0.5 py-2 rounded-xl border text-[11px] font-semibold ${mode === m ? 'bg-rose text-white border-rose' : 'bg-paper border-line text-ink hover:border-rose/40'}`}>
              <span aria-hidden className="text-[16px]">{MODE_EMOJI[m]}</span>{t(`mode_${m}`)}
            </button>
          ))}
        </div>

        {/* Distance / duration */}
        <div aria-live="polite" className="text-[13px]">
          {preview ? (
            <p className="font-semibold text-ink">
              {t('distance_km', { km: metresToKm(preview.distanceMeters) })} · {dur && dur.hours > 0 ? t('duration_hm', { h: dur.hours, m: dur.minutes }) : t('duration_m', { m: dur?.minutes ?? 0 })}
              {preview.summary && <span className="block text-[11.5px] text-muted font-normal mt-0.5">{t('via', { summary: preview.summary })}</span>}
            </p>
          ) : straightKm != null ? (
            <p className="text-muted">{t('approx_distance', { km: Math.round(straightKm * 10) / 10 })}</p>
          ) : (
            <p className="text-muted">{t('no_distance_hint')}</p>
          )}
          {statusMessage && <p className={`mt-1 text-[12px] ${previewStatus === 'loading' ? 'text-muted' : 'text-rose'}`}>{statusMessage}</p>}
        </div>

        {/* Actions — Open in Google Maps is always available */}
        <div className="flex flex-wrap gap-2 pt-0.5">
          <button type="button" onClick={openInGoogleMaps}
            className="flex-1 min-w-[150px] text-center py-2 text-[13px] font-bold rounded-xl bg-rose text-white hover:bg-rose/90 transition-colors">
            {t('open_in_google_maps')}
          </button>
          {routePreviewAvailable && (
            <button type="button" onClick={() => void previewRoute()} disabled={!canPreview || previewStatus === 'loading'}
              className="flex-1 min-w-[120px] text-center py-2 text-[13px] font-semibold rounded-xl bg-teal-soft text-teal border border-teal/25 hover:bg-teal hover:text-white transition-colors disabled:opacity-50">
              {previewStatus === 'loading' ? t('status_loading') : t('preview_route')}
            </button>
          )}
          {preview && (
            <button type="button" onClick={clearRoute}
              className="text-[12.5px] font-semibold px-3 py-2 rounded-xl border border-line text-muted hover:text-rose">{t('clear_route')}</button>
          )}
        </div>
      </div>
    </div>
  )
}
