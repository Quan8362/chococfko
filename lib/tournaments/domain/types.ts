// Shared domain types for the tournament engine. Pure data shapes — no Supabase generated types,
// no I/O. Names mirror the Prompt-02 schema (see migration_tournament_core.sql) but stay
// database-agnostic so these functions never depend on a DB layer.

export type CompetitorId = string
export type GroupId = string

export type Bracket = 'championship' | 'consolation'
export type Stage = 'group' | 'knockout'
export type MatchStatus = 'pending' | 'ready' | 'completed' | 'bye' | 'cancelled'
export type EventFormat = 'round_robin' | 'knockout' | 'group_knockout'

// A competitor as the engine sees it. `seed`/`displayOrder` are ONLY ever used to make output
// technically deterministic — NEVER as a sporting ranking criterion.
export interface Competitor {
  readonly id: CompetitorId
  readonly name: string
  readonly seed?: number | null
  readonly displayOrder?: number
}

// One completed game/set within a match.
export interface GameScore {
  readonly gameNumber: number
  readonly scoreA: number
  readonly scoreB: number
}

// A match as consumed by the calculators. `games` are the per-set scores; `winnerId`, when
// present, is cross-checked against the games (WINNER_MISMATCH otherwise).
export interface MatchInput {
  readonly competitorAId: CompetitorId | null
  readonly competitorBId: CompetitorId | null
  readonly status: MatchStatus
  readonly games: readonly GameScore[]
  readonly winnerId?: CompetitorId | null
}

// ── Round-robin generation ────────────────────────────────────────────────────────────────
export interface GeneratedGroupMatch {
  readonly stage: 'group'
  readonly groupId: GroupId
  readonly roundNumber: number
  readonly matchNumber: number
  readonly competitorAId: CompetitorId
  readonly competitorBId: CompetitorId
  // Stable & reversal-proof: derived from the sorted competitor pair, so re-running generation
  // (or reordering the roster) can never produce a duplicate match for the same pair.
  readonly generationKey: string
}

// ── Standings ─────────────────────────────────────────────────────────────────────────────
export interface StandingRow {
  readonly competitorId: CompetitorId
  readonly position: number // unique 1-based ordinal (technical, for stable output & cut math)
  readonly rank: number     // shared competition rank (tied rows share the smallest rank)
  readonly played: number
  readonly wins: number
  readonly losses: number
  readonly tablePoints: number
  readonly pointsFor: number
  readonly pointsAgainst: number
  readonly pointDifference: number
  readonly tied: boolean    // true when this row shares its sort key with another
}

export interface TieGroup {
  readonly competitorIds: readonly CompetitorId[]
  readonly rank: number
  readonly positionStart: number
  readonly positionEnd: number
}

export interface Standings {
  readonly rows: readonly StandingRow[]
  readonly tieGroups: readonly TieGroup[]
}

// ── Ties ──────────────────────────────────────────────────────────────────────────────────
export type TieImpact = 'none' | 'championship_boundary' | 'consolation_boundary' | 'podium'

export interface ClassifiedTie {
  readonly competitorIds: readonly CompetitorId[]
  readonly rank: number
  readonly positionStart: number
  readonly positionEnd: number
  readonly impact: TieImpact
}

// ── Knockout ──────────────────────────────────────────────────────────────────────────────
// A source that fills a bracket slot. Reused by knockout-only (competitor) AND group+knockout
// (group_rank token), plus BYE.
export type SlotSource =
  | { readonly kind: 'competitor'; readonly competitorId: CompetitorId }
  | { readonly kind: 'group_rank'; readonly groupId: GroupId; readonly rank: number }
  | { readonly kind: 'bye' }

export type KnockoutSlot =
  | { readonly from: 'entrant'; readonly source: SlotSource }
  | { readonly from: 'winner'; readonly matchKey: string }
  | { readonly from: 'loser'; readonly matchKey: string }
  | { readonly from: 'bye' }

export type KnockoutRoundLabel =
  | 'final'
  | 'semifinal'
  | 'quarterfinal'
  | 'round_of_16'
  | 'third_place'
  | `round_${number}`

export interface KnockoutMatch {
  readonly bracket: Bracket
  readonly roundNumber: number
  readonly matchNumber: number
  readonly matchKey: string
  readonly roundLabel: KnockoutRoundLabel
  readonly slotA: KnockoutSlot
  readonly slotB: KnockoutSlot
  readonly isBye: boolean // exactly one slot is a bye → the other entrant auto-advances
  readonly generationKey: string
}

export interface KnockoutBracket {
  readonly bracket: Bracket
  readonly size: number
  readonly byes: number
  readonly rounds: readonly (readonly KnockoutMatch[])[] // rounds[0] = first round
  readonly thirdPlaceMatch: KnockoutMatch | null
}

// ── Progression ───────────────────────────────────────────────────────────────────────────
export interface ProgressionPatch {
  readonly matchKey: string
  readonly slot: 'A' | 'B'
  readonly competitorId: CompetitorId
}

export interface ProgressionResult {
  readonly winnerId: CompetitorId
  readonly loserId: CompetitorId | null // null for a bye advance (no real loser)
  readonly patches: readonly ProgressionPatch[]
}

// ── Podium ────────────────────────────────────────────────────────────────────────────────
export interface PodiumEntry {
  readonly rank: 1 | 2 | 3
  readonly competitorId: CompetitorId
  readonly isJoint: boolean // true for joint-3rd when there is no third-place match
}
