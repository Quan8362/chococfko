'use client'

import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import L from 'leaflet'
import 'leaflet.markercluster'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import type { NearbyPlace } from '@/lib/placesNearby'
import { openStatus, type OpenState } from '@/lib/placeOpenNow'
import { formatDistanceKm } from '@/lib/geo'

const RADII = [0.5, 1, 3, 5, 10, 20]
type View = 'list' | 'map' | 'split'

const STATE_STYLE: Record<OpenState, string> = {
  open: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  closing_soon: 'bg-amber-100 text-amber-700 border-amber-200',
  closed: 'bg-gray-100 text-gray-600 border-gray-200',
  opens_later: 'bg-sky-100 text-sky-700 border-sky-200',
  temporarily_closed: 'bg-rose-100 text-rose-700 border-rose-200',
  hours_unknown: 'bg-cream text-muted border-line',
}

interface Props {
  defaultCenter: { lat: number; lng: number }
  defaultRadius: number
  categories: { code: string; label: string; emoji: string }[]
  areaCenters: { name: string; lat: number; lng: number }[]
  stationCenters: { name: string; lat: number; lng: number }[]
}

/** Parse a <input type="datetime-local"> value as Asia/Tokyo wall-clock. */
function parseWhenJst(v: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v)
  if (!m) return null
  const [, y, mo, d, hh, mi] = m.map(Number) as unknown as number[]
  // openStatus reads JST = date + 9h; subtract 9h so the JST wall-clock == input.
  return new Date(Date.UTC(y, mo - 1, d, hh, mi) - 9 * 3600_000)
}

