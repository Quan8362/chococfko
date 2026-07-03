import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  initialRegKey,
  reentryKey,
  unregisterKey,
  lateRegOpen,
  decideRegistration,
  decideReEntry,
  meetsMinimum,
  type UserEntrySummary,
} from './registration.ts'
import { TEMPLATE_STT_6MAX, TEMPLATE_MTT } from './config.ts'

const NONE: UserEntrySummary[] = []

test('TNMT-ENG-004 dedup keys are stable + unique per logical registration', () => {
  assert.equal(initialRegKey('t1', 'u1'), 'reg:t1:u1')
  assert.equal(initialRegKey('t1', 'u1'), initialRegKey('t1', 'u1')) // retry → same key
  assert.equal(reentryKey('t1', 'u1', 2), 'reentry:t1:u1:2')
  assert.notEqual(reentryKey('t1', 'u1', 1), reentryKey('t1', 'u1', 2))
  assert.equal(unregisterKey('t1', 'u1'), 'unreg:t1:u1')
})

test('TNMT-REG-002 initial registration succeeds when open + under cap', () => {
  const d = decideRegistration('t1', 'u1', 'REGISTRATION_OPEN', TEMPLATE_MTT, 0, 0, NONE)
  assert.ok(d.ok && d.kind === 'initial' && d.seq === 0)
  assert.equal(d.ok && d.idempotencyKey, 'reg:t1:u1')
})

test('TNMT-REG-002 duplicate registration blocked (already live)', () => {
  const existing: UserEntrySummary[] = [{ seq: 0, state: 'ACTIVE' }]
  const d = decideRegistration('t1', 'u1', 'REGISTRATION_OPEN', TEMPLATE_MTT, 0, 1, existing)
  assert.equal(d.ok, false)
  assert.equal(!d.ok && d.code, 'ALREADY_REGISTERED')
})

test('registration rejected when field full', () => {
  const d = decideRegistration('t1', 'u9', 'REGISTRATION_OPEN', TEMPLATE_STT_6MAX, 0, 6, NONE)
  assert.equal(!d.ok && d.code, 'FIELD_FULL')
})

test('TNMT-REG-004 late registration: open before deadline, closed after', () => {
  // MTT late reg through level index 3 (end of L4 = 400s in the test structure? uses real config).
  // L1..L4 each 600s → end of L4 = 2400s.
  assert.equal(lateRegOpen(TEMPLATE_MTT, 0), true)
  assert.equal(lateRegOpen(TEMPLATE_MTT, 2399), true)
  assert.equal(lateRegOpen(TEMPLATE_MTT, 2400), false)
  // STT has no late reg.
  assert.equal(lateRegOpen(TEMPLATE_STT_6MAX, 0), false)

  const openLate = decideRegistration('t1', 'u2', 'RUNNING', TEMPLATE_MTT, 1000, 10, NONE)
  assert.ok(openLate.ok)
  const closedLate = decideRegistration('t1', 'u3', 'RUNNING', TEMPLATE_MTT, 3000, 10, NONE)
  assert.equal(closedLate.ok, false)
  assert.equal(!closedLate.ok && closedLate.code, 'STATE_CLOSED')
})

test('TNMT-REG-006 re-entry: allowed when busted, within window, under limit', () => {
  const busted: UserEntrySummary[] = [{ seq: 0, state: 'ELIMINATED' }]
  const d = decideReEntry('t1', 'u1', 'RUNNING', TEMPLATE_MTT, 1000, 20, busted)
  assert.ok(d.ok && d.kind === 'reentry' && d.seq === 1)
  assert.equal(d.ok && d.idempotencyKey, 'reentry:t1:u1:1')
})

test('re-entry rejected: disabled, still alive, over limit, or window closed', () => {
  const busted: UserEntrySummary[] = [{ seq: 0, state: 'ELIMINATED' }]
  // Disabled by template
  assert.equal(!decideReEntry('t1', 'u1', 'RUNNING', TEMPLATE_STT_6MAX, 100, 3, busted).ok, true)
  // Still alive
  const alive: UserEntrySummary[] = [{ seq: 0, state: 'ACTIVE' }]
  const d2 = decideReEntry('t1', 'u1', 'RUNNING', TEMPLATE_MTT, 100, 3, alive)
  assert.equal(!d2.ok && d2.code, 'NOT_REBUY_ELIGIBLE')
  // Over limit (already 1 re-entry, max 1)
  const overLimit: UserEntrySummary[] = [{ seq: 0, state: 'ELIMINATED' }, { seq: 1, state: 'ELIMINATED' }]
  const d3 = decideReEntry('t1', 'u1', 'RUNNING', TEMPLATE_MTT, 100, 3, overLimit)
  assert.equal(!d3.ok && d3.code, 'REENTRY_LIMIT')
  // Window closed (past end of L4 = 2400s)
  const d4 = decideReEntry('t1', 'u1', 'RUNNING', TEMPLATE_MTT, 3000, 3, busted)
  assert.equal(!d4.ok && d4.code, 'REENTRY_WINDOW_CLOSED')
})

test('TNMT-REG-005 meetsMinimum gate for auto-cancel', () => {
  assert.equal(meetsMinimum(TEMPLATE_MTT, 5), false) // min 6
  assert.equal(meetsMinimum(TEMPLATE_MTT, 6), true)
  assert.equal(meetsMinimum(TEMPLATE_STT_6MAX, 2), true)
})
