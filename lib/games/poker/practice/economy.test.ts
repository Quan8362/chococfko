import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyPracticePayouts,
  isPracticeSettlementConserved,
  practiceSupply,
  assertPracticeChips,
} from './economy.ts'
import type { Payout } from '../types.ts'

test('CASE 22 — practice chips stay integer and settlement conserves exactly', () => {
  const chips = { 0: 1000, 1: 2000, 2: 500 }
  const contributed = { 0: 300, 1: 300, 2: 300 }
  const payouts: Payout[] = [{ seatIndex: 1, amount: 900 }] // seat 1 wins the 900 pot
  const next = applyPracticePayouts(chips, contributed, payouts, null)
  // Winner credited; everyone still integer.
  assert.equal(next[1], 2900)
  for (const v of Object.values(next)) assert.ok(Number.isInteger(v))
  assert.ok(isPracticeSettlementConserved([300, 300, 300], payouts, null))
})

test('uncalled refund conserves', () => {
  const payouts: Payout[] = [{ seatIndex: 0, amount: 200 }]
  const refund = { seatIndex: 0, amount: 100 }
  // contributed 300 total, 200 awarded + 100 refunded = 300.
  assert.ok(isPracticeSettlementConserved([200, 100], payouts, refund))
})

test('a non-conserving settlement is detected', () => {
  const payouts: Payout[] = [{ seatIndex: 0, amount: 999 }]
  assert.equal(isPracticeSettlementConserved([300, 300, 300], payouts, null), false)
})

test('practiceSupply sums all isolated stacks', () => {
  assert.equal(practiceSupply({ 0: 10, 1: 20, 2: 30 }), 60)
})

test('the economy rejects a non-integer chip amount (no floats, ever)', () => {
  assert.throws(() => assertPracticeChips(10.5))
  assert.throws(() => assertPracticeChips(-1))
  assert.doesNotThrow(() => assertPracticeChips(0))
  assert.doesNotThrow(() => assertPracticeChips(1_000_000))
})
