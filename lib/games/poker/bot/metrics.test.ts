import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createPolicyMetrics,
  recordHand,
  finalizePolicyMetrics,
  SIZING_BUCKETS,
  type HandMetricsInput,
} from './metrics.ts'
import { runBotSimulation, type BotSimConfig } from './sim.ts'
import type { PublicActionEntry } from './observation.ts'

// A tiny hand-crafted history so the arithmetic is checkable by hand.
function entry(seatIndex: number, street: PublicActionEntry['street'], type: PublicActionEntry['type'], addedChips: number, to?: number): PublicActionEntry {
  return { seatIndex, street, type, addedChips, ...(to !== undefined ? { to } : {}) }
}

test('VPIP/PFR/3bet are attributed per hand from the public preflop history', () => {
  const acc = createPolicyMetrics()
  const seatDifficulty = new Map([[0, 'normal' as const], [1, 'normal' as const]])
  // Seat 0 raises (PFR+VPIP), seat 1 re-raises (PFR+VPIP+3bet), seat 0 calls.
  const input: HandMetricsInput = {
    history: [
      entry(0, 'PREFLOP', 'raise', 300, 300),
      entry(1, 'PREFLOP', 'raise', 900, 900),
      entry(0, 'PREFLOP', 'call', 600),
    ],
    seatDifficulty,
    stackDeltas: new Map([[0, -900], [1, 900]]),
    wentToShowdown: false,
    smallBlind: 50,
    bigBlind: 100,
  }
  recordHand(acc, input)
  const [m] = finalizePolicyMetrics(acc)
  assert.equal(m.difficulty, 'normal')
  assert.equal(m.handsDealtIn, 2)
  assert.equal(m.vpipPct, 100) // both seats voluntarily invested preflop
  assert.equal(m.pfrPct, 100) // both raised
  assert.equal(m.threeBetPct, 50) // only seat 1 made the 2nd aggressive action
})

test('a preflop check/fold is NOT counted as VPIP', () => {
  const acc = createPolicyMetrics()
  const seatDifficulty = new Map([[0, 'easy' as const], [1, 'easy' as const]])
  recordHand(acc, {
    history: [entry(0, 'PREFLOP', 'fold', 0), entry(1, 'PREFLOP', 'check', 0)],
    seatDifficulty,
    stackDeltas: new Map([[0, 0], [1, 0]]),
    wentToShowdown: false,
    smallBlind: 50,
    bigBlind: 100,
  })
  const [m] = finalizePolicyMetrics(acc)
  assert.equal(m.vpipPct, 0)
  assert.equal(m.pfrPct, 0)
})

test('showdown win-rate counts only seats that reached showdown', () => {
  const acc = createPolicyMetrics()
  const seatDifficulty = new Map([[0, 'hard' as const], [1, 'hard' as const], [2, 'hard' as const]])
  recordHand(acc, {
    history: [
      entry(2, 'PREFLOP', 'fold', 0), // seat 2 folds — not a showdown participant
      entry(0, 'RIVER', 'check', 0),
      entry(1, 'RIVER', 'check', 0),
    ],
    seatDifficulty,
    stackDeltas: new Map([[0, 500], [1, -500], [2, 0]]),
    wentToShowdown: true,
    smallBlind: 50,
    bigBlind: 100,
  })
  const [m] = finalizePolicyMetrics(acc)
  // 2 of 3 seats reached showdown; 1 of those 2 finished with a positive delta.
  assert.equal(m.showdownPct, Math.round((2 / 3) * 10000) / 100)
  assert.equal(m.showdownWinPct, 50)
})

test('action mix shares sum to ~1 and sizing buckets are the declared set', () => {
  const acc = createPolicyMetrics()
  const seatDifficulty = new Map([[0, 'normal' as const]])
  recordHand(acc, {
    history: [entry(0, 'PREFLOP', 'bet', 200, 200), entry(0, 'FLOP', 'check', 0)],
    seatDifficulty,
    stackDeltas: new Map([[0, 0]]),
    wentToShowdown: false,
    smallBlind: 50,
    bigBlind: 100,
  })
  const [m] = finalizePolicyMetrics(acc)
  const sum = Object.values(m.actionMix).reduce((s, v) => s + v, 0)
  assert.ok(Math.abs(sum - 1) < 1e-9, `action mix shares sum to ${sum}`)
  assert.deepEqual(Object.keys(m.sizingMix).sort(), [...SIZING_BUCKETS].sort())
})

test('metrics are reproducible: same sim seed ⇒ identical metrics', () => {
  const config: BotSimConfig = { seatCount: 6, startingStack: 20000, bigBlind: 100, hands: 200, difficulties: 'normal' }
  const a = runBotSimulation(config, 4242)
  const b = runBotSimulation(config, 4242)
  assert.deepEqual(a.metrics, b.metrics)
  assert.ok(a.metrics.length >= 1)
})

test('every reported percentage is within [0,100]', () => {
  const r = runBotSimulation(
    { seatCount: 4, startingStack: 20000, bigBlind: 100, hands: 300, difficulties: ['hard', 'normal', 'easy', 'simulation'] },
    9,
  )
  for (const m of r.metrics) {
    for (const v of [m.vpipPct, m.pfrPct, m.threeBetPct, m.allInHandPct, m.showdownPct, m.showdownWinPct]) {
      assert.ok(v >= 0 && v <= 100, `${m.difficulty}: ${v} out of range`)
    }
    assert.ok(m.topActionShare >= 0 && m.topActionShare <= 1)
  }
})
