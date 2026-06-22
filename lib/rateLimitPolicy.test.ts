// node --test lib/rateLimitPolicy.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  RATE_LIMITS,
  getPolicy,
  hashSubject,
  resolveSubject,
  fixedWindowDecision,
  type RateLimitAction,
} from './rateLimitPolicy.ts'

test('every action has a sane policy (positive limit & window)', () => {
  for (const [action, p] of Object.entries(RATE_LIMITS)) {
    assert.ok(p.limit > 0, `${action} limit`)
    assert.ok(p.windowSec > 0, `${action} window`)
    assert.equal(typeof p.requiresAuth, 'boolean', `${action} requiresAuth`)
  }
})

test('abuse-prone actions are stricter than convenience toggles', () => {
  assert.ok(getPolicy('place_report').limit < getPolicy('save_toggle').limit)
  assert.ok(getPolicy('place_question').limit < getPolicy('list_write').limit)
})

test('hashSubject is deterministic, opaque, and namespaced by action', () => {
  const a = hashSubject('place_report', 'u:user-123')
  const b = hashSubject('place_report', 'u:user-123')
  assert.equal(a, b) // deterministic
  assert.ok(a.startsWith('place_report:'))
  // does not leak the raw identity
  assert.ok(!a.includes('user-123'))
  // different action ⇒ different key (separate buckets per action)
  assert.notEqual(hashSubject('place_answer', 'u:user-123'), a)
  // different user ⇒ different key
  assert.notEqual(hashSubject('place_report', 'u:user-999'), a)
})

test('resolveSubject keys authenticated users by userId', () => {
  const r = resolveSubject('place_report', { userId: 'abc' })
  assert.ok(r.ok && r.subject.startsWith('place_report:'))
})

test('resolveSubject denies auth-required actions for guests', () => {
  const r = resolveSubject('place_report', { guestToken: 'guest-cookie' })
  assert.deepEqual(r, { ok: false, error: 'auth_required' })
})

test('resolveSubject allows guest-permitted actions via bounded token', () => {
  const r = resolveSubject('save_toggle', { guestToken: 'guest-cookie' })
  assert.ok(r.ok && r.subject.startsWith('save_toggle:'))
  // but with no identity at all it is denied
  const none = resolveSubject('save_toggle', {})
  assert.deepEqual(none, { ok: false, error: 'auth_required' })
})

test('separate users do not share a bucket key', () => {
  const u1 = resolveSubject('helpful_mark', { userId: 'u1' })
  const u2 = resolveSubject('helpful_mark', { userId: 'u2' })
  assert.ok(u1.ok && u2.ok && u1.subject !== u2.subject)
})

const policy = { limit: 5, windowSec: 3600, requiresAuth: true }

test('fixedWindowDecision: below limit is allowed', () => {
  const d = fixedWindowDecision(3, policy, Date.parse('2026-06-22T10:15:00Z'))
  assert.deepEqual(d, { allowed: true, retryAfterSec: 0 })
})

test('fixedWindowDecision: at the limit is still allowed', () => {
  const d = fixedWindowDecision(5, policy, Date.parse('2026-06-22T10:15:00Z'))
  assert.equal(d.allowed, true)
})

test('fixedWindowDecision: above limit blocked with retry within the window', () => {
  // 10:15:00 with a 1h window → next bucket at 11:00:00 → 2700s away
  const now = Date.parse('2026-06-22T10:15:00Z')
  const d = fixedWindowDecision(6, policy, now)
  assert.equal(d.allowed, false)
  assert.equal(d.retryAfterSec, 2700)
})

test('fixedWindowDecision: a fresh window resets the decision', () => {
  // count resets to 1 in the new bucket → allowed again
  const d = fixedWindowDecision(1, policy, Date.parse('2026-06-22T11:00:00Z'))
  assert.equal(d.allowed, true)
})

test('fixedWindowDecision: retryAfter is always at least 1s', () => {
  // exactly on a bucket boundary, count over limit
  const now = Date.parse('2026-06-22T11:00:00Z')
  const d = fixedWindowDecision(99, policy, now)
  assert.ok(d.retryAfterSec >= 1)
})

test('action union stays in sync with RATE_LIMITS keys', () => {
  const actions: RateLimitAction[] = [
    'place_report','place_question','place_answer','place_comment','helpful_mark',
    'visit_mark','list_write','plan_write','share_token','notif_pref','save_toggle',
  ]
  assert.deepEqual(new Set(actions), new Set(Object.keys(RATE_LIMITS)))
})
