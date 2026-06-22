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
import {
  type MapViewState, encodeMapView, shouldOfferSearchArea, markerAccent,
} from '@/lib/maps/mapView'
import SavePlaceButton from '@/components/SavePlaceButton'

type SheetState = 'collapsed' | 'half' | 'full'
type FetchState = '' | 'loading' | 'error'

interface Props {
  defaultCenter: { lat: number; lng: number }
  categories: { code: string; label: string; emoji: string }[]
  initialPlaces: NearbyPlace[]
  initialState: MapViewState
}

const STATUS_DOT: Record<OpenState, string> = {
  open: '#10b981', closing_soon: '#f59e0b', closed: '#9ca3af',
  opens_later: '#9ca3af', temporarily_closed: '#e11d48', hours_unknown: '#9ca3af',
}
const SHEET_H: Record<SheetState, string> = { collapsed: 'h-[110px]', half: 'h-[46vh]', full: 'h-[85vh]' }

export default function MapExplorerV2({ defaultCenter, categories, initialPlaces, initialState }: Props) {
  const t = useTranslations('map_v2')
  const te = useTranslations('explore_search')
  const tpd = useTranslations('place_detail')
  const emojiOf = useMemo(() => Object.fromEntries(categories.map((c) => [c.code, c.emoji])), [categories])

  const [places, setPlaces] = useState<NearbyPlace[]>(initialPlaces)
  const [fetchState, setFetchState] = useState<FetchState>('')
  const [selected, setSelected] = useState<string | null>(initialState.selected)
  const [category, setCategory] = useState(initialState.category)
  const [q, setQ] = useState(initialState.q)
  const [openNowOnly, setOpenNowOnly] = useState(initialState.openNow)
  const [moved, setMoved] = useState(false)
  const [sheet, setSheet] = useState<SheetState>('half')
  const [panelOpen, setPanelOpen] = useState(true)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [mapFailed, setMapFailed] = useState(false)

  const mapEl = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null)
  const markerBySlug = useRef<Map<string, L.Marker>>(new Map())
  const lastSearched = useRef<{ center: { lat: number; lng: number }; zoom: number } | null>(null)
  const reqId = useRef(0)
  const urlTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const qTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const listRefs = useRef<Map<string, HTMLLIElement>>(new Map())

  const stateOf = useCallback((m: NearbyPlace): OpenState =>
    openStatus(m.openingHours, m.closedDays, { temporaryStatus: m.temporaryStatus }), [])

  const displayed = useMemo(
    () => places.filter((m) => (!category || m.category === category) &&
      (!openNowOnly || stateOf(m) === 'open' || stateOf(m) === 'closing_soon')),
    [places, category, openNowOnly, stateOf],
  )

  // ── Viewport fetch (explicit / committed only) ──
  const fetchBounds = useCallback(async (cat = category, query = q) => {
    const map = mapRef.current
    if (!map) return
    const b = map.getBounds()
    const params = new URLSearchParams({
      north: String(b.getNorth()), south: String(b.getSouth()),
      east: String(b.getEast()), west: String(b.getWest()), limit: '300',
    })
    if (cat) params.set('category', cat)
    if (query.trim()) params.set('q', query.trim())
    const myId = ++reqId.current
    setFetchState('loading')
    try {
      const res = await fetch(`/api/places/in-bounds?${params}`)
      const json = await res.json()
      if (myId !== reqId.current) return // stale
      setPlaces(Array.isArray(json.places) ? json.places : [])
      setFetchState('')
      setMoved(false)
      lastSearched.current = { center: { lat: map.getCenter().lat, lng: map.getCenter().lng }, zoom: map.getZoom() }
    } catch {
      if (myId !== reqId.current) return
      setFetchState('error')
    }
  }, [category, q])

  // ── Init map once ──
  useEffect(() => {
    if (!mapEl.current || mapRef.current) return
    let map: L.Map
    try {
      map = L.map(mapEl.current, { zoomControl: true })
        .setView([initialState.center?.lat ?? defaultCenter.lat, initialState.center?.lng ?? defaultCenter.lng], initialState.zoom ?? 12)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(map)
      const cluster = (L as unknown as { markerClusterGroup: (o?: unknown) => L.MarkerClusterGroup })
        .markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 55 })
      map.addLayer(cluster)
      lastSearched.current = { center: { lat: map.getCenter().lat, lng: map.getCenter().lng }, zoom: map.getZoom() }
      map.on('moveend', () => {
        const c = map.getCenter(); const cur = { center: { lat: c.lat, lng: c.lng }, zoom: map.getZoom() }
        if (lastSearched.current && shouldOfferSearchArea(lastSearched.current, cur)) setMoved(true)
        scheduleUrlWrite()
      })
      mapRef.current = map
      clusterRef.current = cluster
      void fetchBounds() // initial committed load aligned to the real viewport
    } catch {
      setMapFailed(true)
    }
    return () => { mapRef.current?.remove(); mapRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // keep Leaflet sized when layout changes
  useEffect(() => { const id = setTimeout(() => mapRef.current?.invalidateSize(), 80); return () => clearTimeout(id) }, [sheet, panelOpen])

  // ── Render markers ──
  useEffect(() => {
    const cluster = clusterRef.current
    if (!cluster) return
    cluster.clearLayers()
    markerBySlug.current.clear()
    for (const m of displayed) {
      const accent = markerAccent(m.category)
      const dot = STATUS_DOT[stateOf(m)]
      const isSel = m.slug === selected
      const size = isSel ? 42 : 34
      const icon = L.divIcon({
        className: '',
        html: `<div style="position:relative;width:${size}px;height:${size}px;transition:transform .12s"><div style="width:${size - 2}px;height:${size - 2}px;border-radius:50% 50% 50% 0;transform:rotate(-45deg) scale(${isSel ? 1.06 : 1});background:#fff;border:${isSel ? 3 : 2}px solid ${accent};box-shadow:0 ${isSel ? 4 : 2}px ${isSel ? 10 : 6}px rgba(0,0,0,.28);display:grid;place-items:center"><span style="transform:rotate(45deg);font-size:${isSel ? 17 : 15}px">${emojiOf[m.category] ?? '📍'}</span></div><span style="position:absolute;top:-2px;right:-2px;width:10px;height:10px;border-radius:50%;background:${dot};border:1.5px solid #fff"></span></div>`,
        iconSize: [size, size], iconAnchor: [size / 2, size],
      })
      const marker = L.marker([m.lat, m.lng], { icon, zIndexOffset: isSel ? 1000 : 0 })
      marker.on('click', () => selectPlace(m.slug, false))
      cluster.addLayer(marker)
      markerBySlug.current.set(m.slug, marker)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayed, emojiOf, selected, stateOf])

  // ── Map ↔ list selection ──
  const selectPlace = useCallback((slug: string, fromList: boolean) => {
    setSelected(slug)
    const m = places.find((p) => p.slug === slug)
    const map = mapRef.current
    if (m && map) {
      // pan ONLY when the marker is outside the current view (respect user intent)
      if (!map.getBounds().contains([m.lat, m.lng])) map.panTo([m.lat, m.lng])
    }
    if (fromList) return
    // marker → scroll the matching list row into view (non-disruptive)
    requestAnimationFrame(() => {
      listRefs.current.get(slug)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    })
    if (sheet === 'collapsed') setSheet('half')
  }, [places, sheet])

  // ── URL state (debounced; never on every move tick) ──
  const scheduleUrlWrite = useCallback(() => {
    if (urlTimer.current) clearTimeout(urlTimer.current)
    urlTimer.current = setTimeout(() => {
      const map = mapRef.current
      const view: MapViewState = {
        center: map ? { lat: map.getCenter().lat, lng: map.getCenter().lng } : null,
        zoom: map ? map.getZoom() : null,
        category, q, openNow: openNowOnly, selected, mode: null,
      }
      const qs = new URLSearchParams(encodeMapView(view)).toString()
      window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname)
    }, 500)
  }, [category, q, openNowOnly, selected])
  useEffect(() => { scheduleUrlWrite() }, [category, q, openNowOnly, selected, scheduleUrlWrite])

  // Escape closes overlays.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (filtersOpen) setFiltersOpen(false)
      else if (selected) setSelected(null)
      else if (sheet === 'full') setSheet('half')
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [filtersOpen, selected, sheet])

  const onCategory = (code: string) => { setCategory(code); setTimeout(() => void fetchBounds(code, q), 0) }
  const onQueryChange = (v: string) => {
    setQ(v)
    if (qTimer.current) clearTimeout(qTimer.current)
    qTimer.current = setTimeout(() => void fetchBounds(category, v), 450)
  }

  // Drag handle for the mobile sheet (threshold snap; no body-scroll lock).
  const dragStart = useRef<number | null>(null)
  const onHandleDown = (e: React.PointerEvent) => { dragStart.current = e.clientY; (e.target as HTMLElement).setPointerCapture?.(e.pointerId) }
  const onHandleUp = (e: React.PointerEvent) => {
    if (dragStart.current == null) return
    const dy = e.clientY - dragStart.current
    dragStart.current = null
    const order: SheetState[] = ['collapsed', 'half', 'full']
    const i = order.indexOf(sheet)
    if (dy < -40) setSheet(order[Math.min(i + 1, 2)])
    else if (dy > 40) setSheet(order[Math.max(i - 1, 0)])
    else setSheet(sheet === 'full' ? 'half' : 'full') // tap toggles
  }

  const sel = displayed.find((m) => m.slug === selected) ?? places.find((m) => m.slug === selected) ?? null

  // ── shared list ──
  const List = ({ idPrefix }: { idPrefix: string }) => (
    <div className="h-full flex flex-col">
      <div className="px-4 pt-2 pb-1.5 text-[12.5px] text-muted flex items-center justify-between">
        <span>{fetchState === 'loading' ? te('loading') : t('results_n', { count: displayed.length })}</span>
        {moved && (
          <button type="button" onClick={() => void fetchBounds()}
            className="text-[12px] font-semibold px-3 py-1 rounded-full bg-ink text-white">{t('search_area')}</button>
        )}
      </div>
      <ul role="list" className="flex-1 overflow-y-auto px-3 pb-4 space-y-2">
        {fetchState === 'loading' && displayed.length === 0 ? (
          [0, 1, 2, 3].map((i) => <li key={i} className="h-[84px] rounded-2xl bg-line/40 animate-pulse" aria-hidden />)
        ) : fetchState === 'error' ? (
          <li className="text-[13px] text-rose bg-rose-soft border border-rose/20 rounded-2xl p-4">
            {t('load_error')}{' '}
            <button type="button" onClick={() => void fetchBounds()} className="underline font-semibold">{t('retry')}</button>
          </li>
        ) : displayed.length === 0 ? (
          <li className="text-[13.5px] text-muted bg-paper border border-line rounded-2xl p-5">{t('empty')}</li>
        ) : displayed.map((m) => {
          const isSel = m.slug === selected
          return (
            <li key={m.slug} ref={(el) => { if (el) listRefs.current.set(m.slug, el); else listRefs.current.delete(m.slug) }}>
              <button type="button" id={`${idPrefix}-${m.slug}`} aria-pressed={isSel} onClick={() => selectPlace(m.slug, true)}
                className={`w-full text-left flex gap-3 p-2.5 rounded-2xl border transition-colors ${isSel ? 'border-rose bg-rose-soft' : 'border-line bg-paper hover:border-rose/40'}`}>
                {m.img && <span className="flex-none w-[64px] h-[64px] rounded-xl bg-cover bg-center" style={{ backgroundImage: `url(${m.img})` }} aria-hidden />}
                <span className="min-w-0">
                  <span className="block font-serif font-bold text-[14.5px] text-ink leading-snug truncate">{m.name}</span>
                  <span className="block text-[11.5px] text-teal font-semibold uppercase tracking-[0.4px] truncate">{m.categoryLabel || m.category}</span>
                  <span className="block text-[12px] text-muted truncate">{m.area}{m.nearestStation ? ` · 🚉 ${m.nearestStation}` : ''}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )

  const Preview = ({ m }: { m: NearbyPlace }) => {
    const dir = m.mapUrl || `https://www.google.com/maps/dir/?api=1&destination=${m.lat},${m.lng}`
    const share = async () => {
      const url = `${window.location.origin}/places/${m.slug}`
      try { if (navigator.share) await navigator.share({ title: m.name, url }); else await navigator.clipboard.writeText(url) } catch { /* cancelled */ }
    }
    return (
      <div className="bg-paper border border-line rounded-2xl shadow-card-hover overflow-hidden">
        {m.img && <div className="h-[120px] bg-cover bg-center" style={{ backgroundImage: `url(${m.img})` }} aria-hidden />}
        <div className="p-3.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-serif font-bold text-[16px] text-ink leading-snug">{m.name}</h3>
              <p className="text-[11.5px] text-teal font-semibold uppercase tracking-[0.4px]">{m.categoryLabel || m.category}</p>
              <p className="text-[12.5px] text-muted mt-0.5">{m.area}{m.nearestStation ? ` · 🚉 ${m.nearestStation}` : ''}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <SavePlaceButton slug={m.slug} name={m.name} />
              <button type="button" onClick={() => setSelected(null)} aria-label={tpd('close')}
                className="w-7 h-7 grid place-items-center rounded-full bg-cream text-ink text-[13px] border border-line">✕</button>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <Link href={`/places/${m.slug}`} className="flex-1 text-center py-1.5 text-[12.5px] font-semibold rounded-xl bg-teal-soft text-teal border border-teal/20 hover:bg-teal hover:text-white transition-all">{t('view_article')}</Link>
            <a href={dir} target="_blank" rel="noopener nofollow" className="flex-1 text-center py-1.5 text-[12.5px] font-semibold rounded-xl bg-rose-soft text-rose border border-rose/20 hover:bg-rose hover:text-white transition-all">{t('directions')}</a>
            <button type="button" onClick={share} aria-label={t('share')} className="px-3 py-1.5 text-[12.5px] font-semibold rounded-xl bg-cream text-ink border border-line">↗</button>
          </div>
        </div>
      </div>
    )
  }

  const FilterBar = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative inline-flex">
        <select value={category} onChange={(e) => onCategory(e.target.value)} aria-label={te('any_category')}
          className="appearance-none text-[13px] pl-3 pr-8 py-2 border border-line rounded-full bg-paper">
          <option value="">{te('any_category')}</option>
          {categories.map((c) => <option key={c.code} value={c.code}>{c.emoji} {c.label}</option>)}
        </select>
        <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </div>
      <label className="inline-flex items-center gap-1.5 text-[13px] px-3 py-2 rounded-full border border-line bg-paper cursor-pointer">
        <input type="checkbox" className="accent-rose" checked={openNowOnly} onChange={(e) => setOpenNowOnly(e.target.checked)} />
        {t('open_now')}
      </label>
    </div>
  )

  // ── list-only fallback if Leaflet failed ──
  if (mapFailed) {
    return (
      <div className="max-w-[760px] mx-auto">
        <p className="text-[13px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3">{t('map_unavailable')}</p>
        <div className="mb-3">{FilterBar}</div>
        <div className="border border-line rounded-2xl h-[70vh]"><List idPrefix="fb" /></div>
      </div>
    )
  }

  return (
    <div className="relative w-full h-[calc(100vh-var(--header-h,64px)-40px)] min-h-[520px] rounded-2xl overflow-hidden border border-line">
      {/* Map fills the container */}
      <div ref={mapEl} className="absolute inset-0 z-0" />

      {/* Floating search + filters (top) */}
      <div className="absolute top-3 left-3 right-3 z-[500] flex flex-col gap-2 lg:left-[396px] pointer-events-none">
        <div className="flex gap-2 pointer-events-auto">
          <input
            type="search" value={q} onChange={(e) => onQueryChange(e.target.value)}
            placeholder={t('search_placeholder')} aria-label={t('search_placeholder')}
            className="flex-1 text-[14px] px-4 py-2.5 rounded-full border border-line bg-paper/95 backdrop-blur shadow-sm focus:outline-none focus:border-rose"
          />
          <button type="button" onClick={() => setFiltersOpen((v) => !v)} aria-expanded={filtersOpen}
            className="lg:hidden flex-none px-4 rounded-full bg-paper/95 border border-line text-[13px] font-semibold shadow-sm">{t('filters')}</button>
        </div>
        {(filtersOpen || false) && <div className="lg:hidden pointer-events-auto bg-paper/95 backdrop-blur border border-line rounded-2xl p-3 shadow-sm">{FilterBar}</div>}
        <div className="hidden lg:block pointer-events-auto">{FilterBar}</div>
      </div>

      {/* Search-this-area pill */}
      {moved && (
        <button type="button" onClick={() => void fetchBounds()}
          className="absolute top-16 left-1/2 -translate-x-1/2 z-[600] text-[13px] font-semibold px-4 py-2 rounded-full bg-ink text-white shadow-lg hover:bg-ink/90">
          {t('search_area')}
        </button>
      )}

      {/* Desktop: collapsible left results panel */}
      <div className={`hidden lg:flex absolute top-0 bottom-0 left-0 z-[550] transition-transform ${panelOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="w-[380px] bg-paper/95 backdrop-blur border-r border-line flex flex-col">
          <List idPrefix="d" />
        </div>
        <button type="button" onClick={() => setPanelOpen((v) => !v)} aria-label={panelOpen ? t('hide_list') : t('show_list')}
          className="self-center -ml-px h-16 w-6 grid place-items-center bg-paper border border-l-0 border-line rounded-r-lg text-muted">
          {panelOpen ? '‹' : '›'}
        </button>
      </div>

      {/* Mobile/tablet: draggable bottom sheet */}
      <div className={`lg:hidden absolute inset-x-0 bottom-0 z-[550] ${SHEET_H[sheet]} transition-[height] duration-200 bg-paper/97 backdrop-blur border-t border-line rounded-t-2xl shadow-[0_-4px_20px_-8px_rgba(0,0,0,0.25)] flex flex-col`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <button type="button" onPointerDown={onHandleDown} onPointerUp={onHandleUp}
          aria-label={t('toggle_list')} className="flex-none py-2 grid place-items-center cursor-grab touch-none">
          <span className="w-10 h-1.5 rounded-full bg-line" />
        </button>
        <div className="flex-1 min-h-0"><List idPrefix="m" /></div>
      </div>

      {/* Selected-place preview */}
      {sel && (
        <div className="absolute z-[700] inset-x-3 bottom-[120px] lg:inset-x-auto lg:left-[396px] lg:bottom-3 lg:w-[340px]">
          <Preview m={sel} />
        </div>
      )}
    </div>
  )
}
