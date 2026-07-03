import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeRng } from '../../tlmn/ai/seededRandom.ts'
import {
  decideSafely,
  safeFallbackDecision,
  isDecisionLegal,
  botActionKey,
  naturalActionDelayMs,
  type BotPolicy,
} from './policy.ts'
import type { BotObservation } from './observation.ts'
import type { Card } from '../types.ts'

function obsFacingBet(overrides: Partial<BotObservation> = {}): BotObservation {
  const hole: [Card, Card] = ['As', 'Kd']
  return {
    seatIndex: 0,
    holeCards: hole,
    board: ['2c', '7d', 'Th'],
    street: 'FLOP',
    seats: [
      { seatIndex: 0, stack: 900, committedThisStreet: 0, committedTotal: 100, status: 'active', inHand: true },
      { seatIndex: 1, stack: 800, committedThisStreet: 100, committedTotal: 200, status: 'active', inHand: true },
    ],
    buttonSeat: 0,
    bigBlind: 100,
    potTotal: 300,
    currentBet: 100,
    toCall: 100,
    minRaiseTo: 200,
    maxRaiseTo: 900,
    legal: [{ type: 'fold' }, { type: 'call', amount: 100 }, { type: 'raise', min: 200, max: 900 }],
    opponentsInHand: 1,
    actionHistory: [],
    ...overrides,
  }
}

test('safeFallbackDecision checks when free, folds when facing a bet', () => {
  const facing = obsFacingBet()
  assert.equal(safeFallbackDecision(facing).action.type, 'fold')
  const free = obsFacingBet({ toCall: 0, legal: [{ type: 'check' }, { type: 'bet', min: 100, max: 900 }] })
  assert.equal(safeFallbackDecision(free).action.type, 'check')
})

test('isDecisionLegal enforces bet/raise bounds and offered actions', () => {
  const obs = obsFacingBet()
  assert.ok(isDecisionLegal(obs, { type: 'call' }))
  assert.ok(isDecisionLegal(obs, { type: 'raise', to: 200 }))
  assert.ok(isDecisionLegal(obs, { type: 'raise', to: 900 }))
  assert.ok(!isDecisionLegal(obs, { type: 'raise', to: 199 })) // below min
  assert.ok(!isDecisionLegal(obs, { type: 'raise', to: 901 })) // above max
  assert.ok(!isDecisionLegal(obs, { type: 'raise', to: 250.5 })) // non-integer
  assert.ok(!isDecisionLegal(obs, { type: 'check' })) // not offered while facing a bet
})

test('decideSafely returns the policy decision when it is legal', () => {
  const policy: BotPolicy = () => ({ action: { type: 'call' } })
  const out = decideSafely(policy, obsFacingBet(), makeRng(1))
  assert.equal(out.kind, 'ok')
  assert.equal(out.decision.action.type, 'call')
})

test('decideSafely falls back (never throws) when the policy throws', () => {
  const boom: BotPolicy = () => {
    throw new Error('policy blew up')
  }
  const out = decideSafely(boom, obsFacingBet(), makeRng(1))
  assert.equal(out.kind, 'fallback')
  assert.equal(out.decision.action.type, 'fold') // facing a bet → safe fold
})

test('decideSafely corrects an illegal policy action to a safe action', () => {
  const cheat: BotPolicy = () => ({ action: { type: 'raise', to: 999999 } }) // above max
  const out = decideSafely(cheat, obsFacingBet(), makeRng(1))
  assert.equal(out.kind, 'fallback')
  assert.equal(out.reason, 'illegal')
})

test('decideSafely refuses an unclean observation (boundary violation)', () => {
  const tainted = { ...obsFacingBet(), holeBySeat: 'leak' } as unknown as BotObservation
  const out = decideSafely(() => ({ action: { type: 'call' } }), tainted, makeRng(1))
  assert.equal(out.kind, 'fallback')
  assert.equal(out.reason, 'unclean_observation')
})

test('botActionKey is deterministic and collapses duplicate submissions', () => {
  const a = botActionKey('hand-1', 3, 7)
  const b = botActionKey('hand-1', 3, 7)
  const c = botActionKey('hand-1', 3, 8) // different state version
  assert.equal(a, b)
  assert.notEqual(a, c)
})

test('botActionKey rejects malformed inputs', () => {
  assert.throws(() => botActionKey('h', -1, 0))
  assert.throws(() => botActionKey('h', 0, 1.5))
})

test('naturalActionDelayMs is bounded and deterministic given rng; simulation ignores it', () => {
  const obs = obsFacingBet()
  const d1 = naturalActionDelayMs(obs, { type: 'call' }, makeRng(9))
  const d2 = naturalActionDelayMs(obs, { type: 'call' }, makeRng(9))
  assert.equal(d1, d2)
  assert.ok(d1 >= 0 && d1 <= 6000)
})
