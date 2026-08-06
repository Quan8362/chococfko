// Pure, framework-free search / filter / sort for the public tournament discovery grid
// (`/giai-dau`). No I/O, no React — so it can be unit-tested with `node --test` and reused by the
// client toolbar. This layer NEVER changes visibility: it only reorders / narrows the already
// RLS-approved list handed to the browser.

import type { PublicTournamentListItem, TournamentPhase } from './types'

// A card row: the public list item plus a server-preformatted date label (so the client never has
// to re-plumb locale-aware date formatting).
export interface DiscoveryItem extends PublicTournamentListItem {
  dateLabel: string
}

// Status filter: 'all' plus the three calendar phases.
export type PhaseFilter = 'all' | TournamentPhase

// Sort keys surfaced in the toolbar:
//   recommended → keep the server's curated order (ongoing → upcoming → completed, then by date)
//   newest      → most recently created first
//   start_asc   → earliest start date first
//   start_desc  → latest start date first
export type SortKey = 'recommended' | 'newest' | 'start_asc' | 'start_desc'

export const SORT_KEYS: SortKey[] = ['recommended', 'newest', 'start_asc', 'start_desc']
export const PHASE_FILTERS: PhaseFilter[] = ['all', 'ongoing', 'upcoming', 'completed']

// Fold accents + case so "Fuku" matches "fúku" and "Đà Nẵng" matches "da nang". Uses Unicode NFD
// decomposition then strips combining marks; also flattens the Vietnamese đ/Đ which has no
// combining-mark decomposition.
export function normalizeText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .trim()
}

// Does the item match a free-text query over its name OR location? An empty/whitespace query
// matches everything.
export function matchesQuery(item: Pick<DiscoveryItem, 'name' | 'location'>, query: string): boolean {
  const q = normalizeText(query)
  if (!q) return true
  const haystack = normalizeText(`${item.name} ${item.location ?? ''}`)
  return haystack.includes(q)
}

// Count of items per phase (for the status tabs). `all` is the total.
export function phaseCounts(items: readonly DiscoveryItem[]): Record<PhaseFilter, number> {
  const counts: Record<PhaseFilter, number> = { all: items.length, ongoing: 0, upcoming: 0, completed: 0 }
  for (const it of items) counts[it.phase] += 1
  return counts
}

function startMs(item: DiscoveryItem): number {
  return item.startsAt ? Date.parse(item.startsAt) : NaN
}
function createdMs(item: DiscoveryItem): number {
  return item.createdAt ? Date.parse(item.createdAt) : NaN
}

// Push unknown (NaN) dates to the end regardless of direction, keeping the comparison stable.
function compareDates(a: number, b: number, direction: 1 | -1): number {
  const aNaN = Number.isNaN(a)
  const bNaN = Number.isNaN(b)
  if (aNaN && bNaN) return 0
  if (aNaN) return 1
  if (bNaN) return -1
  return (a - b) * direction
}

export interface DiscoveryFilters {
  query: string
  phase: PhaseFilter
  sort: SortKey
}

// Filter (by phase + query) then sort. `recommended` preserves the incoming (server-curated) order.
// The sort is stable: equal keys retain their prior relative order via an index tiebreaker.
export function filterAndSortTournaments(
  items: readonly DiscoveryItem[],
  { query, phase, sort }: DiscoveryFilters,
): DiscoveryItem[] {
  const filtered = items.filter(
    (it) => (phase === 'all' || it.phase === phase) && matchesQuery(it, query),
  )

  if (sort === 'recommended') return filtered

  const withIndex = filtered.map((item, index) => ({ item, index }))
  withIndex.sort((a, b) => {
    let cmp = 0
    if (sort === 'newest') cmp = compareDates(createdMs(a.item), createdMs(b.item), -1)
    else if (sort === 'start_asc') cmp = compareDates(startMs(a.item), startMs(b.item), 1)
    else if (sort === 'start_desc') cmp = compareDates(startMs(a.item), startMs(b.item), -1)
    return cmp !== 0 ? cmp : a.index - b.index
  })
  return withIndex.map((w) => w.item)
}
