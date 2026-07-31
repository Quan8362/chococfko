// Pure data shapes for the tournament RULE ENGINE. This is a config layer that sits BESIDE the
// existing tournament domain engine (lib/tournaments/domain/**) — it never re-implements standings,
// brackets or progression. Instead it describes, per event, HOW a game/match is scored so those
// decisions stop being hardcoded (touch-15 vs touch-21, win-by-2, deuce caps, gender handicap…).
//
// Hard rule: nothing in here — or anything that consumes it — may branch on a tournament name, an
// event name, a year, or a category string. Every decision is driven by the snapshot passed in.
// No React / Next / Supabase / browser. No `any`. Inputs are never mutated.

// ── Competitor composition ──────────────────────────────────────────────────────────────────
// A competitor may be a single player, a pair, or a team. Composition (how many men / women)
// is the ONLY thing the handicap layer is allowed to key off — never identity.
export type CompetitorKind = 'single' | 'pair' | 'team'

export interface CompetitorComposition {
  readonly kind: CompetitorKind
  readonly maleCount: number
  readonly femaleCount: number
}

// ── Match rules ─────────────────────────────────────────────────────────────────────────────
// Describes one match: how many games/sets decide it and how a single game is won.
export interface MatchRules {
  readonly games_to_win: number      // sets a side must win to take the match (best-of ⇒ (n*2)-1)
  readonly max_games: number         // hard ceiling on sets played (>= games_to_win)
  readonly points_to_win: number     // points that win one game outright (e.g. 15 / 21)
  readonly win_by: number            // required winning margin (1 = sudden, 2 = deuce)
  readonly points_cap: number | null // hard ceiling on a game's winning score (deuce cap, e.g. 31)
  readonly allow_tied_game: boolean  // whether a drawn game is a legal recorded result
}

// ── Tie-break tokens ────────────────────────────────────────────────────────────────────────
// Sporting tie-break criteria. Ordering identity criteria (alphabet / seed / row id) are
// deliberately NOT part of this union so they can never be configured as a sporting criterion.
export type TieBreakToken =
  | 'table_points'
  | 'point_difference'
  | 'points_for'
  | 'head_to_head'
  | 'organizer_decision'
  | 'random_draw'

// The subset the engine can evaluate AUTOMATICALLY from standings numbers alone. The remaining
// recognized tokens are legal to configure but resolve to a typed "unsupported (manual)" result
// rather than being silently ignored (see match-rules → compareByTieBreakToken).
export const AUTO_TIE_BREAK_TOKENS: readonly TieBreakToken[] = [
  'table_points',
  'point_difference',
  'points_for',
]

export const ALL_TIE_BREAK_TOKENS: readonly TieBreakToken[] = [
  'table_points',
  'point_difference',
  'points_for',
  'head_to_head',
  'organizer_decision',
  'random_draw',
]

// Minimal per-competitor numbers a tie-break token compares. Decoupled from the domain's
// StandingRow on purpose so the rule engine stays standalone.
export interface TieBreakStat {
  readonly tablePoints: number
  readonly pointDifference: number
  readonly pointsFor: number
}

// ── Group-stage rules ───────────────────────────────────────────────────────────────────────
export interface GroupStageRules {
  readonly match: MatchRules
  readonly win_table_points: number
  readonly loss_table_points: number
  readonly tie_break_order: readonly TieBreakToken[]
}

// ── Knockout rules ──────────────────────────────────────────────────────────────────────────
// Knockout carries only its match rules. The third-place model is owned by the existing domain
// engine and is intentionally NOT configurable here.
export interface KnockoutRules {
  readonly match: MatchRules
}

// ── Handicap rules ──────────────────────────────────────────────────────────────────────────
// `starting_score`         → each side begins a game on a non-zero score, matched from `entries`.
// `point_adjustment`       → a side's final points are adjusted by the value (kept distinct so
//                            callers never conflate a head-start with a post-hoc correction).
// `female_count_difference`→ the OFFICIAL FJP OLYMPIAD 2026 handicap: the pair with MORE women
//                            starts each game/set ahead by `points_per_difference` for every surplus
//                            woman. It is difference-based (femaleCountA − femaleCountB) and needs
//                            NO `entries` — the head start comes from the two compositions, never
//                            from an identity, a pair name, or a category string.
export type HandicapMode = 'starting_score' | 'point_adjustment' | 'female_count_difference'

// One handicap entry keyed by an exact composition class (kind + gender counts). A side's
// composition is matched against these; there is no name / identity input by design. Used only by
// the entry-matched modes (`starting_score` / `point_adjustment`), never by `female_count_difference`.
export interface HandicapRuleEntry {
  readonly kind: CompetitorKind
  readonly maleCount: number
  readonly femaleCount: number
  readonly value: number
}

export interface HandicapRules {
  readonly enabled: boolean
  readonly mode: HandicapMode
  readonly entries: readonly HandicapRuleEntry[]
  // Points granted per surplus woman for mode `female_count_difference` (FJP official = 2). Optional
  // so pre-existing entry-matched snapshots (which never carried it) stay structurally valid; the
  // difference mode REQUIRES a positive integer here (validation.ts enforces it).
  readonly points_per_difference?: number
  // True when the handicap is intended but its concrete values are not yet confirmed by the
  // organizer. A snapshot in this state validates structurally but MUST NOT be applied to a live
  // score (calculateStartingScore returns a typed error).
  readonly requires_configuration: boolean
}

// ── The full, self-contained rule set ───────────────────────────────────────────────────────
export interface RuleSet {
  readonly group: GroupStageRules
  readonly knockout: KnockoutRules
  readonly handicap: HandicapRules
}

// ── Preset (template) ───────────────────────────────────────────────────────────────────────
export type RuleSource = 'preset' | 'custom'

// A named category variant inside a preset (e.g. `beginner` vs `standard`). The category value is
// a member of a defined enum — never an arbitrary unvalidated string.
export interface RulePresetVariant {
  readonly category: string
  readonly rules: RuleSet
}

export interface RulePreset {
  readonly key: string
  readonly version: number
  readonly label: string
  // A preset is a template only. It is NEVER the global default — an event always gets its own
  // deep-copied snapshot before any scoring happens.
  readonly isDefault: false
  readonly variants: readonly RulePresetVariant[]
}

// ── Event rule snapshot ─────────────────────────────────────────────────────────────────────
// The immutable, self-contained record attached to one event. A deep copy of a preset variant's
// rules (or a fully custom rule set). Editing the preset later can NEVER change an existing
// snapshot because no reference is shared.
export interface RuleSnapshotMetadata {
  readonly preset_key: string | null
  readonly preset_version: number | null
  readonly source: RuleSource
  readonly snapshot_version: number
  // True when some part of the snapshot still needs organizer input before it can drive scoring.
  readonly requires_configuration: boolean
}

export interface EventRuleSnapshot {
  readonly metadata: RuleSnapshotMetadata
  readonly category: string | null
  readonly rules: RuleSet
}
