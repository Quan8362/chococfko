// Qualification calculator for one group. Championship qualifiers are taken FIRST (top
// `winnerQualifiers`), then consolation takes the NEXT `consolationQualifiers` positions. A
// competitor can never appear in both branches. Pure & deterministic.
//
// The configured `winnerQualifiers` / `consolationQualifiers` are the MAXIMUM slots each Serie can
// draw from a group — never a requirement that the group hold that many competitors. A group with
// fewer competitors than the configured total simply qualifies as many as it actually has, taking
// Serie A first and letting the Serie B count fall automatically (see effectiveQualifierCounts).
//
// Outcomes (discriminated, no throw for expected states):
//   ok             → championship[] + consolation[]
//   blocked_by_tie → an unresolved tie straddles a qualification cut (which group/competitors)
//   invalid        → an override permutation was malformed (INVALID_OVERRIDE)
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

/**
 * The number of Serie A / Serie B qualifiers a group with `competitorCount` competitors actually
 * yields, given the configured MAXIMUM slots per Serie. Serie A is filled first; whatever ranks
 * remain feed Serie B (capped by its own maximum). A short group never invents competitors and
 * never double-counts anyone. Pure & deterministic; the single source of the effective formula.
 *
 *   effectiveWinner      = min(requestedWinner, n)
 *   remainingAfterWinner = max(0, n − effectiveWinner)
 *   effectiveConsolation = min(requestedConsolation, remainingAfterWinner)
 */
export function effectiveQualifierCounts(
  competitorCount: number,
  requestedWinner: number,
  requestedConsolation: number,
): { effectiveWinner: number; effectiveConsolation: number } {
  const n = Math.max(0, Math.trunc(competitorCount))
  const reqW = Math.max(0, Math.trunc(requestedWinner))
  const reqC = Math.max(0, Math.trunc(requestedConsolation))
  const effectiveWinner = Math.min(reqW, n)
  const remainingAfterWinner = Math.max(0, n - effectiveWinner)
  const effectiveConsolation = Math.min(reqC, remainingAfterWinner)
  return { effectiveWinner, effectiveConsolation }
}

export function qualifyGroup(input: {
  readonly groupId?: GroupId
  readonly standings: Standings
  readonly winnerQualifiers: number
  readonly consolationQualifiers: number
  readonly resolvedOrder?: readonly CompetitorId[]
}): QualificationOutcome {
  const { groupId, standings, winnerQualifiers: winnerQ, consolationQualifiers: consoQ, resolvedOrder } = input
  const rosterIds = standings.rows.map((r) => r.competitorId)
  const n = rosterIds.length

  // Configured winner/consolation are MAXIMUMS. A short group qualifies as many as it actually has,
  // filling Serie A first — no phantom fourth competitor, no blocking overflow error.
  const { effectiveWinner, effectiveConsolation } = effectiveQualifierCounts(n, winnerQ, consoQ)

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
    // No override: a tie straddling an EFFECTIVE cut is unresolved → block. Cuts that a short group
    // pushes to (or past) its last rank mean everyone remaining qualifies, so no boundary ambiguity.
    const ties = classifyTies({
      standings,
      mode: 'group_knockout',
      winnerQualifiers: effectiveWinner,
      consolationQualifiers: effectiveConsolation,
    })
    const blocking = ties.filter((t) => t.impact !== 'none')
    if (blocking.length > 0) return { status: 'blocked_by_tie', ties: blocking }
    orderedIds = rosterIds
  }

  const championship = orderedIds.slice(0, effectiveWinner)
  const consolation = orderedIds.slice(effectiveWinner, effectiveWinner + effectiveConsolation)
  return { status: 'ok', championship, consolation }
}
