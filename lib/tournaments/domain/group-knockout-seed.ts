// Group+knockout seeding built on GROUP-RANK TOKENS (Prompt 09). A token names a qualification
// SOURCE — "the rank-1 finisher of group A" — not a competitor id, so it stays stable while the
// group standings are still being finalized. The server resolves every token to a real competitor
// from the CURRENT standings only at generate time (never trusting a client-supplied competitor).
//
// Two independent brackets share this machinery:
//   • championship (Serie A) — the top `winnerQualifiers` ranks of each group,
//   • consolation  (Serie B) — the NEXT `consolationQualifiers` ranks of each group.
// This is NOT double elimination: a competitor belongs to exactly one branch, and the loser of a
// championship match never drops into consolation. The two brackets never exchange competitors.
//
// Everything here is pure & deterministic and NEVER re-implements the bracket algorithm — token
// resolution feeds the SAME buildKnockoutBracketFromSeeds / buildKnockoutMatchRows used by the
// knockout-only flow (with the branch's bracket name), and permutation checks reuse validateSeedPayload.

import type { Bracket, CompetitorId, GroupId } from './types.ts'
import type { QualificationOutcome } from './qualification.ts'
import {
  validateSeedPayload,
  evaluateSeedReadiness,
  type SeedPayload,
  type SeedValidation,
  type SeedReadiness,
} from './knockout-seed.ts'

// ── Group-rank token model ──────────────────────────────────────────────────────────────────────

// A stable, source-carrying token id. Encodes the qualification SOURCE (group + finishing rank),
// never a competitor id — so it survives standings changes and can never be re-pointed by the client.
export function groupRankTokenId(groupId: GroupId, rank: number): string {
  return `group:${groupId}:rank:${rank}`
}

/** Parse a token id back into its source (group + rank), or null when malformed. */
export function parseGroupRankTokenId(tokenId: string): { groupId: GroupId; rank: number } | null {
  const m = /^group:(.+):rank:(\d+)$/.exec(tokenId)
  if (!m) return null
  const rank = Number(m[2])
  if (!Number.isInteger(rank) || rank < 1) return null
  return { groupId: m[1], rank }
}

export interface GroupRankToken {
  readonly tokenId: string
  readonly groupId: GroupId
  readonly rank: number
  readonly branch: Bracket
}

export interface TokenGroupInput {
  readonly groupId: GroupId
  // Display name is resolved by the caller; only the id + ordering matter to the engine.
}

/**
 * Build the full set of group-rank tokens for both branches from the event's qualifier settings.
 * For every group: ranks 1..winnerQualifiers become championship tokens; the next
 * consolationQualifiers ranks become consolation tokens. A competitor (rank) never appears in both
 * branches. Deterministic order: group order, then rank ascending.
 */
export function buildGroupRankTokens(input: {
  readonly groups: readonly TokenGroupInput[]
  readonly winnerQualifiers: number
  readonly consolationQualifiers: number
}): { championship: GroupRankToken[]; consolation: GroupRankToken[] } {
  const { groups, winnerQualifiers, consolationQualifiers } = input
  const championship: GroupRankToken[] = []
  const consolation: GroupRankToken[] = []
  for (const g of groups) {
    for (let rank = 1; rank <= winnerQualifiers; rank++) {
      championship.push({ tokenId: groupRankTokenId(g.groupId, rank), groupId: g.groupId, rank, branch: 'championship' })
    }
    for (let rank = winnerQualifiers + 1; rank <= winnerQualifiers + consolationQualifiers; rank++) {
      consolation.push({ tokenId: groupRankTokenId(g.groupId, rank), groupId: g.groupId, rank, branch: 'consolation' })
    }
  }
  return { championship, consolation }
}

// ── Per-branch seed payload validation (reuses the knockout-only permutation check over tokens) ──

// A branch's desired seed state: ordered seeded tokens + the deliberately-unassigned remainder.
export type BranchSeedPayload = SeedPayload
export type BranchSeedValidation = SeedValidation
export type BranchSeedReadiness = SeedReadiness

