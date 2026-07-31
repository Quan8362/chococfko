// Pure, serializable DTOs shared across the rule-engine admin BOUNDARY: the server query/service
// layer builds them, and a Client Component (RuleWorkspace) consumes them. Keeping them here — in the
// pure rules package, with NO server-only import — means the client never has to reference a
// server-only module (ruleQueries / ruleService) even for a type, so no service-role code can ever be
// bundled into the client. No I/O, no React/Next/Supabase.

import type { HandicapMode, RuleSet } from './types.ts'
import type { RuleValidationIssue } from './errors.ts'
import type { RuleSnapshotDbSource } from './persistence.ts'

// ── Preset picker view ────────────────────────────────────────────────────────────────────────
export interface RulePresetPickerVariant {
  category: string
  rules: RuleSet
}

export interface RulePresetPickerOption {
  presetKey: string
  version: number
  label: string
  isDefault: boolean
  requiresConfiguration: boolean
  variants: RulePresetPickerVariant[]
}

// ── The current snapshot, projected for the client ────────────────────────────────────────────
export interface RuleSnapshotView {
  id: string
  eventId: string
  source: RuleSnapshotDbSource
  presetKey: string | null
  presetVersion: number | null
  category: string | null
  snapshotVersion: number
  requiresConfiguration: boolean
  version: number
  rules: RuleSet
}

// ── Scoring rule view (for the score editors, Prompt 15D-1) ─────────────────────────────────────
// The minimal, client-safe projection a score editor needs to SHOW which rule it is scoring under.
// Never carries an internal id, snapshot version, or handicap entry — display shape only. The server
// remains the sole authority; this only drives client-side UX (labels + optimistic validation).
export interface StageRuleView {
  pointsToWin: number
  winBy: number
  pointsCap: number | null
  gamesToWin: number
  maxGames: number
  allowTiedGame: boolean
}

// The handicap ("chấp điểm") descriptor a score editor shows. Display shape only — never a raw entry
// list. For the OFFICIAL FJP rule, `mode` is 'female_count_difference' and `pointsPerDifference` is 2.
export interface HandicapRuleView {
  enabled: boolean
  mode: HandicapMode | null
  // Points granted per surplus woman (mode 'female_count_difference'); null for other/disabled modes.
  pointsPerDifference: number | null
  // True when the handicap is enabled but its values are not yet confirmed → scoring is blocked.
  requiresConfiguration: boolean
}

export interface EventScoringRuleView {
  // 'legacy_default' → the event has no snapshot and is scored by the built-in engine (both stage
  // views are null); 'snapshot' → the event rule snapshot is authoritative.
  source: RuleSnapshotDbSource | 'legacy_default'
  category: string | null
  group: StageRuleView | null
  knockout: StageRuleView | null
  // True when an enabled handicap has no confirmed values → scoring is blocked until an organizer
  // configures it. A CONFIGURED handicap (FJP v2) is NOT blocked — it applies at save time.
  handicapBlocked: boolean
  // The handicap descriptor (Prompt 15D-1B). Present for both legacy (disabled) and snapshot events.
  handicap: HandicapRuleView
}

// ── Mutation results ──────────────────────────────────────────────────────────────────────────
export type RuleMutationError =
  | 'forbidden'
  | 'not_authenticated'
  | 'invalid'
  | 'tournament_not_found'
  | 'event_not_found'
  | 'snapshot_not_found'
  | 'preset_not_found'
  // Reset-to-preset lifecycle (Prompt 15C-2): the snapshot has no preset provenance to reset to, or
  // the exact (preset_key, preset_version) it was copied from is no longer available in the registry.
  | 'not_preset_sourced'
  | 'preset_version_gone'
  | 'unknown_category'
  | 'validation_failed'
  | 'version_conflict'
  | 'event_rules_locked'
  | 'event_requires_schedule_reset'
  | 'warning_not_acknowledged'
  | 'unknown'

export type RuleMutationResult =
  | { ok: true; snapshot: RuleSnapshotView }
  | { ok: false; error: RuleMutationError; issues?: readonly RuleValidationIssue[] }

export type RuleAckResult = { ok: true } | { ok: false; error: RuleMutationError }

// Deleting a snapshot leaves the event on the system default rules — there is no snapshot to return.
export type RuleDeleteResult = { ok: true } | { ok: false; error: RuleMutationError }
