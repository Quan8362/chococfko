// Framework-free tests for pot, side-pot construction & settlement.
// Run with:  node --test lib/games/poker/pot.test.ts
//
// 🔴 Integer correctness. Maps to POT-UNCALLED-001, POT-MAIN-001, POT-SIDE-001/002,
// POT-ELIG-001, POT-INDEP-001, POT-SPLIT-001, POT-ODD-001, CONTRIB-FOLDED-001, POT-CONSERVE-001.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  detectUncalledRefund,
  buildPots,
  settlePots,
  totalContributed,
  isSettlementConserved,
  type SeatContribution,
} from './pot.ts'
import type { Payout } from './types.ts'
import { mulberry32 } from './deck.ts'

const contrib = (seatIndex: number, committed: number, folded = false): SeatContribution => ({
  seatIndex,
  committed,
  folded,
})

// score map → comparator for settlePots (higher wins).
const scorer = (map: Record<number, number>) => (seat: number) => map[seat] ?? -1

function paid(payouts: Payout[], seat: number): number {
  return payouts.find((p) => p.seatIndex === seat)?.amount ?? 0
}

// ── POT-MAIN-001: single main pot ────────────────────────────────────────────────────
test('POT-MAIN-001 main pot only — equal contributions, single pot', () => {
  const contribs = [contrib(0, 100), contrib(1, 100), contrib(2, 100)]
  const { pots, refund } = buildPots(contribs)
  assert.equal(refund, null)
  assert.equal(pots.length, 1)
  assert.equal(pots[0].amount, 300)
  assert.deepEqual(pots[0].eligibleSeatIndexes, [0, 1, 2])
  const payouts = settlePots(pots, scorer({ 0: 9, 1: 1, 2: 1 }), [1, 2, 0])
  assert.equal(paid(payouts, 0), 300)
  assert.ok(isSettlementConserved(contribs, payouts, refund))
})

// ── POT-SIDE-001: one side pot ───────────────────────────────────────────────────────
test('POT-SIDE-001 one side pot from a single short all-in', () => {
  const contribs = [contrib(0, 100), contrib(1, 300), contrib(2, 300)]
  const { pots } = buildPots(contribs)
  assert.equal(pots.length, 2)
  assert.equal(pots[0].amount, 300) // main: 100×3
  assert.deepEqual(pots[0].eligibleSeatIndexes, [0, 1, 2])
  assert.equal(pots[1].amount, 400) // side: 200×2
  assert.deepEqual(pots[1].eligibleSeatIndexes, [1, 2])
  assert.equal(totalContributed(contribs), 700)
})

// ── POT-SIDE-002: multiple side pots ─────────────────────────────────────────────────
test('POT-SIDE-002 multiple layered side pots from unequal all-ins', () => {
  const contribs = [contrib(0, 100), contrib(1, 200), contrib(2, 300), contrib(3, 300)]
  const { pots, refund } = buildPots(contribs)
  assert.equal(refund, null)
  assert.equal(pots.length, 3)
  assert.deepEqual(pots.map((p) => p.amount), [400, 300, 200]) // 100×4, 100×3, 100×2
  assert.deepEqual(pots[0].eligibleSeatIndexes, [0, 1, 2, 3])
  assert.deepEqual(pots[1].eligibleSeatIndexes, [1, 2, 3])
  assert.deepEqual(pots[2].eligibleSeatIndexes, [2, 3])
})

// ── CONTRIB-FOLDED-001 / POT-ELIG-001 ────────────────────────────────────────────────
test('CONTRIB-FOLDED-001 folded chips stay in the pot but the folder is ineligible', () => {
  const contribs = [contrib(0, 50, true), contrib(1, 200), contrib(2, 200)]
  const { pots } = buildPots(contribs)
  assert.equal(pots.length, 1) // folded layer merges (same eligible set)
  assert.equal(pots[0].amount, 450) // 50 dead money + 400
  assert.deepEqual(pots[0].eligibleSeatIndexes, [1, 2]) // folder excluded (POT-ELIG-001)
  assert.ok(!pots[0].eligibleSeatIndexes.includes(0))
})