/**
 * Validate that a branch's payload is an exact permutation of that branch's valid tokens — every
 * token appears once across seeded/unassigned, no foreign / duplicate / missing token. Reuses
 * validateSeedPayload with the token-id space in place of the competitor-id space.
 */
export function validateBranchSeedPayload(
  payload: BranchSeedPayload,
  validTokenIds: readonly string[],
): BranchSeedValidation {
  return validateSeedPayload(payload, { competitorIds: validTokenIds })
}

/** Ready to generate a branch: ≥2 seeded tokens and nothing left unassigned. */
export function evaluateBranchSeedReadiness(payload: BranchSeedPayload): BranchSeedReadiness {
  return evaluateSeedReadiness(payload)
}

// ── Token → competitor resolution (from CURRENT standings/qualification, at generate time) ────────

export interface TokenResolutionInput {
  readonly winnerQualifiers: number
  // Per-group qualification outcome (from qualifyGroup / evaluateGroupStage), keyed by group id.
  readonly qualificationByGroup: ReadonlyMap<GroupId, QualificationOutcome>
}

export type TokenResolution =
  | { readonly ok: true; readonly competitorId: CompetitorId }
  | { readonly ok: false; readonly reason: 'group_not_found' | 'group_not_qualified' | 'rank_out_of_range' }

/**
 * Resolve one group-rank token to a competitor from the current per-group qualification. Rank r:
 *   r ≤ winnerQualifiers          → the (r)-th championship qualifier of that group,
 *   winnerQualifiers < r          → the (r − winnerQualifiers)-th consolation qualifier.
 * Fails (never throws) when the group is missing, its qualification is not settled ('ok'), or the
 * rank exceeds the qualifiers that group actually supplies.
 */
export function resolveGroupRankToken(
  token: { readonly groupId: GroupId; readonly rank: number },
  input: TokenResolutionInput,
): TokenResolution {
  const qual = input.qualificationByGroup.get(token.groupId)
  if (!qual) return { ok: false, reason: 'group_not_found' }
  if (qual.status !== 'ok') return { ok: false, reason: 'group_not_qualified' }
  if (token.rank <= input.winnerQualifiers) {
    const c = qual.championship[token.rank - 1]
    return c ? { ok: true, competitorId: c } : { ok: false, reason: 'rank_out_of_range' }
  }
  const idx = token.rank - input.winnerQualifiers - 1
  const c = qual.consolation[idx]
  return c ? { ok: true, competitorId: c } : { ok: false, reason: 'rank_out_of_range' }
}

export interface BranchResolution {
  readonly ok: boolean
  // Resolved competitor ids in seed order (only meaningful when ok).
  readonly competitorIds: CompetitorId[]
  // Token ids that could not be resolved (blocking generation).
  readonly unresolved: string[]
}

/**
 * Resolve an ordered list of seed token ids to competitor ids (seed order preserved). If ANY token
 * fails to resolve, `ok` is false and `unresolved` lists the offenders — the caller must block the
 * generation and ask the admin to reload (qualification changed / not yet settled).
 */
export function resolveBranchSeeds(
  seededTokenIds: readonly string[],
  input: TokenResolutionInput,
): BranchResolution {
  const competitorIds: CompetitorId[] = []
  const unresolved: string[] = []
  const seenCompetitors = new Set<CompetitorId>()
  for (const tokenId of seededTokenIds) {
    const parsed = parseGroupRankTokenId(tokenId)
    if (!parsed) {
      unresolved.push(tokenId)
      continue
    }
    const res = resolveGroupRankToken(parsed, input)
    if (!res.ok) {
      unresolved.push(tokenId)
      continue
    }
    // A competitor must never end up in the same branch twice (defensive; token set already unique).
    if (seenCompetitors.has(res.competitorId)) {
      unresolved.push(tokenId)
      continue
    }
    seenCompetitors.add(res.competitorId)
    competitorIds.push(res.competitorId)
  }
  return { ok: unresolved.length === 0, competitorIds, unresolved }
}
