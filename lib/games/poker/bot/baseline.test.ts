import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runBaseline } from './baseline.ts'
import type { BenchScenario } from './seeds.ts'

// A deliberately tiny, fast grid so the test is bounded. The full baseline is generated via
// `npm run poker:bots:baseline` (docs/poker/bots/27c-a-baseline.md).
const TINY: readonly BenchScenario[] = [
  { label: 'hu-standard', seatCount: 2, stack: 'standard' },
  { label: '6max-short', seatCount: 6, stack: 'short' },
]

test('baseline runs, conserves, and produces integer stacks + per-difficulty metrics', () => {
  const r = runBaseline({
    group: 'calibration',
    seedCount: 2,
    handsPerRun: 40,
    bigBlind: 100,
    difficulties: ['simulation', 'easy'],
    includeMixed: false,
    scenarios: TINY,
  })
  assert.equal(r.integrity.conserved, true)
  assert.equal(r.integrity.totalDefects, 0)
  assert.equal(r.integrity.negativeStacks, 0)
  assert.equal(r.integrity.fractionalStacks, 0)
  assert.ok(r.totalHands > 0)
  // Both difficulties should appear in the aggregated behavioural metrics.
  const diffs = new Set(r.perDifficulty.map((m) => m.difficulty))
  assert.ok(diffs.has('simulation') && diffs.has('easy'))
  // seedsUsed reports the ACTUAL seeds (from the calibration group), not a plan.
  assert.equal(r.seedsUsed.length, 2)
})

test('baseline is reproducible: same options ⇒ identical report', () => {
  const opts = {
    group: 'calibration' as const,
    seedCount: 2,
    handsPerRun: 30,
    bigBlind: 100,
    difficulties: ['simulation' as const],
    includeMixed: false,
    scenarios: TINY,
  }
  const a = runBaseline(opts)
  const b = runBaseline(opts)
  assert.deepEqual(a, b)
})

test('baseline uses only its named seed group (calibration ≠ validation)', () => {
  const base = {
    seedCount: 2,
    handsPerRun: 20,
    bigBlind: 100,
    difficulties: ['simulation' as const],
    includeMixed: false,
    scenarios: TINY,
  }
  const cal = runBaseline({ ...base, group: 'calibration' })
  const val = runBaseline({ ...base, group: 'validation' })
  assert.notDeepEqual(cal.seedsUsed, val.seedsUsed)
})
