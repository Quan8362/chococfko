// Controlled RULE-CHANGE lifecycle — the PURE core (Prompt 15D-2). When an organizer wants to change
// an event's scoring rules AFTER a schedule / bracket has already been generated (or even scored),
// the conservative guard (editor.ts → evaluateRuleMutationGuard) blocks the naive edit. This module
// describes, PURELY, the controlled alternative:
//
//   1. classifyRuleChange(before, after)          — WHAT kind of change this is (typed, path-driven).
//   2. deriveRuleChangeGuard(state, change)       — which controlled action is permitted for the
//                                                    current match/score state (direct / reset / blocked).
//   3. summarizeRuleChangeImpact(input)           — HOW MUCH downstream data a reset would touch
//                                                    (counts only) + whether auto-regeneration is safe.
//   4. computeRuleChangeImpactToken(input)        — a DETERMINISTIC token over the reloaded DB truth +
//                                                    proposed rules, so the mutation can refuse to act
//                                                    on a preview that went stale (optimistic concurrency).
//
// Hard rules (mirrors types.ts): no I/O, no React/Next/Supabase, no `any`, never branch on a
// tournament / event / category NAME or a year. Inputs are never mutated. The SERVER reloads DB truth
// and feeds it in; nothing here trusts a client payload.

import type { RuleSet } from './types.ts'
import { diffRuleSetPaths } from './editor.ts'
import type { EventMatchState, RuleEditorFields } from './editor.ts'
import type { RuleValidationIssue } from './errors.ts'

// ── 1. Classification ─────────────────────────────────────────────────────────────────────────
// A rule change is classified by the DIMENSIONS of the domain it perturbs, derived from the exact
// changed leaf paths — NEVER from a field's UI label. Three orthogonal impacts, because one field
// can touch more than one (tie_break_order / table points affect standings AND qualification):
//   • affectsMatchScoring  → how an individual game/match is won or handicapped (points_to_win,
//                            win_by, points_cap, games_to_win, max_games, allow_tied_game, handicap.*).
//   • affectsStandings     → how group standings NUMBERS are computed (table win/loss points).
//   • affectsQualification → who qualifies / how the bracket is seeded (tie_break order, table points).
export interface RuleChangeClassification {
  readonly changed: boolean
  readonly changedPaths: readonly string[]
  readonly affectsMatchScoring: boolean
  readonly affectsStandings: boolean
  readonly affectsQualification: boolean
  // 'none'        → nothing computational differs (safe to persist with no downstream effect).
  // 'scoring'     → match-scoring only; standings ordering / qualification unaffected.
  // 'structural'  → standings / qualification / bracket seeding change ⇒ the widest reset scope.
  readonly severity: 'none' | 'scoring' | 'structural'
}

// Leaf-path predicates. A changed path is matched by prefix so a whole-array change reported at the
// array path (e.g. 'group.tie_break_order') and a deep leaf ('group.match.points_to_win') both hit.
function pathTouches(path: string, needle: string): boolean {
  return path === needle || path.startsWith(`${needle}.`) || path.startsWith(`${needle}[`)
}

const MATCH_SCORING_ROOTS = ['group.match', 'knockout.match', 'handicap'] as const
const STANDINGS_ROOTS = ['group.win_table_points', 'group.loss_table_points'] as const
const QUALIFICATION_ROOTS = [
  'group.tie_break_order',
  'group.win_table_points',
  'group.loss_table_points',
] as const

export function classifyRuleChange(before: RuleSet, after: RuleSet): RuleChangeClassification {
  const changedPaths = diffRuleSetPaths(before, after)
  const anyTouches = (roots: readonly string[]) =>
    changedPaths.some((p) => roots.some((r) => pathTouches(p, r)))

  const affectsMatchScoring = anyTouches(MATCH_SCORING_ROOTS)
  const affectsStandings = anyTouches(STANDINGS_ROOTS)
  const affectsQualification = anyTouches(QUALIFICATION_ROOTS)
  const changed = changedPaths.length > 0

  const severity: RuleChangeClassification['severity'] = !changed
    ? 'none'
    : affectsQualification || affectsStandings
      ? 'structural'
      : 'scoring'

  return { changed, changedPaths, affectsMatchScoring, affectsStandings, affectsQualification, severity }
}

// ── 2. Controlled guard ─────────────────────────────────────────────────────────────────────────
// Given the current match/score state and the classification, decide which controlled action the
// caller may take. This SUPERSEDES the blunt evaluateRuleMutationGuard for the controlled path only.
//   • 'direct'      → no matches generated yet ⇒ update the snapshot in place, no reset needed.
//   • 'reset'       → matches generated but NO scores/results ⇒ controlled reset (schedule_only) allowed.
//   • 'destructive' → scores/results exist ⇒ reset is destructive; requires explicit confirmation.
//   • 'no_change'   → nothing computational differs ⇒ persist metadata only, never a reset.
export type RuleChangeMode = 'no_change' | 'direct' | 'reset' | 'destructive'

