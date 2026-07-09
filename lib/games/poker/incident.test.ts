// Unit tests for the SEV-1 incident contract, dedupe/cooldown, and the active notifier core.
// Run with:  node --test lib/games/poker/incident.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildSev1Incident,
  assertSev1Safe,
  sev1DedupeKey,
  isSev1Code,
  SEV1_CODES,
  type Sev1Code,
} from './incident.ts'
import { Sev1Deduper } from './incidentDedup.ts'
import {
  emitSev1,
  sendSev1HealthCheck,
  buildSev1EmailText,
  buildSev1EmailSubject,
} from './incidentNotifierCore.ts'

const FIXED = () => '2026-07-09T00:00:00.000Z'

// ── Contract: one incident per invariant, correctly coded ───────────────────────────────────────
test('every SEV-1 code builds a valid, safe incident', () => {
  for (const code of SEV1_CODES) {
    const inc = buildSev1Incident({ code, correlation: { source: 'test' }, now: FIXED })
    assert.equal(inc.code, code)
    assert.equal(inc.severity, 'SEV1')
    assert.equal(inc.schema, 1)
    assert.ok(inc.summary.length > 0)
    assert.doesNotThrow(() => assertSev1Safe(inc))
  }
})

test('isSev1Code accepts the taxonomy and rejects ordinary rejection codes (no SEV-1 noise)', () => {
  assert.equal(isSev1Code('PKR_SEV1_ECONOMY_NOT_CONSERVED'), true)
  // Normal stale / wrong-turn / rejected-duplicate-click codes are NOT SEV-1 codes.
  for (const noise of ['action_rejected', 'action_stale', 'not_your_turn', 'stale_action', 'PKR_ACTION_STALE']) {
    assert.equal(isSev1Code(noise), false)
  }
})

// ── Redaction: payloads never carry sensitive values ────────────────────────────────────────────
test('facts are sanitised to numbers/safe strings; secrets/cards/PII/SQL/stack are dropped or rejected', () => {
  const inc = buildSev1Incident({
    code: 'PKR_SEV1_ECONOMY_NOT_CONSERVED',
    correlation: { tableId: 'tbl-123', handId: 'hand-456', source: 'test' },
    facts: {
      delta: 500, seatIndex: 2,           // kept (numbers)
      integrity: 'CONSERVATION_MISMATCH', // kept (safe slug)
      hole: ['As', 'Kd'],                 // dropped (not scalar / card-shaped)
      password: 'hunter2',                // dropped (secret key)
      token: 'eyJabc.def.ghi',            // dropped (secret + jwt shaped)
      email: 'a@b.com',                   // dropped (PII key)
    },
    now: FIXED,
  })
  const blob = JSON.stringify(inc)
  for (const forbidden of ['As', 'Kd', 'hunter2', 'eyJabc', 'a@b.com', 'password', 'token', 'email']) {
    assert.ok(!blob.includes(forbidden), `incident must not contain "${forbidden}" — got ${blob}`)
  }
  assert.equal(inc.facts.delta, 500)
  assert.equal(inc.facts.integrity, 'CONSERVATION_MISMATCH')
  assert.doesNotThrow(() => assertSev1Safe(inc))
})

test('assertSev1Safe throws if a summary smuggles a JWT / secret / SQL / stack', () => {
  const base = buildSev1Incident({ code: 'PKR_SEV1_PRIVATE_STATE_LEAK', now: FIXED })
  const unsafeSamples = [
    'contains eyJhbGciOi.JIUzI1NiIsIn.type token',
    'password=hunter2',
    'SELECT * FROM poker_hands',
    'at Object.<anonymous> (actions.ts:1140)',
  ]
  for (const s of unsafeSamples) {
    assert.throws(() => assertSev1Safe({ ...base, summary: s }), /unsafe/)
  }
})

