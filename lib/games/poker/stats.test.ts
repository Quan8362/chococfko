// Framework-free tests for player statistics derivation.
// Run with:  node --test lib/games/poker/stats.test.ts
//
// 🔴 Reproduces the exact Cowork retest scenario (Prompt 24E, Issue 2): two players, 8,000 total
// table chips, both buy in 4,000; Player A ends 200 (net −3,800), Player B ends 7,800 (net
// +3,800). A +100 fold win must NOT be "break-even"; a showdown hand must count exactly once —
// even when the seat mucks. Maps to POT-UNCALLED-001, SHOWDOWN-MUCK-001, COIN-INT-001.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  seatHandOutcome,
  aggregatePokerStats,
  seatPayoutAmount,
  type SeatPayout,
  type HandForStats,
} from './stats.ts'
import type { SeatContribution } from './pot.ts'
import { isSettlementConserved } from './pot.ts'

const contrib = (seatIndex: number, committed: number, folded = false): SeatContribution => ({
  seatIndex,
  committed,
  folded,
})
const pay = (seatIndex: number, amount: number): SeatPayout => ({ seatIndex, amount })

// ── The three hands that make up the Cowork session (seat 0 = Player A, seat 1 = Player B) ──
// Hand 1: A over-bets, B folds → A wins the called pot AND gets the uncalled excess back.
const HAND1_CONTRIBS = [contrib(0, 200), contrib(1, 100, true)]
const HAND1_PAYOUTS = [pay(0, 200)] // main pot (2×100); A's 100 excess is refunded, not in payouts
// Hand 2: both to showdown, B wins.
const HAND2_CONTRIBS = [contrib(0, 2000), contrib(1, 2000)]
const HAND2_PAYOUTS = [pay(1, 4000)]
// Hand 3: A commits then folds; B takes it.
const HAND3_CONTRIBS = [contrib(0, 1900, true), contrib(1, 1900)]
const HAND3_PAYOUTS = [pay(1, 3800)]

test('fold win with an uncalled over-bet is a WIN (+100), never break-even', () => {
  const o = seatHandOutcome(HAND1_CONTRIBS, HAND1_PAYOUTS, 0)
  assert.equal(o.contributed, 200)
  assert.equal(o.payout, 200)
  assert.equal(o.refund, 100) // POT-UNCALLED-001 excess returned to seat 0
  assert.equal(o.net, 100) // payout + refund − committed = 200 + 100 − 200
  assert.equal(o.result, 'won')
  assert.equal(o.wentToShowdown, false)
  assert.equal(o.reachedShowdown, false)
  assert.equal(o.wonWithoutShowdown, true)
})

test('showdown hand counts for a contender that loses (and would muck)', () => {
  // Seat 0 reaches showdown and loses; its cards would be mucked (absent from `reveal`), but it
  // still reached showdown exactly once. seatHandOutcome derives this from fold state, not reveal.
  const a = seatHandOutcome(HAND2_CONTRIBS, HAND2_PAYOUTS, 0)
  assert.equal(a.reachedShowdown, true)
  assert.equal(a.wonHand, false)
  assert.equal(a.net, -2000)
  const b = seatHandOutcome(HAND2_CONTRIBS, HAND2_PAYOUTS, 1)
  assert.equal(b.reachedShowdown, true)
  assert.equal(b.net, 2000)
})

test('a folded seat never reached showdown', () => {
  const o = seatHandOutcome(HAND3_CONTRIBS, HAND3_PAYOUTS, 0)
  assert.equal(o.folded, true)
  assert.equal(o.reachedShowdown, false)
  assert.equal(o.net, -1900)
})

