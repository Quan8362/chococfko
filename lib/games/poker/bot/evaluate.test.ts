import { test } from 'node:test'
import assert from 'node:assert/strict'

import { BENCHMARK_IDS, benchmarkFor } from './benchmarks.ts'
import { policyFor } from './policies.ts'
import {
  runEvalSession,
  evaluateMatchup,
  winrateStats,
  type SeatPolicy,
} from './evaluate.ts'
import { SEED_GROUPS } from './seeds.ts'

// 27C-C EVALUATION HARNESS tests — prove the validation tooling is itself trustworthy: benchmark
// opponents are legal-by-construction, the session conserves + cross-checks the canonical engine,
// metrics attribute ONLY to the labelled bot-under-test seat, seeded replay is deterministic, and the
// cross-seed CI math is correct. NONE of this touches the frozen strategy or the holdout seeds.

test('every benchmark opponent produces only LEGAL actions (0 forced fallbacks)', () => {
  // Benchmark copies at every seat, across seat counts + stacks, must never force a safe fallback —
  // that is the signal a policy returned an illegal/garbage action. A clean 0 proves legality.
  for (const id of BENCHMARK_IDS) {
    for (const seatCount of [2, 3, 6]) {
      const seats: SeatPolicy[] = Array.from({ length: seatCount }, (_, i) => ({
        seatIndex: i,
        policy: benchmarkFor(id),
      }))
      const r = runEvalSession(seats, { startingStack: 6000, bigBlind: 100, hands: 120 }, 12345)
      assert.equal(r.integrity.fallbacks, 0, `benchmark "${id}" @${seatCount}p forced ${r.integrity.fallbacks} fallbacks`)
      assert.equal(r.integrity.conserved, true, `benchmark "${id}" @${seatCount}p did not conserve`)
      assert.equal(r.integrity.defects, 0, `benchmark "${id}" @${seatCount}p produced defects`)
      assert.equal(r.integrity.negativeStacks, 0)
      assert.equal(r.integrity.fractionalStacks, 0)
      assert.equal(r.integrity.stuckHands, 0)
      assert.equal(r.integrity.canonicalMismatches, 0)
    }
  }
})

test('the skill bots vs benchmarks conserve, cross-check the engine, and never go stuck', () => {
  const seeds = SEED_GROUPS.validation.slice(0, 3)
  for (const difficulty of ['easy', 'normal', 'hard'] as const) {
    for (const benchmark of BENCHMARK_IDS) {
      const m = evaluateMatchup(difficulty, benchmark, { seatCount: 2, stack: 'standard' }, seeds, 60, 100)
      assert.equal(m.integrity.conserved, true, `${difficulty} vs ${benchmark}: not conserved`)
      assert.equal(m.integrity.defects, 0, `${difficulty} vs ${benchmark}: defects`)
      assert.equal(m.integrity.canonicalMismatches, 0, `${difficulty} vs ${benchmark}: canonical mismatch`)
      assert.equal(m.integrity.stuckHands, 0, `${difficulty} vs ${benchmark}: stuck`)
      assert.equal(m.integrity.negativeStacks, 0)
      assert.equal(m.integrity.fractionalStacks, 0)
    }
  }
})

test('metrics attribute ONLY to the labelled bot-under-test seat, never to benchmark seats', () => {
  const seats: SeatPolicy[] = [
    { seatIndex: 0, policy: policyFor('normal'), label: 'normal' },
    { seatIndex: 1, policy: benchmarkFor('aggressive') },
  ]
  const r = runEvalSession(seats, { startingStack: 10000, bigBlind: 100, hands: 200 }, 777)
  // Exactly one difficulty (the labelled one) appears in the metrics; the benchmark contributes none.
  assert.equal(r.metrics.length, 1)
  assert.equal(r.metrics[0].difficulty, 'normal')
  assert.ok(r.metrics[0].handsDealtIn > 0)
})

test('seeded replay is bit-for-bit identical (harness determinism)', () => {
  const seats: SeatPolicy[] = [
    { seatIndex: 0, policy: policyFor('hard'), label: 'hard' },
    { seatIndex: 1, policy: benchmarkFor('random') },
  ]
  const a = runEvalSession(seats, { startingStack: 10000, bigBlind: 100, hands: 150 }, 999)
  const b = runEvalSession(seats, { startingStack: 10000, bigBlind: 100, hands: 150 }, 999)
  assert.equal(a.underTestBbPer100, b.underTestBbPer100)
  assert.equal(a.handsPlayed, b.handsPlayed)
  assert.deepEqual(a.metrics, b.metrics)
})

test('winrateStats: mean / sd / CI are correct and detect a decisive edge', () => {
  const s = winrateStats([100, 102, 98, 101, 99])
  assert.equal(s.seeds, 5)
  assert.equal(s.mean, 100)
  assert.ok(s.sd > 0 && s.sd < 3)
  assert.ok(s.ci95Lo > 0 && s.beatsZero, 'a tight positive sample must beat zero')

  // A sample straddling zero must NOT claim to beat the benchmark.
  const straddle = winrateStats([-500, 600, -300, 400, 50])
  assert.equal(straddle.beatsZero, false)

  // Degenerate inputs never throw.
  assert.equal(winrateStats([]).seeds, 0)
  assert.equal(winrateStats([42]).mean, 42)
})
