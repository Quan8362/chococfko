import test from 'node:test'
import assert from 'node:assert/strict'
import {
  operatorControlsFor, registrationOpen, canUnregister,
  participantDisplayState, hasTableAssignment, type EntryLike,
} from './uiModel.ts'

const entry = (over: Partial<EntryLike>): EntryLike =>
  ({ state: 'REGISTERED', finishing_place: null, table_no: null, seat_index: null, ...over })

test('UIM-001 operator controls follow the FSM per state', () => {
  // No escrow held → a plain cancel is offered.
  const draft = operatorControlsFor('DRAFT', false).map((c) => c.key)
  assert.deepEqual(draft.sort(), ['cancel', 'schedule'])
  const regOpen = operatorControlsFor('REGISTRATION_OPEN', false).map((c) => c.key)
  assert.ok(regOpen.includes('start') && regOpen.includes('cancel'))
  const starting = operatorControlsFor('STARTING', false).map((c) => c.key)
  assert.ok(starting.includes('begin_play') && starting.includes('draw_seats'))
  const running = operatorControlsFor('RUNNING', false).map((c) => c.key)
  assert.ok(running.includes('advance_level') && running.includes('settle') && running.includes('final_table'))
  // terminal states expose no controls
  assert.equal(operatorControlsFor('COMPLETED').length, 0)
  assert.equal(operatorControlsFor('CANCELLED').length, 0)
})

test('UIM-002 cancel is marked destructive (needs confirmation)', () => {
  const cancel = operatorControlsFor('REGISTRATION_OPEN', false).find((c) => c.key === 'cancel')
  assert.ok(cancel?.destructive)
})

test('UIM-002b escrow held → recover_refund replaces plain cancel (never strand fees)', () => {
  // With escrow held, a plain cancel is NOT offered — only the refunding recovery control.
  const running = operatorControlsFor('RUNNING', true)
  assert.ok(!running.some((c) => c.key === 'cancel'), 'plain cancel must be hidden while escrow is held')
  const recover = running.find((c) => c.key === 'recover_refund')
  assert.ok(recover?.op === 'recover_refund' && recover?.destructive, 'recover_refund must be present + destructive')
  // Registration-open with escrow also routes to recovery (registered players already paid).
  const regOpen = operatorControlsFor('REGISTRATION_OPEN', true).map((c) => c.key)
  assert.ok(regOpen.includes('recover_refund') && !regOpen.includes('cancel'))
  // The default (unknown escrow) is fail-safe: prefer the refunding path.
  assert.ok(operatorControlsFor('RUNNING').some((c) => c.key === 'recover_refund'))
})

test('UIM-002c deal_next (manual next-hand recovery) is offered during live play only', () => {
  for (const s of ['RUNNING', 'BREAK', 'FINAL_TABLE'] as const) {
    assert.ok(operatorControlsFor(s, false).some((c) => c.op === 'deal_next'), `deal_next expected in ${s}`)
  }
  for (const s of ['DRAFT', 'REGISTRATION_OPEN', 'STARTING', 'COMPLETED', 'CANCELLED'] as const) {
    assert.ok(!operatorControlsFor(s, false).some((c) => c.op === 'deal_next'), `deal_next must NOT appear in ${s}`)
  }
})

test('UIM-003 registrationOpen requires REGISTRATION_OPEN and room', () => {
  assert.equal(registrationOpen('REGISTRATION_OPEN', 3, 6), true)
  assert.equal(registrationOpen('REGISTRATION_OPEN', 6, 6), false) // full
  assert.equal(registrationOpen('RUNNING', 1, 6), false)          // wrong state
})

test('UIM-004 canUnregister only pre-start for a live registration', () => {
  assert.equal(canUnregister('REGISTRATION_OPEN', 'REGISTERED'), true)
  assert.equal(canUnregister('STARTING', 'SEATED'), true)
  assert.equal(canUnregister('RUNNING', 'ACTIVE'), false)         // too late
  assert.equal(canUnregister('REGISTRATION_OPEN', null), false)   // not registered
  assert.equal(canUnregister('REGISTRATION_OPEN', 'ELIMINATED'), false)
})

test('UIM-005 participant display state', () => {
  assert.equal(participantDisplayState('REGISTRATION_OPEN', null), 'not_registered')
  assert.equal(participantDisplayState('REGISTRATION_OPEN', entry({})), 'registered')
  assert.equal(participantDisplayState('STARTING', entry({ state: 'REGISTERED' })), 'waiting')
  assert.equal(participantDisplayState('RUNNING', entry({ state: 'SEATED', table_no: 1, seat_index: 2 })), 'seated')
  assert.equal(participantDisplayState('RUNNING', entry({ state: 'ELIMINATED', finishing_place: 4 })), 'eliminated')
  assert.equal(participantDisplayState('COMPLETED', entry({ state: 'PAID', finishing_place: 1 })), 'champion')
  assert.equal(participantDisplayState('COMPLETED', entry({ state: 'PAID', finishing_place: 3 })), 'eliminated')
  assert.equal(participantDisplayState('REGISTRATION_OPEN', entry({ state: 'WITHDRAWN' })), 'withdrawn')
})

test('UIM-006 hasTableAssignment only when live + seated', () => {
  assert.equal(hasTableAssignment(entry({ state: 'SEATED', table_no: 1, seat_index: 0 })), true)
  assert.equal(hasTableAssignment(entry({ state: 'ELIMINATED', table_no: 1, seat_index: 0 })), false)
  assert.equal(hasTableAssignment(entry({ state: 'REGISTERED' })), false)
})
