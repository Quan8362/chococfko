// Qualification calculator for one group. Championship qualifiers are taken FIRST (top
// `winnerQualifiers`), then consolation takes the NEXT `consolationQualifiers` positions. A
// competitor can never appear in both branches. Pure & deterministic.
//
// Outcomes (discriminated, no throw for expected states):
//   ok             → championship[] + consolation[]
//   blocked_by_tie → an unresolved tie straddles a qualification cut (which group/competitors)
//   invalid        → the group cannot supply the requested qualifiers (QUALIFICATION_OVERFLOW)
//
// Manual override (Prompt 15): pass `resolvedOrder` — a full, unique ordering of the group's
// competitors decided by the organizer — to break ties. No database write happens here.

import type { ClassifiedTie, CompetitorId, GroupId, Standings } from './types.ts'
import type { TournamentErrorCode } from './errors.ts'
import { classifyTies } from './ties.ts'

export type QualificationOutcome =
  | { readonly status: 'ok'; readonly championship: readonly CompetitorId[]; readonly consolation: readonly CompetitorId[] }
  | { readonly status: 'blocked_by_tie'; readonly ties: readonly ClassifiedTie[] }
  | { readonly status: 'invalid'; readonly code: TournamentErrorCode; readonly message: string; readonly groupId?: GroupId }

export function qualifyGroup(input: {
  readonly groupId?: GroupId
  readonly standings: Standings
  readonly winnerQualifiers: number
  readonly consolationQualifiers: number
  readonly resolvedOrder?: readonly CompetitorId[]
}): QualificationOutcome {
  const { groupId, standings, winnerQualifiers: winnerQ, consolationQualifiers: consoQ, resolvedOrder } = input
  const need = winnerQ + consoQ
  const rosterIds = standings.rows.map((r) => r.competitorId)
  const n = rosterIds.length

  if (need > n) {
    return {
      status: 'invalid',
      code: 'QUALIFICATION_OVERFLOW',
      message: `Group has ${n} competitor(s) but ${need} qualification slot(s) were requested`,
      groupId,
    }
  }

  // Determine the definitive ordering of competitor ids.
  let orderedIds: readonly CompetitorId[]
  if (resolvedOrder && resolvedOrder.length > 0) {
    // Validate the override is a permutation of exactly this group's competitors.
    const rosterSet = new Set(rosterIds)
    const overrideSet = new Set(resolvedOrder)
    const sameSize = overrideSet.size === resolvedOrder.length
      && overrideSet.size === rosterSet.size
      && resolvedOrder.every((id) => rosterSet.has(id))
    if (!sameSize) {
      return {
        status: 'invalid',
        code: 'INVALID_OVERRIDE',
        message: 'Resolved order must be a unique permutation of the group competitors',
        groupId,
      }
    }
    orderedIds = resolvedOrder
  } else {
    // No override: a tie straddling a cut is unresolved → block.
    const ties = classifyTies({
      standings,
      mode: 'group_knockout',
      winnerQualifiers: winnerQ,
      consolationQualifiers: consoQ,
    })
    const blocking = ties.filter((t) => t.impact !== 'none')
    if (blocking.length > 0) return { status: 'blocked_by_tie', ties: blocking }
    orderedIds = rosterIds
  }

  const championship = orderedIds.slice(0, winnerQ)
  const consolation = orderedIds.slice(winnerQ, winnerQ + consoQ)
  return { status: 'ok', championship, consolation }
}
