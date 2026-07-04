import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeRng } from '../../tlmn/ai/seededRandom.ts'
import { estimateEquity } from './equity.ts'
import { decideSafely, type BotPolicy } from './policy.ts'
import { policyFor } from './policies.ts'
import { buildObservation } from './observation.ts'
import type { Card } from '../types.ts'

const H = (a: string, b: string): [Card, Card] => [a as Card, b as Card]
const B = (...cs: string[]) => cs as Card[]

test('backward compatible: no options ⇒ runs exactly `samples` (bit-for-bit legacy behaviour)', () => {
  const e = estimateEquity(H('As', 'Ah'), B('7h', '2d', '9c'), 2, 300, makeRng(11))
  assert.equal(e.samples, 300) // never early-stops without opts
})

test('bounded early stop: takes fewer samples but stays close to the full estimate', () => {
  const full = estimateEquity(H('Kd', 'Qd'), B('Jd', '4c', '9h'), 2, 4000, makeRng(7)).equity
  const bounded = estimateEquity(H('Kd', 'Qd'), B('Jd', '4c', '9h'), 2, 4000, makeRng(7), { earlyStop: true, minSamples: 64, ciTarget: 0.02 })
  assert.ok(bounded.samples >= 64, 'never stops before the floor')
  assert.ok(bounded.samples <= 4000, 'never exceeds the cap')
  assert.ok(bounded.samples < 4000, 'early stop actually engaged on a tight estimate')
  assert.ok(Math.abs(bounded.equity - full) < 0.06, `bounded ${bounded.equity} vs full ${full} within tolerance`)
})

test('early stop is deterministic (same seed ⇒ same stop point + estimate)', () => {
  const a = estimateEquity(H('9s', '8s'), B('7h', '2d', 'Kc'), 3, 2000, makeRng(3), { earlyStop: true })
  const b = estimateEquity(H('9s', '8s'), B('7h', '2d', 'Kc'), 3, 2000, makeRng(3), { earlyStop: true })
  assert.deepEqual(a, b)
})

test('equity stays within [0,1] under early stop across opponent counts', () => {
  for (let opp = 1; opp <= 5; opp++) {
    const e = estimateEquity(H('As', 'Ks'), B('Th', '5s', '2d'), opp, 1000, makeRng(opp), { earlyStop: true })
    assert.ok(e.equity >= 0 && e.equity <= 1)
    assert.ok(e.samples >= 1 && e.samples <= 1000)
  }
})

test('safe fallback: a throwing policy degrades to a legal action (never crashes the table)', () => {
  const thrower: BotPolicy = () => {
    throw new Error('boom')
  }
  const obs = buildObservation({
    seatIndex: 0,
    holeCards: H('As', 'Kd'),
    fullBoard: [],
    street: 'PREFLOP',
    seats: [
      { seatIndex: 0, stack: 9900, committedThisStreet: 100, committedTotal: 100, status: 'active', inHand: true },
      { seatIndex: 1, stack: 9900, committedThisStreet: 100, committedTotal: 100, status: 'active', inHand: true },
    ],
    buttonSeat: 0,
    bigBlind: 100,
    currentBet: 100,
    toCall: 0,
    minRaiseTo: 200,
    maxRaiseTo: 10000,
    legal: [{ type: 'check' }, { type: 'raise', min: 200, max: 10000 }],
    actionHistory: [],
  })
  const out = decideSafely(thrower, obs, makeRng(1))
  assert.equal(out.kind, 'fallback')
  assert.equal(out.decision.action.type, 'check') // check is free ⇒ the safe fallback
})

test('the real skill policies force zero fallbacks on a clean observation', () => {
  const obs = buildObservation({
    seatIndex: 0,
    holeCards: H('As', 'Kd'),
    fullBoard: B('Ah', '7d', '2c'),
    street: 'FLOP',
    seats: [
      { seatIndex: 0, stack: 4900, committedThisStreet: 0, committedTotal: 100, status: 'active', inHand: true },
      { seatIndex: 1, stack: 4900, committedThisStreet: 0, committedTotal: 100, status: 'active', inHand: true },
    ],
    buttonSeat: 0,
    bigBlind: 100,
    currentBet: 0,
    toCall: 0,
    minRaiseTo: 100,
    maxRaiseTo: 4900,
    legal: [{ type: 'check' }, { type: 'bet', min: 100, max: 4900 }],
    actionHistory: [],
  })
  for (const d of ['easy', 'normal', 'hard'] as const) {
    const out = decideSafely(policyFor(d), obs, makeRng(2))
    assert.equal(out.kind, 'ok', `${d} produced a fallback on a clean observation`)
  }
})
