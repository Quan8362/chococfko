'use client'

// ============================================================
// Unified map search box (Map UX Phase 7).
//
// INTERNAL FIRST: every keystroke (debounced) hits our own /api/places/search —
// Google is never called automatically. Results are grouped & clearly labeled:
//   Chợ Cóc FKO · Stations & areas · Topics · Google Maps (external, on demand).
//
// Performance: debounce + min chars + stale-request cancel + per-session internal
// cache + stable keyboard navigation + loading/zero/error/retry states.
// External (Google) is requested ONLY on an explicit "Search Google Maps" click,
// shown only when the server says it is safe to offer (flag-gated, default off).
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import type {
  UnifiedInternalResponse, InternalResultItem, StationAreaResultItem, TopicResultItem,
} from '@/lib/maps/unifiedSearch'
import { MIN_QUERY_CHARS } from '@/lib/maps/unifiedSearch'
import { emitMapMetric } from '@/lib/maps/metrics'
import type { ExternalPlacePreview } from '@/lib/maps/externalPlace'
import {
  fetchExternalSuggestions, fetchExternalPreviewFromPrediction, newExternalSessionToken,
  createDetailsCache, type ExternalSuggestion,
} from './externalSearch'

const DEBOUNCE_MS = 300
const JAPAN_BIAS = { north: 45.7, south: 24.0, east: 146.0, west: 122.9 }
const EMPTY: UnifiedInternalResponse = { internal: [], stationAreas: [], topics: [], internalTotal: 0, offerExternal: false, externalReason: 'none' }

interface Props {
  externalEnabled: boolean
  apiKey: string | null
  locale: string
  placeholder?: string
  onSelectInternal: (item: InternalResultItem) => void
  onSelectStationArea: (item: StationAreaResultItem) => void
  onSelectTopic: (item: TopicResultItem) => void
  onSelectExternal: (preview: ExternalPlacePreview) => void
}

type InternalState = '' | 'loading' | 'error'
type ExternalState = '' | 'loading' | 'zero' | 'error'

