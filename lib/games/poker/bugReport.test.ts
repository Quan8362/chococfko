import test from 'node:test'
import assert from 'node:assert/strict'
import {
  sanitizeBugContext,
  validateBugReport,
  containsSensitiveKey,
  deviceClassFromViewport,
  BUG_LIMITS,
  type BugReportInput,
} from './bugReport.ts'

const baseCtx = {
  tableId: 't-1', handId: 'h-1', seatIndex: 3, street: 'flop', phase: 'betting',
  stateVersion: 12, actionSeq: 40, lastEventId: 'e-9', playerCount: 5,
  buildVersion: 'abc123', browser: 'Chrome 120', os: 'Android 14',
  viewport: '390x844', orientation: 'landscape', locale: 'vi',
  connectionState: 'online', reconnectCount: 1, errorCode: 'action_rejected',
  path: '/games/poker/t-1', timestamp: '2026-07-01T00:00:00.000Z',
}

function input(overrides: Partial<BugReportInput> = {}): BugReportInput {
  return {
    description: 'Pot looked wrong after all-in',
    expected: 'Side pot to short stack',
    actual: 'Whole pot to big stack',
    severity: 'major',
    contactOk: true,
    context: baseCtx,
    ...overrides,
  }
}

// ── Sanitisation / privacy ──────────────────────────────────────────────────────
test('BUG-SAN-001 keeps every allow-listed context key', () => {
  const c = sanitizeBugContext(baseCtx)
  assert.equal(c.tableId, 't-1')
  assert.equal(c.seatIndex, 3)
  assert.equal(c.stateVersion, 12)
  assert.equal(c.connectionState, 'online')
  assert.equal(c.reconnectCount, 1)
})

test('BUG-SAN-002 DROPS sensitive keys (hole cards, deck, token, password, seed)', () => {
  const dirty = {
    ...baseCtx,
    holeCards: ['As', 'Kd'],
    hole_cards: ['As', 'Kd'],
    deck: ['2c', '3c'],
    seed: 'deadbeef',
    accessToken: 'ey.jwt.token',
    password: 'hunter2',
    authorization: 'Bearer xyz',
    opponentCards: ['Qh', 'Qs'],
    service_role_key: 'srk',
  }
  const c = sanitizeBugContext(dirty) as Record<string, unknown>
  for (const bad of ['holeCards', 'hole_cards', 'deck', 'seed', 'accessToken', 'password', 'authorization', 'opponentCards', 'service_role_key']) {
    assert.equal(bad in c, false, `leaked ${bad}`)
  }
  // ...but the safe keys still survived the same pass
  assert.equal(c.tableId, 't-1')
  assert.equal(containsSensitiveKey(c), false)
})

test('BUG-SAN-003 nested/unknown objects are dropped entirely', () => {
  const c = sanitizeBugContext({ tableId: 't', nested: { deck: ['x'] }, junk: 42 }) as Record<string, unknown>
  assert.deepEqual(Object.keys(c), ['tableId'])
})

test('BUG-SAN-004 caps long strings and coerces numeric fields', () => {
  const c = sanitizeBugContext({ browser: 'x'.repeat(5000), seatIndex: '4', stateVersion: 9.9 })
  assert.equal(c.browser?.length, BUG_LIMITS.string)
  assert.equal(c.seatIndex, 4)
  assert.equal(c.stateVersion, 9)
})

test('BUG-SAN-005 non-object context resolves to empty', () => {
  assert.deepEqual(sanitizeBugContext(null), {})
  assert.deepEqual(sanitizeBugContext('cards'), {})
})

test('BUG-SENS-001 containsSensitiveKey finds nested forbidden keys', () => {
  assert.equal(containsSensitiveKey({ a: { b: { holeCards: 1 } } }), true)
  assert.equal(containsSensitiveKey({ a: { b: { seatIndex: 1 } } }), false)
})

// ── Validation ────────────────────────────────────────────────────────────────
test('BUG-VAL-001 valid report normalises + sanitises context', () => {
  const r = validateBugReport(input())
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.report.severity, 'major')
    assert.equal(r.report.contactOk, true)
    assert.equal(r.report.context.tableId, 't-1')
    assert.equal(r.report.screenshotUrl, null)
  }
})