// ── Deterministic dedupe key ────────────────────────────────────────────────────────────────────
test('dedupe key depends only on code + correlation ids, never timestamp/count', () => {
  const c = { tableId: 't1', handId: 'h1' }
  const k1 = sev1DedupeKey('PKR_SEV1_DUPLICATE_PAYOUT', c)
  const k2 = sev1DedupeKey('PKR_SEV1_DUPLICATE_PAYOUT', c)
  assert.equal(k1, k2)
  assert.notEqual(k1, sev1DedupeKey('PKR_SEV1_DUPLICATE_REFUND', c))
  assert.notEqual(k1, sev1DedupeKey('PKR_SEV1_DUPLICATE_PAYOUT', { tableId: 't2', handId: 'h1' }))
})

// ── Dedupe + cooldown ───────────────────────────────────────────────────────────────────────────
test('Sev1Deduper: first hit notifies, repeats within cooldown are suppressed + counted', () => {
  const dd = new Sev1Deduper({ cooldownMs: 1000 })
  const a = dd.record('k', 0)
  assert.deepEqual([a.shouldNotify, a.occurrenceCount], [true, 1])
  const b = dd.record('k', 100)
  assert.deepEqual([b.shouldNotify, b.occurrenceCount], [false, 2])
  const c = dd.record('k', 500)
  assert.deepEqual([c.shouldNotify, c.occurrenceCount], [false, 3])
  // Cooldown elapsed → a fresh window notifies again.
  const d = dd.record('k', 1000)
  assert.deepEqual([d.shouldNotify, d.occurrenceCount], [true, 1])
})

test('Sev1Deduper is bounded (LRU eviction) so distinct keys cannot grow memory unbounded', () => {
  const dd = new Sev1Deduper({ maxKeys: 3, cooldownMs: 100000 })
  for (let i = 0; i < 10; i++) dd.record(`k${i}`, i)
  assert.ok(dd.size() <= 3)
})

// ── Notifier: build → dedupe → log + email (dependency injected) ─────────────────────────────────
function stubFetch(record: { calls: any[] }, ok = true): typeof fetch {
  return (async (_url: any, init: any) => {
    record.calls.push(JSON.parse(init.body))
    return { ok, status: ok ? 200 : 500, text: async () => '' } as any
  }) as unknown as typeof fetch
}

test('emitSev1 delivers exactly one email for a fresh incident to the approved recipients', async () => {
  const prevKey = process.env.RESEND_API_KEY
  const prevTo = process.env.POKER_SEV1_ALERT_EMAIL
  process.env.RESEND_API_KEY = 'test-key'
  process.env.POKER_SEV1_ALERT_EMAIL = 'ops@example.com'
  try {
    const rec = { calls: [] as any[] }
    const dd = new Sev1Deduper({ cooldownMs: 60000 })
    const r = await emitSev1({
      code: 'PKR_SEV1_DUPLICATE_ACTIVE_HAND',
      correlation: { tableId: 'tbl-1', source: 'test' },
      facts: { liveHands: 2 },
      nowMs: 0, fetchImpl: stubFetch(rec), deduperImpl: dd,
    })
    assert.equal(r.notified, true)
    assert.equal(r.emailDispatched, true)
    assert.equal(rec.calls.length, 1)
    assert.deepEqual(rec.calls[0].to, ['ops@example.com'])
    assert.ok(String(rec.calls[0].subject).includes('SEV-1'))
    // Body carries no secret/card/PII (defense-in-depth on the whole email).
    const body = rec.calls[0].text as string
    for (const bad of ['hunter2', 'eyJ', 'As Kd', 'service_role']) assert.ok(!body.includes(bad))
    assert.ok(body.includes('Kill switch'))
  } finally {
    process.env.RESEND_API_KEY = prevKey
    process.env.POKER_SEV1_ALERT_EMAIL = prevTo
  }
})