test('Cowork aggregate: Player A net = −3,800 with correct win/showdown counts', () => {
  const aHands: HandForStats[] = [
    { contribs: HAND1_CONTRIBS, payouts: HAND1_PAYOUTS, seat: 0 },
    { contribs: HAND2_CONTRIBS, payouts: HAND2_PAYOUTS, seat: 0 },
    { contribs: HAND3_CONTRIBS, payouts: HAND3_PAYOUTS, seat: 0 },
  ]
  const a = aggregatePokerStats(aHands)
  assert.equal(a.handsPlayed, 3)
  assert.equal(a.netChange, -3800) // NOT −3,900: the +100 refund is included
  assert.equal(a.handsWon, 1) // only the fold-win hand
  assert.equal(a.showdownsReached, 1) // exactly once (hand 2), even though A would muck
  assert.equal(a.showdownsWon, 0)
  assert.equal(a.biggestPotWon, 200)
})

test('Cowork aggregate is zero-sum: Player B net = +3,800 (8,000 chips conserved)', () => {
  const bHands: HandForStats[] = [
    { contribs: HAND1_CONTRIBS, payouts: HAND1_PAYOUTS, seat: 1 },
    { contribs: HAND2_CONTRIBS, payouts: HAND2_PAYOUTS, seat: 1 },
    { contribs: HAND3_CONTRIBS, payouts: HAND3_PAYOUTS, seat: 1 },
  ]
  const b = aggregatePokerStats(bHands)
  assert.equal(b.netChange, 3800)
  // Final stacks: A = 4000 − 3800 = 200; B = 4000 + 3800 = 7800; total = 8000.
  assert.equal(4000 - 3800, 200)
  assert.equal(4000 + 3800, 7800)
})

test('every Cowork hand conserves coins (Σ payouts + Σ refund == Σ contributed)', () => {
  const cases: [SeatContribution[], SeatPayout[]][] = [
    [HAND1_CONTRIBS, HAND1_PAYOUTS],
    [HAND2_CONTRIBS, HAND2_PAYOUTS],
    [HAND3_CONTRIBS, HAND3_PAYOUTS],
  ]
  for (const [contribs, payouts] of cases) {
    // Reconstruct the refund the same way settlement did and assert exact conservation.
    const o0 = seatHandOutcome(contribs, payouts, 0)
    const o1 = seatHandOutcome(contribs, payouts, 1)
    const refundSeat = o0.refund > 0 ? { seatIndex: 0, amount: o0.refund } : o1.refund > 0 ? { seatIndex: 1, amount: o1.refund } : null
    assert.equal(
      isSettlementConserved(contribs, payouts, refundSeat),
      true,
    )
    // Per-hand net is zero-sum across the two seats.
    assert.equal(o0.net + o1.net, 0)
  }
})

test('net is integer-only', () => {
  for (const seat of [0, 1]) {
    for (const [c, p] of [[HAND1_CONTRIBS, HAND1_PAYOUTS], [HAND2_CONTRIBS, HAND2_PAYOUTS], [HAND3_CONTRIBS, HAND3_PAYOUTS]] as const) {
      const o = seatHandOutcome(c, p, seat)
      assert.equal(Number.isInteger(o.net), true)
      assert.equal(Number.isInteger(o.refund), true)
      assert.equal(Number.isInteger(o.payout), true)
    }
  }
})

test('split-pot seat sums awards from multiple pots', () => {
  // A wins main + a side pot in the same hand.
  assert.equal(seatPayoutAmount([pay(0, 300), pay(2, 50), pay(0, 120)], 0), 420)
})

test('degrade-safe: missing engine contribs falls back to payout + reveal seats', () => {
  const hands: HandForStats[] = [
    { contribs: null, payouts: [pay(0, 500)], seat: 0, revealSeats: [0, 1] },
    { contribs: null, payouts: [pay(1, 100)], seat: 0, revealSeats: [] },
  ]
  const agg = aggregatePokerStats(hands)
  assert.equal(agg.handsPlayed, 2)
  assert.equal(agg.handsWon, 1)
  assert.equal(agg.netChange, 500) // contribution unknown → payout only
  assert.equal(agg.showdownsReached, 1) // first hand: seat 0 in reveal
  assert.equal(agg.showdownsWon, 1)
})
