import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import {
  getRulePreset,
  type EventRuleSnapshot,
  type RulePresetVariant,
  type RulePresetPickerOption,
  type RulePresetPickerVariant,
  type RuleSet,
  type RuleSnapshotDbSource,
} from '@/lib/tournaments/rules'

// Server-only ADMIN read helpers for the rule engine. These use the service-role client (RLS-bypass)
// and therefore MUST only be called from a 'use server' path that has already passed checkIsAdmin()
// — same contract as lib/tournaments/admin/queries.ts. No mutation actions live here yet (Prompt 15B
// owns the admin form + the create/override/apply server actions); these are the minimal reads the
// later UI needs. The service-role client is never imported into a Client Component.

// ── Preset (template) reads ─────────────────────────────────────────────────────────────────
export interface AdminRulePresetRow {
  id: string
  presetKey: string
  version: number
  label: string
  description: string | null
  schemaVersion: number
  isDefault: boolean
  requiresConfiguration: boolean
  status: 'active' | 'deprecated'
  payload: unknown
}

interface RawPresetRow {
  id: string
  preset_key: string
  version: number
  label: string
  description: string | null
  schema_version: number
  is_default: boolean
  requires_configuration: boolean
  status: string
  payload: unknown
}

function mapPresetRow(r: RawPresetRow): AdminRulePresetRow {
  return {
    id: r.id,
    presetKey: r.preset_key,
    version: r.version,
    label: r.label,
    description: r.description,
    schemaVersion: r.schema_version,
    isDefault: r.is_default,
    requiresConfiguration: r.requires_configuration,
    status: r.status === 'deprecated' ? 'deprecated' : 'active',
    payload: r.payload,
  }
}

/**
 * Load one persisted preset by (key, version) for the admin picker. Returns null when absent. Caller
 * must be an authenticated admin (checkIsAdmin already passed upstream).
 */
export async function getRulePresetForAdmin(
  presetKey: string,
  version: number,
): Promise<AdminRulePresetRow | null> {
  if (!presetKey || !Number.isInteger(version)) return null
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('tournament_rule_presets')
    .select('id, preset_key, version, label, description, schema_version, is_default, requires_configuration, status, payload')
    .eq('preset_key', presetKey)
    .eq('version', version)
    .maybeSingle()
  if (error || !data) return null
  return mapPresetRow(data as RawPresetRow)
}

/**
 * The registered in-code presets (from the domain registry) reconciled against what is persisted.
 * The domain registry is the source of truth for what CAN be offered; the DB says what is seeded.
 * Returned rows are the persisted ones only — a preset that exists in code but is not yet seeded
 * simply does not appear (the admin seed step must be run first).
 */
export async function listRulePresetsForAdmin(): Promise<AdminRulePresetRow[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('tournament_rule_presets')
    .select('id, preset_key, version, label, description, schema_version, is_default, requires_configuration, status, payload')
    .eq('status', 'active')
    .order('preset_key', { ascending: true })
    .order('version', { ascending: false })
  if (error || !data) return []
  return (data as RawPresetRow[]).map(mapPresetRow)
}

// ── Event snapshot reads ────────────────────────────────────────────────────────────────────
export interface AdminEventRuleSnapshotRow {
  id: string
  eventId: string
  source: RuleSnapshotDbSource
  presetKey: string | null
  presetVersion: number | null
  category: string | null
  schemaVersion: number
  snapshotVersion: number
  requiresConfiguration: boolean
  version: number
  rules: RuleSet
}

interface RawSnapshotRow {
  id: string
  event_id: string
  source: string
  preset_key: string | null
  preset_version: number | null
  category: string | null
  schema_version: number
  snapshot_version: number
  requires_configuration: boolean
  version: number
  payload: RuleSet
}

/**
 * Load the current rule snapshot for one event (there is at most one). Returns null when the event
 * has no snapshot yet. Admin-only. The returned `rules` is the self-contained RuleSet — callers can
 * validate it with validateTournamentRules before using it.
 */
export async function getEventRuleSnapshotForAdmin(
  eventId: string,
): Promise<AdminEventRuleSnapshotRow | null> {
  if (!eventId) return null
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('tournament_event_rule_snapshots')
    .select('id, event_id, source, preset_key, preset_version, category, schema_version, snapshot_version, requires_configuration, version, payload')
    .eq('event_id', eventId)
    .maybeSingle()
  if (error || !data) return null
  const r = data as RawSnapshotRow
  return {
    id: r.id,
    eventId: r.event_id,
    source: (r.source === 'preset' || r.source === 'custom' ? r.source : 'default') as RuleSnapshotDbSource,
    presetKey: r.preset_key,
    presetVersion: r.preset_version,
    category: r.category,
    schemaVersion: r.schema_version,
    snapshotVersion: r.snapshot_version,
    requiresConfiguration: r.requires_configuration,
    version: r.version,
    rules: r.payload,
  }
}

// ── Preset picker view (serializable for a Client Component) ──────────────────────────────────
// The picker DTOs live in the PURE rules package (lib/tournaments/rules/views.ts) so a Client
// Component can consume them without importing this server-only module even for a type. Built here
// from the persisted preset rows — the DB template mirrors the in-code registry.
function toPickerVariants(payload: unknown): RulePresetPickerVariant[] {
  if (!Array.isArray(payload)) return []
  return (payload as RulePresetVariant[])
    .filter((v) => v && typeof v.category === 'string' && v.rules && typeof v.rules === 'object')
    .map((v) => ({ category: v.category, rules: v.rules }))
}

/**
 * The active presets available to an event's rule picker, with each variant's full rule set for
 * preview. Admin-only (service-role read). A preset seeded in code but not yet in the DB simply does
 * not appear — the DB is the source of what is offered (see listRulePresetsForAdmin).
 */
export async function listRulePresetsForPicker(): Promise<RulePresetPickerOption[]> {
  const rows = await listRulePresetsForAdmin()
  return rows.map((r) => ({
    presetKey: r.presetKey,
    version: r.version,
    label: r.label,
    isDefault: r.isDefault,
    requiresConfiguration: r.requiresConfiguration,
    variants: toPickerVariants(r.payload),
  }))
}

// Re-export the pure registry lookup so an admin caller has one import surface. The registry (not a
// DB read) is the source of truth for which preset variants exist in code.
export { getRulePreset }
export type { EventRuleSnapshot }