test('emitSev1 deduplicates: a repeated incident within cooldown sends no second email', async () => {
  const prevKey = process.env.RESEND_API_KEY
  const prevTo = process.env.POKER_SEV1_ALERT_EMAIL
  process.env.RESEND_API_KEY = 'test-key'
  process.env.POKER_SEV1_ALERT_EMAIL = 'ops@example.com'
  try {
    const rec = { calls: [] as any[] }
    const dd = new Sev1Deduper({ cooldownMs: 60000 })
    const inp = {
      code: 'PKR_SEV1_ECONOMY_NOT_CONSERVED' as Sev1Code,
      correlation: { handId: 'h9', source: 'test' },
      fetchImpl: stubFetch(rec), deduperImpl: dd,
    }
    const first = await emitSev1({ ...inp, nowMs: 0 })
    const second = await emitSev1({ ...inp, nowMs: 1000 })
    assert.equal(first.notified, true)
    assert.equal(second.suppressed, true)
    assert.equal(second.incident.occurrenceCount, 2)
    assert.equal(rec.calls.length, 1) // only ONE email despite two occurrences
  } finally {
    process.env.RESEND_API_KEY = prevKey
    process.env.POKER_SEV1_ALERT_EMAIL = prevTo
  }
})

test('notifier failure never throws and never affects the caller (gameplay/economy safe)', async () => {
  const prevKey = process.env.RESEND_API_KEY
  process.env.RESEND_API_KEY = 'test-key'
  process.env.POKER_SEV1_ALERT_EMAIL = 'ops@example.com'
  try {
    const throwingFetch = (async () => { throw new Error('network down') }) as unknown as typeof fetch
    const dd = new Sev1Deduper({ cooldownMs: 60000 })
    const r = await emitSev1({
      code: 'PKR_SEV1_CROSS_USER_ACTION', correlation: { handId: 'h1' },
      nowMs: 0, fetchImpl: throwingFetch, deduperImpl: dd,
    })
    // The alert was ATTEMPTED (durable log always happened) but email failed — and emitSev1 resolved.
    assert.equal(r.notified, true)
    assert.equal(r.emailDispatched, false)
    assert.equal(r.emailReason, 'exception')
  } finally {
    process.env.RESEND_API_KEY = prevKey
  }
})

test('emitSev1 without RESEND_API_KEY logs but does not email (degrade-safe)', async () => {
  const prevKey = process.env.RESEND_API_KEY
  delete process.env.RESEND_API_KEY
  try {
    const dd = new Sev1Deduper({ cooldownMs: 60000 })
    const r = await emitSev1({ code: 'PKR_SEV1_DUPLICATE_PAYOUT', nowMs: 0, deduperImpl: dd })
    assert.equal(r.notified, true)
    assert.equal(r.emailDispatched, false)
    assert.equal(r.emailReason, 'no_api_key')
  } finally {
    process.env.RESEND_API_KEY = prevKey
  }
})

// ── Disposable health check ──────────────────────────────────────────────────────────────────────
test('sendSev1HealthCheck reaches the approved destination with a HEALTHCHECK subject', async () => {
  const prevKey = process.env.RESEND_API_KEY
  process.env.RESEND_API_KEY = 'test-key'
  process.env.POKER_SEV1_ALERT_EMAIL = 'ops@example.com'
  try {
    const rec = { calls: [] as any[] }
    const dd = new Sev1Deduper({ cooldownMs: 60000 })
    const first = await sendSev1HealthCheck({ nowMs: 0, fetchImpl: stubFetch(rec), deduperImpl: dd })
    assert.equal(first.emailDispatched, true)
    assert.ok(String(rec.calls[0].subject).includes('HEALTHCHECK'))
    // Repeating within cooldown is deduplicated → no second email.
    const second = await sendSev1HealthCheck({ nowMs: 1000, fetchImpl: stubFetch(rec), deduperImpl: dd })
    assert.equal(second.suppressed, true)
    assert.equal(rec.calls.length, 1)
  } finally {
    process.env.RESEND_API_KEY = prevKey
  }
})

test('email subject/body builders never contain secrets for any code', () => {
  for (const code of SEV1_CODES) {
    const inc = buildSev1Incident({ code, correlation: { tableId: 't', handId: 'h', source: 's' }, facts: { n: 1 }, now: FIXED })
    const subject = buildSev1EmailSubject(inc)
    const body = buildSev1EmailText(inc)
    for (const bad of ['RESEND', 'Bearer', 'service_role', 'password', 'eyJ']) {
      assert.ok(!subject.includes(bad) && !body.includes(bad))
    }
  }
})
