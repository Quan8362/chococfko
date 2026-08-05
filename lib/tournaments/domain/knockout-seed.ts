// Knockout-only seeding + bracket materialization, built DIRECTLY on top of generateKnockout /
// progressKnockout — the bracket algorithm and BYE auto-advance are NEVER re-implemented here
// (design doc §6/§9). Pure & deterministic; never mutates its inputs. Three concerns, kept apart:
//   1. validateSeedPayload — the desired seed state is a PERMUTATION of the event's competitors
//      (each appears exactly once, in the ordered seed list OR the explicit unassigned list;
//      no foreign / duplicate / missing ids). Used before a SAVE.
//   2. evaluateSeedReadiness — the pre-GENERATE checks: ≥2 competitors and nobody left unassigned.
//   3. buildKnockoutPreview / buildKnockoutMatchRows — the deterministic preview and the exact DB
//      rows the generate action writes, both derived from generateKnockout (+ progressKnockout for
//      BYE auto-advance), so drag / keyboard / preview / persisted bracket all agree.

import type {
  Bracket, CompetitorId, KnockoutBracket, KnockoutMatch, KnockoutRoundLabel, KnockoutSlot,
} from './types.ts'
import { generateKnockout, type KnockoutEntrant } from './knockout.ts'
import { progressKnockout } from './progression.ts'

// Knockout-only always seeds into the single championship bracket.
export const KNOCKOUT_BRACKET: Bracket = 'championship'

function nextPow2(x: number): number {
  let p = 1
  while (p < x) p *= 2
  return p
}

/** Smallest power of two ≥ `count` (the bracket size). 3→4, 5/6→8, 10→16. */
export function requiredBracketSize(count: number): number {
  if (count < 2) return count <= 0 ? 0 : 1
  return nextPow2(count)
}

/** Number of BYE slots = bracket size − competitor count. Never creates fake competitors. */
export function knockoutByeCount(count: number): number {
  return Math.max(0, requiredBracketSize(count) - count)
}

// ── Seed payload validation ──────────────────────────────────────────────────────────────────

// The FULL desired seed state: the ordered seeded competitors + the ones deliberately unassigned.
export interface SeedPayload {
  readonly seededIds: readonly CompetitorId[]
  readonly unassignedIds: readonly CompetitorId[]
}

// Ground truth reloaded from the DB — never trusted from the client.
export interface SeedTruth {
  readonly competitorIds: readonly CompetitorId[]
}

export type SeedError =
  | { readonly code: 'unknown_competitor'; readonly competitorId: CompetitorId }
  | { readonly code: 'duplicate_competitor'; readonly competitorId: CompetitorId }
  | { readonly code: 'missing_competitor'; readonly competitorId: CompetitorId }

export type SeedValidation =
  | { readonly ok: true }
  | { readonly ok: false; readonly errors: readonly SeedError[] }

/**
 * Validate that `payload` is a valid permutation of the event's competitors: every competitor
 * appears exactly once across the seeded list and the unassigned list, no foreign / duplicate /
 * missing ids. Slot ordering is implied by the seededIds array order (no client slot index trusted).
 */
export function validateSeedPayload(payload: SeedPayload, truth: SeedTruth): SeedValidation {
  const errors: SeedError[] = []
  const known = new Set(truth.competitorIds)
  const seen = new Set<CompetitorId>()

  const consider = (id: CompetitorId) => {
    if (!known.has(id)) errors.push({ code: 'unknown_competitor', competitorId: id })
    else if (seen.has(id)) errors.push({ code: 'duplicate_competitor', competitorId: id })
    else seen.add(id)
  }
  for (const id of payload.seededIds) consider(id)
  for (const id of payload.unassignedIds) consider(id)

  for (const id of truth.competitorIds) {
    if (!seen.has(id)) errors.push({ code: 'missing_competitor', competitorId: id })
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors }
}

// ── Pre-generate readiness ─────────────────────────────────────────────────────────────────────

export type SeedReadinessIssue =
  | { readonly code: 'not_enough_competitors'; readonly count: number }
  | { readonly code: 'unseeded_remaining'; readonly competitorIds: readonly CompetitorId[] }

export interface SeedReadiness {
  readonly ok: boolean
  readonly issues: readonly SeedReadinessIssue[]
  readonly bracketSize: number
  readonly byes: number
}

