'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import TournamentCard from './TournamentCard'
import {
  filterAndSortTournaments,
  phaseCounts,
  PHASE_FILTERS,
  SORT_KEYS,
  type DiscoveryItem,
  type PhaseFilter,
  type SortKey,
} from '@/lib/tournaments/public/listFilter'

// Interactive discovery surface for the public tournament index: search + status tabs + sort over
// the already-loaded (RLS-approved) list. Pure client-side narrowing/reordering — it NEVER fetches
// or changes what is visible. All heavy logic lives in the tested pure `listFilter` module.
export default function TournamentDiscovery({
  items,
  createHref,
}: {
  items: DiscoveryItem[]
  createHref: string
}) {
  const t = useTranslations('tournaments')
  const [query, setQuery] = useState('')
  const [phase, setPhase] = useState<PhaseFilter>('all')
  const [sort, setSort] = useState<SortKey>('recommended')
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  const counts = useMemo(() => phaseCounts(items), [items])
  const visible = useMemo(
    () => filterAndSortTournaments(items, { query, phase, sort }),
    [items, query, phase, sort],
  )

  const hasFilters = query.trim() !== '' || phase !== 'all'

  function resetFilters() {
    setQuery('')
    setPhase('all')
  }

  // Automatic-activation tablist: Arrow/Home/End move focus AND selection across the status tabs.
  function onTabKeyDown(e: React.KeyboardEvent, index: number) {
    const last = PHASE_FILTERS.length - 1
    let next = index
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = index === last ? 0 : index + 1
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = index === 0 ? last : index - 1
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = last
    else return
    e.preventDefault()
    setPhase(PHASE_FILTERS[next])
    tabRefs.current[next]?.focus()
  }

  return (
    <div>
      {/* ── Toolbar: search + sort ─────────────────────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <label htmlFor="trn-search" className="sr-only">
            {t('public.search_label')}
          </label>
          <span aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted/70">
            <SearchIcon />
          </span>
          <input
            id="trn-search"
            name="tournament-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('public.search_placeholder')}
            autoComplete="off"
            className="w-full rounded-xl border border-line bg-paper py-2.5 pl-10 pr-10 text-[14px] text-ink placeholder:text-muted/70 transition-colors focus:border-rose/50 focus:outline-none focus:ring-2 focus:ring-rose/20"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label={t('public.clear_search')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 grid h-6 w-6 place-items-center rounded-full text-muted hover:bg-cream hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/50"
            >
              <CloseIcon />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 sm:flex-none">
          <label htmlFor="trn-sort" className="sr-only">
            {t('public.sort_label')}
          </label>
          <div className="relative w-full sm:w-auto">
            <select
              id="trn-sort"
              name="tournament-sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="w-full appearance-none rounded-xl border border-line bg-paper py-2.5 pl-4 pr-9 text-[13.5px] font-medium text-ink transition-colors focus:border-rose/50 focus:outline-none focus:ring-2 focus:ring-rose/20 sm:w-auto"
            >
              {SORT_KEYS.map((k) => (
                <option key={k} value={k}>
                  {t(`public.sort.${k}`)}
                </option>
              ))}
            </select>
            <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted/70">
              <ChevronDownIcon />
            </span>
          </div>
        </div>
      </div>

      {/* ── Status tabs + result count ─────────────────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          role="tablist"
          aria-label={t('public.status_filter_label')}
          className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {PHASE_FILTERS.map((p, i) => {
            const active = phase === p
            return (
              <button
                key={p}
                ref={(el) => {
                  tabRefs.current[i] = el
                }}
                role="tab"
                type="button"
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                onClick={() => setPhase(p)}
                onKeyDown={(e) => onTabKeyDown(e, i)}
                className={`flex-none whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/50 ${
                  active
                    ? 'border-rose bg-rose text-white'
                    : 'border-line bg-paper text-muted hover:border-rose/30 hover:text-rose'
                }`}
              >
                {t(`public.phase.${p}`)}
                <span
                  className={`ml-1.5 rounded-full px-1.5 py-px text-[11px] font-bold ${
                    active ? 'bg-white/25 text-white' : 'bg-cream text-muted'
                  }`}
                >
                  {counts[p]}
                </span>
              </button>
            )
          })}
        </div>

        <p aria-live="polite" className="flex-none text-[13px] text-muted">
          {t('public.result_count', { count: visible.length })}
        </p>
      </div>

      {/* ── Grid / no-results ──────────────────────────────────────────────────────────────────── */}
      {visible.length > 0 ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 sm:gap-6">
          {visible.map((item) => (
            <TournamentCard
              key={item.slug}
              item={item}
              labels={{
                statusLabel: t(`status.${item.phase}`),
                viewDetail: t('public.view_detail'),
                datesTbd: t('public.dates_tbd'),
                locationTbd: t('public.location_tbd'),
                eventsCount: t('public.events_count', { count: item.eventCount }),
              }}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-line bg-cream px-6 py-14 text-center">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-line bg-paper text-muted/60">
            <SearchIcon large />
          </div>
          <p className="mb-1 text-[15px] font-semibold text-ink">{t('public.no_results_title')}</p>
          <p className="mx-auto mb-5 max-w-[400px] text-[13.5px] text-muted">
            {query.trim()
              ? t('public.no_results_query', { query: query.trim() })
              : t('public.no_results_filter')}
          </p>
          <button
            type="button"
            onClick={resetFilters}
            disabled={!hasFilters}
            className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-paper px-4 py-2 text-[13px] font-semibold text-ink transition-colors hover:border-rose/40 hover:text-rose focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/50 disabled:opacity-50"
          >
            {t('public.clear_filters')}
          </button>
        </div>
      )}

      {/* Hidden create link keeps a create affordance available even from the no-results state. */}
      <Link href={createHref} className="sr-only">
        {t('public.create_cta')}
      </Link>
    </div>
  )
}

function SearchIcon({ large }: { large?: boolean }) {
  return (
    <svg className={large ? 'h-6 w-6' : 'h-[18px] w-[18px]'} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  )
}
function CloseIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}
function ChevronDownIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  )
}
