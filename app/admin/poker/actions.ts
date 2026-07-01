'use server'

// ── Poker ADMIN / OPERATIONS server actions ────────────────────────────────────────────
//
// The ONLY way the admin UI mutates poker operational state. Every action:
//   1. re-checks checkIsAdmin() (defense in depth beyond the /admin layout gate),
//   2. resolves the acting admin's user id from the session (never trusts the client),
//   3. scrubs any free-form `detail` of cards/secrets (lib/games/poker/admin.ts), then
//   4. calls a SECURITY DEFINER admin RPC that performs the state change AND writes an
//      immutable audit row in ONE transaction (atomic + idempotent).
//
// The DB RPCs are service_role-only; the browser can never reach them. Coin-moving commands
// (refund) are idempotent at the DB layer (settlement lock), so a double click cannot double-pay.

import { revalidatePath } from 'next/cache'
import { checkIsAdmin, createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { scrubDetail } from '@/lib/games/poker/admin'
import type { IncidentStatus } from '@/lib/games/poker/admin'

export type AdminResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string }

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error }
}

// Resolve the acting admin (re-checked server-side). Returns the actor user id or an error.
async function requireActor(): Promise<{ ok: true; actorId: string } | { ok: false; error: string }> {
  if (!(await checkIsAdmin())) return fail('not_admin')
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('not_authenticated')
  return { ok: true, actorId: user.id }
}

function requireReason(reason: string | undefined | null): string | null {
  const r = (reason ?? '').trim()
  return r.length > 0 ? r : null
}

async function callRpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<AdminResult<{ data: T }>> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc(fn, args)
  if (error) return fail(error.message || `${fn}_failed`)
  return { ok: true, data: data as T }
}

function bump(tableId?: string | null) {
  revalidatePath('/admin/poker')
  if (tableId) revalidatePath(`/admin/poker/${tableId}`)
}

// ── Safe table commands ─────────────────────────────────────────────────────────────────
export async function pauseTable(tableId: string, reason: string): Promise<AdminResult> {
  const actor = await requireActor(); if (!actor.ok) return actor
  const r = requireReason(reason); if (!r) return fail('reason_required')
  const res = await callRpc('poker_admin_pause_table', { p_actor: actor.actorId, p_table_id: tableId, p_reason: r })
  bump(tableId); return res.ok ? { ok: true } : res
}

export async function resumeTable(tableId: string, reason: string): Promise<AdminResult> {
  const actor = await requireActor(); if (!actor.ok) return actor
  const r = requireReason(reason); if (!r) return fail('reason_required')
  const res = await callRpc('poker_admin_resume_table', { p_actor: actor.actorId, p_table_id: tableId, p_reason: r })
  bump(tableId); return res.ok ? { ok: true } : res
}

export async function markTableClosing(tableId: string, reason: string): Promise<AdminResult> {
  const actor = await requireActor(); if (!actor.ok) return actor
  const r = requireReason(reason); if (!r) return fail('reason_required')
  const res = await callRpc('poker_admin_mark_closing', { p_actor: actor.actorId, p_table_id: tableId, p_reason: r })
  bump(tableId); return res.ok ? { ok: true } : res
}

export async function closeTable(tableId: string, reason: string): Promise<AdminResult> {
  const actor = await requireActor(); if (!actor.ok) return actor
  const r = requireReason(reason); if (!r) return fail('reason_required')
  const res = await callRpc('poker_admin_close_table', { p_actor: actor.actorId, p_table_id: tableId, p_reason: r })
  bump(tableId); return res.ok ? { ok: true } : res
}

export async function forceSitOut(tableId: string, seatIndex: number, reason: string): Promise<AdminResult> {
  const actor = await requireActor(); if (!actor.ok) return actor
  const r = requireReason(reason); if (!r) return fail('reason_required')
  const res = await callRpc('poker_admin_force_sit_out', {
    p_actor: actor.actorId, p_table_id: tableId, p_seat_index: seatIndex, p_reason: r,
  })
  bump(tableId); return res.ok ? { ok: true } : res
}

// ── Hand freeze / controlled refund ──────────────────────────────────────────────────────
export async function freezeHand(tableId: string, handId: string, reason: string): Promise<AdminResult> {
  const actor = await requireActor(); if (!actor.ok) return actor
  const r = requireReason(reason); if (!r) return fail('reason_required')
  const res = await callRpc('poker_admin_freeze_hand', { p_actor: actor.actorId, p_hand_id: handId, p_reason: r })
  bump(tableId); revalidatePath(`/admin/poker/hands/${handId}`); return res.ok ? { ok: true } : res
}

