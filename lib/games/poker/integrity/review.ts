// ── Poker integrity — REVIEW WORKFLOW (pure state machine + admin-action contract) ──────
//
// The human side of the system. A scored subject becomes a review CASE that moves through a
// lifecycle, and admins take explicit, audited ACTIONS. This module is the single source of truth
// for:
//   • which case-status transitions are legal,
//   • which terminal statuses require a resolution note,
//   • the closed set of admin actions and the metadata each one demands, and
//   • the invariant that NO action in the first version confiscates or moves coins.
//
// It is pure: transitions and validation are total functions over plain data, mirrored by the SQL
// RPCs (migration_poker_integrity.sql) which enforce the same rules server-side.

// ── Case lifecycle ──────────────────────────────────────────────────────────────────────
export type ReviewStatus =
  | 'NEW' // freshly surfaced by the scoring job, untouched
  | 'TRIAGED' // an admin has looked and set priority
  | 'INVESTIGATING' // active investigation underway
  | 'MONITORING' // not actioned; being watched for more evidence
  | 'ACTION_REQUIRED' // investigation concluded an action is warranted
  | 'DISMISSED' // terminal: no abuse / false positive
  | 'RESOLVED' // terminal: handled (action taken or closed with a decision)

export const REVIEW_STATUSES: readonly ReviewStatus[] = [
  'NEW', 'TRIAGED', 'INVESTIGATING', 'MONITORING', 'ACTION_REQUIRED', 'DISMISSED', 'RESOLVED',
] as const

export const TERMINAL_REVIEW_STATUSES: readonly ReviewStatus[] = ['DISMISSED', 'RESOLVED'] as const

export function isTerminalReview(status: ReviewStatus): boolean {
  return TERMINAL_REVIEW_STATUSES.includes(status)
}

// Legal transitions. A case can always be dismissed or resolved (with a note); monitoring can go
// back to investigating when new evidence arrives; nothing leaves a terminal state.
const REVIEW_TRANSITIONS: Record<ReviewStatus, readonly ReviewStatus[]> = {
  NEW: ['TRIAGED', 'INVESTIGATING', 'MONITORING', 'DISMISSED'],
  TRIAGED: ['INVESTIGATING', 'MONITORING', 'DISMISSED', 'RESOLVED'],
  INVESTIGATING: ['MONITORING', 'ACTION_REQUIRED', 'DISMISSED', 'RESOLVED'],
  MONITORING: ['INVESTIGATING', 'ACTION_REQUIRED', 'DISMISSED', 'RESOLVED'],
  ACTION_REQUIRED: ['INVESTIGATING', 'RESOLVED', 'DISMISSED'],
  DISMISSED: [],
  RESOLVED: [],
}

export function canTransitionReview(from: ReviewStatus, to: ReviewStatus): boolean {
  return REVIEW_TRANSITIONS[from]?.includes(to) ?? false
}

// Terminal statuses require a non-empty resolution note (accountability contract).
export function reviewTransitionRequiresResolution(to: ReviewStatus): boolean {
  return to === 'RESOLVED' || to === 'DISMISSED'
}

export interface ReviewTransitionRequest {
  readonly from: ReviewStatus
  readonly to: ReviewStatus
  readonly reason?: string
  readonly resolution?: string
}

export interface ValidationResult {
  readonly ok: boolean
  readonly error?: string
}

export function validateReviewTransition(req: ReviewTransitionRequest): ValidationResult {
  if (isTerminalReview(req.from)) return { ok: false, error: 'case_already_terminal' }
  if (!canTransitionReview(req.from, req.to)) return { ok: false, error: 'illegal_transition' }
  if (!req.reason || req.reason.trim().length === 0) return { ok: false, error: 'reason_required' }
  if (reviewTransitionRequiresResolution(req.to) && (!req.resolution || req.resolution.trim().length === 0)) {
    return { ok: false, error: 'resolution_required' }
  }
  return { ok: true }
}

