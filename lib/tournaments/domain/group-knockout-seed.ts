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
import type { EventProgressStatus } from './event-progress.ts'
import { effectiveQualifierCounts, type QualificationOutcome } from './qualification.ts'
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
  // Competitors actually assigned to this group. The winner/consolation settings are MAXIMUMS: a
  // group with fewer competitors than winner+consolation yields fewer tokens (never phantom ranks).
  readonly competitorCount: number
  // Display name is resolved by the caller; only the id + ordering matter to the engine.
}

/**
 * Build the full set of group-rank tokens for both branches from the event's qualifier settings.
 * For every group: ranks 1..effectiveWinner become championship tokens; the next
 * effectiveConsolation ranks become consolation tokens — where the effective counts cap the
 * configured MAXIMUMS at the competitors the group actually holds (effectiveQualifierCounts). So a
 * 3-competitor group under A=2/B=2 emits ranks 1-2 (Serie A) + rank 3 (Serie B), never a phantom
 * rank 4. Consolation ranks are always numbered from `winnerQualifiers + 1` so token→competitor
 * resolution (which keys off the configured winnerQualifiers) stays consistent; a group short of
 * Serie A never produces any Serie B token, so that numbering can never collide. A competitor (rank)
 * never appears in both branches. Deterministic order: group order, then rank ascending.
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
    const { effectiveWinner, effectiveConsolation } = effectiveQualifierCounts(
      g.competitorCount,
      winnerQualifiers,
      consolationQualifiers,
    )
    for (let rank = 1; rank <= effectiveWinner; rank++) {
      championship.push({ tokenId: groupRankTokenId(g.groupId, rank), groupId: g.groupId, rank, branch: 'championship' })
    }
    for (let rank = winnerQualifiers + 1; rank <= winnerQualifiers + effectiveConsolation; rank++) {
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

// ── Preconfigured template phase + staleness (Prompt: knockout template before group completion) ──
//
// A knockout TEMPLATE is the same group-rank seed order persisted BEFORE the group stage is settled:
// it names qualification SOURCES ("Nhất A vs Nhì B"), never competitors, so an organiser can lay out
// the bracket on the qualifier settings + group sizes alone — days before the first match. Nothing
// here resolves a competitor or writes an official match; that only happens at APPLY time (the 'ready'
// phase), gated by knockout_ready. These are pure derivations the read + save layers share so the UI,
// the save gate, and the apply gate agree on exactly one phase.

/** Order-independent equality of two token-id sets (each list assumed free of duplicates by callers). */
export function sameTokenIdSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(a)
  for (const id of b) if (!set.has(id)) return false
  return true
}

export type GroupKnockoutTemplatePhase =
  // Groups are not assigned yet — the token pool is not stable, so no template can be laid out.
  | 'groups_pending'
  // Groups assigned, group stage NOT finished → a DRAFT template only (tokens unresolved, no apply).
  | 'template'
  // Group stage finished but a qualification-boundary tie is unresolved → template editable, apply blocked.
  | 'blocking_tie'
  // knockout_ready — every token resolves; the official bracket can be generated.
  | 'ready'
  // The official bracket already exists (seeds frozen); only a guarded reset changes it.
  | 'generated'

/**
 * The single template phase for a group_knockout event, derived from three stable facts. `hasBrackets`
 * wins (an existing bracket is terminal for the editor); otherwise groups must be assigned before any
 * template exists; then the group-stage progress status maps to template / blocking_tie / ready. A
 * `round_robin`-shaped 'completed' should never reach here, but is treated as 'ready' defensively.
 */
export function evaluateGroupKnockoutTemplatePhase(input: {
  readonly groupsAssigned: boolean
  readonly hasBrackets: boolean
  readonly stageStatus: EventProgressStatus
}): GroupKnockoutTemplatePhase {
  if (input.hasBrackets) return 'generated'
  if (!input.groupsAssigned) return 'groups_pending'
  if (input.stageStatus === 'knockout_ready' || input.stageStatus === 'completed') return 'ready'
  if (input.stageStatus === 'group_stage_completed') return 'blocking_tie'
  return 'template'
}

/** The editor may be opened (seed order edited/saved) in every phase except groups_pending/generated. */
export function templatePhaseAllowsEditing(phase: GroupKnockoutTemplatePhase): boolean {
  return phase === 'template' || phase === 'blocking_tie' || phase === 'ready'
}

/**
 * A saved template is STALE when its persisted token set no longer equals the CURRENT valid token
 * pool — i.e. the group count / a group's size / the Serie A|B quotas changed after the save, so the
 * old seed order references sources that no longer exist (or misses new ones). No saved slots ⇒ never
 * stale (there is nothing to reconcile). Purely a set comparison; ordering is irrelevant to staleness.
 */
export function isGroupKnockoutTemplateStale(
  savedTokenIds: readonly string[],
  currentValidTokenIds: readonly string[],
): boolean {
  if (savedTokenIds.length === 0) return false
  return !sameTokenIdSet(savedTokenIds, currentValidTokenIds)
}