export default function MapExplorer({ defaultCenter, defaultRadius, categories, areaCenters, stationCenters }: Props) {
  const t = useTranslations('map_explore')
  const te = useTranslations('explore_search')
  const emojiOf = useMemo(() => Object.fromEntries(categories.map((c) => [c.code, c.emoji])), [categories])

  const [view, setView] = useState<View>('map')
  const [radius, setRadius] = useState(defaultRadius)
  const [markers, setMarkers] = useState<NearbyPlace[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [category, setCategory] = useState('')
  const [openNowOnly, setOpenNowOnly] = useState(false)
  const [whenStr, setWhenStr] = useState('')
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null)
  const [geoStatus, setGeoStatus] = useState<'' | 'locating' | 'denied' | 'error' | 'unsupported'>('')
  const [moved, setMoved] = useState(false)

  const mapEl = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null)
  const userMarkerRef = useRef<L.Marker | null>(null)
  const circleRef = useRef<L.Circle | null>(null)
  const searchCenter = useRef(defaultCenter)

  const when = useMemo(() => (whenStr ? parseWhenJst(whenStr) ?? new Date() : new Date()), [whenStr])

  const stateOf = useCallback(
    (m: NearbyPlace): OpenState => openStatus(m.openingHours, m.closedDays, { now: when, temporaryStatus: m.temporaryStatus }),
    [when],
  )

  const displayed = useMemo(
    () => markers.filter((m) => (!category || m.category === category) && (!openNowOnly || stateOf(m) === 'open' || stateOf(m) === 'closing_soon')),
    [markers, category, openNowOnly, stateOf],
  )

  const fetchNearby = useCallback(async (center: { lat: number; lng: number }, r: number) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/places/nearby?lat=${center.lat}&lng=${center.lng}&radius=${r}`)
      const json = await res.json()
      setMarkers(Array.isArray(json.places) ? json.places : [])
      searchCenter.current = center
      setMoved(false)
    } catch {
      setMarkers([])
    } finally {
      setLoading(false)
    }
  }, [])

  // ── init map once ──
  useEffect(() => {
    if (!mapEl.current || mapRef.current) return
    const map = L.map(mapEl.current, { zoomControl: true }).setView([defaultCenter.lat, defaultCenter.lng], 13)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(map)
    const cluster = (L as unknown as { markerClusterGroup: (o?: unknown) => L.MarkerClusterGroup }).markerClusterGroup({ showCoverageOnHover: false })
    map.addLayer(cluster)
    map.on('moveend', () => setMoved(true))
    mapRef.current = map
    clusterRef.current = cluster
    void fetchNearby(defaultCenter, radius)
    return () => { map.remove(); mapRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // keep Leaflet sized correctly when the view toggles
  useEffect(() => { setTimeout(() => mapRef.current?.invalidateSize(), 60) }, [view])

  // ── render markers when the displayed set changes ──
  useEffect(() => {
    const cluster = clusterRef.current
    if (!cluster) return
    cluster.clearLayers()
    for (const m of displayed) {
      const st = stateOf(m)
      const dot = st === 'open' ? '#10b981' : st === 'closing_soon' ? '#f59e0b' : st === 'temporarily_closed' ? '#e11d48' : '#9ca3af'
      const icon = L.divIcon({
        className: '',
        html: `<div style="position:relative;width:34px;height:34px"><div style="width:32px;height:32px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#fff;border:2px solid #c2185b;box-shadow:0 2px 6px rgba(0,0,0,.25);display:grid;place-items:center"><span style="transform:rotate(45deg);font-size:15px">${emojiOf[m.category] ?? '📍'}</span></div><span style="position:absolute;top:-2px;right:-2px;width:10px;height:10px;border-radius:50%;background:${dot};border:1.5px solid #fff"></span></div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 34],
      })
      const marker = L.marker([m.lat, m.lng], { icon })
      marker.on('click', () => { setSelected(m.slug); mapRef.current?.panTo([m.lat, m.lng]) })
      cluster.addLayer(marker)
    }
  }, [displayed, emojiOf, stateOf])

  // ── radius circle around the last search center ──
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    circleRef.current?.remove()
    circleRef.current = L.circle([searchCenter.current.lat, searchCenter.current.lng], {
      radius: radius * 1000, color: '#c2185b', weight: 1, fillColor: '#c2185b', fillOpacity: 0.05,
    }).addTo(map)
  }, [radius, markers])

  // ── geolocation (only on explicit user action) ──
  const useMyLocation = () => {
    if (!('geolocation' in navigator)) { setGeoStatus('unsupported'); return }
    setGeoStatus('locating')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setUserLoc(loc); setGeoStatus('')
        const map = mapRef.current
        if (map) {
          map.setView([loc.lat, loc.lng], 14)
          userMarkerRef.current?.remove()
          userMarkerRef.current = L.marker([loc.lat, loc.lng], {
            icon: L.divIcon({ className: '', html: '<div style="width:16px;height:16px;border-radius:50%;background:#1f8fa6;border:3px solid #fff;box-shadow:0 0 0 2px #1f8fa6"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }),
          }).addTo(map)
        }
        void fetchNearby(loc, radius)
      },
      (err) => setGeoStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'error'),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
    )
  }

  const stopLocation = () => { setUserLoc(null); userMarkerRef.current?.remove(); userMarkerRef.current = null }
  const recenter = () => { const c = userLoc ?? defaultCenter; mapRef.current?.setView([c.lat, c.lng], userLoc ? 14 : 13) }
  const searchThisArea = () => { const c = mapRef.current?.getCenter(); if (c) void fetchNearby({ lat: c.lat, lng: c.lng }, radius) }
  const changeRadius = (r: number) => { setRadius(r); const c = mapRef.current?.getCenter() ?? searchCenter.current; void fetchNearby({ lat: c.lat, lng: c.lng }, r) }
  const goTo = (c: { lat: number; lng: number } | undefined) => { if (!c) return; mapRef.current?.setView([c.lat, c.lng], 14); void fetchNearby(c, radius) }

  const selectCard = (m: NearbyPlace) => { setSelected(m.slug); mapRef.current?.setView([m.lat, m.lng], Math.max(mapRef.current.getZoom(), 15)) }

  const radiusLabel = (r: number) => (r < 1 ? `${r * 1000} m` : `${r} km`)
  const sel = displayed.find((m) => m.slug === selected) ?? null

  const Card = ({ m, compact }: { m: NearbyPlace; compact?: boolean }) => {
    const st = stateOf(m)
    const dir = m.mapUrl || `https://www.google.com/maps/dir/?api=1&destination=${m.lat},${m.lng}`
    return (
      <div className={`bg-paper border border-line rounded-2xl p-3.5 ${compact ? '' : 'shadow-card-hover'}`}>
        <div className="flex items-start justify-between gap-2">
          <button type="button" onClick={() => selectCard(m)} className="text-left">
            <h3 className="font-serif font-bold text-[15.5px] text-ink leading-snug">{m.name}</h3>
            <p className="text-[12px] text-teal font-semibold uppercase tracking-[0.5px] mt-0.5">{m.area}</p>
          </button>
          <span className={`flex-none text-[11px] font-semibold px-2 py-[3px] rounded-full border ${STATE_STYLE[st]}`}>{t(`state_${st}` as 'state_open')}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[12px] text-muted">
          <span className="font-semibold text-ink">{te('distance_away', { dist: formatDistanceKm(m.distanceKm) })}</span>
          {m.nearestStation && <span>🚉 {m.nearestStation}{m.stationWalkMinutes != null ? ` · ${t('walk_min', { min: m.stationWalkMinutes })}` : ''}</span>}
        </div>
        <div className="flex gap-2 mt-3">
          <Link href={`/places/${m.slug}`} className="flex-1 text-center py-1.5 text-[12px] font-semibold rounded-xl bg-teal-soft text-teal border border-teal/20 hover:bg-teal hover:text-white transition-all">{t('detail')}</Link>
          <a href={dir} target="_blank" rel="noopener nofollow" className="flex-1 text-center py-1.5 text-[12px] font-semibold rounded-xl bg-rose-soft text-rose border border-rose/20 hover:bg-rose hover:text-white transition-all">{t('directions')}</a>
        </div>
      </div>
    )
  }

  const List = () => (
    <div className="space-y-3 overflow-auto max-h-full pr-1">
      <p className="text-[13px] text-muted">{t('results_n', { count: displayed.length })}</p>
      {displayed.length === 0 ? (
        <p className="text-[13.5px] text-muted bg-paper border border-line rounded-2xl p-5">{t('empty')}</p>
      ) : displayed.map((m) => <Card key={m.slug} m={m} compact />)}
    </div>
  )

  return (
    <div>
      {/* controls */}
      <div className="flex flex-col gap-2.5 mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-full border border-line overflow-hidden">
            {(['map', 'list', 'split'] as View[]).map((v) => (
              <button key={v} type="button" onClick={() => setView(v)}
                className={`px-3.5 py-1.5 text-[13px] font-semibold ${view === v ? 'bg-rose text-white' : 'bg-paper text-muted hover:text-rose'} ${v === 'split' ? 'hidden lg:block' : ''}`}>
                {t(`view_${v}` as 'view_map')}
              </button>
            ))}
          </div>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="text-[13px] px-3 py-1.5 border border-line rounded-full bg-paper">
            <option value="">{te('any_category')}</option>
            {categories.map((c) => <option key={c.code} value={c.code}>{c.emoji} {c.label}</option>)}
          </select>
          <label className="inline-flex items-center gap-1.5 text-[13px] px-3 py-1.5 rounded-full border border-line bg-paper cursor-pointer">
            <input type="checkbox" className="accent-rose" checked={openNowOnly} onChange={(e) => setOpenNowOnly(e.target.checked)} />
            {t('open_now')}
          </label>
          <label className="inline-flex items-center gap-1.5 text-[12.5px] text-muted">
            {t('at_time')}
            <input type="datetime-local" value={whenStr} onChange={(e) => setWhenStr(e.target.value)} className="text-[12.5px] px-2 py-1 border border-line rounded-lg bg-paper" />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-semibold text-muted">{t('radius_label')}:</span>
          {RADII.map((r) => (
            <button key={r} type="button" onClick={() => changeRadius(r)}
              className={`text-[12.5px] px-3 py-1 rounded-full border ${radius === r ? 'bg-rose text-white border-rose' : 'border-line text-muted hover:border-rose/40'}`}>{radiusLabel(r)}</button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!userLoc ? (
            <button type="button" onClick={useMyLocation} className="text-[13px] font-semibold px-3.5 py-1.5 rounded-full bg-teal text-white hover:bg-teal/90">{te('use_location')}</button>
          ) : (
            <button type="button" onClick={stopLocation} className="text-[13px] font-semibold px-3.5 py-1.5 rounded-full border border-line text-muted hover:text-rose">{t('stop_location')}</button>
          )}
          <button type="button" onClick={recenter} className="text-[13px] px-3.5 py-1.5 rounded-full border border-line text-muted hover:text-rose">{t('recenter')}</button>
          {areaCenters.length > 0 && (
            <select onChange={(e) => goTo(areaCenters[Number(e.target.value)] )} defaultValue="" className="text-[13px] px-3 py-1.5 border border-line rounded-full bg-paper">
              <option value="" disabled>{t('select_area')}</option>
              {areaCenters.map((a, i) => <option key={a.name} value={i}>{a.name}</option>)}
            </select>
          )}
          {stationCenters.length > 0 && (
            <select onChange={(e) => goTo(stationCenters[Number(e.target.value)])} defaultValue="" className="text-[13px] px-3 py-1.5 border border-line rounded-full bg-paper">
              <option value="" disabled>{t('select_station')}</option>
              {stationCenters.map((s, i) => <option key={s.name} value={i}>{s.name}</option>)}
            </select>
          )}
          <span className="text-[12px] text-muted">{loading ? te('loading') : t('results_n', { count: displayed.length })}</span>
          {geoStatus === 'locating' && <span className="text-[12px] text-muted">{te('nearby_locating')}</span>}
          {(geoStatus === 'denied' || geoStatus === 'error' || geoStatus === 'unsupported') && <span className="text-[12px] text-rose">{te(`nearby_${geoStatus}` as 'nearby_denied')}</span>}
        </div>
        <p className="text-[11.5px] text-muted">{t('why_location')}</p>
      </div>

      {/* body */}
      <div className={view === 'split' ? 'lg:grid lg:grid-cols-[360px_1fr] lg:gap-4' : ''}>
        {(view === 'list' || view === 'split') && (
          <div className={view === 'split' ? 'hidden lg:block max-h-[72vh]' : ''}>
            <List />
          </div>
        )}
        {(view === 'map' || view === 'split') && (
          <div className="relative">
            <div ref={mapEl} className="w-full h-[60vh] sm:h-[72vh] rounded-2xl overflow-hidden border border-line z-0" />
            {moved && (
              <button type="button" onClick={searchThisArea}
                className="absolute top-3 left-1/2 -translate-x-1/2 z-[1100] text-[13px] font-semibold px-4 py-2 rounded-full bg-ink text-white shadow-lg hover:bg-ink/90">
                {t('search_area')}
              </button>
            )}
            {/* selected preview — bottom sheet on mobile, floating on desktop */}
            {sel && (
              <div className="absolute z-[1100] inset-x-3 bottom-3 sm:inset-x-auto sm:right-3 sm:bottom-3 sm:w-[320px] max-h-[45%] overflow-auto">
                <div className="relative">
                  <button type="button" onClick={() => setSelected(null)} aria-label="close"
                    className="absolute -top-2 -right-2 z-[1] w-7 h-7 grid place-items-center rounded-full bg-ink text-white text-[13px] shadow">✕</button>
                  <Card m={sel} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
