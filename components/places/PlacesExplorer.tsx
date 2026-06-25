'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { Place } from '@/lib/places'
import { filterPlaces, suggestRelaxation, normalizeText, type PlaceCriteria, type SearchConfig } from '@/lib/placeSearch'
import { extractIntent } from '@/lib/placeIntent'
import { formatDistanceKm } from '@/lib/geo'
import { relevantFilterKeys } from '@/lib/placeFields'
import {
  encodeFilters, CHIP_KEYS, SORT_KEYS, activeFilterCount,
  resolvePriceBounds, hasPriceFilter, priceSelectionPatch, currentPriceSelection, PRICE_RESET,
  type ExploreFilters, type SortKey,
} from '@/lib/exploreParams'
import { formatYen, priceRangeI18nKey, type PriceRangeKey } from '@/lib/placeBudget'
import { SEARCH_EVENTS, trackSearchEvent, logSearchQuery, markSearchClicked } from '@/lib/searchAnalytics'
import PlaceFilters from './PlaceFilters'
import Select from '@/components/explore/Select'
import ViewSwitch from '@/components/explore/ViewSwitch'

const PAGE = 12
const RECENT_KEY = 'chococfko_recent_searches'

// suggestRelaxation returns engine (PlaceCriteria) keys, a few of which differ
// from the URL/UI (ExploreFilters) keys that chipLabel + `set` understand. Map
// them so the empty-state "remove filter" buttons get the right localized label
// AND actually clear the filter when clicked.
const CRITERIA_TO_FILTER_KEY: Partial<Record<string, keyof ExploreFilters>> = {
  verifiedOnly: 'verified',
  recentlyUpdatedDays: 'recentlyUpdated',
  paymentMethods: 'payment',
  languages: 'lang',
}
const toFilterKey = (k: keyof PlaceCriteria): keyof ExploreFilters =>
  CRITERIA_TO_FILTER_KEY[String(k)] ?? (k as keyof ExploreFilters)

interface Props {
  places: Place[]
  cards: Record<string, React.ReactNode>
  categories: { code: string; label: string }[]
  prefectures: { code: string; name: string }[]
  searchConfig: SearchConfig
  popular: string[]
  initial: ExploreFilters
  locale: string
}