export interface RuleChangeGuard {
  readonly mode: RuleChangeMode
  // The minimum reset scope this change requires when a reset is performed.
  readonly requiredResetScope: 'none' | 'schedule_only' | 'all_results_and_downstream'
  // Whether the caller must supply an explicit destructive confirmation.
  readonly requiresDestructiveConfirmation: boolean
}

export function deriveRuleChangeGuard(
  state: EventMatchState,
  change: RuleChangeClassification,
): RuleChangeGuard {
  if (!change.changed) {
    return { mode: 'no_change', requiredResetScope: 'none', requiresDestructiveConfirmation: false }
  }
  if (state.matchCount === 0) {
    return { mode: 'direct', requiredResetScope: 'none', requiresDestructiveConfirmation: false }
  }
  if (state.completedMatchCount === 0) {
    // Generated but unscored: a schedule reset is enough for scoring-only changes; a structural change
    // that alters standings/qualification still only needs the schedule reset here (no results exist).
    return { mode: 'reset', requiredResetScope: 'schedule_only', requiresDestructiveConfirmation: false }
  }
  // Results exist: any computational change is destructive and must wipe results + downstream.
  return {
    mode: 'destructive',
    requiredResetScope: 'all_results_and_downstream',
    requiresDestructiveConfirmation: true,
  }
}

// ── 3. Impact summary (counts only — no identities) ─────────────────────────────────────────────
// The raw truth the SERVER reloads from the DB for one event, plus the proposed rules. Kept as plain
// numbers/strings so this stays pure and the same shape feeds both the preview and the token.
export interface RuleChangeImpactInput {
  readonly eventVersion: number
  readonly eventStatus: string
  readonly eventFormat: 'round_robin' | 'knockout' | 'group_knockout'
  readonly snapshotVersion: number
  readonly snapshotId: string
  readonly groupMatchCount: number
  readonly knockoutChampionshipMatchCount: number
  readonly knockoutConsolationMatchCount: number
  readonly scoredGameCount: number
  readonly completedMatchCount: number
  readonly standingsGroupCount: number
  readonly qualificationOverrideCount: number
  readonly podiumRowCount: number
  // Sorted match (id,version) pairs — the strongest concurrency signal (any score edit bumps version).
  readonly matchVersions: readonly { readonly id: string; readonly version: number }[]
  // Sorted distinct generation keys currently on the board (bracket/schedule identity).
  readonly generationKeys: readonly string[]
  readonly proposedRules: RuleSet
}

export interface RuleChangeImpactSummary {
  readonly groupMatches: number
  readonly championshipMatches: number
  readonly consolationMatches: number
  readonly scoredGames: number
  readonly completedMatches: number
  readonly standingsGroups: number
  readonly qualificationOverrides: number
  readonly podiumRows: number
  readonly resetsResults: boolean
  // Whether the platform can regenerate the schedule/bracket automatically after the reset, or the
  // organizer must reseed manually (a group_knockout knockout cannot be auto-seeded without standings).
  readonly canAutoRegenerate: boolean
  readonly regenerateModes: readonly RegenerateMode[]
}

export type RegenerateMode = 'none' | 'round_robin' | 'knockout' | 'all_applicable'

// What regeneration is applicable AFTER a reset, per format. group_knockout can only auto-regenerate
// the round-robin stage — the knockout bracket needs fresh, valid standings (or a manual reseed), so
// it is never auto-generated here (§10: "Không generate knockout trước khi qualification hợp lệ").
export function applicableRegenerateModes(format: RuleChangeImpactInput['eventFormat']): RegenerateMode[] {
  switch (format) {
    case 'round_robin':
      return ['none', 'round_robin']
    case 'knockout':
      // A pure knockout can be regenerated only when the confirmed seed order is still valid; the
      // server decides feasibility. We advertise the option; feasibility is re-checked at apply time.
      return ['none', 'knockout']
    case 'group_knockout':
      return ['none', 'round_robin']
    default:
      return ['none']
  }
}

export function summarizeRuleChangeImpact(
  input: RuleChangeImpactInput,
  scope: RuleChangeGuard['requiredResetScope'],
): RuleChangeImpactSummary {
  const resetsResults = scope === 'all_results_and_downstream'
  const regenerateModes = applicableRegenerateModes(input.eventFormat)
  // Auto-regeneration is possible for round-robin group stages; a pure knockout depends on a valid
  // stored seed (server-verified), and group_knockout's bracket always needs fresh standings first.
  const canAutoRegenerate = input.eventFormat !== 'knockout'

  return {
    groupMatches: input.groupMatchCount,
    championshipMatches: input.knockoutChampionshipMatchCount,
    consolationMatches: input.knockoutConsolationMatchCount,
    scoredGames: resetsResults ? input.scoredGameCount : 0,
    completedMatches: resetsResults ? input.completedMatchCount : 0,
    standingsGroups: input.standingsGroupCount,
    qualificationOverrides: resetsResults ? input.qualificationOverrideCount : 0,
    podiumRows: resetsResults ? input.podiumRowCount : 0,
    resetsResults,
    canAutoRegenerate,
    regenerateModes,
  }
}