// ── Admin actions ───────────────────────────────────────────────────────────────────────
export type ReviewActionKind =
  | 'no_action' // explicit decision to do nothing (still audited)
  | 'monitor' // add to a watch list / raise sampling
  | 'restrict_private_tables' // may not create/join private tables
  | 'restrict_high_blind' // may not sit at high-blind tables
  | 'temp_poker_suspension' // time-boxed suspension from poker
  | 'account_investigation' // escalate to a full account (cross-feature) investigation
  | 'escalation' // escalate to a senior reviewer / trust & safety
  | 'coin_review' // FLAG a coin ledger review for humans — does NOT move coins

export const REVIEW_ACTION_KINDS: readonly ReviewActionKind[] = [
  'no_action', 'monitor', 'restrict_private_tables', 'restrict_high_blind',
  'temp_poker_suspension', 'account_investigation', 'escalation', 'coin_review',
] as const

// CORE INVARIANT: no first-version action moves or confiscates coins. `coin_review` merely opens a
// human review of the ledger. This function is asserted in tests and mirrors the SQL, which never
// calls any wallet RPC from the integrity path.
export function actionMovesCoins(_kind: ReviewActionKind): boolean {
  return false
}

// Whether an action targets specific user(s). `escalation` may be case-level only.
export function actionTargetsUser(kind: ReviewActionKind): boolean {
  return kind !== 'escalation' && kind !== 'no_action'
}

// Maps an action onto the existing player-restriction primitive (poker_player_restrictions.kind),
// or null when the action does not itself restrict play. Temp suspension = time-boxed no_join.
export function restrictionKindForAction(kind: ReviewActionKind): 'no_join' | 'no_sit' | null {
  switch (kind) {
    case 'restrict_private_tables': return 'no_join'
    case 'restrict_high_blind': return 'no_sit'
    case 'temp_poker_suspension': return 'no_join'
    default: return null
  }
}

export function actionRequiresExpiry(kind: ReviewActionKind): boolean {
  return kind === 'temp_poker_suspension'
}

export interface ReviewActionRequest {
  readonly kind: ReviewActionKind
  readonly reason?: string
  readonly evidenceRef?: string // pointer into evidence (case id, hand id, signal code)
  readonly actorId?: string // admin identity — mandatory
  readonly targetUserId?: string
  readonly expiresAtMs?: number | null
}

export function validateReviewAction(req: ReviewActionRequest): ValidationResult {
  if (!REVIEW_ACTION_KINDS.includes(req.kind)) return { ok: false, error: 'unknown_action' }
  if (!req.actorId || req.actorId.trim().length === 0) return { ok: false, error: 'actor_required' }
  if (!req.reason || req.reason.trim().length === 0) return { ok: false, error: 'reason_required' }
  if (!req.evidenceRef || req.evidenceRef.trim().length === 0) return { ok: false, error: 'evidence_ref_required' }
  if (actionTargetsUser(req.kind) && (!req.targetUserId || req.targetUserId.trim().length === 0)) {
    return { ok: false, error: 'target_user_required' }
  }
  if (actionRequiresExpiry(req.kind) && (req.expiresAtMs == null || req.expiresAtMs <= Date.now())) {
    return { ok: false, error: 'expiry_required' }
  }
  // Defence in depth: reject any attempt to route a coin-moving action through this path.
  if (actionMovesCoins(req.kind)) return { ok: false, error: 'coin_moving_action_forbidden' }
  return { ok: true }
}

// Suggested status after an action (advisory; the admin still chooses the transition explicitly).
export function suggestedStatusAfterAction(kind: ReviewActionKind): ReviewStatus {
  switch (kind) {
    case 'no_action': return 'DISMISSED'
    case 'monitor': return 'MONITORING'
    case 'escalation':
    case 'account_investigation': return 'INVESTIGATING'
    default: return 'ACTION_REQUIRED'
  }
}

// A record of an action for the immutable case timeline (mirrors poker_risk_case_events rows).
export interface ReviewActionRecord {
  readonly caseId: string
  readonly kind: ReviewActionKind
  readonly reason: string
  readonly evidenceRef: string
  readonly actorId: string
  readonly actorEmail: string | null
  readonly targetUserId: string | null
  readonly expiresAtMs: number | null
  readonly atMs: number
}
