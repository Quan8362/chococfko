// Versioned rule PRESETS (templates) + a lookup registry. A preset is only a template: applying it
// always produces a fresh, independent event snapshot (see snapshot.ts). No preset is the global
// default — an event that does not opt into a preset carries its own custom snapshot instead.
//
// FJP OLYMPIAD 2026 is modelled here as ONE preset with named category variants. Nothing downstream
// may branch on the tournament/event name, the year, or the string "beginner" — decisions come from
// the snapshot, and category is a member of a defined enum, never an arbitrary string.

import {
  type GroupStageRules,
  type HandicapRules,
  type KnockoutRules,
  type MatchRules,
  type RulePreset,
  type RuleSet,
  type TieBreakToken,
} from './types.ts'

// ── FJP OLYMPIAD 2026 ───────────────────────────────────────────────────────────────────────
export const FJP_OLYMPIAD_2026_KEY = 'fjp_olympiad_2026'
export const FJP_OLYMPIAD_2026_VERSION = 1

// The defined category enum for this preset (never an arbitrary string).
export const FJP_EVENT_CATEGORIES = ['beginner', 'standard'] as const
export type FjpEventCategory = (typeof FJP_EVENT_CATEGORIES)[number]

// Confirmed FJP standings tie-break order: primary = table points (win 1 / loss 0), then point
// difference, points for, and finally an organizer decision (random_draw may be substituted per the
// event via a snapshot override).
const FJP_TIE_BREAK: readonly TieBreakToken[] = [
  'table_points',
  'point_difference',
  'points_for',
  'organizer_decision',
]

// A single-set, touch-`points` game with no deuce (win_by 1, no cap). Used for group play.
function singleSetTo(points: number): MatchRules {
  return {
    games_to_win: 1,
    max_games: 1,
    points_to_win: points,
    win_by: 1,
    points_cap: null,
    allow_tied_game: false,
  }
}

// Confirmed FJP knockout: single set to 21, win by 2, deuce cap 31.
function fjpKnockoutMatch(): MatchRules {
  return {
    games_to_win: 1,
    max_games: 1,
    points_to_win: 21,
    win_by: 2,
    points_cap: 31,
    allow_tied_game: false,
  }
}

function fjpGroup(points: number): GroupStageRules {
  return {
    match: singleSetTo(points),
    win_table_points: 1,
    loss_table_points: 0,
    tie_break_order: [...FJP_TIE_BREAK],
  }
}

function fjpKnockout(): KnockoutRules {
  return { match: fjpKnockoutMatch() }
}

// Gender handicap is INTENDED for FJP but its concrete values are not yet confirmed by the
// organizer. Ship the schema in the pending state: enabled, but requires_configuration = true and no
// entries — applying it to a live score returns a typed HANDICAP_NOT_CONFIGURED error. Do NOT invent
// values here.
function fjpHandicap(): HandicapRules {
  return {
    enabled: true,
    mode: 'starting_score',
    entries: [],
    requires_configuration: true,
  }
}

function fjpRules(groupPoints: number): RuleSet {
  return {
    group: fjpGroup(groupPoints),
    knockout: fjpKnockout(),
    handicap: fjpHandicap(),
  }
}

// Build a fresh preset object each call so no two callers share a mutable reference.
export function buildFjpOlympiad2026Preset(): RulePreset {
  return {
    key: FJP_OLYMPIAD_2026_KEY,
    version: FJP_OLYMPIAD_2026_VERSION,
    label: 'FJP Olympiad 2026',
    isDefault: false,
    variants: [
      // Beginner group play: single set to 15.
      { category: 'beginner', rules: fjpRules(15) },
      // Every other content: single set to 21.
      { category: 'standard', rules: fjpRules(21) },
    ],
  }
}

// ── Registry ────────────────────────────────────────────────────────────────────────────────
// Presets are addressed by (key, version). Each getter returns a freshly built object so the
// registry can never hand out a shared mutable template.
type PresetBuilder = () => RulePreset

const REGISTRY: ReadonlyMap<string, PresetBuilder> = new Map<string, PresetBuilder>([
  [`${FJP_OLYMPIAD_2026_KEY}@${FJP_OLYMPIAD_2026_VERSION}`, buildFjpOlympiad2026Preset],
])

export function getRulePreset(key: string, version: number): RulePreset | null {
  const builder = REGISTRY.get(`${key}@${version}`)
  return builder ? builder() : null
}

// List (key, version, label) of every registered preset — for an admin picker. Never exposes a
// mutable template.
export function listRulePresets(): readonly { key: string; version: number; label: string }[] {
  return Array.from(REGISTRY.values()).map((build) => {
    const p = build()
    return { key: p.key, version: p.version, label: p.label }
  })
}
