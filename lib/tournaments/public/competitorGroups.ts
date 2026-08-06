import type { PublicCompetitor } from './types'

export interface CompetitorGroup {
  id: string
  name: string
  members: PublicCompetitor[]
}

export interface GroupedCompetitors {
  // Groups in the SAME order as the `groups` argument (already `display_order` from the query).
  groups: CompetitorGroup[]
  // Competitors with no group assignment (falls back to a muted "unassigned" card).
  ungrouped: PublicCompetitor[]
  totalGroups: number
  totalCompetitors: number
}

// Pure bucketing for the public Athletes tab. Group ORDER follows the `groups` array; member ORDER
// follows the `competitors` array — both already sorted by the query (`display_order` / `created_at`).
// This helper never reorders, renames, drops, or parses a competitor: it only sorts each person into
// the bucket their `groupId` already points at. A competitor whose `groupId` is not among `groups`
// (data inconsistency that the query prevents) is skipped from cards but still counted in the total,
// exactly matching the tab's prior rendering behaviour.
export function groupCompetitors(
  competitors: PublicCompetitor[],
  groups: { id: string; name: string }[],
): GroupedCompetitors {
  const byGroup = new Map<string, PublicCompetitor[]>(groups.map((g) => [g.id, []]))
  const ungrouped: PublicCompetitor[] = []

  for (const c of competitors) {
    if (c.groupId) {
      byGroup.get(c.groupId)?.push(c)
    } else {
      ungrouped.push(c)
    }
  }

  return {
    groups: groups.map((g) => ({ id: g.id, name: g.name, members: byGroup.get(g.id) ?? [] })),
    ungrouped,
    totalGroups: groups.length,
    totalCompetitors: competitors.length,
  }
}