// ── 4. Deterministic impact token ─────────────────────────────────────────────────────────────
// A stable fingerprint of everything a preview depends on. The mutation recomputes it from freshly
// reloaded truth and refuses (rule_change_impact_stale) if it differs from the token the caller
// echoes back from the preview — so a reset can NEVER act on data that changed after the preview.
// Pure & deterministic: a canonical JSON string over sorted keys, hashed with FNV-1a (no crypto).
// The token is NEVER minted by the client; the client only echoes what the server previously returned.
function canonicalRules(rules: RuleSet): string {
  // Stable stringification: object keys are already fixed by the RuleSet shape; arrays are ordered.
  const stable = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(stable)
    if (v && typeof v === 'object') {
      return Object.keys(v as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = stable((v as Record<string, unknown>)[k])
          return acc
        }, {})
    }
    return v
  }
  return JSON.stringify(stable(rules))
}

function fnv1a(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

// ── 5. Client ⇆ server DTOs (client-safe: this module is pure) ──────────────────────────────────
// The read-only preview the server returns to the admin modal. Counts only — never identities —
// plus the classification, the permitted controlled mode, the applicable regenerate options and the
// deterministic token the client must echo back to apply.
export interface RuleChangeImpactPreview {
  readonly snapshotId: string
  readonly snapshotVersion: number
  readonly eventVersion: number
  readonly eventFormat: RuleChangeImpactInput['eventFormat']
  readonly classification: RuleChangeClassification
  readonly mode: RuleChangeMode
  readonly requiredResetScope: RuleChangeGuard['requiredResetScope']
  readonly requiresDestructiveConfirmation: boolean
  readonly summary: RuleChangeImpactSummary
  readonly impactToken: string
}

export type RuleChangePreviewResult =
  | { readonly ok: true; readonly preview: RuleChangeImpactPreview }
  | {
      readonly ok: false
      readonly error:
        | 'forbidden'
        | 'not_authenticated'
        | 'invalid'
        | 'not_found'
        | 'snapshot_not_found'
        | 'event_completed'
        | 'validation_failed'
        | 'unknown'
      readonly issues?: readonly RuleValidationIssue[]
    }

export type RuleChangeApplyResult =
  | {
      readonly ok: true
      readonly snapshotVersion: number
      readonly status: string
      readonly regenerated: boolean
    }
  | {
      readonly ok: false
      readonly error:
        | 'forbidden'
        | 'not_authenticated'
        | 'invalid'
        | 'not_found'
        | 'snapshot_not_found'
        | 'event_completed'
        | 'validation_failed'
        | 'warning_not_acknowledged'
        | 'confirmation_required'
        | 'results_present'
        | 'rule_change_impact_stale'
        | 'snapshot_version_conflict'
        | 'event_version_conflict'
        | 'not_ready'
        | 'unknown'
      readonly issues?: readonly RuleValidationIssue[]
    }

export type RuleResetMode = 'schedule_only' | 'all_results_and_downstream'

// The apply request the client sends back after reviewing a preview.
export interface RuleChangeApplyInput {
  readonly tournamentId: string
  readonly eventId: string
  readonly snapshotId: string
  readonly expectedSnapshotVersion: number
  readonly expectedEventVersion: number
  readonly fields: RuleEditorFields
  readonly expectedImpactToken: string
  readonly resetMode: RuleResetMode
  readonly regenerateMode: RegenerateMode
  readonly acknowledgeWarning?: boolean
  // Destructive confirmation phrase — required when the guard demands it (§6). The server compares it.
  readonly confirmation?: string
}

export const RULE_CHANGE_CONFIRM_PHRASE = 'RESET'

export function computeRuleChangeImpactToken(input: RuleChangeImpactInput): string {
  const matchVersions = [...input.matchVersions]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((m) => `${m.id}:${m.version}`)
  const generationKeys = [...input.generationKeys].sort()
  const canonical = [
    `ev=${input.eventVersion}`,
    `st=${input.eventStatus}`,
    `fmt=${input.eventFormat}`,
    `sid=${input.snapshotId}`,
    `sv=${input.snapshotVersion}`,
    `gm=${input.groupMatchCount}`,
    `kc=${input.knockoutChampionshipMatchCount}`,
    `ks=${input.knockoutConsolationMatchCount}`,
    `sg=${input.scoredGameCount}`,
    `cm=${input.completedMatchCount}`,
    `qo=${input.qualificationOverrideCount}`,
    `pd=${input.podiumRowCount}`,
    `mv=[${matchVersions.join(',')}]`,
    `gk=[${generationKeys.join(',')}]`,
    `rules=${canonicalRules(input.proposedRules)}`,
  ].join('|')
  return `rci_${fnv1a(canonical)}_${input.matchVersions.length}`
}