test('BUG-VAL-002 empty description rejected', () => {
  const r = validateBugReport(input({ description: '   ' }))
  assert.deepEqual(r, { ok: false, error: 'missing_description' })
})

test('BUG-VAL-003 oversized description rejected', () => {
  const r = validateBugReport(input({ description: 'a'.repeat(BUG_LIMITS.description + 1) }))
  assert.deepEqual(r, { ok: false, error: 'description_too_long' })
})

test('BUG-VAL-004 invalid severity rejected', () => {
  const r = validateBugReport(input({ severity: 'urgent' as never }))
  assert.deepEqual(r, { ok: false, error: 'invalid_severity' })
})

test('BUG-VAL-005 empty expected/actual normalise to null', () => {
  const r = validateBugReport(input({ expected: '', actual: '  ' }))
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.report.expected, null)
    assert.equal(r.report.actual, null)
  }
})

test('BUG-VAL-006 rejects a non-image / non-url screenshot but accepts http + data:image', () => {
  assert.equal(validateBugReport(input({ screenshotUrl: 'javascript:alert(1)' })).ok, false)
  assert.equal(validateBugReport(input({ screenshotUrl: 'https://i.example/x.png' })).ok, true)
  assert.equal(validateBugReport(input({ screenshotUrl: 'data:image/png;base64,AAAA' })).ok, true)
})

// ── Device bucketing ────────────────────────────────────────────────────────────
test('BUG-DEV-001 device class from viewport width', () => {
  assert.equal(deviceClassFromViewport('1440x900'), 'desktop')
  assert.equal(deviceClassFromViewport('820x1180'), 'tablet')
  assert.equal(deviceClassFromViewport('390x844'), 'phone')
  assert.equal(deviceClassFromViewport('garbage'), 'unknown')
  assert.equal(deviceClassFromViewport(null), 'unknown')
})

// ── UX-feedback fields (report kind / category / usability rating) ──────────────
test('BUG-UX-001 sanitizeBugContext keeps valid reportKind/uxCategory and coerces rating to int', () => {
  const ctx = sanitizeBugContext({
    ...baseCtx,
    reportKind: 'ux_feedback',
    uxCategory: 'confusing_action',
    usabilityRating: '4',
    uxTrail: 'raise_composer_opened:2 raise_composer_cancelled:1',
  })
  assert.equal(ctx.reportKind, 'ux_feedback')
  assert.equal(ctx.uxCategory, 'confusing_action')
  assert.equal(ctx.usabilityRating, 4)
  assert.equal(ctx.uxTrail, 'raise_composer_opened:2 raise_composer_cancelled:1')
})

test('BUG-UX-002 sanitizeBugContext drops invalid enum kind/category and out-of-range rating', () => {
  const ctx = sanitizeBugContext({
    reportKind: 'hacker',
    uxCategory: 'not_a_category',
    usabilityRating: 99,
  })
  assert.equal(ctx.reportKind, undefined)
  assert.equal(ctx.uxCategory, undefined)
  assert.equal(ctx.usabilityRating, undefined)
})

test('BUG-UX-003 rating boundary values 1 and 5 survive; 0 and 6 are dropped', () => {
  assert.equal(sanitizeBugContext({ usabilityRating: 1 }).usabilityRating, 1)
  assert.equal(sanitizeBugContext({ usabilityRating: 5 }).usabilityRating, 5)
  assert.equal(sanitizeBugContext({ usabilityRating: 0 }).usabilityRating, undefined)
  assert.equal(sanitizeBugContext({ usabilityRating: 6 }).usabilityRating, undefined)
})

test('BUG-UX-004 a card-shaped uxTrail value cannot smuggle sensitive data (allowlist only)', () => {
  // Even if a caller tried to hide something under a non-allowlisted key, it is dropped.
  const ctx = sanitizeBugContext({ holeCards: ['As', 'Kd'], deck: 'AsKdQc', uxTrail: 'device_rotated:1' })
  assert.equal((ctx as Record<string, unknown>).holeCards, undefined)
  assert.equal((ctx as Record<string, unknown>).deck, undefined)
  assert.equal(ctx.uxTrail, 'device_rotated:1')
})