/**
 * Evaluate whether the seed state is ready to generate the bracket: at least 2 competitors and
 * nobody left unassigned. Never mutates its input.
 */
export function evaluateSeedReadiness(payload: SeedPayload): SeedReadiness {
  const issues: SeedReadinessIssue[] = []
  const count = payload.seededIds.length

  if (count < 2) issues.push({ code: 'not_enough_competitors', count })
  if (payload.unassignedIds.length > 0) {
    issues.push({ code: 'unseeded_remaining', competitorIds: [...payload.unassignedIds] })
  }

  return {
    ok: issues.length === 0,
    issues,
    bracketSize: requiredBracketSize(count),
    byes: knockoutByeCount(count),
  }
}

// ── Bracket construction (reuses generateKnockout verbatim) ──────────────────────────────────────

/**
 * Build the pure knockout bracket from an ordered list of seeded competitor ids. `bracket` defaults
 * to the knockout-only championship; group+knockout (Prompt 09) passes 'consolation' for the losers'
 * branch so generation keys (which embed the bracket name) never collide across the two brackets.
 */
export function buildKnockoutBracketFromSeeds(
  seededIds: readonly CompetitorId[],
  thirdPlaceEnabled: boolean,
  bracket: Bracket = KNOCKOUT_BRACKET,
): KnockoutBracket {
  const entrants: KnockoutEntrant[] = seededIds.map((competitorId) => ({ kind: 'competitor', competitorId }))
  return generateKnockout({ bracket, entrants, thirdPlaceEnabled })
}

// ── Deterministic preview ────────────────────────────────────────────────────────────────────────

export type KnockoutPreviewSlot =
  | { readonly kind: 'competitor'; readonly competitorId: CompetitorId }
  | { readonly kind: 'bye' }
  | { readonly kind: 'winner'; readonly matchKey: string }
  | { readonly kind: 'loser'; readonly matchKey: string }

export interface KnockoutPreviewMatch {
  readonly matchKey: string
  readonly roundNumber: number
  readonly matchNumber: number
  readonly roundLabel: string
  readonly slotA: KnockoutPreviewSlot
  readonly slotB: KnockoutPreviewSlot
  readonly isBye: boolean
}

export interface KnockoutPreviewRound {
  readonly roundNumber: number
  readonly label: string
  readonly matches: readonly KnockoutPreviewMatch[]
}

export interface KnockoutPreview {
  readonly totalCompetitors: number
  readonly bracketSize: number
  readonly byes: number
  readonly roundCount: number
  readonly rounds: readonly KnockoutPreviewRound[]
  readonly thirdPlaceMatch: KnockoutPreviewMatch | null
}

function toPreviewSlot(slot: KnockoutSlot): KnockoutPreviewSlot {
  switch (slot.from) {
    case 'entrant':
      // In knockout-only every entrant slot is a direct competitor (group_rank is Prompt 09).
      return slot.source.kind === 'competitor'
        ? { kind: 'competitor', competitorId: slot.source.competitorId }
        : { kind: 'bye' }
    case 'bye':
      return { kind: 'bye' }
    case 'winner':
      return { kind: 'winner', matchKey: slot.matchKey }
    case 'loser':
      return { kind: 'loser', matchKey: slot.matchKey }
  }
}

function toPreviewMatch(m: KnockoutMatch): KnockoutPreviewMatch {
  return {
    matchKey: m.matchKey,
    roundNumber: m.roundNumber,
    matchNumber: m.matchNumber,
    roundLabel: m.roundLabel,
    slotA: toPreviewSlot(m.slotA),
    slotB: toPreviewSlot(m.slotB),
    isBye: m.isBye,
  }
}

/**
 * Deterministic display summary of the bracket that WOULD be generated for the given seed order.
 * Totals + per-round pairings + third-place placeholder. Uses generateKnockout (no re-implementation).
 */
