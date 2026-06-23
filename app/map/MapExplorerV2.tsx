'use client'

import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import L from 'leaflet'
import 'leaflet.markercluster'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { NearbyPlace } from '@/lib/placesNearby'
import { openStatus, type OpenState } from '@/lib/placeOpenNow'
import {
  type MapViewState, encodeMapView, shouldOfferSearchArea, markerAccent,
} from '@/lib/maps/mapView'
import type { InternalResultItem, StationAreaResultItem, TopicResultItem } from '@/lib/maps/unifiedSearch'
import type { ExternalPlacePreview as ExternalPreview } from '@/lib/maps/externalPlace'
import { findInternalDuplicate } from '@/lib/maps/duplicateDetection'
import { internalToNearby, mergePinnedPlace, unionBySlug } from '@/lib/maps/viewportResults'
import { encodeExternalSeed, SEED_PARAM } from '@/lib/maps/adminSeed'
import { polylineBounds } from '@/lib/maps/polyline'
import { prefersReducedMotion, motionOptions, scrollBehavior } from '@/lib/maps/motion'
import { emitMapMetric, latencyBucket } from '@/lib/maps/metrics'
import UnifiedSearchBox from '@/components/maps/UnifiedSearchBox'
import ExternalPlacePreviewCard from '@/components/maps/ExternalPlacePreview'
import DirectionsPanel, { type PreviewRoute } from '@/components/maps/DirectionsPanel'
import SavePlaceButton from '@/components/SavePlaceButton'

type SheetState = 'collapsed' | 'half' | 'full'
type FetchState = '' | 'loading' | 'error'

interface Props {
  defaultCenter: { lat: number; lng: number }
  categories: { code: string; label: string; emoji: string }[]
  initialPlaces: NearbyPlace[]
  initialState: MapViewState
  /** Unified search: may external Google results be OFFERED (default false). */
  externalEnabled: boolean
  /** Browser Maps key (NEXT_PUBLIC) — only used when externalEnabled. */
  apiKey: string | null
  locale: string
  /** Admin viewing → enables the gated "use external place for an article" action. */
  isAdmin: boolean
  /** Whether the Admin place picker (target of the admin action) is configured. */
  adminSearchEnabled: boolean
  /** In-site route preview available (Routes API flag) — default false. */
  routePreviewAvailable: boolean
}

const STATUS_DOT: Record<OpenState, string> = {
  open: '#10b981', closing_soon: '#f59e0b', closed: '#9ca3af',
  opens_later: '#9ca3af', temporarily_closed: '#e11d48', hours_unknown: '#9ca3af',
}
// Bottom-sheet heights use dynamic viewport units (dvh) so the mobile browser
// chrome (collapsing URL bar) doesn't make the sheet jump or exceed the screen.
// vh is kept as a fallback for browsers without dvh support.
const SHEET_H: Record<SheetState, string> = {
  collapsed: 'h-[104px]',
  half: 'h-[42dvh]',
  full: 'h-[82dvh]',
}