export default function PlacesExplorer({ places, cards, categories, prefectures, searchConfig, popular, initial, locale }: Props) {
  const t = useTranslations('explore_search')
  const tp = useTranslations('place_fields')
  const router = useRouter()
  const pathname = usePathname()

  const [state, setState] = useState<ExploreFilters>(initial)
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null)
  const [geoStatus, setGeoStatus] = useState<'' | 'locating' | 'denied' | 'error' | 'unsupported'>('')
  const [drawer, setDrawer] = useState(false)
  const [visible, setVisible] = useState(PAGE)
  const [focused, setFocused] = useState(false)
  const [recent, setRecent] = useState<string[]>([])

  const urlTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const logTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSearchId = useRef<string | null>(null)
  const openedSinceSearch = useRef(true)
  const drawerRef = useRef<HTMLDivElement | null>(null)
  const drawerTriggerRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => { try { setRecent(JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')) } catch { /* ignore */ } }, [])

  // ── filter drawer a11y: body scroll lock + Escape + focus move/return ──
  useEffect(() => {
    if (!drawer) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const node = drawerRef.current
    const trigger = drawerTriggerRef.current
    const focusable = node?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
    focusable?.[0]?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setDrawer(false); return }
      if (e.key !== 'Tab' || !focusable || focusable.length === 0) return
      const first = focusable[0], last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener('keydown', onKey)
      trigger?.focus()
    }
  }, [drawer])

  // ── derive criteria + results (deterministic) ──
  const intent = useMemo(() => extractIntent(state.q ?? ''), [state.q])
  const criteria = useMemo<PlaceCriteria>(() => {
    const wantNearby = !!(state.nearby || intent.nearby)
    // Explicit price filter (bucket/custom) wins; only fall back to the price
    // parsed from the query text when the user set no price filter at all.
    const pb = resolvePriceBounds(state)
    const explicitPrice = hasPriceFilter(state)
    return {
      q: intent.rest,
      categories: state.category ? [state.category] : undefined,
      prefecture: state.prefecture ?? null,
      area: state.area ?? intent.area ?? null,
      station: state.station ?? intent.station ?? null,
      fee: state.fee,
      priceMin: explicitPrice ? pb.min : (intent.priceMin ?? null),
      priceMax: explicitPrice ? pb.max : (intent.priceMax ?? null),
      openNow: state.openNow || intent.openNow || undefined,
      now: new Date(),
      nearby: userLoc ? { lat: userLoc.lat, lng: userLoc.lng, radiusKm: wantNearby ? 10 : undefined } : null,
      reservationAvailable: state.reservationAvailable || intent.reservationAvailable || undefined,
      reservationRequired: state.reservationRequired || undefined,
      parking: state.parking || intent.parking || undefined,
      children: state.children || intent.children || undefined,
      solo: state.solo || intent.solo || undefined,
      group: state.group || intent.group || undefined,
      rainy: state.rainy || intent.rainy || undefined,
      indoor: state.indoor || intent.indoor || undefined,
      outdoor: state.outdoor || intent.outdoor || undefined,
      wheelchair: state.wheelchair || intent.wheelchair || undefined,
      bbq: state.bbq || undefined,
      camping: state.camping || undefined,
      pet: state.pet || undefined,
      vegetarian: state.vegetarian || undefined,
      smoking: state.smoking ?? null,
      tattoo: state.tattoo ?? null,
      paymentMethods: state.payment,
      languages: state.lang,
      verifiedOnly: state.verified || undefined,
      recentlyUpdatedDays: state.recentlyUpdated ? 30 : null,
      sort: (state.sort ?? (wantNearby && userLoc ? 'nearest' : 'recommended')) as SortKey,
    }
  }, [state, intent, userLoc])

  const results = useMemo(() => filterPlaces(places, criteria, searchConfig), [places, criteria, searchConfig])

  // reset pagination whenever the result set changes
  useEffect(() => { setVisible(PAGE) }, [criteria])

  // ── URL sync (debounced, replace) ──
  useEffect(() => {
    if (urlTimer.current) clearTimeout(urlTimer.current)
    urlTimer.current = setTimeout(() => {
      const sp = encodeFilters(state)
      const qs = sp.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    }, 350)
    return () => { if (urlTimer.current) clearTimeout(urlTimer.current) }
  }, [state, pathname, router])

  // ── analytics: log committed searches (debounced) ──
  useEffect(() => {
    const q = (state.q ?? '').trim()
    if (logTimer.current) clearTimeout(logTimer.current)
    if (!q) return
    logTimer.current = setTimeout(() => {
      // abandoned: previous search produced results but nothing was opened
      if (!openedSinceSearch.current) trackSearchEvent(SEARCH_EVENTS.abandoned)
      openedSinceSearch.current = false
      trackSearchEvent(SEARCH_EVENTS.submitted, { q })
      trackSearchEvent(results.length ? SEARCH_EVENTS.results : SEARCH_EVENTS.zeroResults, { q, count: results.length })
      addRecent(q)
      // privacy-safe payloads: no coordinates (nearby is a boolean only)
      const { nearby, ...intentSafe } = intent as unknown as Record<string, unknown>
      logSearchQuery({
        rawQuery: q, normalizedQuery: normalizeText(q), locale,
        resultCount: results.length,
        filters: { ...state, q: undefined },
        intent: { ...intentSafe, nearby: !!nearby },
      }).then((id) => { lastSearchId.current = id })
    }, 700)
    return () => { if (logTimer.current) clearTimeout(logTimer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.q, results.length])

  const addRecent = (q: string) => {
    setRecent((prev) => {
      const next = [q, ...prev.filter((x) => x !== q)].slice(0, 8)
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }

  const set = useCallback((patch: Partial<ExploreFilters>) => {
    setState((prev) => {
      for (const [k, v] of Object.entries(patch)) {
        if (k === 'q' || k === 'sort') continue
        const added = Array.isArray(v) ? v.length > 0 : !!v
        trackSearchEvent(added ? SEARCH_EVENTS.filterAdded : SEARCH_EVENTS.filterRemoved, { key: k })
      }
      return { ...prev, ...patch }
    })
  }, [])

  const relevant = useMemo(() => relevantFilterKeys(state.category ?? ''), [state.category])

  // ── geolocation ──
  const requestMyLocation = () => {
    if (!('geolocation' in navigator)) { setGeoStatus('unsupported'); return }
    setGeoStatus('locating')
    navigator.geolocation.getCurrentPosition(
      (pos) => { setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setGeoStatus(''); set({ nearby: true }); setState((p) => ({ ...p, sort: 'nearest' })) },
      (err) => setGeoStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'error'),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
    )
  }

  // ── chip labels ──
  const chipLabel = useCallback((key: keyof ExploreFilters): string | null => {
    const v = state[key]
    if (v == null || v === false || (Array.isArray(v) && !v.length)) return null
    switch (key) {
      case 'category': return categories.find((c) => c.code === v)?.label ?? String(v)
      case 'prefecture': return prefectures.find((p) => p.code === v)?.name ?? String(v)
      case 'area': case 'station': return String(v)
      case 'fee': return v === 'free' ? t('f_free') : t('f_paid')
      case 'price': return t(priceRangeI18nKey(v as PriceRangeKey))
      case 'priceMin': return t('price_from_chip', { value: formatYen(Number(v), locale) })
      case 'priceMax': return t('price_to_chip', { value: formatYen(Number(v), locale) })
      case 'openNow': return t('f_open_now')
      case 'nearby': return t('f_near_me')
      case 'reservationAvailable': return t('f_takes_reservation')
      case 'reservationRequired': return tp('reservation_required')
      case 'parking': return tp('parking')
      case 'children': return tp('good_for_children')
      case 'solo': return tp('good_for_solo')
      case 'group': return tp('good_for_groups')
      case 'rainy': return tp('rainy_day_ok')
      case 'indoor': return tp('io_indoor')
      case 'outdoor': return tp('io_outdoor')
      case 'wheelchair': return tp('wheelchair_accessible')
      case 'bbq': return tp('bbq_available')
      case 'camping': return tp('camping_available')
      case 'verified': return t('f_verified')
      case 'recentlyUpdated': return t('f_recently_updated')
      case 'smoking': return tp(`smk_${v}` as 'smk_no_smoking')
      case 'tattoo': return tp(`tat_${v}` as 'tat_allowed')
      case 'payment': return (v as string[]).map((m) => tp(`pm_${m}` as 'pm_cash')).join(', ')
      case 'lang': return (v as string[]).map((l) => tp(`lang_${l}` as 'lang_ja')).join(', ')
      default: return null
    }
  }, [state, categories, prefectures, t, tp, locale])

  // Combined label for an active CUSTOM range (one chip, not two ≥/≤ chips).
  const customPriceChip = useMemo(() => {
    if (state.price || (state.priceMin == null && state.priceMax == null)) return null
    const min = state.priceMin != null ? formatYen(state.priceMin, locale) : null
    const max = state.priceMax != null ? formatYen(state.priceMax, locale) : null
    if (min && max) return `${min}–${max}`
    if (min) return t('price_from_chip', { value: min })
    return t('price_to_chip', { value: max as string })
  }, [state.price, state.priceMin, state.priceMax, locale, t])

  // Human label for the active price choice (bucket / free / custom) — for the
  // zero-result relax suggestions, where the dropped engine key is priceMin/Max.
  const priceSelectionLabel = useMemo(() => {
    const sel = currentPriceSelection(state)
    if (sel === 'all') return null
    if (sel === 'free') return t('f_free')
    if (sel === 'custom') return customPriceChip
    return t(priceRangeI18nKey(sel))
  }, [state, t, customPriceChip])

  // Relax a single criterion from the zero-result state. Price-dimension keys map
  // back to a full price reset (the bucket lives in state.price, not priceMin/Max).
  const relaxFilter = useCallback((key: keyof PlaceCriteria) => {
    if (key === 'priceMin' || key === 'priceMax' || key === 'fee') { set({ ...PRICE_RESET }); return }
    const fk = toFilterKey(key)
    set({ [fk]: Array.isArray(state[fk]) ? [] : undefined } as Partial<ExploreFilters>)
  }, [set, state])

  const activeCount = activeFilterCount(state)
  const shown = results.slice(0, visible)

  // zero-result helpers
  const relax = useMemo(() => (results.length === 0 ? suggestRelaxation(places, criteria, searchConfig).slice(0, 3) : []), [results.length, places, criteria, searchConfig])

  // Recovery suggestions for the empty state, each carrying the AUTHORITATIVE
  // count of places that become visible after removing ONLY that filter (all
  // other active filters preserved). The price dimension is collapsed into ONE
  // suggestion: suggestRelaxation works per engine key (priceMin/priceMax/fee),
  // but the button clears the WHOLE price dimension — so we compute that single
  // count here (it matches what the click does) and drop the per-key price
  // entries to avoid duplicate/contradictory buttons.
  const relaxItems = useMemo(() => {
    type Item = { key: string; label: string; count: number; onClick: () => void }
    if (results.length > 0) return [] as Item[]
    const priceKeys = new Set(['priceMin', 'priceMax', 'fee'])
    const items: Item[] = []
    if (hasPriceFilter(state) && priceSelectionLabel) {
      const relaxed = { ...criteria, priceMin: null, priceMax: null, fee: state.fee === 'free' ? undefined : criteria.fee } as PlaceCriteria
      const count = filterPlaces(places, relaxed, searchConfig).length
      if (count > 0) items.push({ key: 'price', label: priceSelectionLabel, count, onClick: () => set({ ...PRICE_RESET }) })
    }
    for (const s of relax) {
      if (priceKeys.has(String(s.filter))) continue
      const label = chipLabel(toFilterKey(s.filter)) ?? String(s.filter)
      items.push({ key: String(s.filter), label, count: s.count, onClick: () => relaxFilter(s.filter) })
    }
    return items.slice(0, 3)
  }, [results.length, relax, state, criteria, places, searchConfig, priceSelectionLabel, chipLabel, set, relaxFilter])
  const relatedCats = useMemo(() => {
    if (results.length > 0 || !state.category) return []
    return categories
      .map((c) => ({ c, n: filterPlaces(places, { ...criteria, categories: [c.code] }, searchConfig).length }))
      .filter((x) => x.n > 0 && x.c.code !== state.category)
      .slice(0, 4)
  }, [results.length, places, criteria, searchConfig, categories, state.category])

  // analytics: intercept card clicks within the grid
  const onGridClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest('a')
    if (!a) return
    const href = a.getAttribute('href') ?? ''
    openedSinceSearch.current = true
    if (lastSearchId.current) void markSearchClicked(lastSearchId.current)
    if (/google\.[^/]*\/maps|maps\.app|maps\?/.test(href)) trackSearchEvent(SEARCH_EVENTS.directionsClicked, { href })
    else if (href.startsWith('/places/')) trackSearchEvent(SEARCH_EVENTS.resultOpened, { href })
  }

  // intent-derived "detected" chips (read-only — clear by editing the query)
  const detected: string[] = []
  if (intent.openNow) detected.push(t('f_open_now'))
  if (intent.nearby) detected.push(t('f_near_me'))
  if (intent.station) detected.push(`${tp('pub_station')}: ${intent.station}`)
  if (intent.area) detected.push(intent.area)
  if (intent.priceMax) detected.push(`≤ ¥${intent.priceMax}`)
  if (intent.priceMin) detected.push(`≥ ¥${intent.priceMin}`)

  const sortKeys = SORT_KEYS.filter((s) => s !== 'nearest' || userLoc)

  // Map view link — preserve only the filters the Map page understands (keyword,
  // category, open-now). Area/prefecture aren't supported by the map view, so
  // they're intentionally dropped rather than breaking navigation.
  const mapHref = useMemo(() => {
    const sp = new URLSearchParams()
    const q = (state.q ?? '').trim()
    if (q) sp.set('q', q)
    if (state.category) sp.set('cat', state.category)
    if (state.openNow) sp.set('open', '1')
    // Price dimension — the Map applies the same shared semantics client-side.
    if (state.fee === 'free') sp.set('price', 'free')
    else if (state.price) sp.set('price', state.price)
    else if (state.priceMin != null || state.priceMax != null) {
      if (state.priceMin != null) sp.set('priceMin', String(state.priceMin))
      if (state.priceMax != null) sp.set('priceMax', String(state.priceMax))
    }
    const qs = sp.toString()
    return qs ? `/map?${qs}` : '/map'
  }, [state.q, state.category, state.openNow, state.fee, state.price, state.priceMin, state.priceMax])

  return (
    <div>
      {/* ── List / Map view switch ── */}
      <div className="flex justify-end mb-3">
        <ViewSwitch active="list" mapHref={mapHref} />
      </div>

      {/* ── Search bar + sort + filters button ── */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-2.5 mb-2.5">
        <div className="relative lg:flex-1">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
          </svg>
          <input
            value={state.q ?? ''}
            onChange={(e) => setState((p) => ({ ...p, q: e.target.value }))}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            placeholder={t('search_placeholder')}
            aria-label={t('search_placeholder')}
            className="w-full pl-10 pr-9 min-h-[44px] text-[14px] rounded-full border border-line bg-paper text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-rose/15"
          />
          {state.q && (
            <button type="button" onClick={() => setState((p) => ({ ...p, q: '' }))} aria-label={t('search_clear')}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 grid place-items-center rounded-full text-muted hover:text-rose">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
          {/* suggestions */}
          {focused && (!state.q) && (recent.length > 0 || popular.length > 0) && (
            <div className="absolute z-50 left-0 right-0 top-[calc(100%+6px)] bg-paper border border-line rounded-2xl shadow-card-hover p-3">
              {recent.length > 0 && (
                <div className="mb-2">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-[1px] text-muted">{t('recent')}</span>
                    <button type="button" className="text-[11.5px] text-rose hover:underline" onMouseDown={(e) => { e.preventDefault(); setRecent([]); try { localStorage.removeItem(RECENT_KEY) } catch { /* */ } }}>{t('clear_recent')}</button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {recent.map((r) => (
                      <button key={r} type="button" onMouseDown={(e) => { e.preventDefault(); setState((p) => ({ ...p, q: r })); trackSearchEvent(SEARCH_EVENTS.suggestionSelected, { q: r, kind: 'recent' }) }}
                        className="text-[12.5px] px-3 py-1 rounded-full bg-cream border border-line hover:border-rose/40">{r}</button>
                    ))}
                  </div>
                </div>
              )}
              {popular.length > 0 && (
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-[1px] text-muted block mb-1.5">{t('popular')}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {popular.map((r) => (
                      <button key={r} type="button" onMouseDown={(e) => { e.preventDefault(); setState((p) => ({ ...p, q: r })); trackSearchEvent(SEARCH_EVENTS.suggestionSelected, { q: r, kind: 'popular' }) }}
                        className="text-[12.5px] px-3 py-1 rounded-full bg-rose-soft text-rose border border-rose/15 hover:bg-rose hover:text-white">{r}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* sort + filters toggle (one row, balanced) */}
        <div className="flex items-center gap-2">
          <Select
            wrapperClassName="flex-1 lg:flex-none lg:w-[190px]"
            value={state.sort ?? 'recommended'}
            onChange={(e) => { setState((p) => ({ ...p, sort: e.target.value as SortKey })); trackSearchEvent(SEARCH_EVENTS.sortChanged, { sort: e.target.value }) }}
            aria-label={t('sort')}
          >
            {sortKeys.map((s) => <option key={s} value={s}>{t(`sort_${s}` as 'sort_recommended')}</option>)}
          </Select>

          {/* filters toggle (mobile/tablet drawer) */}
          <button ref={drawerTriggerRef} type="button" onClick={() => setDrawer(true)}
            aria-label={activeCount > 0 ? t('filters_n', { n: activeCount }) : t('filters')}
            aria-haspopup="dialog"
            className="lg:hidden inline-flex items-center gap-1.5 shrink-0 min-h-[44px] px-3.5 rounded-full border border-line bg-paper text-[13.5px] font-semibold text-ink">
            <svg className="w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h18M6 12h12M10 19h4" /></svg>
            <span>{t('filters')}</span>
            {activeCount > 0 && <span className="grid place-items-center min-w-[20px] h-5 px-1 rounded-full bg-rose text-white text-[11px] font-bold leading-none">{activeCount}</span>}
          </button>
        </div>
      </div>

      {/* category select + quick chips */}
      <div className="flex flex-col gap-2.5 mb-3 lg:flex-row lg:flex-wrap lg:items-center">
        <Select
          wrapperClassName="w-full lg:w-[240px]"
          value={state.category ?? ''}
          onChange={(e) => set({ category: e.target.value || undefined })}
          aria-label={t('any_category')}
        >
          <option value="">{t('any_category')}</option>
          {categories.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
        </Select>
        <div className="flex flex-wrap items-center gap-2">
          <QuickChip on={!!state.openNow} label={t('quick_open_now')} onClick={() => set({ openNow: !state.openNow || undefined })} />
          <QuickChip on={currentPriceSelection(state) === 'free'} label={t('quick_free')} onClick={() => set(priceSelectionPatch(currentPriceSelection(state) === 'free' ? 'all' : 'free'))} />
          <QuickChip on={!!state.nearby} label={t('quick_nearby')} onClick={() => (userLoc ? set({ nearby: !state.nearby || undefined }) : requestMyLocation())} />
          {geoStatus === 'locating' && <span className="text-[12px] text-muted">{t('nearby_locating')}</span>}
          {(geoStatus === 'denied' || geoStatus === 'error' || geoStatus === 'unsupported') && (
            <span className="text-[12px] text-rose">{t(`nearby_${geoStatus}` as 'nearby_denied')}</span>
          )}
        </div>
      </div>

      {/* active filter chips + detected */}
      {(activeCount > 0 || detected.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5 mb-4">
          {activeCount > 0 && <span className="text-[12px] font-semibold text-muted mr-0.5">{t('applied')}</span>}
          {CHIP_KEYS.map((k) => {
            const label = chipLabel(k)
            if (!label) return null
            return (
              <button key={k} type="button" aria-label={t('remove_filter', { filter: label })}
                onClick={() => set({ [k]: Array.isArray(state[k]) ? [] : undefined } as Partial<ExploreFilters>)}
                className="inline-flex items-center gap-1.5 text-[12.5px] font-medium pl-3 pr-2.5 py-1.5 rounded-full bg-rose-soft text-rose border border-rose/20 hover:bg-rose hover:text-white group">
                <span>{label}</span>
                <span aria-hidden="true" className="opacity-60 group-hover:opacity-100">✕</span>
              </button>
            )
          })}
          {customPriceChip && (
            <button type="button" aria-label={t('remove_filter', { filter: customPriceChip })}
              onClick={() => set({ priceMin: undefined, priceMax: undefined })}
              className="inline-flex items-center gap-1.5 text-[12.5px] font-medium pl-3 pr-2.5 py-1.5 rounded-full bg-rose-soft text-rose border border-rose/20 hover:bg-rose hover:text-white group">
              <span>{customPriceChip}</span>
              <span aria-hidden="true" className="opacity-60 group-hover:opacity-100">✕</span>
            </button>
          )}
          {detected.map((d) => (
            <span key={d} className="inline-flex items-center gap-1 text-[12px] px-2.5 py-1 rounded-full bg-cream border border-line text-muted" title={t('detected')}>
              <span className="opacity-50">⌕</span>{d}
            </span>
          ))}
          {activeCount > 0 && (
            <button type="button" onClick={() => setState((p) => ({ q: p.q, sort: p.sort }))} className="text-[12.5px] text-muted hover:text-rose underline ml-1">
              {t('clear_all')}
            </button>
          )}
        </div>
      )}

      {/* layout: desktop filter panel + results */}
      <div className="grid lg:grid-cols-[260px_1fr] gap-6 items-start">
        {/* desktop panel */}
        <aside className="hidden lg:block sticky top-[88px] bg-paper border border-line rounded-2xl px-4 max-h-[calc(100vh-110px)] overflow-auto">
          <PlaceFilters filters={state} set={set} relevant={relevant} categories={categories} prefectures={prefectures} locale={locale} />
        </aside>

        <div>
          <p className="text-[13.5px] text-muted mb-4" aria-live="polite">{t('results_n', { count: results.length })}</p>

          {results.length === 0 ? (
            <div className="bg-paper border border-line rounded-2xl px-5 py-7 text-center" role="status">
              <div className="text-[30px] mb-2" aria-hidden="true">🔍</div>
              <h3 className="font-serif font-bold text-[17px] text-ink mb-1">{t('empty_title')}</h3>
              <p className="text-[13.5px] text-muted mb-4 max-w-[380px] mx-auto leading-relaxed">{t('empty_sub')}</p>
              {/* Recovery actions: targeted filter removal is the PRIMARY path
                  (filled, with the exact promised count); clear-all is a quieter
                  secondary outline. Full-width controls stack cleanly on mobile
                  and never break the label across lines. */}
              <div className="flex flex-col items-stretch gap-2 mb-4 max-w-[360px] mx-auto">
                {relaxItems.map((item, i) => (
                  <button key={item.key} type="button" onClick={item.onClick}
                    aria-label={t('remove_filter_view', { filter: item.label, count: item.count })}
                    className={`inline-flex items-center justify-center text-center text-[13px] font-semibold px-4 min-h-[44px] rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/40 ${i === 0 ? 'bg-rose text-white border-rose hover:bg-rose/90' : 'bg-rose-soft text-rose border-rose/20 hover:bg-rose hover:text-white'}`}>
                    <span className="[text-wrap:balance]">{t('remove_filter_view', { filter: item.label, count: item.count })}</span>
                  </button>
                ))}
                {activeCount > 0 && (
                  <button type="button" onClick={() => setState((p) => ({ q: p.q, sort: p.sort }))}
                    className="inline-flex items-center justify-center text-[13px] font-semibold px-4 min-h-[44px] rounded-full border border-line bg-white text-ink/70 hover:text-ink hover:border-rose/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/40">
                    {t('view_all_places')}
                  </button>
                )}
              </div>
              {relatedCats.length > 0 && (
                <div className="mb-4">
                  <p className="text-[12px] font-semibold text-muted mb-2">{t('related_categories')}</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {relatedCats.map(({ c, n }) => (
                      <button key={c.code} type="button" onClick={() => set({ category: c.code })}
                        className="text-[13px] px-3.5 py-1.5 rounded-full bg-cream border border-line hover:border-rose/40">{c.label} ({n})</button>
                    ))}
                  </div>
                </div>
              )}
              {/* Tertiary: community help — visually separated so it never competes
                  with the recovery actions above. */}
              <div className="mt-5 pt-4 border-t border-line/70">
                <Link href="/community" className="inline-flex flex-col items-center gap-1">
                  <span className="font-semibold text-[13px] px-4 py-2 rounded-full border border-teal/30 text-teal bg-teal-soft hover:bg-teal hover:text-white transition-colors">{t('ask_community')}</span>
                  <span className="text-[12px] text-muted mt-1 max-w-[320px]">{t('ask_community_sub')}</span>
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6" onClickCapture={onGridClick}>
                {shown.map((p) => (
                  <div key={p.slug} className="relative h-full">
                    {typeof p.distanceKm === 'number' && (
                      <span className="absolute top-3 left-3 z-[3] text-[11px] font-semibold px-2 py-[3px] rounded-full bg-ink/85 text-white">
                        {t('distance_away', { dist: formatDistanceKm(p.distanceKm) })}
                      </span>
                    )}
                    {cards[p.slug] ?? null}
                  </div>
                ))}
              </div>
              {visible < results.length && (
                <div className="text-center mt-8">
                  <button type="button" onClick={() => setVisible((v) => v + PAGE)}
                    className="font-semibold text-[14px] px-7 py-3 rounded-full border border-line bg-paper hover:border-rose/40 hover:text-rose transition-colors">
                    {t('load_more')} · {t('showing_n_of_m', { shown: shown.length, total: results.length })}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* mobile filter drawer */}
      {drawer && (
        <div className="fixed inset-0 z-[200] lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawer(false)} />
          <div ref={drawerRef} role="dialog" aria-modal="true" aria-labelledby="place-filters-title"
            className="absolute right-0 top-0 bottom-0 w-[90%] max-w-[380px] bg-cream shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-line">
              <span id="place-filters-title" className="font-semibold text-[15px]">{activeCount > 0 ? t('filters_n', { n: activeCount }) : t('filters')}</span>
              <button type="button" onClick={() => setDrawer(false)} aria-label={t('done')} className="w-9 h-9 grid place-items-center rounded-full hover:bg-line">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-auto overscroll-contain px-4">
              <PlaceFilters filters={state} set={set} relevant={relevant} categories={categories} prefectures={prefectures} locale={locale} />
            </div>
            <div className="flex gap-2 px-4 pt-3 border-t border-line" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
              <button type="button" onClick={() => setState((p) => ({ q: p.q, sort: p.sort }))} className="flex-1 min-h-[44px] rounded-full border border-line text-[14px] font-semibold text-muted">{t('reset_filters')}</button>
              <button type="button" onClick={() => setDrawer(false)} className="flex-1 min-h-[44px] rounded-full bg-rose text-white text-[14px] font-semibold">{t('apply')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function QuickChip({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={`inline-flex items-center text-[13px] font-medium px-3.5 min-h-[36px] rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-rose/30 ${on ? 'bg-rose text-white border-rose' : 'bg-paper border-line text-muted hover:border-rose/40 hover:text-rose'}`}>
      {label}
    </button>
  )
}
