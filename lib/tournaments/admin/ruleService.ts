import 'server-only'

// Server-only SERVICE for the tournament RULE ENGINE admin surface (Prompt 15C-1). Every mutation
// here is the authoritative path behind the thin 'use server' wrappers in
// app/admin/giai-dau/[id]/noi-dung/rule-actions.ts (shared by the Site-Admin mount AND the scoped
// /quan-ly-giai-dau mount). Discipline for EVERY mutation — mirrors the event/score actions:
//   1. authenticate + checkTournamentPermission(tournamentId, 'rules.manage')  (deny before any I/O)
//   2. verify the parent tournament exists AND the event belongs to it (anti-IDOR)
//   3. reload DB truth (match counts for the safety guard; the current snapshot for concurrency)
//   4. apply the CONSERVATIVE safety guard (locked / requires-schedule-reset)
//   5. build + validate the snapshot with the PURE rule engine (never trust a client payload)
//   6. mutate via the SERVICE-ROLE client (created only after the check passes)
//   7. write an audit entry (ids / provenance / changed paths — NEVER tokens/cookies/secrets)
//   8. revalidate both mounts and return a TYPED result
//
// The service-role client is created ONLY after the permission check returns ok, and is never
// imported into a Client Component.

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkTournamentPermission } from '@/lib/tournaments/permissions/server'
import {
  applyRulePreset,
  buildRuleSetFromEditorFields,
  createEventRuleSnapshot,
  createSnapshotPayload,
  diffRuleSetPaths,
  evaluateRuleMutationGuard,
  isRuleEngineError,
  validateEventRuleSnapshot,
  type EventRuleSnapshot,
  type RuleAckResult,
  type RuleDeleteResult,
  type RuleEditorFields,
  type RuleMutationResult,
  type RulePreset,
  type RulePresetVariant,
  type RuleSet,
  type RuleSnapshotDbSource,
  type RuleSnapshotView,
} from '@/lib/tournaments/rules'

// The result/view DTOs (RuleMutationResult, RuleSnapshotView, RuleAckResult) live in the PURE rules
// package (views.ts) so the Client Component consumes them without importing this server-only module.

// ── Small internals ─────────────────────────────────────────────────────────────────────────
// Gate on rules.manage. Returns the resolved actor id on success (for audit attribution). Maps the
// two typed denial codes so the UI can distinguish "sign in" from "not allowed".
async function requireRulesManage(
  tournamentId: string,
): Promise<{ ok: true; actorId: string | null } | { ok: false; error: 'forbidden' | 'not_authenticated' }> {
  const check = await checkTournamentPermission(tournamentId, 'rules.manage')
  if (check.ok) return { ok: true, actorId: check.actorId }
  return { ok: false, error: check.error === 'NOT_AUTHENTICATED' ? 'not_authenticated' : 'forbidden' }
}

interface RuleEventContext {
  matchCount: number
  completedMatchCount: number
}

// Prove the event belongs to `tournamentId` and read its match counts (anti-IDOR + safety guard).
async function loadRuleEvent(
  admin: SupabaseClient,
  tournamentId: string,
  eventId: string,
): Promise<RuleEventContext | null> {
  const { data } = await admin
    .from('tournament_events')
    .select('id, tournament_id')
    .eq('id', eventId)
    .maybeSingle()
  const row = data as { id: string; tournament_id: string } | null
  if (!row || row.tournament_id !== tournamentId) return null

  const [{ count: matchCount }, { count: completedCount }] = await Promise.all([
    admin.from('tournament_matches').select('*', { count: 'exact', head: true }).eq('event_id', eventId),
    admin
      .from('tournament_matches')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('status', 'completed'),
  ])
  return { matchCount: matchCount ?? 0, completedMatchCount: completedCount ?? 0 }
}

async function tournamentExists(admin: SupabaseClient, tournamentId: string): Promise<boolean> {
  const { data } = await admin.from('tournaments').select('id').eq('id', tournamentId).maybeSingle()
  return !!data
}

async function writeAudit(
  admin: SupabaseClient,
  entry: {
    tournamentId: string | null
    eventId: string | null
    actorId: string | null
    action: string
    detail: Record<string, unknown>
  },
): Promise<void> {
  try {
    await admin.from('tournament_audit_log').insert({
      tournament_id: entry.tournamentId,
      event_id: entry.eventId,
      actor_id: entry.actorId,
      action: entry.action,
      detail: entry.detail,
    })
  } catch {
    /* audit is best-effort — never rolls back the primary mutation */
  }
}