export default function UnifiedSearchBox({
  externalEnabled, apiKey, locale, placeholder,
  onSelectInternal, onSelectStationArea, onSelectTopic, onSelectExternal,
}: Props) {
  const t = useTranslations('map_search')

  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [res, setRes] = useState<UnifiedInternalResponse>(EMPTY)
  const [intState, setIntState] = useState<InternalState>('')
  const [ext, setExt] = useState<ExternalSuggestion[]>([])
  const [extState, setExtState] = useState<ExternalState>('')
  const [activeIdx, setActiveIdx] = useState(-1)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const intReqId = useRef(0)
  const extReqId = useRef(0)
  const cacheRef = useRef<Map<string, UnifiedInternalResponse>>(new Map())
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessionRef = useRef<any>(null)
  const detailsCache = useRef(createDetailsCache())
  const rootRef = useRef<HTMLDivElement>(null)

  // ── Internal search (debounced, min chars, stale-cancel, cached) ──
  const runInternal = useCallback(async (q: string) => {
    const norm = q.trim().toLowerCase()
    const cached = cacheRef.current.get(norm)
    if (cached) { setRes(cached); setIntState(''); return }
    const myId = ++intReqId.current
    setIntState('loading')
    try {
      const r = await fetch(`/api/places/search?q=${encodeURIComponent(q.trim())}`)
      const json = (await r.json()) as UnifiedInternalResponse
      if (myId !== intReqId.current) return // stale
      cacheRef.current.set(norm, json)
      setRes(json); setIntState('')
      emitMapMetric('search_succeeded', { count: json.internal?.length ?? 0 })
    } catch {
      if (myId !== intReqId.current) return
      setIntState('error')
      emitMapMetric('search_failed', { status: 'error' })
    }
  }, [])

  const onChange = (v: string) => {
    setQuery(v); setActiveIdx(-1); setExt([]); setExtState('')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const trimmed = v.trim()
    if (trimmed.length < MIN_QUERY_CHARS) { setRes(EMPTY); setIntState(''); setOpen(trimmed.length > 0); return }
    setOpen(true)
    debounceRef.current = setTimeout(() => void runInternal(trimmed), DEBOUNCE_MS)
  }

  // ── External search — explicit only ──
  const runExternal = useCallback(async () => {
    if (!externalEnabled || query.trim().length < MIN_QUERY_CHARS) return
    if (!sessionRef.current) sessionRef.current = await newExternalSessionToken(apiKey)
    const myId = ++extReqId.current
    setExtState('loading')
    try {
      const r = await fetchExternalSuggestions(apiKey, query.trim(), sessionRef.current, { language: locale, locationBias: JAPAN_BIAS })
      if (myId !== extReqId.current) return
      setExt(r); setExtState(r.length ? '' : 'zero')
    } catch {
      if (myId !== extReqId.current) return
      setExtState('error')
      emitMapMetric('autocomplete_failed', { status: 'error' })
    }
  }, [apiKey, externalEnabled, locale, query])

  const pickExternal = useCallback(async (s: ExternalSuggestion) => {
    try {
      const preview = await fetchExternalPreviewFromPrediction(s.prediction, detailsCache.current)
      sessionRef.current = null // session concluded → next external search starts fresh
      onSelectExternal(preview)
      setOpen(false)
    } catch { setExtState('error') }
  }, [onSelectExternal])

  // Flat selectable index for keyboard navigation (display order).
  const flat = useMemo(() => {
    const rows: { type: 'internal' | 'station' | 'topic' | 'ext'; idx: number }[] = []
    res.internal.forEach((_, i) => rows.push({ type: 'internal', idx: i }))
    res.stationAreas.forEach((_, i) => rows.push({ type: 'station', idx: i }))
    res.topics.forEach((_, i) => rows.push({ type: 'topic', idx: i }))
    ext.forEach((_, i) => rows.push({ type: 'ext', idx: i }))
    return rows
  }, [res, ext])

  const selectFlat = useCallback((pos: number) => {
    const row = flat[pos]
    if (!row) return
    if (row.type === 'internal') { onSelectInternal(res.internal[row.idx]); setOpen(false) }
    else if (row.type === 'station') { onSelectStationArea(res.stationAreas[row.idx]); setOpen(false) }
    else if (row.type === 'topic') { onSelectTopic(res.topics[row.idx]); setOpen(false) }
    else void pickExternal(ext[row.idx])
  }, [flat, res, ext, onSelectInternal, onSelectStationArea, onSelectTopic, pickExternal])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActiveIdx((i) => Math.min(i + 1, flat.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (activeIdx >= 0) selectFlat(activeIdx) }
    else if (e.key === 'Escape') { setOpen(false); setActiveIdx(-1) }
  }

  // Close on outside click.
  useEffect(() => {
    const h = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const hasInternal = res.internal.length > 0 || res.stationAreas.length > 0 || res.topics.length > 0
  const showZero = intState === '' && query.trim().length >= MIN_QUERY_CHARS && !hasInternal && ext.length === 0 && extState !== 'loading'
  const idxOf = (type: string, i: number) => flat.findIndex((r) => r.type === type && r.idx === i)
  const optId = (type: string, i: number) => `usb-opt-${type}-${i}`
  const activeRow = activeIdx >= 0 ? flat[activeIdx] : null
  const activeId = activeRow ? optId(activeRow.type, activeRow.idx) : undefined

  const Group = ({ titleKey, children }: { titleKey: string; children: React.ReactNode }) => (
    <li role="presentation">
      <div className="px-3.5 pt-2.5 pb-1 text-[10.5px] font-bold uppercase tracking-[0.6px] text-muted">{t(titleKey)}</div>
      <ul role="group">{children}</ul>
    </li>
  )

  return (
    <div ref={rootRef} className="relative w-full">
      <input
        type="search" role="combobox" aria-expanded={open} aria-controls="unified-search-results" aria-autocomplete="list"
        aria-activedescendant={open ? activeId : undefined}
        value={query} onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown} onFocus={() => query.trim() && setOpen(true)}
        placeholder={placeholder ?? t('placeholder')} aria-label={placeholder ?? t('placeholder')} autoComplete="off"
        className="w-full text-[14px] px-4 py-2.5 rounded-full border border-line bg-paper/95 backdrop-blur shadow-sm focus:outline-none focus:border-rose"
      />

      {open && query.trim().length >= MIN_QUERY_CHARS && (
        <div className="absolute z-[60] left-0 right-0 mt-1.5 bg-paper border border-line rounded-2xl shadow-lg overflow-hidden max-h-[64vh] overflow-y-auto">
          {intState === 'loading' && (
            <div className="px-3.5 py-3 text-[12.5px] text-muted">{t('searching')}</div>
          )}
          {intState === 'error' && (
            <div className="px-3.5 py-3 text-[12.5px] text-rose">
              {t('search_error')}{' '}
              <button type="button" onClick={() => void runInternal(query)} className="underline font-semibold">{t('retry')}</button>
            </div>
          )}

          <ul id="unified-search-results" role="listbox" className="py-1">
            {/* 1. Chợ Cóc FKO editorial places (internal, prioritized) */}
            {res.internal.length > 0 && (
              <Group titleKey="group_internal">
                {res.internal.map((m, i) => {
                  const pos = idxOf('internal', i)
                  return (
                    <li key={m.slug} id={optId('internal', i)} role="option" aria-selected={pos === activeIdx}>
                      <button type="button" onMouseEnter={() => setActiveIdx(pos)} onMouseDown={(e) => { e.preventDefault(); onSelectInternal(m); setOpen(false) }}
                        className={`w-full text-left flex gap-2.5 items-center px-3.5 py-2 ${pos === activeIdx ? 'bg-rose-soft' : ''} hover:bg-rose-soft`}>
                        {m.img
                          ? <span className="flex-none w-9 h-9 rounded-lg bg-cover bg-center" style={{ backgroundImage: `url(${m.img})` }} aria-hidden />
                          : <span className="flex-none w-9 h-9 rounded-lg bg-rose-soft grid place-items-center text-rose text-[13px]" aria-hidden>🏷️</span>}
                        <span className="min-w-0">
                          <span className="block text-[13.5px] font-semibold text-ink truncate">{m.name}</span>
                          <span className="block text-[11.5px] text-muted truncate">{m.categoryLabel}{m.area ? ` · ${m.area}` : ''}</span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </Group>
            )}

            {/* 3. Stations & areas */}
            {res.stationAreas.length > 0 && (
              <Group titleKey="group_stations">
                {res.stationAreas.map((s, i) => {
                  const pos = idxOf('station', i)
                  return (
                    <li key={`${s.type}-${s.key}`} id={optId('station', i)} role="option" aria-selected={pos === activeIdx}>
                      <button type="button" onMouseEnter={() => setActiveIdx(pos)} onMouseDown={(e) => { e.preventDefault(); onSelectStationArea(s); setOpen(false) }}
                        className={`w-full text-left flex gap-2.5 items-center px-3.5 py-2 ${pos === activeIdx ? 'bg-rose-soft' : ''} hover:bg-rose-soft`}>
                        <span className="flex-none w-9 h-9 rounded-lg bg-teal-soft grid place-items-center text-teal text-[13px]" aria-hidden>{s.type === 'station' ? '🚉' : '📍'}</span>
                        <span className="min-w-0">
                          <span className="block text-[13.5px] font-semibold text-ink truncate">{s.label}</span>
                          <span className="block text-[11.5px] text-muted">{t(s.type === 'station' ? 'station' : 'area')} · {t('count_places', { count: s.count })}</span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </Group>
            )}

            {/* 4. Topics */}
            {res.topics.length > 0 && (
              <Group titleKey="group_topics">
                {res.topics.map((tp, i) => {
                  const pos = idxOf('topic', i)
                  return (
                    <li key={`${tp.topicType}-${tp.code}`} id={optId('topic', i)} role="option" aria-selected={pos === activeIdx}>
                      <button type="button" onMouseEnter={() => setActiveIdx(pos)} onMouseDown={(e) => { e.preventDefault(); onSelectTopic(tp); setOpen(false) }}
                        className={`w-full text-left flex gap-2.5 items-center px-3.5 py-2 ${pos === activeIdx ? 'bg-rose-soft' : ''} hover:bg-rose-soft`}>
                        <span className="flex-none w-9 h-9 rounded-lg bg-cream grid place-items-center text-[13px]" aria-hidden>🔖</span>
                        <span className="min-w-0">
                          <span className="block text-[13.5px] font-semibold text-ink truncate">{tp.label}</span>
                          <span className="block text-[11.5px] text-muted">{t('count_places', { count: tp.count })}</span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </Group>
            )}

            {/* 2. Google Maps (external) — offered, never auto-run */}
            {externalEnabled && (res.offerExternal || ext.length > 0) && (
              <Group titleKey="group_google">
                <li className="px-3.5 py-1 text-[10.5px] text-muted">{t('google_hint')}</li>
                {ext.length === 0 ? (
                  <li>
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); void runExternal() }}
                      disabled={extState === 'loading'}
                      className="w-full text-left px-3.5 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60">
                      {extState === 'loading' ? t('searching_google') : t('search_google')}
                    </button>
                    {extState === 'error' && <p className="px-3.5 py-1.5 text-[12px] text-rose">{t('search_error')} <button type="button" onMouseDown={(e) => { e.preventDefault(); void runExternal() }} className="underline font-semibold">{t('retry')}</button></p>}
                    {extState === 'zero' && <p className="px-3.5 py-1.5 text-[12px] text-muted">{t('no_results')}</p>}
                  </li>
                ) : ext.map((s, i) => {
                  const pos = idxOf('ext', i)
                  return (
                    <li key={`${s.placeId ?? s.mainText}-${i}`} id={optId('ext', i)} role="option" aria-selected={pos === activeIdx}>
                      <button type="button" onMouseEnter={() => setActiveIdx(pos)} onMouseDown={(e) => { e.preventDefault(); void pickExternal(s) }}
                        className={`w-full text-left flex gap-2.5 items-center px-3.5 py-2 ${pos === activeIdx ? 'bg-slate-100' : ''} hover:bg-slate-100`}>
                        <span className="flex-none w-9 h-9 rounded-lg bg-slate-200 grid place-items-center text-slate-500 text-[13px]" aria-hidden>🌐</span>
                        <span className="min-w-0">
                          <span className="block text-[13.5px] font-semibold text-slate-800 truncate">{s.mainText}</span>
                          <span className="block text-[11.5px] text-slate-500 truncate">{s.secondaryText || t('provider_google')}</span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </Group>
            )}

            {showZero && <li className="px-3.5 py-3 text-[12.5px] text-muted">{t('no_results')}</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