export default function MapExplorerV2({ defaultCenter, categories, initialPlaces, initialState, externalEnabled, apiKey, locale, isAdmin, adminSearchEnabled, routePreviewAvailable }: Props) {
  const t = useTranslations('map_v2')
  const te = useTranslations('explore_search')
  const tpd = useTranslations('place_detail')
  const router = useRouter()
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
  const [externalPreview, setExternalPreview] = useState<ExternalPreview | null>(null)
  const [directionsFor, setDirectionsFor] = useState<NearbyPlace | null>(null)
  const [routePreview, setRoutePreview] = useState<PreviewRoute | null>(null)
  const [pickingOrigin, setPickingOrigin] = useState(false)
  const [pickedOrigin, setPickedOrigin] = useState<{ lat: number; lng: number } | null>(null)

  const mapEl = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null)
  const markerBySlug = useRef<Map<string, L.Marker>>(new Map())
  const lastSearched = useRef<{ center: { lat: number; lng: number }; zoom: number } | null>(null)
  // A search result selected from OUTSIDE the loaded viewport. Kept visible
  // across the next viewport fetch so selection never flashes to an empty list.
  const pinnedRef = useRef<NearbyPlace | null>(null)
  // True for the next moveend caused by PROGRAMMATIC camera moves (select/fit/
  // restore) so they don't surface the "search this area" prompt.
  const suppressMovedRef = useRef(false)
  const routeLayerRef = useRef<L.LayerGroup | null>(null)
  const pickingOriginRef = useRef(false)
  const prevViewRef = useRef<{ center: { lat: number; lng: number }; zoom: number } | null>(null)
  const reducedRef = useRef(false)
  const reqId = useRef(0)
  const urlTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const listRefs = useRef<Map<string, HTMLLIElement>>(new Map())

  const stateOf = useCallback((m: NearbyPlace): OpenState =>
    openStatus(m.openingHours, m.closedDays, { temporaryStatus: m.temporaryStatus }), [])

  const displayed = useMemo(
    () => places.filter((m) => (!category || m.category === category) &&
      (!openNowOnly || stateOf(m) === 'open' || stateOf(m) === 'closing_soon')),
    [places, category, openNowOnly, stateOf],
  )

  // ── Viewport fetch (explicit / committed only) ──
  // `initial` = the very first committed load right after the map mounts. The SSR
  // `initialPlaces` were fetched from a generous fixed box; this first client query
  // reflects the actual rendered (often narrower) viewport. On `initial` we UNION
  // the two so a transiently narrow first viewport can never drop a valid SSR place
  // ("two load, then one disappears"). All later (user-committed) fetches replace.
  const fetchBounds = useCallback(async (cat = category, query = q, opts?: { initial?: boolean }) => {
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
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0
    if (process.env.NODE_ENV !== 'production') {
      // Dev-only: trace the exact viewport → query the server receives.
      console.debug('[mapv2] fetchBounds', {
        seq: myId, initial: !!opts?.initial, startedAt: Math.round(t0),
        center: map.getCenter(), zoom: map.getZoom(),
        bounds: { north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() },
        params: params.toString(), category: cat, openNowOnly,
      })
    }
    try {
      const res = await fetch(`/api/places/in-bounds?${params}`)
      const json = await res.json()
      if (myId !== reqId.current) return // stale: a newer fetch already won
      const serverPlaces: NearbyPlace[] = Array.isArray(json.places) ? json.places : []
      // Keep a pinned (just-selected, out-of-view) result visible if the new
      // viewport still covers it but the server response omitted it.
      const merged = mergePinnedPlace(serverPlaces, pinnedRef.current, (lat, lng) => b.contains([lat, lng]))
      // First load only: never shrink below the SSR result set.
      const next = opts?.initial ? unionBySlug(merged, initialPlaces) : merged
      setPlaces(next)
      setFetchState('')
      setMoved(false)
      lastSearched.current = { center: { lat: map.getCenter().lat, lng: map.getCenter().lng }, zoom: map.getZoom() }
      if (process.env.NODE_ENV !== 'production') {
        const ms = (typeof performance !== 'undefined' ? performance.now() : 0) - t0
        console.debug('[mapv2] result', {
          seq: myId, ms: Math.round(ms), serverCount: serverPlaces.length,
          afterPin: merged.length, afterUnion: next.length, slugs: next.map((p) => p.slug),
        })
      }
      const ms = (typeof performance !== 'undefined' ? performance.now() : 0) - t0
      emitMapMetric('viewport_query', { ok: true, latency_ms: Math.round(ms), latency_bucket: latencyBucket(ms) })
    } catch (err) {
      if (myId !== reqId.current) return
      setFetchState('error')
      if (process.env.NODE_ENV !== 'production') console.debug('[mapv2] fetchBounds error', err)
      emitMapMetric('viewport_query', { ok: false, status: 'error' })
      emitMapMetric('map_api_unavailable', { status: 'in_bounds' })
    }
  }, [category, q, openNowOnly, initialPlaces])

  // Track OS "reduce motion" so Leaflet pan/zoom/fit can honour it (CSS can't).
  useEffect(() => {
    reducedRef.current = prefersReducedMotion()
    const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null
    if (!mq) return
    const on = () => { reducedRef.current = mq.matches }
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])

  // ── Init map once ──
  useEffect(() => {
    if (!mapEl.current || mapRef.current) return
    let map: L.Map
    try {
      map = L.map(mapEl.current, { zoomControl: false })
        .setView([initialState.center?.lat ?? defaultCenter.lat, initialState.center?.lng ?? defaultCenter.lng], initialState.zoom ?? 12)
      // Localized, accessibly-titled zoom control (Leaflet defaults are English).
      // Bottom-right keeps it clear of the top search row on mobile; CSS lifts it
      // above the bottom sheet (see .map-v2-shell rules in globals.css).
      L.control.zoom({ position: 'bottomright', zoomInTitle: t('zoom_in'), zoomOutTitle: t('zoom_out') }).addTo(map)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(map)
      const cluster = (L as unknown as { markerClusterGroup: (o?: unknown) => L.MarkerClusterGroup })
        .markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 55 })
      map.addLayer(cluster)
      lastSearched.current = { center: { lat: map.getCenter().lat, lng: map.getCenter().lng }, zoom: map.getZoom() }
      map.on('moveend', () => {
        // Ignore moves we triggered ourselves (result select, fit, restore) —
        // only genuine user pan/zoom should offer "search this area".
        if (suppressMovedRef.current) { suppressMovedRef.current = false; scheduleUrlWrite(); return }
        const c = map.getCenter(); const cur = { center: { lat: c.lat, lng: c.lng }, zoom: map.getZoom() }
        if (lastSearched.current && shouldOfferSearchArea(lastSearched.current, cur)) setMoved(true)
        scheduleUrlWrite()
      })
      // Origin pick (directions): capture the next click ONLY when arming it.
      map.on('click', (e: L.LeafletMouseEvent) => {
        if (!pickingOriginRef.current) return
        pickingOriginRef.current = false
        setPickingOrigin(false)
        setPickedOrigin({ lat: e.latlng.lat, lng: e.latlng.lng })
      })
      mapRef.current = map
      clusterRef.current = cluster
      emitMapMetric('map_loaded', { provider: 'leaflet' })
      emitMapMetric('map_provider', { provider: 'leaflet' })
      // Initial committed load. Defer until the container has its FINAL size
      // (mobile bottom sheet, dvh / Safari toolbar settle) so getBounds() reflects
      // the real rendered viewport — querying too early gives a transiently narrow
      // box. The `initial` union then guarantees the SSR places survive regardless.
      const initialLoad = () => {
        const m = mapRef.current
        if (!m) return
        m.invalidateSize()
        void fetchBounds(category, q, { initial: true })
      }
      requestAnimationFrame(() => requestAnimationFrame(initialLoad))
    } catch {
      setMapFailed(true)
      emitMapMetric('map_load_failed', { provider: 'leaflet' })
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
      if (!map.getBounds().contains([m.lat, m.lng])) {
        suppressMovedRef.current = true // programmatic pan → don't offer "search area"
        map.panTo([m.lat, m.lng], motionOptions(reducedRef.current))
      }
    }
    // Marker-driven selection: open the sheet enough to reveal the (now expanded)
    // row. Row scroll-into-view is handled by the `selected` effect below.
    if (!fromList && sheet === 'collapsed') setSheet('half')
  }, [places, sheet])

  // When the selection changes, gently bring its row into view inside the
  // scroll container. On mobile that row has just expanded inline, so this keeps
  // the expanded card fully visible near the bottom of the sheet without ever
  // jumping the whole page. `block: 'nearest'` is a no-op when already visible.
  useEffect(() => {
    if (!selected) return
    const id = requestAnimationFrame(() => {
      listRefs.current.get(selected)?.scrollIntoView({ block: 'nearest', behavior: scrollBehavior(reducedRef.current) })
    })
    return () => cancelAnimationFrame(id)
  }, [selected])

  // ── Route preview rendering (origin/dest markers + polyline + fit bounds) ──
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    routeLayerRef.current?.remove()
    routeLayerRef.current = null
    if (!routePreview) return
    const layer = L.layerGroup()
    if (routePreview.points.length) {
      L.polyline(routePreview.points, { color: '#1d4ed8', weight: 5, opacity: 0.85 }).addTo(layer)
    }
    const pin = (color: string, glyph: string) => L.divIcon({
      className: '',
      html: `<div style="width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3);display:grid;place-items:center"><span style="transform:rotate(45deg);font-size:13px">${glyph}</span></div>`,
      iconSize: [26, 26], iconAnchor: [13, 26],
    })
    L.marker([routePreview.origin.lat, routePreview.origin.lng], { icon: pin('#10b981', '🟢'), zIndexOffset: 1200 }).addTo(layer)
    L.marker([routePreview.destination.lat, routePreview.destination.lng], { icon: pin('#1d4ed8', '📍'), zIndexOffset: 1200 }).addTo(layer)
    layer.addTo(map)
    routeLayerRef.current = layer
    const b = polylineBounds(routePreview.points) ?? {
      north: Math.max(routePreview.origin.lat, routePreview.destination.lat), south: Math.min(routePreview.origin.lat, routePreview.destination.lat),
      east: Math.max(routePreview.origin.lng, routePreview.destination.lng), west: Math.min(routePreview.origin.lng, routePreview.destination.lng),
    }
    if (!prevViewRef.current) prevViewRef.current = { center: { lat: map.getCenter().lat, lng: map.getCenter().lng }, zoom: map.getZoom() }
    suppressMovedRef.current = true // programmatic fit → don't offer "search area"
    map.fitBounds([[b.south, b.west], [b.north, b.east]], { padding: [60, 60], maxZoom: 16, ...motionOptions(reducedRef.current) })
  }, [routePreview])

  // Open / close the directions panel for a place.
  const openDirections = useCallback((m: NearbyPlace) => {
    setExternalPreview(null); setSelected(m.slug); setDirectionsFor(m)
  }, [])
  const closeDirections = useCallback(() => {
    setDirectionsFor(null); setRoutePreview(null); setPickingOrigin(false); pickingOriginRef.current = false; setPickedOrigin(null)
    const map = mapRef.current
    if (map && prevViewRef.current) {
      suppressMovedRef.current = true // programmatic restore → don't offer "search area"
      map.setView([prevViewRef.current.center.lat, prevViewRef.current.center.lng], prevViewRef.current.zoom, motionOptions(reducedRef.current))
    }
    prevViewRef.current = null
    // Restore focus to the map region (the trigger lived in a now-hidden preview).
    mapEl.current?.focus()
  }, [])

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
      else if (directionsFor) closeDirections()
      else if (externalPreview) setExternalPreview(null)
      else if (selected) setSelected(null)
      else if (sheet === 'full') setSheet('half')
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [filtersOpen, selected, sheet, externalPreview, directionsFor, closeDirections])

  const onCategory = (code: string) => { setCategory(code); setTimeout(() => void fetchBounds(code, q), 0) }
  const clearFilters = () => { setCategory(''); setOpenNowOnly(false); setTimeout(() => void fetchBounds('', q), 0) }
  const filtersActive = Boolean(category) || openNowOnly

  // ── Unified search selections (internal first; external kept separate) ──
  const onSelectInternal = useCallback((item: InternalResultItem) => {
    setExternalPreview(null)
    emitMapMetric('result_selected', { source: 'internal' })
    const map = mapRef.current
    if (places.some((p) => p.slug === item.slug)) {
      selectPlace(item.slug, true)
      if (sheet === 'collapsed') setSheet('half')
      return
    }
    if (item.hasCoordinates && item.lat != null && item.lng != null && map) {
      // Inject the result up-front so the marker, preview and list row appear
      // immediately — the selection stays visible even before the viewport
      // reloads, and never flashes from 1 result to 0.
      const np = internalToNearby(item)
      pinnedRef.current = np
      setPlaces((prev) => [np, ...prev.filter((p) => p.slug !== np.slug)])
      setSelected(item.slug)
      if (sheet === 'collapsed') setSheet('half')
      const targetZoom = Math.max(map.getZoom(), 15)
      // Fetch the new viewport AFTER the camera settles. getBounds() is stale
      // during an animated setView, so querying immediately returned the OLD
      // viewport (which excluded the place) → the "0 places" bug. moveend fires
      // for both animated and instant moves.
      suppressMovedRef.current = true // programmatic fly → don't offer "search area"
      map.once('moveend', () => { void fetchBounds() })
      map.setView([item.lat, item.lng], targetZoom, motionOptions(reducedRef.current))
      return
    }
    // No coordinates at all → open the editorial article instead.
    router.push(`/places/${item.slug}`)
    // selectPlace/fetchBounds are stable enough; deps kept minimal intentionally.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, router, sheet])

  const onSelectStationArea = useCallback((item: StationAreaResultItem) => {
    setExternalPreview(null); emitMapMetric('result_selected', { source: 'station' }); setQ(item.label); void fetchBounds(category, item.label)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category])

  const onSelectTopic = useCallback((item: TopicResultItem) => {
    setExternalPreview(null); emitMapMetric('result_selected', { source: 'topic' })
    if (item.topicType === 'category') { setCategory(item.code); void fetchBounds(item.code, q) }
    else { setQ(item.label); void fetchBounds(category, item.label) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, q])

  const onSelectExternal = useCallback((preview: ExternalPreview) => {
    setSelected(null); setExternalPreview(preview); emitMapMetric('result_selected', { source: 'external' })
  }, [])

  // Duplicate detection: prefer an existing Chợ Cóc FKO article for this place.
  const externalDuplicate = useMemo(() => {
    if (!externalPreview) return null
    return findInternalDuplicate(
      { providerPlaceId: externalPreview.providerPlaceId, name: externalPreview.name, formattedAddress: externalPreview.formattedAddress, lat: externalPreview.lat, lng: externalPreview.lng },
      places.map((p) => ({ slug: p.slug, name: p.name, address: p.area, lat: p.lat, lng: p.lng })),
    )
  }, [externalPreview, places])

  const adminHref = useMemo(() => {
    if (!externalPreview || !(isAdmin && adminSearchEnabled)) return null
    const token = encodeExternalSeed({
      providerPlaceId: externalPreview.providerPlaceId, name: externalPreview.name,
      address: externalPreview.formattedAddress, lat: externalPreview.lat, lng: externalPreview.lng,
    })
    return `/admin/places?${SEED_PARAM}=${token}`
  }, [externalPreview, isAdmin, adminSearchEnabled])

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

  // `inline` = rendered inside the results list (mobile inline expansion): a
  // calmer shadow + selected-state border so it reads as part of the list rather
  // than a detached floating layer. Default = floating preview (desktop).
  const Preview = ({ m, inline = false }: { m: NearbyPlace; inline?: boolean }) => {
    const share = async () => {
      const url = `${window.location.origin}/places/${m.slug}`
      try { if (navigator.share) await navigator.share({ title: m.name, url }); else await navigator.clipboard.writeText(url) } catch { /* cancelled */ }
    }
    return (
      <div className={`bg-paper border rounded-2xl overflow-hidden ${inline ? 'border-rose ring-1 ring-rose/25 shadow-sm motion-safe:animate-fadein' : 'border-line shadow-card-hover'}`}>
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
              <button type="button" onClick={() => { setSelected(null); mapEl.current?.focus() }} aria-label={tpd('close')}
                className="w-8 h-8 grid place-items-center rounded-full bg-cream text-ink text-[13px] border border-line">✕</button>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <Link href={`/places/${m.slug}`} className="flex-1 text-center py-1.5 text-[12.5px] font-semibold rounded-xl bg-teal-soft text-teal border border-teal/20 hover:bg-teal hover:text-white transition-all">{t('view_article')}</Link>
            <button type="button" onClick={() => openDirections(m)} className="flex-1 text-center py-1.5 text-[12.5px] font-semibold rounded-xl bg-rose-soft text-rose border border-rose/20 hover:bg-rose hover:text-white transition-all">{t('directions')}</button>
            <button type="button" onClick={share} aria-label={t('share')} className="px-3 py-1.5 text-[12.5px] font-semibold rounded-xl bg-cream text-ink border border-line">↗</button>
          </div>
        </div>
      </div>
    )
  }

  // ── shared list ──
  // `inlineExpand` (mobile bottom sheet only): the selected row expands IN PLACE
  // inside the scrollable list — it stays in normal document flow so following
  // cards move below it. Desktop keeps the compact rows and shows the selected
  // place in the floating preview beside the map instead.
  const List = ({ idPrefix, inlineExpand = false }: { idPrefix: string; inlineExpand?: boolean }) => (
    <div className="h-full flex flex-col">
      {/* Header = result info ONLY. The single "search this area" action lives on
          the map (floating button); it is never duplicated here. */}
      <div className="flex-none px-4 pt-3 pb-2.5 border-b border-line/60 flex items-center gap-2">
        <span className="text-[13px] font-semibold text-ink truncate" aria-live="polite">
          {fetchState === 'loading' ? te('loading') : t('results_n', { count: displayed.length })}
        </span>
        {filtersActive && fetchState !== 'loading' && (
          <span className="flex-none text-[11px] font-semibold text-rose bg-rose-soft border border-rose/20 rounded-full px-2 py-0.5">{t('filters_on')}</span>
        )}
      </div>
      <ul role="list" className="flex-1 overflow-y-auto px-3 pt-3 pb-4 space-y-2">
        {fetchState === 'loading' && displayed.length === 0 ? (
          [0, 1, 2, 3].map((i) => <li key={i} className="h-[84px] rounded-2xl bg-line/40 animate-pulse" aria-hidden />)
        ) : fetchState === 'error' ? (
          <li className="text-[13px] text-rose bg-rose-soft border border-rose/20 rounded-2xl p-4">
            {t('load_error')}{' '}
            <button type="button" onClick={() => void fetchBounds()} className="underline font-semibold">{t('retry')}</button>
          </li>
        ) : displayed.length === 0 ? (
          // Compact, intentional empty state. NO duplicate "search this area"
          // button — that action is the floating map button. Only a context-
          // specific secondary action (clear filters) appears, and only when it
          // is the actual cause.
          <li className="bg-paper border border-line rounded-2xl px-5 py-6 text-center">
            <span aria-hidden className="mx-auto mb-2 grid h-10 w-10 place-items-center rounded-full bg-cream text-[18px]">🗺️</span>
            <p className="text-[13.5px] font-semibold text-ink">{filtersActive ? t('empty_filtered') : t('empty')}</p>
            <p className="text-[12.5px] text-muted mt-1 leading-relaxed">{t('empty_hint')}</p>
            {filtersActive && (
              <button type="button" onClick={clearFilters}
                className="mt-3 inline-block text-[12.5px] font-semibold px-3.5 py-2 rounded-full border border-line text-ink bg-paper hover:border-rose/40 transition-colors">{t('clear_filters')}</button>
            )}
          </li>
        ) : displayed.map((m) => {
          const isSel = m.slug === selected
          // Inline-expanded selected row (mobile): full detail card rendered in
          // normal list flow — never a floating overlay above other results.
          if (inlineExpand && isSel) {
            return (
              <li key={m.slug} ref={(el) => { if (el) listRefs.current.set(m.slug, el); else listRefs.current.delete(m.slug) }}>
                {Preview({ m, inline: true })}
              </li>
            )
          }
          return (
            <li key={m.slug} ref={(el) => { if (el) listRefs.current.set(m.slug, el); else listRefs.current.delete(m.slug) }}>
              <button type="button" id={`${idPrefix}-${m.slug}`} aria-pressed={isSel} aria-expanded={inlineExpand ? isSel : undefined} onClick={() => selectPlace(m.slug, true)}
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

  const FilterBar = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative inline-flex">
        <select value={category} onChange={(e) => onCategory(e.target.value)} aria-label={te('any_category')}
          className="appearance-none text-[13px] h-[40px] pl-3.5 pr-8 border border-line rounded-full bg-paper/95 backdrop-blur shadow-sm cursor-pointer hover:border-rose/40 focus:outline-none focus:border-rose transition-colors">
          <option value="">{te('any_category')}</option>
          {categories.map((c) => <option key={c.code} value={c.code}>{c.emoji} {c.label}</option>)}
        </select>
        <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </div>
      <label className={`inline-flex items-center gap-1.5 text-[13px] h-[40px] px-3.5 rounded-full border bg-paper/95 backdrop-blur shadow-sm cursor-pointer transition-colors ${openNowOnly ? 'border-rose text-rose' : 'border-line hover:border-rose/40'}`}>
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
        <div className="border border-line rounded-2xl h-[70vh]">{List({ idPrefix: 'fb' })}</div>
      </div>
    )
  }

  return (
    <div className="map-v2-shell relative w-full max-w-full h-[calc(100dvh-var(--header-h,68px)-40px)] min-h-[480px] rounded-2xl overflow-hidden border border-line">
      {/* Map fills the container. The results list is the non-map alternative. */}
      <div ref={mapEl} aria-label={t('map_region_label')} className="absolute inset-0 z-0" />

      {/* Floating control bar (top). One compact row: a width-capped search that
          stays primary without spanning the whole map, with the filters sitting
          inline beside it on desktop (a toggle on tablet/mobile). Constrained to
          the viewport, safe-area aware, and shrinkable. */}
      <div className="absolute top-0 left-0 right-0 z-[500] p-3 sm:p-4 lg:left-[376px] pointer-events-none"
        style={{ paddingTop: 'max(0.875rem, env(safe-area-inset-top))' }}>
        <div className="flex flex-wrap items-center gap-2 pointer-events-auto">
          {/* Search — capped so it reads as primary but never oversized. */}
          <div className="flex-1 min-w-0 lg:flex-none lg:w-[420px]">
            <UnifiedSearchBox
              externalEnabled={externalEnabled}
              apiKey={apiKey}
              locale={locale}
              placeholder={t('search_placeholder')}
              onSelectInternal={onSelectInternal}
              onSelectStationArea={onSelectStationArea}
              onSelectTopic={onSelectTopic}
              onSelectExternal={onSelectExternal}
            />
          </div>
          {/* Desktop: filters inline beside the search (one tidy control bar). */}
          <div className="hidden lg:block">{FilterBar}</div>
          {/* Tablet/mobile: compact filters toggle with an active-state dot. */}
          <button type="button" onClick={() => setFiltersOpen((v) => !v)} aria-expanded={filtersOpen}
            className="lg:hidden flex-none inline-flex items-center gap-1.5 h-[44px] px-4 rounded-full bg-paper/95 backdrop-blur border border-line text-[13px] font-semibold shadow-sm hover:border-rose/40 transition-colors">
            <svg className="w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18M6 12h12M10 20h4" /></svg>
            {t('filters')}
            {filtersActive && <span className="w-1.5 h-1.5 rounded-full bg-rose" aria-hidden="true" />}
          </button>
        </div>
        {filtersOpen && <div className="lg:hidden mt-2 pointer-events-auto bg-paper/95 backdrop-blur border border-line rounded-2xl p-3 shadow-sm">{FilterBar}</div>}
      </div>

      {/* THE single "search this area" action. Floating, centered, below the
          search row, shown only after an un-searched USER viewport change. It is
          intentionally the only place this action appears (not in the list header
          or empty state). */}
      {moved && (
        <button type="button" onClick={() => void fetchBounds()}
          aria-label={t('search_area')}
          style={{ top: 'calc(env(safe-area-inset-top) + 64px)' }}
          className="absolute left-1/2 -translate-x-1/2 z-[600] inline-flex items-center gap-1.5 min-h-[44px] text-[13px] font-semibold px-4 rounded-full bg-ink text-white shadow-lg hover:bg-ink/90 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" /></svg>
          {t('search_area')}
        </button>
      )}

      {/* Desktop: collapsible left results panel */}
      <div className={`hidden lg:flex absolute top-0 bottom-0 left-0 z-[550] transition-transform ${panelOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div role="region" aria-label={t('list_region_label')} className="w-[360px] bg-paper/95 backdrop-blur border-r border-line flex flex-col">
          {List({ idPrefix: 'd' })}
        </div>
        <button type="button" onClick={() => setPanelOpen((v) => !v)} aria-label={panelOpen ? t('hide_list') : t('show_list')}
          className="self-center -ml-px h-16 w-6 grid place-items-center bg-paper border border-l-0 border-line rounded-r-lg text-muted">
          {panelOpen ? '‹' : '›'}
        </button>
      </div>

      {/* Mobile/tablet: draggable bottom sheet */}
      <div role="region" aria-label={t('list_region_label')}
        className={`lg:hidden absolute inset-x-0 bottom-0 z-[550] ${SHEET_H[sheet]} transition-[height] duration-200 bg-paper/97 backdrop-blur border-t border-line rounded-t-2xl shadow-[0_-4px_20px_-8px_rgba(0,0,0,0.25)] flex flex-col`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <button type="button" onPointerDown={onHandleDown} onPointerUp={onHandleUp}
          aria-label={t('toggle_list')} className="flex-none py-3 grid place-items-center cursor-grab touch-none">
          <span className="w-10 h-1.5 rounded-full bg-line" />
        </button>
        <div className="flex-1 min-h-0">{List({ idPrefix: 'm', inlineExpand: true })}</div>
      </div>

      {/* Picking-origin hint (route mode) */}
      {pickingOrigin && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[680] text-[12.5px] font-semibold px-4 py-2 rounded-full bg-blue-600 text-white shadow-lg">
          {t('pick_origin_hint')}
        </div>
      )}

      {/* Directions panel (takes precedence over previews; keeps selection) */}
      {directionsFor && (
        <div className="absolute z-[710] inset-x-3 bottom-[120px] lg:inset-x-auto lg:left-[376px] lg:bottom-3 lg:w-[360px]">
          <DirectionsPanel
            destination={{ name: directionsFor.name, lat: directionsFor.lat, lng: directionsFor.lng, placeId: null, mapUrl: directionsFor.mapUrl }}
            routePreviewAvailable={routePreviewAvailable}
            locale={locale}
            pickedOrigin={pickedOrigin}
            onRequestPickOrigin={() => { pickingOriginRef.current = true; setPickingOrigin(true) }}
            onRoute={setRoutePreview}
            onClose={closeDirections}
          />
        </div>
      )}

      {/* Selected-place preview (internal Chợ Cóc FKO editorial).
          Desktop only: floats over the map beside the left sidebar. On mobile the
          selection expands INLINE inside the bottom-sheet list (see List
          `inlineExpand`), so no floating card overlaps the other results. */}
      {sel && !externalPreview && !directionsFor && (
        <div className="hidden lg:block absolute z-[700] lg:inset-x-auto lg:left-[376px] lg:bottom-3 lg:w-[340px]">
          {Preview({ m: sel })}
        </div>
      )}

      {/* External Google place preview (visually distinct; never editorial) */}
      {externalPreview && !directionsFor && (
        <div className="absolute z-[700] inset-x-3 bottom-[120px] lg:inset-x-auto lg:left-[376px] lg:bottom-3 lg:w-[340px]">
          <ExternalPlacePreviewCard
            preview={externalPreview}
            duplicate={externalDuplicate}
            showAdminAction={isAdmin && adminSearchEnabled}
            adminHref={adminHref}
            onClose={() => { setExternalPreview(null); mapEl.current?.focus() }}
          />
        </div>
      )}
    </div>
  )
}
