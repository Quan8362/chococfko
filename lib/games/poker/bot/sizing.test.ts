import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Card } from '../types.ts'
import type { LegalAction } from '../betting.ts'
import type { BotObservation } from './observation.ts'
import {
  clampTo,
  aggressiveToAmount,
  betPotFraction,
  raisePotFraction,
  raiseToChips,
  passiveContinue,
  checkOrFold,
} from './sizing.ts'

// Minimal observation factory — sizing reads only legal/currentBet/potTotal/toCall, but we fill a
// complete, valid BotObservation so the type (and any future field read) stays honest.
function obs(over: Partial<BotObservation> & { legal: readonly LegalAction[] }): BotObservation {
  return {
    seatIndex: 0,
    holeCards: ['As', 'Kd'] as [Card, Card],
    board: [],
    street: 'PREFLOP',
    seats: [
      { seatIndex: 0, stack: 10000, committedThisStreet: 0, committedTotal: 0, status: 'active', inHand: true },
      { seatIndex: 1, stack: 10000, committedThisStreet: 0, committedTotal: 0, status: 'active', inHand: true },
    ],
    buttonSeat: 0,
    bigBlind: 100,
    potTotal: 0,
    currentBet: 0,
    toCall: 0,
    minRaiseTo: 0,
    maxRaiseTo: 0,
    opponentsInHand: 1,
    actionHistory: [],
    ...over,
  }
}

test('clampTo rounds to an integer inside the band', () => {
  assert.equal(clampTo(150.6, 100, 400), 151)
  assert.equal(clampTo(50, 100, 400), 100) // below min → min
  assert.equal(clampTo(900, 100, 400), 400) // above max → max
  assert.ok(Number.isInteger(clampTo(233.33, 100, 400)))
})

test('betPotFraction: opening bet is an integer raise-TO in the legal band', () => {
  const o = obs({ potTotal: 300, currentBet: 0, toCall: 0, legal: [{ type: 'check' }, { type: 'bet', min: 100, max: 5000 }, { type: 'all_in', amount: 10000 }] })
  const a = betPotFraction(o, 0.66)
  assert.ok(a && a.type === 'bet')
  if (a.type === 'bet') {
    assert.equal(a.to, 198) // round(300 * 0.66)
    assert.ok(Number.isInteger(a.to) && a.to >= 100 && a.to <= 5000)
  }
})

test('raisePotFraction: RAISE-TO, not raise-BY (adds a pot fraction on top of the call)', () => {
  // currentBet 300, we owe 300, pot already 500. A pot-sized raise adds (500+300)=800 on top of the
  // matched 300 → raise-TO = 300 + 800 = 1100 (a "raise-to", never a "raise-by" of 800).
  const o = obs({ potTotal: 500, currentBet: 300, toCall: 300, legal: [{ type: 'fold' }, { type: 'call', amount: 300 }, { type: 'raise', min: 600, max: 10000 }] })
  const a = raisePotFraction(o, 1.0)
  assert.ok(a && a.type === 'raise')
  if (a.type === 'raise') {
    assert.equal(a.to, 1100)
    assert.ok(a.to >= 600 && a.to <= 10000)
  }
})

test('raise clamps up to the legal minimum and never below', () => {
  const o = obs({ potTotal: 500, currentBet: 300, toCall: 300, legal: [{ type: 'fold' }, { type: 'call', amount: 300 }, { type: 'raise', min: 600, max: 10000 }] })
  const tiny = raisePotFraction(o, 0.01) // would be ~308, below the 600 min
  assert.ok(tiny && tiny.type === 'raise')
  if (tiny.type === 'raise') assert.equal(tiny.to, 600)
})

test('raise clamps down to max (never above the seat stack)', () => {
  const o = obs({ potTotal: 500, currentBet: 300, toCall: 300, legal: [{ type: 'fold' }, { type: 'call', amount: 300 }, { type: 'raise', min: 600, max: 900 }] })
  const big = raisePotFraction(o, 5.0)
  assert.ok(big && big.type === 'raise')
  if (big.type === 'raise') assert.equal(big.to, 900)
})

test('falls back to all-in when raising is closed but shoving is legal', () => {
  const o = obs({ potTotal: 500, currentBet: 300, toCall: 300, legal: [{ type: 'fold' }, { type: 'call', amount: 300 }, { type: 'all_in', amount: 800 }] })
  const a = raisePotFraction(o, 1.0)
  assert.deepEqual(a, { type: 'all_in' })
})

test('returns null when no aggressive action is legal (caller falls back safely)', () => {
  const o = obs({ potTotal: 500, currentBet: 300, toCall: 300, legal: [{ type: 'fold' }, { type: 'call', amount: 300 }] })
  assert.equal(raisePotFraction(o, 1.0), null)
  assert.equal(aggressiveToAmount(o, 1200), null)
})

test('raiseToChips prefers a raise, else a bet, and clamps', () => {
  const openBet = obs({ potTotal: 150, currentBet: 0, toCall: 0, legal: [{ type: 'check' }, { type: 'bet', min: 100, max: 9000 }] })
  const a = raiseToChips(openBet, 250)
  assert.deepEqual(a, { type: 'bet', to: 250 })

  const reRaise = obs({ potTotal: 900, currentBet: 300, toCall: 300, legal: [{ type: 'fold' }, { type: 'call', amount: 300 }, { type: 'raise', min: 600, max: 9000 }] })
  const b = raiseToChips(reRaise, 500) // below min 600 → clamps up
  assert.deepEqual(b, { type: 'raise', to: 600 })
})

test('passiveContinue / checkOrFold always return a legal action', () => {
  const facing = obs({ toCall: 200, legal: [{ type: 'fold' }, { type: 'call', amount: 200 }] })
  assert.deepEqual(passiveContinue(facing), { type: 'call' })
  assert.deepEqual(checkOrFold(facing), { type: 'fold' })

  const free = obs({ toCall: 0, legal: [{ type: 'check' }, { type: 'bet', min: 100, max: 900 }] })
  assert.deepEqual(passiveContinue(free), { type: 'check' })
  assert.deepEqual(checkOrFold(free), { type: 'check' })
})

test('every produced amount is a positive integer within the stack', () => {
  const o = obs({ potTotal: 777, currentBet: 111, toCall: 111, legal: [{ type: 'fold' }, { type: 'call', amount: 111 }, { type: 'raise', min: 222, max: 5555 }] })
  for (const f of [0.1, 0.33, 0.5, 0.66, 1, 2, 10]) {
    const a = raisePotFraction(o, f)
    assert.ok(a)
    if (a && a.type === 'raise') {
      assert.ok(Number.isInteger(a.to) && a.to > 0 && a.to >= 222 && a.to <= 5555)
    }
  }
})