export async function refundHand(
  tableId: string, handId: string, reason: string, caseId?: string | null,
): Promise<AdminResult<{ data: unknown }>> {
  const actor = await requireActor(); if (!actor.ok) return actor
  const r = requireReason(reason); if (!r) return fail('reason_required')
  const res = await callRpc('poker_admin_refund_hand', {
    p_actor: actor.actorId, p_hand_id: handId, p_reason: r, p_case_id: caseId ?? null,
  })
  bump(tableId); revalidatePath(`/admin/poker/hands/${handId}`); return res
}

// ── Player restrictions ──────────────────────────────────────────────────────────────────
export async function restrictPlayer(
  userId: string, kind: 'no_join' | 'no_sit' | 'full_ban', reason: string,
  expiresAt?: string | null, caseId?: string | null,
): Promise<AdminResult> {
  const actor = await requireActor(); if (!actor.ok) return actor
  const r = requireReason(reason); if (!r) return fail('reason_required')
  const res = await callRpc('poker_admin_restrict_player', {
    p_actor: actor.actorId, p_user_id: userId, p_kind: kind, p_reason: r,
    p_expires_at: expiresAt ?? null, p_case_id: caseId ?? null,
  })
  revalidatePath('/admin/poker'); return res.ok ? { ok: true } : res
}

export async function liftRestriction(restrictionId: string, reason: string): Promise<AdminResult> {
  const actor = await requireActor(); if (!actor.ok) return actor
  const r = requireReason(reason); if (!r) return fail('reason_required')
  const res = await callRpc('poker_admin_lift_restriction', {
    p_actor: actor.actorId, p_restriction_id: restrictionId, p_reason: r,
  })
  revalidatePath('/admin/poker'); return res.ok ? { ok: true } : res
}

// ── Incident cases ───────────────────────────────────────────────────────────────────────
export async function openIncident(input: {
  title: string; reason: string; severity?: string; category?: string;
  tableId?: string | null; handId?: string | null; relatedUserIds?: string[]; evidence?: Record<string, unknown>;
}): Promise<AdminResult<{ data: unknown }>> {
  const actor = await requireActor(); if (!actor.ok) return actor
  const r = requireReason(input.reason); if (!r) return fail('reason_required')
  if (!input.title.trim()) return fail('title_required')
  const res = await callRpc('poker_admin_open_incident', {
    p_actor: actor.actorId, p_title: input.title.trim(), p_reason: r,
    p_severity: input.severity ?? 'warn', p_category: input.category ?? 'other',
    p_table_id: input.tableId ?? null, p_hand_id: input.handId ?? null,
    p_related: input.relatedUserIds ?? [], p_evidence: scrubDetail(input.evidence ?? {}),
  })
  revalidatePath('/admin/poker/incidents'); return res
}

export async function addIncidentNote(caseId: string, note: string): Promise<AdminResult> {
  const actor = await requireActor(); if (!actor.ok) return actor
  const r = requireReason(note); if (!r) return fail('note_required')
  const res = await callRpc('poker_admin_add_incident_note', { p_actor: actor.actorId, p_case_id: caseId, p_note: r })
  revalidatePath(`/admin/poker/incidents/${caseId}`); return res.ok ? { ok: true } : res
}

export async function transitionIncident(
  caseId: string, toStatus: Exclude<IncidentStatus, 'REFUNDED'>, reason: string, resolution?: string,
): Promise<AdminResult> {
  const actor = await requireActor(); if (!actor.ok) return actor
  const r = requireReason(reason); if (!r) return fail('reason_required')
  const res = await callRpc('poker_admin_transition_incident', {
    p_actor: actor.actorId, p_case_id: caseId, p_to_status: toStatus, p_reason: r,
    p_resolution: resolution ?? null,
  })
  revalidatePath(`/admin/poker/incidents/${caseId}`); revalidatePath('/admin/poker/incidents')
  return res.ok ? { ok: true } : res
}

// ── Audited terminal-hand hole-card reveal (explicit, high-severity audit) ─────────────────
export async function revealHoleCards(
  handId: string, reason: string, caseId?: string | null,
): Promise<AdminResult<{ hole: { seatIndex: number; userId: string; cards: string[] }[] }>> {
  const actor = await requireActor(); if (!actor.ok) return actor
  const r = requireReason(reason); if (!r) return fail('reason_required')
  const res = await callRpc<{ ok: boolean; hole: { seatIndex: number; userId: string; cards: string[] }[] }>(
    'poker_admin_reveal_hole_cards',
    { p_actor: actor.actorId, p_hand_id: handId, p_reason: r, p_case_id: caseId ?? null },
  )
  if (!res.ok) return res
  revalidatePath(`/admin/poker/hands/${handId}`)
  return { ok: true, hole: res.data.hole ?? [] }
}