// ── POT-INDEP-001: different winners for main and side pots ───────────────────────────
test('POT-INDEP-001 main and side pots can have different winners', () => {
  const contribs = [contrib(0, 100), contrib(1, 300), contrib(2, 300)]
  const { pots, refund } = buildPots(contribs)
  // seat 0 (all-in short) has the best hand → wins main; seat 1 best among the rest → side.
  const payouts = settlePots(pots, scorer({ 0: 9, 1: 5, 2: 1 }), [1, 2, 0])
  assert.equal(paid(payouts, 0), 300) // main only — ineligible for the side pot
  assert.equal(paid(payouts, 1), 400) // side pot
  assert.equal(paid(payouts, 2), 0)
  assert.ok(isSettlementConserved(contribs, payouts, refund))
})

// ── POT-SPLIT-001: split pots ────────────────────────────────────────────────────────
test('POT-SPLIT-001 split main pot between exact ties', () => {
  const contribs = [contrib(0, 100), contrib(1, 100)]
  const { pots } = buildPots(contribs)
  const payouts = settlePots(pots, scorer({ 0: 7, 1: 7 }), [1, 0])
  assert.equal(paid(payouts, 0), 100)
  assert.equal(paid(payouts, 1), 100)
})

test('POT-SPLIT-001 split a side pot between two tied eligible players', () => {
  const contribs = [contrib(0, 100), contrib(1, 300), contrib(2, 300)]
  const { pots } = buildPots(contribs)
  // seats 1 & 2 tie; seat 0 (eligible only for main) is beaten in the main.
  const payouts = settlePots(pots, scorer({ 0: 1, 1: 8, 2: 8 }), [1, 2, 0])
  // main 300 split between 1 & 2 → 150 each; side 400 split → 200 each.
  assert.equal(paid(payouts, 1), 350)
  assert.equal(paid(payouts, 2), 350)
  assert.equal(paid(payouts, 0), 0)
})

// ── POT-UNCALLED-001 ─────────────────────────────────────────────────────────────────
test('POT-UNCALLED-001 uncalled excess is refunded before any pot is awarded', () => {
  // seat 0 bets 300, seat 1 calls all-in for 100 and folds is impossible; model: seat1 100 folded.
  const contribs = [contrib(0, 300), contrib(1, 100, true)]
  const refund = detectUncalledRefund(contribs)
  assert.deepEqual(refund, { seatIndex: 0, amount: 200 })
  const built = buildPots(contribs)
  assert.deepEqual(built.refund, { seatIndex: 0, amount: 200 })
  // After refund, seat 0's effective contribution is capped at 100.
  const payouts = settlePots(built.pots, scorer({ 0: 9 }), [0, 1])
  assert.equal(paid(payouts, 0), 200) // the 100 dead from seat1 + own 100
  assert.ok(isSettlementConserved(contribs, payouts, built.refund))
})

test('POT-UNCALLED-001 no refund when the top contribution is matched', () => {
  assert.equal(detectUncalledRefund([contrib(0, 200), contrib(1, 200)]), null)
})

// ── POT-ODD-001 ──────────────────────────────────────────────────────────────────────
test('POT-ODD-001 odd chip goes to the earliest winner clockwise from the button', () => {
  const contribs = [contrib(0, 100), contrib(1, 100), contrib(2, 100)] // pot = 300... use 100 each→300
  const { pots } = buildPots(contribs)
  // Force a pot that does not divide evenly: 3-way tie on a 100-chip... build a 100 pot instead.
  const smallPot = [{ amount: 100, eligibleSeatIndexes: [0, 1, 2] }]
  // button = 0 → order from button is [1, 2, 0]; the odd chip goes to seat 1.
  const payouts = settlePots(smallPot, scorer({ 0: 5, 1: 5, 2: 5 }), [1, 2, 0])
  assert.equal(paid(payouts, 1), 34) // 33 + odd chip
  assert.equal(paid(payouts, 2), 33)
  assert.equal(paid(payouts, 0), 33)
  assert.equal(paid(payouts, 0) + paid(payouts, 1) + paid(payouts, 2), 100) // conserved, no suit used
  assert.equal(pots[0].amount, 300)
})