function revalidateRuleViews(tournamentId: string, eventId: string): void {
  for (const base of ['/admin/giai-dau', '/quan-ly-giai-dau']) {
    revalidatePath(`${base}/${tournamentId}/noi-dung/${eventId}`)
  }
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

function toView(row: RawSnapshotRow): RuleSnapshotView {
  return {
    id: row.id,
    eventId: row.event_id,
    source: (row.source === 'preset' || row.source === 'custom' ? row.source : 'default') as RuleSnapshotDbSource,
    presetKey: row.preset_key,
    presetVersion: row.preset_version,
    category: row.category,
    snapshotVersion: row.snapshot_version,
    requiresConfiguration: row.requires_configuration,
    version: row.version,
    rules: row.payload,
  }
}

const SNAPSHOT_COLS =
  'id, event_id, source, preset_key, preset_version, category, schema_version, snapshot_version, requires_configuration, version, payload'

// Reconstruct the DOMAIN snapshot from a persisted row so overrides can be validated with the pure
// engine. Provenance/version come from columns; rules from the JSONB payload.
function rowToDomainSnapshot(row: RawSnapshotRow): EventRuleSnapshot {
  return createEventRuleSnapshot({
    rules: row.payload,
    source: row.source === 'preset' ? 'preset' : 'custom',
    presetKey: row.preset_key,
    presetVersion: row.preset_version,
    category: row.category,
    snapshotVersion: row.snapshot_version,
  })
}

// Persist a fresh snapshot for an event (apply-preset / create-custom). Upserts on the unique
// event_id so re-applying replaces the current rule set. The DB owns the optimistic `version` column.
async function upsertSnapshot(
  admin: SupabaseClient,
  eventId: string,
  snapshot: EventRuleSnapshot,
): Promise<RawSnapshotRow | null> {
  const payload = createSnapshotPayload(eventId, snapshot)
  const { data, error } = await admin
    .from('tournament_event_rule_snapshots')
    .upsert(payload, { onConflict: 'event_id' })
    .select(SNAPSHOT_COLS)
    .single()
  if (error || !data) return null
  return data as RawSnapshotRow
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 1. Apply a stored preset variant to an event
// ══════════════════════════════════════════════════════════════════════════════════════════════
export interface ApplyPresetInput {
  readonly tournamentId: string
  readonly eventId: string
  readonly presetKey: string
  readonly presetVersion: number
  readonly category: string
  // The operator confirmed the "handicap not yet configured" warning. Required before a
  // requires_configuration preset may be applied.
  readonly acknowledgeWarning?: boolean
}

export async function applyRulePresetToEvent(input: ApplyPresetInput): Promise<RuleMutationResult> {
  const gate = await requireRulesManage(input.tournamentId)
  if (!gate.ok) return { ok: false, error: gate.error }

  if (!input.tournamentId || !input.eventId || !input.presetKey || !Number.isInteger(input.presetVersion) || !input.category) {
    return { ok: false, error: 'invalid' }
  }

  const admin = createAdminClient()
  if (!(await tournamentExists(admin, input.tournamentId))) return { ok: false, error: 'tournament_not_found' }

  const ev = await loadRuleEvent(admin, input.tournamentId, input.eventId)
  if (!ev) return { ok: false, error: 'event_not_found' }

  const guard = evaluateRuleMutationGuard(ev)
  if (!guard.ok) return { ok: false, error: guard.code }

  // Load the STORED preset (never trust preset payload from the client) and rebuild the template.
  const { data: presetRow } = await admin
    .from('tournament_rule_presets')
    .select('preset_key, version, label, status, payload')
    .eq('preset_key', input.presetKey)
    .eq('version', input.presetVersion)
    .maybeSingle()
  const pr = presetRow as { preset_key: string; version: number; label: string; status: string; payload: unknown } | null
  if (!pr || pr.status !== 'active' || !Array.isArray(pr.payload)) return { ok: false, error: 'preset_not_found' }

  const preset: RulePreset = {
    key: pr.preset_key,
    version: pr.version,
    label: pr.label,
    isDefault: false,
    variants: pr.payload as RulePresetVariant[],
  }

  let snapshot: EventRuleSnapshot
  try {
    snapshot = applyRulePreset({ preset, category: input.category })
  } catch (e) {
    if (isRuleEngineError(e) && e.code === 'UNKNOWN_CATEGORY') return { ok: false, error: 'unknown_category' }
    return { ok: false, error: 'unknown' }
  }

  const validation = validateEventRuleSnapshot(snapshot)
  if (!validation.ok) return { ok: false, error: 'validation_failed', issues: validation.issues }

  // Handicap-warning gate: a requires_configuration snapshot may only be applied once the operator
  // has acknowledged that the handicap numbers are still pending (§15).
  if (snapshot.metadata.requires_configuration && !input.acknowledgeWarning) {
    return { ok: false, error: 'warning_not_acknowledged' }
  }

  const persisted = await upsertSnapshot(admin, input.eventId, snapshot)
  if (!persisted) return { ok: false, error: 'unknown' }

  await writeAudit(admin, {
    tournamentId: input.tournamentId,
    eventId: input.eventId,
    actorId: gate.actorId,
    action: 'event_rule_preset_applied',
    detail: {
      source: 'preset',
      preset_key: input.presetKey,
      preset_version: input.presetVersion,
      category: input.category,
      snapshot_version: persisted.snapshot_version,
      requires_configuration: persisted.requires_configuration,
    },
  })
  if (snapshot.metadata.requires_configuration && input.acknowledgeWarning) {
    await writeAudit(admin, {
      tournamentId: input.tournamentId,
      eventId: input.eventId,
      actorId: gate.actorId,
      action: 'event_rule_warning_acknowledged',
      detail: { preset_key: input.presetKey, preset_version: input.presetVersion, category: input.category, requires_configuration: true },
    })
  }

  revalidateRuleViews(input.tournamentId, input.eventId)
  return { ok: true, snapshot: toView(persisted) }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2. Create a fully-custom snapshot (no preset provenance)
// ══════════════════════════════════════════════════════════════════════════════════════════════
export interface CreateCustomInput {
  readonly tournamentId: string
  readonly eventId: string
  readonly fields: RuleEditorFields
}

export async function createCustomEventRuleSnapshot(input: CreateCustomInput): Promise<RuleMutationResult> {
  const gate = await requireRulesManage(input.tournamentId)
  if (!gate.ok) return { ok: false, error: gate.error }
  if (!input.tournamentId || !input.eventId || !input.fields) return { ok: false, error: 'invalid' }

  const admin = createAdminClient()
  if (!(await tournamentExists(admin, input.tournamentId))) return { ok: false, error: 'tournament_not_found' }

  const ev = await loadRuleEvent(admin, input.tournamentId, input.eventId)
  if (!ev) return { ok: false, error: 'event_not_found' }

  const guard = evaluateRuleMutationGuard(ev)
  if (!guard.ok) return { ok: false, error: guard.code }

  const rules = buildRuleSetFromEditorFields(input.fields, null)
  const snapshot = createEventRuleSnapshot({ rules, source: 'custom' })
  const validation = validateEventRuleSnapshot(snapshot)
  if (!validation.ok) return { ok: false, error: 'validation_failed', issues: validation.issues }

  const persisted = await upsertSnapshot(admin, input.eventId, snapshot)
  if (!persisted) return { ok: false, error: 'unknown' }

  await writeAudit(admin, {
    tournamentId: input.tournamentId,
    eventId: input.eventId,
    actorId: gate.actorId,
    action: 'event_rule_snapshot_created',
    detail: {
      source: 'custom',
      snapshot_version: persisted.snapshot_version,
      requires_configuration: persisted.requires_configuration,
    },
  })
  revalidateRuleViews(input.tournamentId, input.eventId)
  return { ok: true, snapshot: toView(persisted) }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 3. Update an existing snapshot (optimistic concurrency)
// ══════════════════════════════════════════════════════════════════════════════════════════════
export interface UpdateSnapshotInput {
  readonly tournamentId: string
  readonly eventId: string
  readonly snapshotId: string
  readonly expectedVersion: number
  readonly fields: RuleEditorFields
  readonly acknowledgeWarning?: boolean
}

export async function updateEventRuleSnapshot(input: UpdateSnapshotInput): Promise<RuleMutationResult> {
  const gate = await requireRulesManage(input.tournamentId)
  if (!gate.ok) return { ok: false, error: gate.error }
  if (!input.tournamentId || !input.eventId || !input.snapshotId || !Number.isInteger(input.expectedVersion) || !input.fields) {
    return { ok: false, error: 'invalid' }
  }

  const admin = createAdminClient()
  const ev = await loadRuleEvent(admin, input.tournamentId, input.eventId)
  if (!ev) return { ok: false, error: 'event_not_found' }

  const guard = evaluateRuleMutationGuard(ev)
  if (!guard.ok) return { ok: false, error: guard.code }

  // Reload the current snapshot, proving it belongs to this event (anti-IDOR).
  const { data: currentData } = await admin
    .from('tournament_event_rule_snapshots')
    .select(SNAPSHOT_COLS)
    .eq('id', input.snapshotId)
    .maybeSingle()
  const current = currentData as RawSnapshotRow | null
  if (!current || current.event_id !== input.eventId) return { ok: false, error: 'snapshot_not_found' }
  if (current.version !== input.expectedVersion) return { ok: false, error: 'version_conflict' }

  const currentDomain = rowToDomainSnapshot(current)
  const newRules = buildRuleSetFromEditorFields(input.fields, currentDomain.rules)
  // Preserve provenance; bump the domain snapshot_version. requires_configuration is recomputed.
  const nextSnapshot = createEventRuleSnapshot({
    rules: newRules,
    source: current.source === 'preset' ? 'preset' : 'custom',
    presetKey: current.preset_key,
    presetVersion: current.preset_version,
    category: current.category,
    snapshotVersion: current.snapshot_version + 1,
  })

  const validation = validateEventRuleSnapshot(nextSnapshot)
  if (!validation.ok) return { ok: false, error: 'validation_failed', issues: validation.issues }

  if (nextSnapshot.metadata.requires_configuration && !input.acknowledgeWarning) {
    return { ok: false, error: 'warning_not_acknowledged' }
  }

  const changedPaths = diffRuleSetPaths(current.payload, newRules)

  // Atomic optimistic-concurrency update: the WHERE also pins `version` so a stale write cannot
  // clobber a concurrent edit even if the pre-check raced. The trigger bumps `version`.
  const { data: updatedData, error } = await admin
    .from('tournament_event_rule_snapshots')
    .update({
      payload: nextSnapshot.rules,
      snapshot_version: nextSnapshot.metadata.snapshot_version,
      requires_configuration: nextSnapshot.metadata.requires_configuration,
    })
    .eq('id', input.snapshotId)
    .eq('event_id', input.eventId)
    .eq('version', input.expectedVersion)
    .select(SNAPSHOT_COLS)
    .maybeSingle()
  if (error) return { ok: false, error: 'unknown' }
  const updated = updatedData as RawSnapshotRow | null
  if (!updated) return { ok: false, error: 'version_conflict' }

  await writeAudit(admin, {
    tournamentId: input.tournamentId,
    eventId: input.eventId,
    actorId: gate.actorId,
    action: 'event_rule_snapshot_updated',
    detail: {
      source: updated.source,
      snapshot_version_before: current.snapshot_version,
      snapshot_version_after: updated.snapshot_version,
      changed_paths: changedPaths,
      requires_configuration: updated.requires_configuration,
    },
  })
  if (nextSnapshot.metadata.requires_configuration && input.acknowledgeWarning) {
    await writeAudit(admin, {
      tournamentId: input.tournamentId,
      eventId: input.eventId,
      actorId: gate.actorId,
      action: 'event_rule_warning_acknowledged',
      detail: { snapshot_version: updated.snapshot_version, requires_configuration: true },
    })
  }
  revalidateRuleViews(input.tournamentId, input.eventId)
  return { ok: true, snapshot: toView(updated) }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 4. Acknowledge the handicap warning (audit-only; no rule mutation)
// ══════════════════════════════════════════════════════════════════════════════════════════════
export interface AcknowledgeWarningInput {
  readonly tournamentId: string
  readonly eventId: string
  readonly presetKey?: string | null
  readonly presetVersion?: number | null
  readonly category?: string | null
}

export async function acknowledgeRuleWarning(input: AcknowledgeWarningInput): Promise<RuleAckResult> {
  const gate = await requireRulesManage(input.tournamentId)
  if (!gate.ok) return { ok: false, error: gate.error }
  if (!input.tournamentId || !input.eventId) return { ok: false, error: 'invalid' }

  const admin = createAdminClient()
  const ev = await loadRuleEvent(admin, input.tournamentId, input.eventId)
  if (!ev) return { ok: false, error: 'event_not_found' }

  await writeAudit(admin, {
    tournamentId: input.tournamentId,
    eventId: input.eventId,
    actorId: gate.actorId,
    action: 'event_rule_warning_acknowledged',
    detail: {
      preset_key: input.presetKey ?? null,
      preset_version: input.presetVersion ?? null,
      category: input.category ?? null,
      requires_configuration: true,
    },
  })
  return { ok: true }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 5. Reset a preset-sourced snapshot back to its ORIGINAL preset version (Prompt 15C-2 §6)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Re-copies the EXACT (preset_key, preset_version) the snapshot was created from — never the newest
// preset version — so a later preset revision can never silently change a reset. Keeps the category,
// bumps snapshot_version, and is guarded by optimistic concurrency + the conservative safety guard.
export interface ResetSnapshotInput {
  readonly tournamentId: string
  readonly eventId: string
  readonly snapshotId: string
  readonly expectedVersion: number
  // Reset re-applies the (possibly requires_configuration) preset, so the same handicap warning gate
  // applies before a pending snapshot may be written.
  readonly acknowledgeWarning?: boolean
}

export async function resetEventRuleSnapshotToPreset(input: ResetSnapshotInput): Promise<RuleMutationResult> {
  const gate = await requireRulesManage(input.tournamentId)
  if (!gate.ok) return { ok: false, error: gate.error }
  if (!input.tournamentId || !input.eventId || !input.snapshotId || !Number.isInteger(input.expectedVersion)) {
    return { ok: false, error: 'invalid' }
  }

  const admin = createAdminClient()
  const ev = await loadRuleEvent(admin, input.tournamentId, input.eventId)
  if (!ev) return { ok: false, error: 'event_not_found' }

  const guard = evaluateRuleMutationGuard(ev)
  if (!guard.ok) return { ok: false, error: guard.code }

  // Reload the current snapshot (anti-IDOR + concurrency truth).
  const { data: currentData } = await admin
    .from('tournament_event_rule_snapshots')
    .select(SNAPSHOT_COLS)
    .eq('id', input.snapshotId)
    .maybeSingle()
  const current = currentData as RawSnapshotRow | null
  if (!current || current.event_id !== input.eventId) return { ok: false, error: 'snapshot_not_found' }
  if (current.version !== input.expectedVersion) return { ok: false, error: 'version_conflict' }

  // Only a preset-sourced snapshot can be reset to a preset — a custom snapshot has nowhere to reset to.
  if (current.source !== 'preset' || !current.preset_key || !Number.isInteger(current.preset_version) || !current.category) {
    return { ok: false, error: 'not_preset_sourced' }
  }

  // Load the ORIGINAL (preset_key, preset_version) — never the latest. If that exact version is gone,
  // block rather than fall back to another version.
  const { data: presetRow } = await admin
    .from('tournament_rule_presets')
    .select('preset_key, version, label, payload')
    .eq('preset_key', current.preset_key)
    .eq('version', current.preset_version)
    .maybeSingle()
  const pr = presetRow as { preset_key: string; version: number; label: string; payload: unknown } | null
  if (!pr || !Array.isArray(pr.payload)) return { ok: false, error: 'preset_version_gone' }

  const preset: RulePreset = {
    key: pr.preset_key,
    version: pr.version,
    label: pr.label,
    isDefault: false,
    variants: pr.payload as RulePresetVariant[],
  }

  let fresh: EventRuleSnapshot
  try {
    fresh = applyRulePreset({ preset, category: current.category })
  } catch (e) {
    if (isRuleEngineError(e) && e.code === 'UNKNOWN_CATEGORY') return { ok: false, error: 'unknown_category' }
    return { ok: false, error: 'unknown' }
  }

  // Preserve provenance, bump snapshot_version from the CURRENT snapshot (a reset is a new revision).
  const nextSnapshot = createEventRuleSnapshot({
    rules: fresh.rules,
    source: 'preset',
    presetKey: current.preset_key,
    presetVersion: current.preset_version,
    category: current.category,
    snapshotVersion: current.snapshot_version + 1,
  })

  const validation = validateEventRuleSnapshot(nextSnapshot)
  if (!validation.ok) return { ok: false, error: 'validation_failed', issues: validation.issues }

  if (nextSnapshot.metadata.requires_configuration && !input.acknowledgeWarning) {
    return { ok: false, error: 'warning_not_acknowledged' }
  }

  // Atomic optimistic-concurrency update pinned on the expected version.
  const { data: updatedData, error } = await admin
    .from('tournament_event_rule_snapshots')
    .update({
      payload: nextSnapshot.rules,
      snapshot_version: nextSnapshot.metadata.snapshot_version,
      requires_configuration: nextSnapshot.metadata.requires_configuration,
    })
    .eq('id', input.snapshotId)
    .eq('event_id', input.eventId)
    .eq('version', input.expectedVersion)
    .select(SNAPSHOT_COLS)
    .maybeSingle()
  if (error) return { ok: false, error: 'unknown' }
  const updated = updatedData as RawSnapshotRow | null
  if (!updated) return { ok: false, error: 'version_conflict' }

  await writeAudit(admin, {
    tournamentId: input.tournamentId,
    eventId: input.eventId,
    actorId: gate.actorId,
    action: 'event_rule_snapshot_reset',
    detail: {
      source: 'preset',
      preset_key: current.preset_key,
      preset_version: current.preset_version,
      category: current.category,
      snapshot_version_before: current.snapshot_version,
      snapshot_version_after: updated.snapshot_version,
      requires_configuration: updated.requires_configuration,
    },
  })
  if (nextSnapshot.metadata.requires_configuration && input.acknowledgeWarning) {
    await writeAudit(admin, {
      tournamentId: input.tournamentId,
      eventId: input.eventId,
      actorId: gate.actorId,
      action: 'event_rule_warning_acknowledged',
      detail: {
        preset_key: current.preset_key,
        preset_version: current.preset_version,
        category: current.category,
        requires_configuration: true,
      },
    })
  }
  revalidateRuleViews(input.tournamentId, input.eventId)
  return { ok: true, snapshot: toView(updated) }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 6. Delete a snapshot → the event falls back to the system default rules (Prompt 15C-2 §7)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Allowed ONLY while the event is still in setup (no generated matches, no recorded results) — the
// same conservative guard that gates every rule mutation. Never deletes the preset, never touches any
// other event. Optimistic-concurrency pinned so a stale delete cannot race a concurrent edit.
export interface DeleteSnapshotInput {
  readonly tournamentId: string
  readonly eventId: string
  readonly snapshotId: string
  readonly expectedVersion: number
}

export async function deleteEventRuleSnapshot(input: DeleteSnapshotInput): Promise<RuleDeleteResult> {
  const gate = await requireRulesManage(input.tournamentId)
  if (!gate.ok) return { ok: false, error: gate.error }
  if (!input.tournamentId || !input.eventId || !input.snapshotId || !Number.isInteger(input.expectedVersion)) {
    return { ok: false, error: 'invalid' }
  }

  const admin = createAdminClient()
  const ev = await loadRuleEvent(admin, input.tournamentId, input.eventId)
  if (!ev) return { ok: false, error: 'event_not_found' }

  // A schedule/result present → typed locked error; downstream is never silently reset.
  const guard = evaluateRuleMutationGuard(ev)
  if (!guard.ok) return { ok: false, error: guard.code }

  const { data: currentData } = await admin
    .from('tournament_event_rule_snapshots')
    .select(SNAPSHOT_COLS)
    .eq('id', input.snapshotId)
    .maybeSingle()
  const current = currentData as RawSnapshotRow | null
  if (!current || current.event_id !== input.eventId) return { ok: false, error: 'snapshot_not_found' }
  if (current.version !== input.expectedVersion) return { ok: false, error: 'version_conflict' }

  const { data: deletedData, error } = await admin
    .from('tournament_event_rule_snapshots')
    .delete()
    .eq('id', input.snapshotId)
    .eq('event_id', input.eventId)
    .eq('version', input.expectedVersion)
    .select('id')
    .maybeSingle()
  if (error) return { ok: false, error: 'unknown' }
  if (!deletedData) return { ok: false, error: 'version_conflict' }

  await writeAudit(admin, {
    tournamentId: input.tournamentId,
    eventId: input.eventId,
    actorId: gate.actorId,
    action: 'event_rule_snapshot_deleted',
    detail: {
      source: current.source,
      preset_key: current.source === 'preset' ? current.preset_key : null,
      preset_version: current.source === 'preset' ? current.preset_version : null,
      category: current.category,
      snapshot_version_before: current.snapshot_version,
      requires_configuration: current.requires_configuration,
    },
  })
  revalidateRuleViews(input.tournamentId, input.eventId)
  return { ok: true }
}
