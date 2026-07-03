import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aggregatePracticeOps, difficultyDistribution, type PracticeOpsSample } from './adminMetrics.ts'

const sample = (over: Partial<PracticeOpsSample>): PracticeOpsSample => ({
  tableId: 't1', difficulty: 'normal', acted: true, fallback: null, ineligible: null,
  staleRejected: false, timedOut: false, conservationFailure: false, ...over,
})

test('empty input yields zeroed metrics', () => {
  const m = aggregatePracticeOps([])
  assert.equal(m.totalSamples, 0)
  assert.equal(m.botActions, 0)
})

test('aggregates actions, fallbacks, stale, timeouts, conservation failures', () => {
  const m = aggregatePracticeOps([
    sample({ acted: true, difficulty: 'easy' }),
    sample({ acted: true, difficulty: 'normal' }),
    sample({ acted: false, fallback: 'threw' }),
    sample({ acted: true, staleRejected: true }),
    sample({ acted: false, timedOut: true }),
    sample({ acted: false, conservationFailure: true }),
  ])
  assert.equal(m.totalSamples, 6)
  assert.equal(m.botActions, 3)
  assert.equal(m.fallbacks, 1)
  assert.equal(m.staleRejections, 1)
  assert.equal(m.timeouts, 1)
  assert.equal(m.conservationFailures, 1)
  assert.equal(m.byDifficulty.easy, 1)
  assert.equal(m.byFallbackReason.threw, 1)
})

test('difficultyDistribution counts live seat difficulties', () => {
  assert.deepEqual(difficultyDistribution(['easy', 'easy', 'hard']), { easy: 2, hard: 1 })
})
