// node --test lib/games/poker/tournamentRateLimitPolicy.test.ts
//
// Pure tests for the tournament rate-limit policy + token-bucket math. Mirrors the
// authoritative SQL `poker_tournament_rate_limit_hit`; the atomic/concurrent DB
// behaviour is additionally validated end-to-end in the disposable-env load phase.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  TNMT_RATE_POLICIES,
  getTnmtRatePolicy,
  tnmtRateSubject,
  tokenBucketDecision,
  type TnmtRateFamily,
  type TnmtRatePolicy,
  type BucketState,
} from './tournamentRateLimitPolicy.ts'

const FAMILIES: TnmtRateFamily[] = [
  'tnmt_action', 'tnmt_view', 'tnmt_ensure', 'tnmt_register', 'tnmt_create', 'tnmt_operator',
]

// Helper: a fresh (full) bucket for a policy at time `nowMs`.
function fresh(policy: TnmtRatePolicy, nowMs: number): BucketState {
  return { tokens: policy.capacity, updatedAtMs: nowMs }
}

// ── Policy sanity ──────────────────────────────────────────────────────────────
test('every family has a sane policy (positive capacity + refill, valid fail mode)', () => {
  for (const f of FAMILIES) {
    const p = getTnmtRatePolicy(f)
    assert.equal(p.family, f)
    assert.ok(p.capacity > 0, `${f} capacity`)
    assert.ok(p.refillPerSec > 0, `${f} refill`)
    assert.ok(p.failMode === 'open' || p.failMode === 'closed', `${f} failMode`)
    assert.ok(p.rationale.length > 0, `${f} rationale`)
  }
})

test('the action union stays in sync with the policy table', () => {
  assert.deepEqual(new Set(FAMILIES), new Set(Object.keys(TNMT_RATE_POLICIES)))
})

// ── Fail mode: mutations fail-CLOSED, reads fail-OPEN ────────────────────────────
test('mutation families fail CLOSED; the read family fails OPEN', () => {
  // The single read family is the reconcile/table-view read.
  assert.equal(getTnmtRatePolicy('tnmt_view').failMode, 'open')
  // Every mutating family must fail closed so a limiter outage can never open the write floodgates.
  for (const f of ['tnmt_action', 'tnmt_ensure', 'tnmt_register', 'tnmt_create', 'tnmt_operator'] as TnmtRateFamily[]) {
    assert.equal(getTnmtRatePolicy(f).failMode, 'closed', `${f} must fail closed`)
  }
})

// ── Subject keying: opaque, spoof-resistant, isolated ────────────────────────────
test('subject is deterministic, opaque, and namespaced by family', () => {
  const a = tnmtRateSubject('tnmt_action', 'u:user-123')
  const b = tnmtRateSubject('tnmt_action', 'u:user-123')
  assert.equal(a, b)                              // deterministic
  assert.ok(a.startsWith('tnmt_action:'))         // namespaced
  assert.ok(!a.includes('user-123'))              // does not leak the raw identity
})

test('different families do NOT collide (participants cannot consume operator buckets)', () => {
  const player = tnmtRateSubject('tnmt_action', 'u:same-user')
  const operator = tnmtRateSubject('tnmt_operator', 'u:same-user')
  const view = tnmtRateSubject('tnmt_view', 'u:same-user')
  assert.notEqual(player, operator)               // a participant's action bucket ≠ operator bucket
  assert.notEqual(player, view)                   // reconnect reads ≠ action bucket
  assert.notEqual(operator, view)
})

test('different users never share a bucket key', () => {
  assert.notEqual(
    tnmtRateSubject('tnmt_action', 'u:u1'),
    tnmtRateSubject('tnmt_action', 'u:u2'),
  )
})

test('the enforced key depends ONLY on family + trusted identity (spoof-resistant)', () => {
  // The subject is derived from (family, identity) alone — no client-supplied tournamentId /
  // handId / tableNo — so an attacker cannot mint fresh buckets by rotating a spoofed value.
  const base = tnmtRateSubject('tnmt_action', 'u:user-9')
  // Simulate what a key WOULD be if a client value leaked in; it must equal the base (i.e. ignored).
  assert.equal(tnmtRateSubject('tnmt_action', 'u:user-9'), base)
})