export function buildKnockoutPreview(
  seededIds: readonly CompetitorId[],
  thirdPlaceEnabled: boolean,
  forBracket: Bracket = KNOCKOUT_BRACKET,
): KnockoutPreview {
  const bracket = buildKnockoutBracketFromSeeds(seededIds, thirdPlaceEnabled, forBracket)
  const rounds: KnockoutPreviewRound[] = bracket.rounds.map((round) => ({
    roundNumber: round[0].roundNumber,
    label: round[0].roundLabel,
    matches: round.map(toPreviewMatch),
  }))
  return {
    totalCompetitors: seededIds.length,
    bracketSize: bracket.size,
    byes: bracket.byes,
    roundCount: bracket.rounds.length,
    rounds,
    thirdPlaceMatch: bracket.thirdPlaceMatch ? toPreviewMatch(bracket.thirdPlaceMatch) : null,
  }
}

// ── First-round pairing preview (same mapping as the full preview) ─────────────────────────────────

export interface FirstRoundPairing {
  readonly matchNumber: number
  readonly matchKey: string
  readonly slotA: KnockoutPreviewSlot
  readonly slotB: KnockoutPreviewSlot
  readonly isBye: boolean
}

/**
 * The first-round pairings that WOULD be produced for the current seed order — the SAME mapping the
 * full-bracket preview and the generate action use (buildKnockoutPreview → rounds[0]); there is no
 * second pairing algorithm for the UI. Returns [] when there are fewer than two seeds (a bracket can
 * not be formed yet) instead of throwing, so a live seeding UI can call it on every keystroke. Never
 * fabricates competitors — an empty first-round slot stays an explicit BYE.
 */
export function deriveFirstRoundPairings(
  seededIds: readonly CompetitorId[],
  thirdPlaceEnabled = false,
  forBracket: Bracket = KNOCKOUT_BRACKET,
): readonly FirstRoundPairing[] {
  if (seededIds.length < 2) return []
  const first = buildKnockoutPreview(seededIds, thirdPlaceEnabled, forBracket).rounds[0]
  if (!first) return []
  return first.matches.map((m) => ({
    matchNumber: m.matchNumber,
    matchKey: m.matchKey,
    slotA: m.slotA,
    slotB: m.slotB,
    isBye: m.isBye,
  }))
}

// ── Materialization → DB rows (with BYE auto-advance already applied) ─────────────────────────────

export interface KnockoutMatchRow {
  readonly generationKey: string
  readonly bracket: Bracket
  readonly roundNumber: number
  readonly matchNumber: number
  readonly roundLabel: string
  readonly competitorAId: CompetitorId | null
  readonly competitorBId: CompetitorId | null
  // Source references are stored by the STABLE match key; the RPC resolves them to row ids by
  // (event_id, generation_key) so the winner/loser of an earlier match feeds the later slot.
  readonly sourceAKey: string | null
  readonly sourceAOutcome: 'winner' | 'loser' | null
  readonly sourceBKey: string | null
  readonly sourceBOutcome: 'winner' | 'loser' | null
  readonly status: 'ready' | 'pending' | 'bye'
  readonly winnerId: CompetitorId | null
}

function allMatchesOf(bracket: KnockoutBracket): KnockoutMatch[] {
  const out: KnockoutMatch[] = []
  for (const round of bracket.rounds) for (const m of round) out.push(m)
  if (bracket.thirdPlaceMatch) out.push(bracket.thirdPlaceMatch)
  return out
}

interface WorkingRow {
  a: CompetitorId | null
  b: CompetitorId | null
  isBye: boolean
  winner: CompetitorId | null
}

/**
 * Turn a pure bracket into the exact DB rows the generate action inserts, WITH first-round BYEs
 * already auto-advanced into the next round (via progressKnockout — never a 0–0 score, never a fake
 * competitor). A match is 'bye' when one slot is a bye; 'ready' once both competitor slots are known;
 * 'pending' while still waiting on an upstream result.
 */
