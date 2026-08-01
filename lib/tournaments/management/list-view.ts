import type { ManageableTournament } from '@/lib/tournaments/members'

export const MANAGEMENT_STATUS_FILTERS = ['all', 'draft', 'published', 'archived'] as const
export type ManagementStatusFilter = (typeof MANAGEMENT_STATUS_FILTERS)[number]

export const MANAGEMENT_SORT_OPTIONS = ['updated', 'starts'] as const
export type ManagementSortOption = (typeof MANAGEMENT_SORT_OPTIONS)[number]

function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('vi')
    .trim()
}

function timestamp(value: string | null): number | null {
  if (!value) return null
  const parsed = new Date(value).getTime()
  return Number.isNaN(parsed) ? null : parsed
}

export function selectManageableTournaments<T extends ManageableTournament>(
  items: readonly T[],
  query: string,
  status: ManagementStatusFilter,
  sort: ManagementSortOption,
  now = Date.now(),
): T[] {
  const needle = normalizeSearch(query)
  const selected = items.filter((item) => {
    if (status !== 'all' && item.status !== status) return false
    if (!needle) return true
    return normalizeSearch(`${item.name} ${item.slug}`).includes(needle)
  })

  return selected.sort((a, b) => {
    if (sort === 'starts') {
      const aStarts = timestamp(a.startsAt)
      const bStarts = timestamp(b.startsAt)
      const aDistance = aStarts === null ? Number.POSITIVE_INFINITY : Math.abs(aStarts - now)
      const bDistance = bStarts === null ? Number.POSITIVE_INFINITY : Math.abs(bStarts - now)
      if (aDistance !== bDistance) return aDistance - bDistance
    }

    const aUpdated = timestamp(a.updatedAt) ?? 0
    const bUpdated = timestamp(b.updatedAt) ?? 0
    if (aUpdated !== bUpdated) return bUpdated - aUpdated
    return a.name.localeCompare(b.name, 'vi')
  })
}
