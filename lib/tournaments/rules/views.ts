// Pure, serializable DTOs shared across the rule-engine admin BOUNDARY: the server query/service
// layer builds them, and a Client Component (RuleWorkspace) consumes them. Keeping them here — in the
// pure rules package, with NO server-only import — means the client never has to reference a
// server-only module (ruleQueries / ruleService) even for a type, so no service-role code can ever be
// bundled into the client. No I/O, no React/Next/Supabase.

import type { RuleSet } from './types.ts'
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