// ── Everyone all-in preflop ──────────────────────────────────────────────────────────
test('everyone all-in preflop with unequal stacks builds correct pots', () => {
  const contribs = [contrib(0, 200), contrib(1, 500), contrib(2, 500)]
  const { pots, refund } = buildPots(contribs)
  assert.equal(refund, null)
  assert.deepEqual(pots.map((p) => p.amount), [600, 600]) // 200×3, 300×2
  assert.deepEqual(pots[0].eligibleSeatIndexes, [0, 1, 2])
  assert.deepEqual(pots[1].eligibleSeatIndexes, [1, 2])
  const payouts = settlePots(pots, scorer({ 0: 1, 1: 9, 2: 2 }), [1, 2, 0])
  assert.equal(paid(payouts, 1), 1200)
  assert.ok(isSettlementConserved(contribs, payouts, refund))
})

// ── One player remaining after folds ─────────────────────────────────────────────────
test('one player remaining after folds wins all (with uncalled refund)', () => {
  const contribs = [contrib(0, 300), contrib(1, 100, true), contrib(2, 50, true)]
  const built = buildPots(contribs)
  assert.deepEqual(built.refund, { seatIndex: 0, amount: 200 }) // 300 − second-highest 100
  const payouts = settlePots(built.pots, scorer({ 0: 1 }), [0, 1, 2])
  assert.equal(paid(payouts, 0), 250) // 100 own + 100 (s1) + 50 (s2) dead money
  assert.ok(isSettlementConserved(contribs, payouts, built.refund))
})

// ── POT-CONSERVE-001 / COIN-INT-001: randomized conservation property test ───────────
test('POT-CONSERVE-001 randomized multiway settlements conserve coins exactly (integer)', () => {
  const rng = mulberry32(0xC0FFEE)
  const rint = (n: number) => Math.floor(rng() * n)
  for (let iter = 0; iter < 500; iter++) {
    const n = 2 + rint(5) // 2..6 seats
    // Decide who stays in (seat 0 always does). Real invariant: a folded player never commits
    // more than the highest amount a non-folded player matched, so a "dead" pot layer with no
    // eligible winner can never form.
    const folds: boolean[] = [false]
    for (let s = 1; s < n; s++) folds.push(rint(4) === 0)
    const liveCommitted: number[] = []
    for (let s = 0; s < n; s++) if (!folds[s]) liveCommitted.push(1 + rint(500))
    const maxLive = Math.max(...liveCommitted)
    const contribs: SeatContribution[] = []
    let liveIdx = 0
    for (let s = 0; s < n; s++) {
      const committed = folds[s] ? 1 + rint(maxLive) : liveCommitted[liveIdx++]
      contribs.push(contrib(s, committed, folds[s]))
    }

    const built = buildPots(contribs)
    const scores: Record<number, number> = {}
    for (let s = 0; s < n; s++) scores[s] = rint(100)
    const order = Array.from({ length: n }, (_, i) => i) // button at seat n-1 → order 0..n-1
    const payouts = settlePots(built.pots, scorer(scores), order)

    // Every payout is a non-negative integer.
    for (const p of payouts) {
      assert.ok(Number.isInteger(p.amount) && p.amount >= 0)
    }
    // Σ awards + Σ refunds == Σ contributions (POT-CONSERVE-001).
    assert.ok(
      isSettlementConserved(contribs, payouts, built.refund),
      `iter ${iter}: conservation failed`,
    )
    // Σ stack deltas == 0: chips paid in (contribs) equal chips returned (awards + refund).
    const totalOut =
      payouts.reduce((s, p) => s + p.amount, 0) + (built.refund?.amount ?? 0)
    assert.equal(totalOut, totalContributed(contribs))
  }
})