export function buildKnockoutMatchRows(bracket: KnockoutBracket): KnockoutMatchRow[] {
  const matches = allMatchesOf(bracket)

  // Working competitor placement, seeded from first-round entrant slots.
  const work = new Map<string, WorkingRow>()
  for (const m of matches) {
    const a = m.slotA.from === 'entrant' && m.slotA.source.kind === 'competitor' ? m.slotA.source.competitorId : null
    const b = m.slotB.from === 'entrant' && m.slotB.source.kind === 'competitor' ? m.slotB.source.competitorId : null
    work.set(m.matchKey, { a, b, isBye: m.isBye, winner: null })
  }

  // Resolve first-round BYE winners and cascade them into the downstream slots via progressKnockout.
  for (const m of matches) {
    if (!m.isBye) continue
    const row = work.get(m.matchKey)!
    const winnerId = row.a ?? row.b // exactly one side present in a bye match
    if (!winnerId) continue
    row.winner = winnerId
    const { patches } = progressKnockout({ bracket, completedMatchKey: m.matchKey, winnerId, loserId: null })
    for (const p of patches) {
      const target = work.get(p.matchKey)
      if (!target) continue
      if (p.slot === 'A') target.a = p.competitorId
      else target.b = p.competitorId
    }
  }

  return matches.map((m) => {
    const row = work.get(m.matchKey)!
    const sourceA = m.slotA.from === 'winner' || m.slotA.from === 'loser'
      ? { key: m.slotA.matchKey, outcome: m.slotA.from as 'winner' | 'loser' }
      : null
    const sourceB = m.slotB.from === 'winner' || m.slotB.from === 'loser'
      ? { key: m.slotB.matchKey, outcome: m.slotB.from as 'winner' | 'loser' }
      : null
    const status: KnockoutMatchRow['status'] = m.isBye ? 'bye' : row.a !== null && row.b !== null ? 'ready' : 'pending'
    return {
      generationKey: m.generationKey,
      bracket: m.bracket,
      roundNumber: m.roundNumber,
      matchNumber: m.matchNumber,
      roundLabel: m.roundLabel,
      competitorAId: row.a,
      competitorBId: row.b,
      sourceAKey: sourceA?.key ?? null,
      sourceAOutcome: sourceA?.outcome ?? null,
      sourceBKey: sourceB?.key ?? null,
      sourceBOutcome: sourceB?.outcome ?? null,
      status,
      winnerId: row.winner,
    }
  })
}

// ── Reconstruct a bracket from persisted rows (so the RESULT actions can reuse progressKnockout) ──

export interface DbKnockoutSlotSource {
  readonly from: 'entrant' | 'bye' | 'winner' | 'loser'
  readonly matchKey?: string | null
}

export interface DbKnockoutMatch {
  readonly matchKey: string
  readonly bracket: Bracket
  readonly roundNumber: number
  readonly matchNumber: number
  readonly roundLabel: string
  readonly slotA: DbKnockoutSlotSource
  readonly slotB: DbKnockoutSlotSource
  readonly isThirdPlace: boolean
}

function toReconSlot(s: DbKnockoutSlotSource): KnockoutSlot {
  if (s.from === 'winner') return { from: 'winner', matchKey: s.matchKey ?? '' }
  if (s.from === 'loser') return { from: 'loser', matchKey: s.matchKey ?? '' }
  if (s.from === 'bye') return { from: 'bye' }
  // 'entrant' details are irrelevant to progression — a placeholder source keeps the shape valid.
  return { from: 'entrant', source: { kind: 'bye' } }
}

/**
 * Rebuild a KnockoutBracket shape from persisted DB match descriptors — enough for progressKnockout
 * to route winners/losers to the right downstream slots. Only the winner/loser slot references
 * matter to progression; entrant/bye slots are placeholders. The third-place match is separated out
 * so it is not double-counted (progressKnockout scans rounds.flat() PLUS thirdPlaceMatch).
 */
export function reconstructBracketForProgression(matches: readonly DbKnockoutMatch[]): KnockoutBracket {
  let thirdPlaceMatch: KnockoutMatch | null = null
  const main: KnockoutMatch[] = []
  for (const m of matches) {
    const km: KnockoutMatch = {
      bracket: m.bracket,
      roundNumber: m.roundNumber,
      matchNumber: m.matchNumber,
      matchKey: m.matchKey,
      roundLabel: m.roundLabel as KnockoutRoundLabel,
      slotA: toReconSlot(m.slotA),
      slotB: toReconSlot(m.slotB),
      isBye: false,
      generationKey: m.matchKey,
    }
    if (m.isThirdPlace) thirdPlaceMatch = km
    else main.push(km)
  }
  const size = main.length + 1
  return { bracket: KNOCKOUT_BRACKET, size, byes: 0, rounds: main.length > 0 ? [main] : [], thirdPlaceMatch }
}
