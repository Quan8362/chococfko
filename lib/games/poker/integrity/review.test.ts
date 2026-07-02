import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  canTransitionReview,
  isTerminalReview,
  validateReviewTransition,
  reviewTransitionRequiresResolution,
  validateReviewAction,
  actionMovesCoins,
  actionTargetsUser,
  actionRequiresExpiry,
  restrictionKindForAction,
  suggestedStatusAfterAction,
  REVIEW_ACTION_KINDS,
  REVIEW_STATUSES,
  type ReviewActionKind,
} from './review.ts'

test('lifecycle: terminal states are dead-ends', () => {
  assert.ok(isTerminalReview('RESOLVED'))
  assert.ok(isTerminalReview('DISMISSED'))
  for (const to of REVIEW_STATUSES) {
    assert.equal(canTransitionReview('RESOLVED', to), false)
    assert.equal(canTransitionReview('DISMISSED', to), false)
  }
})

test('lifecycle: representative legal transitions', () => {
  assert.ok(canTransitionReview('NEW', 'TRIAGED'))
  assert.ok(canTransitionReview('INVESTIGATING', 'ACTION_REQUIRED'))
  assert.ok(canTransitionReview('MONITORING', 'INVESTIGATING'))
  assert.equal(canTransitionReview('NEW', 'RESOLVED'), false) // must be triaged/investigated first
})

test('validateReviewTransition enforces reason and terminal resolution', () => {
  assert.equal(validateReviewTransition({ from: 'NEW', to: 'TRIAGED' }).error, 'reason_required')
  assert.equal(
    validateReviewTransition({ from: 'INVESTIGATING', to: 'RESOLVED', reason: 'r' }).error,
    'resolution_required',
  )
  assert.ok(validateReviewTransition({ from: 'INVESTIGATING', to: 'RESOLVED', reason: 'r', resolution: 'done' }).ok)
  assert.equal(validateReviewTransition({ from: 'RESOLVED', to: 'NEW', reason: 'r' }).error, 'case_already_terminal')
  assert.equal(validateReviewTransition({ from: 'NEW', to: 'ACTION_REQUIRED', reason: 'r' }).error, 'illegal_transition')
})

test('reviewTransitionRequiresResolution only for terminal', () => {
  assert.ok(reviewTransitionRequiresResolution('RESOLVED'))
  assert.ok(reviewTransitionRequiresResolution('DISMISSED'))
  assert.equal(reviewTransitionRequiresResolution('MONITORING'), false)
})

test('CORE INVARIANT: no action moves coins', () => {
  for (const kind of REVIEW_ACTION_KINDS) {
    assert.equal(actionMovesCoins(kind), false, `${kind} must not move coins`)
  }
})

test('validateReviewAction requires actor + reason + evidence', () => {
  const base = { kind: 'monitor' as ReviewActionKind, targetUserId: 'u' }
  assert.equal(validateReviewAction({ ...base }).error, 'actor_required')
  assert.equal(validateReviewAction({ ...base, actorId: 'admin' }).error, 'reason_required')
  assert.equal(validateReviewAction({ ...base, actorId: 'admin', reason: 'r' }).error, 'evidence_ref_required')
  assert.ok(validateReviewAction({ ...base, actorId: 'admin', reason: 'r', evidenceRef: 'case-1' }).ok)
})

test('validateReviewAction: user-targeting actions need a target', () => {
  assert.equal(
    validateReviewAction({ kind: 'restrict_private_tables', actorId: 'a', reason: 'r', evidenceRef: 'e' }).error,
    'target_user_required',
  )
  // escalation is case-level; no target needed
  assert.ok(validateReviewAction({ kind: 'escalation', actorId: 'a', reason: 'r', evidenceRef: 'e' }).ok)
})

test('temp suspension requires a future expiry', () => {
  assert.ok(actionRequiresExpiry('temp_poker_suspension'))
  assert.equal(
    validateReviewAction({ kind: 'temp_poker_suspension', actorId: 'a', reason: 'r', evidenceRef: 'e', targetUserId: 'u' }).error,
    'expiry_required',
  )
  assert.ok(
    validateReviewAction({
      kind: 'temp_poker_suspension', actorId: 'a', reason: 'r', evidenceRef: 'e', targetUserId: 'u',
      expiresAtMs: Date.now() + 86_400_000,
    }).ok,
  )
})

test('action → restriction primitive mapping', () => {
  assert.equal(restrictionKindForAction('restrict_private_tables'), 'no_join')
  assert.equal(restrictionKindForAction('restrict_high_blind'), 'no_sit')
  assert.equal(restrictionKindForAction('temp_poker_suspension'), 'no_join')
  assert.equal(restrictionKindForAction('coin_review'), null)
  assert.equal(restrictionKindForAction('monitor'), null)
})

test('actionTargetsUser + suggested status', () => {
  assert.equal(actionTargetsUser('escalation'), false)
  assert.equal(actionTargetsUser('no_action'), false)
  assert.equal(actionTargetsUser('coin_review'), true)
  assert.equal(suggestedStatusAfterAction('no_action'), 'DISMISSED')
  assert.equal(suggestedStatusAfterAction('monitor'), 'MONITORING')
  assert.equal(suggestedStatusAfterAction('restrict_high_blind'), 'ACTION_REQUIRED')
})
