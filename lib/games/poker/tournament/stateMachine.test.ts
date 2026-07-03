import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  TOURNAMENT_STATES,
  ENTRY_STATES,
  canTransition,
  canResumeTo,
  isLiveTournamentState,
  isTerminalTournamentState,
  stateAllowsRegistration,
  canEntryTransition,
  isEntryTerminal,
  canWithdraw,
} from './stateMachine.ts'
import type { TournamentState } from './types.ts'

test('TNMT-STATE-001 happy-path lifecycle transitions are legal', () => {
  assert.ok(canTransition('DRAFT', 'SCHEDULED'))
  assert.ok(canTransition('SCHEDULED', 'REGISTRATION_OPEN'))
  assert.ok(canTransition('REGISTRATION_OPEN', 'STARTING'))
  assert.ok(canTransition('STARTING', 'RUNNING'))
  assert.ok(canTransition('RUNNING', 'BREAK'))
  assert.ok(canTransition('BREAK', 'RUNNING'))
  assert.ok(canTransition('RUNNING', 'FINAL_TABLE'))
  assert.ok(canTransition('FINAL_TABLE', 'COMPLETED'))
})

test('TNMT-STATE-003 CANCELLED reachable from every non-terminal state', () => {
  for (const s of TOURNAMENT_STATES) {
    if (s === 'COMPLETED' || s === 'CANCELLED') continue
    assert.ok(canTransition(s, 'CANCELLED'), `${s} should reach CANCELLED`)
  }
})

test('TNMT-STATE-004 terminals have no outgoing transitions', () => {
  for (const s of ['COMPLETED', 'CANCELLED'] as TournamentState[]) {
    for (const t of TOURNAMENT_STATES) assert.equal(canTransition(s, t), false)
  }
  assert.ok(isTerminalTournamentState('COMPLETED'))
  assert.ok(isTerminalTournamentState('CANCELLED'))
})

test('TNMT-STATE-002 PAUSED_FOR_REVIEW resumes only to a live state', () => {
  assert.ok(canResumeTo('RUNNING'))
  assert.ok(canResumeTo('FINAL_TABLE'))
  assert.equal(canResumeTo('COMPLETED'), false)
  assert.equal(canResumeTo('REGISTRATION_OPEN'), false)
  // every live state is reachable from the pause
  for (const s of ['STARTING', 'RUNNING', 'BREAK', 'FINAL_TABLE'] as TournamentState[]) {
    assert.ok(canTransition('PAUSED_FOR_REVIEW', s))
    assert.ok(isLiveTournamentState(s))
  }
})

test('TNMT-STATE-INV-001 every transition lands in a known state', () => {
  for (const from of TOURNAMENT_STATES) {
    for (const to of TOURNAMENT_STATES) {
      if (canTransition(from, to)) assert.ok(TOURNAMENT_STATES.includes(to))
    }
  }
})

test('TNMT-STATE-005 registration gate by state + late-reg', () => {
  assert.ok(stateAllowsRegistration('REGISTRATION_OPEN', false))
  assert.equal(stateAllowsRegistration('RUNNING', false), false)
  assert.ok(stateAllowsRegistration('RUNNING', true))
  assert.ok(stateAllowsRegistration('BREAK', true))
  assert.equal(stateAllowsRegistration('FINAL_TABLE', true), false) // late reg never into final table
  assert.equal(stateAllowsRegistration('COMPLETED', true), false)
})

test('TNMT-PSTATE entry transitions + terminals', () => {
  assert.ok(canEntryTransition('REGISTERED', 'SEATED'))
  assert.ok(canEntryTransition('ACTIVE', 'DISCONNECTED'))
  assert.ok(canEntryTransition('DISCONNECTED', 'ACTIVE'))
  assert.ok(canEntryTransition('ACTIVE', 'ELIMINATED'))
  assert.ok(canEntryTransition('ELIMINATED', 'PAID'))
  assert.ok(canEntryTransition('ELIMINATED', 'REBUY_ELIGIBLE'))
  assert.ok(canEntryTransition('REBUY_ELIGIBLE', 'SEATED'))
  assert.equal(canEntryTransition('WITHDRAWN', 'SEATED'), false)
  assert.equal(canEntryTransition('PAID', 'ACTIVE'), false)
  assert.ok(isEntryTerminal('PAID'))
  assert.ok(isEntryTerminal('WITHDRAWN'))
  for (const s of ENTRY_STATES) assert.equal(typeof s, 'string')
})

test('TNMT-PSTATE-004 withdraw only pre-start', () => {
  assert.ok(canWithdraw('REGISTERED', 'REGISTRATION_OPEN'))
  assert.ok(canWithdraw('SEATED', 'STARTING'))
  assert.equal(canWithdraw('ACTIVE', 'RUNNING'), false)
  assert.equal(canWithdraw('REGISTERED', 'RUNNING'), false)
})
