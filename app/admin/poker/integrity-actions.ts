'use server'

// ── Poker INTEGRITY (anti-collusion) admin server actions ──────────────────────────────
//
// The ONLY way the admin UI mutates a risk-review case. Same contract as actions.ts:
//   1. re-check checkIsAdmin() (defence in depth beyond the /admin layout gate),
//   2. resolve the acting admin's id from the SESSION (never trust the client),
//   3. validate with the PURE review-workflow rules (review.ts) for friendly, deterministic errors,
//   4. call a SECURITY DEFINER, service_role-only RPC that performs the change AND writes an
//      immutable poker_risk_case_events + poker_admin_audit row in ONE transaction.
//
// INVARIANTS (mirrored in SQL):
//   • NEVER auto-punish / auto-ban / auto-move coins. `coin_review` only FLAGS a ledger review.
//   • A restriction-type action (which delegates to the existing audited poker_admin_restrict_player)
//     is applied ONLY after EXPLICIT human confirmation (`confirm: true`) from the reviewer.
//   • Every mutation requires an authenticated admin actor + a reason (+ evidence ref for actions).

import { revalidatePath } from 'next/cache'
import { checkIsAdmin, createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {
  validateReviewAction,
  validateReviewTransition,
  restrictionKindForAction,
  type ReviewStatus,
  type ReviewActionKind,
} from '@/lib/games/poker/integrity'

export type AdminResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string }

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error }
}

async function requireActor(): Promise<{ ok: true; actorId: string } | { ok: false; error: string }> {
  if (!(await checkIsAdmin())) return fail('not_admin')
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('not_authenticated')
  return { ok: true, actorId: user.id }
}

async function callRpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<AdminResult<{ data: T }>> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc(fn, args)
  if (error) return fail(error.message || `${fn}_failed`)
  return { ok: true, data: data as T }
}

function revalidate() {
  revalidatePath('/admin/poker/integrity')
}

// ── Transition a review case (FSM + terminal-resolution enforced in review.ts and SQL) ──
export async function transitionRiskCase(
  caseId: string, fromStatus: ReviewStatus, toStatus: ReviewStatus, reason: string, resolution?: string,
): Promise<AdminResult> {
  const actor = await requireActor(); if (!actor.ok) return actor
  const check = validateReviewTransition({ from: fromStatus, to: toStatus, reason, resolution })
  if (!check.ok) return fail(check.error ?? 'invalid_transition')
  const res = await callRpc('poker_risk_transition_case', {
    p_actor: actor.actorId, p_case_id: caseId, p_to_status: toStatus,
    p_reason: reason.trim(), p_resolution: resolution?.trim() ?? null,
  })
  revalidate(); return res.ok ? { ok: true } : res
}

// ── Add a note to a case (immutable timeline + audit) ────────────────────────────────────
export async function addRiskNote(caseId: string, note: string): Promise<AdminResult> {
  const actor = await requireActor(); if (!actor.ok) return actor
  if (!note.trim()) return fail('note_required')
  const res = await callRpc('poker_risk_add_note', { p_actor: actor.actorId, p_case_id: caseId, p_note: note.trim() })
  revalidate(); return res.ok ? { ok: true } : res
}

// ── Record a reviewed admin action ───────────────────────────────────────────────────────
// A restriction-type action delegates to the existing audited restriction RPC — but ONLY after the
// reviewer explicitly confirms (`confirm: true`). Nothing here moves coins or bans automatically.
export async function recordRiskAction(input: {
  caseId: string
  action: ReviewActionKind
  reason: string
  evidenceRef: string
  targetUserId?: string | null
  expiresAt?: string | null // ISO; required for temp_poker_suspension
  confirm?: boolean
}): Promise<AdminResult> {
  const actor = await requireActor(); if (!actor.ok) return actor

  const expiresAtMs = input.expiresAt ? new Date(input.expiresAt).getTime() : null
  const check = validateReviewAction({
    kind: input.action,
    reason: input.reason,
    evidenceRef: input.evidenceRef,
    actorId: actor.actorId,
    targetUserId: input.targetUserId ?? undefined,
    expiresAtMs,
  })
  if (!check.ok) return fail(check.error ?? 'invalid_action')

  // Explicit human confirmation gate for any action that actually restricts a player's access.
  if (restrictionKindForAction(input.action) !== null && input.confirm !== true) {
    return fail('confirmation_required')
  }

  const res = await callRpc('poker_risk_record_action', {
    p_actor: actor.actorId,
    p_case_id: input.caseId,
    p_action: input.action,
    p_reason: input.reason.trim(),
    p_evidence_ref: input.evidenceRef.trim(),
    p_target_user_id: input.targetUserId ?? null,
    p_expires_at: input.expiresAt ?? null,
  })
  revalidate(); return res.ok ? { ok: true } : res
}