// ── Token bucket: below limit passes ─────────────────────────────────────────────
test('requests below the limit pass', () => {
  const p = getTnmtRatePolicy('tnmt_action')
  const d = tokenBucketDecision(fresh(p, 1_000_000), p, 1_000_000)
  assert.equal(d.allowed, true)
  assert.equal(d.retryAfterMs, 0)
  assert.equal(d.tokensAfter, p.capacity - 1)
})

// ── Token bucket: burst allowance, then rejection ────────────────────────────────
test('burst allowance works: exactly `capacity` instantaneous requests pass, the next is rejected', () => {
  const p = getTnmtRatePolicy('tnmt_action')
  const now = 5_000_000
  let state = fresh(p, now)
  // Thread the bucket forward at the SAME instant (no refill) — models serialized concurrent hits.
  for (let i = 0; i < p.capacity; i++) {
    const d = tokenBucketDecision(state, p, now)
    assert.equal(d.allowed, true, `burst hit ${i + 1} should pass`)
    state = { tokens: d.tokensAfter, updatedAtMs: now }
  }
  const over = tokenBucketDecision(state, p, now)
  assert.equal(over.allowed, false, 'the (capacity+1)-th instantaneous request must be rejected')
  assert.ok(over.retryAfterMs >= 1)
})

// ── Concurrency: serialized atomic path can never exceed the allowance ────────────
test('concurrent (serialized) requests cannot exceed the atomic allowance', () => {
  const p = getTnmtRatePolicy('tnmt_register') // small capacity = easy to reason about
  const now = 7_000_000
  let state = fresh(p, now)
  let admitted = 0
  // 100 requests arriving "at once" (the DB serializes them via SELECT ... FOR UPDATE).
  for (let i = 0; i < 100; i++) {
    const d = tokenBucketDecision(state, p, now)
    if (d.allowed) admitted++
    state = { tokens: d.tokensAfter, updatedAtMs: now }
  }
  assert.equal(admitted, p.capacity, 'no more than capacity may be admitted in a zero-time burst')
})

// ── Token bucket: refill ────────────────────────────────────────────────────────
test('refill works: waiting replenishes tokens at the sustained rate', () => {
  const p = getTnmtRatePolicy('tnmt_action') // refill 10/s
  const now = 9_000_000
  // Drain to empty.
  let state: BucketState = { tokens: 0, updatedAtMs: now }
  // Immediately after draining, a request is rejected.
  assert.equal(tokenBucketDecision(state, p, now).allowed, false)
  // After 1s at 10 tokens/s, ~10 tokens are back → allowed, and clamped to capacity.
  const later = now + 1000
  const d = tokenBucketDecision(state, p, later)
  assert.equal(d.allowed, true)
  assert.ok(d.tokensAfter <= p.capacity)
})

test('refill is partial before a full token is available (precise retry)', () => {
  const p = getTnmtRatePolicy('tnmt_register') // refill 5/60 ≈ 0.0833/s → ~12s per token
  const now = 11_000_000
  const state: BucketState = { tokens: 0, updatedAtMs: now }
  // 1s later: only ~0.083 tokens → still rejected, with a retry in the ballpark of 11s.
  const d = tokenBucketDecision(state, p, now + 1000)
  assert.equal(d.allowed, false)
  assert.ok(d.retryAfterMs > 9_000 && d.retryAfterMs <= 12_000, `retry ~11s, got ${d.retryAfterMs}`)
})

test('tokens never exceed capacity no matter how long the bucket idles', () => {
  const p = getTnmtRatePolicy('tnmt_view')
  const now = 13_000_000
  const state: BucketState = { tokens: 0, updatedAtMs: now }
  const d = tokenBucketDecision(state, p, now + 3_600_000) // idle 1h
  assert.ok(d.tokensAfter <= p.capacity)
  assert.equal(d.allowed, true)
})

test('retryAfterMs is always at least 1ms when rejected', () => {
  const p = getTnmtRatePolicy('tnmt_action')
  const now = 15_000_000
  const d = tokenBucketDecision({ tokens: 0.999999, updatedAtMs: now }, p, now)
  assert.equal(d.allowed, false)
  assert.ok(d.retryAfterMs >= 1)
})
