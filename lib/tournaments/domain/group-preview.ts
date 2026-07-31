// Round-robin PREVIEW + match-materialization built directly on top of generateRoundRobin — the
// schedule algorithm is NEVER reimplemented here (design doc §9). Pure & deterministic.
//
//   • buildRoundRobinMatches — flat list of matches across all groups (what the generate action
//     writes to the DB, after re-loading ground truth).
//   • buildRoundRobinPreview — a display-shaped summary (per group: competitor count, match count,
//     rounds with their pairings) plus totals, for the pre-generate preview screen.

import { generateRoundRobin } from './round-robin.ts'
import type { Competitor, GeneratedGroupMatch, GroupId } from './types.ts'

export interface PreviewGroupInput {
  readonly groupId: GroupId
  readonly competitors: readonly Competitor[]
}

export interface PreviewRound {
  readonly roundNumber: number
  readonly matches: readonly GeneratedGroupMatch[]
}

export interface PreviewGroup {
  readonly groupId: GroupId
  readonly competitorCount: number
  readonly matchCount: number
  readonly rounds: readonly PreviewRound[]
}

export interface RoundRobinPreview {
  readonly groups: readonly PreviewGroup[]
  readonly totalGroups: number
  readonly totalMatches: number
}

/** Flat list of every group match across all groups — the exact rows the generate action inserts. */
export function buildRoundRobinMatches(
  groups: readonly PreviewGroupInput[],
): GeneratedGroupMatch[] {
  const all: GeneratedGroupMatch[] = []
  for (const g of groups) {
    all.push(...generateRoundRobin({ groupId: g.groupId, competitors: g.competitors }))
  }
  return all
}

function groupByRound(matches: readonly GeneratedGroupMatch[]): PreviewRound[] {
  const byRound = new Map<number, GeneratedGroupMatch[]>()
  for (const m of matches) {
    const list = byRound.get(m.roundNumber)
    if (list) list.push(m)
    else byRound.set(m.roundNumber, [m])
  }
  return Array.from(byRound.keys())
    .sort((a, b) => a - b)
    .map((roundNumber) => ({ roundNumber, matches: byRound.get(roundNumber)! }))
}

/** Deterministic display summary of the round-robin schedule that WOULD be generated. */
export function buildRoundRobinPreview(input: {
  readonly groups: readonly PreviewGroupInput[]
}): RoundRobinPreview {
  const groups: PreviewGroup[] = input.groups.map((g) => {
    const matches = generateRoundRobin({ groupId: g.groupId, competitors: g.competitors })
    return {
      groupId: g.groupId,
      competitorCount: g.competitors.length,
      matchCount: matches.length,
      rounds: groupByRound(matches),
    }
  })

  return {
    groups,
    totalGroups: groups.length,
    totalMatches: groups.reduce((sum, g) => sum + g.matchCount, 0),
  }
}
