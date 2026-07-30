// Pure helpers for the ADMIN rule EDITOR (Prompt 15C-1). This layer turns the flat, structured
// fields an admin form submits into a validated domain RuleSet, decides the conservative
// safety-guard verdict from an event's match state, and classifies tie-break tokens the runtime
// cannot yet evaluate automatically. Pure & deterministic — no I/O, no React/Next/Supabase, no
// `any`, inputs never mutated. It NEVER branches on a tournament/event name, a year, or a category
// string — every decision comes from the fields/state passed in.
//
// The form deliberately never accepts raw JSON: it collects each field with its own control and
// this module reconstructs a full, valid RuleSet. The domain validators (validation.ts) remain the
// authoritative gate; callers still run validateTournamentRules on the result before persisting.

import {
  AUTO_TIE_BREAK_TOKENS,
  type HandicapRules,
  type KnockoutRules,
  type GroupStageRules,
  type MatchRules,
  type RuleSet,
  type TieBreakToken,
} from './types.ts'

// ── Flat editor field shapes (what a Client Component submits) ────────────────────────────────
// Every value is a primitive so the payload is fully serializable across the server-action boundary.
export interface MatchRuleFields {
  readonly games_to_win: number
  readonly max_games: number
  readonly points_to_win: number
  readonly win_by: number
  readonly points_cap: number | null
  readonly allow_tied_game: boolean
}

export interface GroupRuleFields extends MatchRuleFields {
  readonly win_table_points: number
  readonly loss_table_points: number
  readonly tie_break_order: readonly TieBreakToken[]
}

export interface RuleEditorFields {
  readonly group: GroupRuleFields
  readonly knockout: MatchRuleFields
  // Handicap concrete numbers are NOT edited in this Prompt — only the on/off toggle. The mode and
  // entries are carried through from the base snapshot (or defaulted) so the editor can never invent
  // handicap values.
  readonly handicap: { readonly enabled: boolean }
}

function toMatchRules(f: MatchRuleFields): MatchRules {
  return {
    games_to_win: f.games_to_win,
    max_games: f.max_games,
    points_to_win: f.points_to_win,
    win_by: f.win_by,
    points_cap: f.points_cap,
    allow_tied_game: f.allow_tied_game,
  }
}

// Build the handicap block. When disabled → empty, not-requiring-configuration. When enabled →
// preserve the base's mode/entries/requires_configuration (an enabled-but-unconfigured handicap stays
// unconfigured — we NEVER fabricate entries here). With no base, an enabled handicap ships pending.
function toHandicapRules(enabled: boolean, base: HandicapRules | null): HandicapRules {
  if (!enabled) {
    return { enabled: false, mode: base?.mode ?? 'starting_score', entries: [], requires_configuration: false }
  }
  return {
    enabled: true,
    mode: base?.mode ?? 'starting_score',
    entries: base ? base.entries.map((e) => ({ ...e })) : [],
    requires_configuration: base ? base.requires_configuration : true,
  }
}

// Reconstruct a full RuleSet from editor fields. `base` (the current snapshot's rules, if editing)
// supplies the handicap mode/entries the form does not expose. The result is a fresh object that
// shares no reference with `base`. Callers MUST still validate it (validateTournamentRules).
export function buildRuleSetFromEditorFields(fields: RuleEditorFields, base: RuleSet | null = null): RuleSet {
  const group: GroupStageRules = {
    match: toMatchRules(fields.group),
    win_table_points: fields.group.win_table_points,
    loss_table_points: fields.group.loss_table_points,
    tie_break_order: [...fields.group.tie_break_order],
  }
  const knockout: KnockoutRules = { match: toMatchRules(fields.knockout) }
  const handicap = toHandicapRules(fields.handicap.enabled, base?.handicap ?? null)
  return { group, knockout, handicap }
}

// Project a RuleSet back into editor fields (for pre-filling the form when editing an existing
// snapshot). The inverse of buildRuleSetFromEditorFields for the fields the form owns.
export function ruleSetToEditorFields(rules: RuleSet): RuleEditorFields {
  const m = (r: MatchRules): MatchRuleFields => ({
    games_to_win: r.games_to_win,
    max_games: r.max_games,
    points_to_win: r.points_to_win,
    win_by: r.win_by,
    points_cap: r.points_cap,
    allow_tied_game: r.allow_tied_game,
  })
  return {
    group: {
      ...m(rules.group.match),
      win_table_points: rules.group.win_table_points,
      loss_table_points: rules.group.loss_table_points,
      tie_break_order: [...rules.group.tie_break_order],
    },
    knockout: m(rules.knockout.match),
    handicap: { enabled: rules.handicap.enabled },
  }
}

// ── Tie-break support classification ──────────────────────────────────────────────────────────
// The tokens the engine can evaluate AUTOMATICALLY from standings numbers. The remaining recognized
// tokens are legal to configure but resolve to a manual decision — the UI must WARN, never silently
// drop them (that is the contract in match-rules → compareByTieBreakToken).
export function isAutoTieBreakToken(token: TieBreakToken): boolean {
  return AUTO_TIE_BREAK_TOKENS.includes(token)
}

export function unsupportedTieBreakTokens(tokens: readonly TieBreakToken[]): TieBreakToken[] {
  return tokens.filter((t) => !isAutoTieBreakToken(t))
}

// ── Conservative safety guard (Prompt 15C-1 §14) ──────────────────────────────────────────────
// Until schedule-reset lands (Prompt 15C-2), a rule mutation is blocked once matches exist so a live
// event can never have its scoring rules changed out from under recorded results:
//   • any completed match / recorded score → 'event_rules_locked'   (hard block).
//   • matches generated but none scored yet → 'event_requires_schedule_reset' (needs a manual reset).
// Pure: the SERVER computes matchCount/completedMatchCount from DB truth and passes them in.
export interface EventMatchState {
  readonly matchCount: number
  readonly completedMatchCount: number
}

export type RuleMutationGuardCode = 'event_rules_locked' | 'event_requires_schedule_reset'

export type RuleMutationGuard =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: RuleMutationGuardCode }

export function evaluateRuleMutationGuard(state: EventMatchState): RuleMutationGuard {
  if (state.completedMatchCount > 0) return { ok: false, code: 'event_rules_locked' }
  if (state.matchCount > 0) return { ok: false, code: 'event_requires_schedule_reset' }
  return { ok: true }
}

// ── Changed-field paths (for the audit log) ───────────────────────────────────────────────────
// Dotted leaf paths that differ between two rule sets (e.g. 'group.match.points_to_win'). Arrays
// (tie_break_order, handicap.entries) are compared whole and reported at the array path. Pure — used
// to record WHAT changed on an update without ever storing tokens/secrets.
export function diffRuleSetPaths(before: RuleSet, after: RuleSet): string[] {
  const paths: string[] = []
  const walk = (a: unknown, b: unknown, prefix: string): void => {
    if (Array.isArray(a) || Array.isArray(b)) {
      if (JSON.stringify(a) !== JSON.stringify(b)) paths.push(prefix)
      return
    }
    if (a && b && typeof a === 'object' && typeof b === 'object') {
      const ao = a as Record<string, unknown>
      const bo = b as Record<string, unknown>
      const keys = Array.from(new Set([...Object.keys(ao), ...Object.keys(bo)]))
      for (const k of keys) walk(ao[k], bo[k], prefix ? `${prefix}.${k}` : k)
      return
    }
    if (a !== b) paths.push(prefix)
  }
  walk(before, after, '')
  return paths
}
