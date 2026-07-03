import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  prizePool,
  collectedFees,
  overlay,
  resolvePaidWeights,
  paidPlacesCount,
  splitByWeights,
  projectedPayouts,
} from './prizePool.ts'
import { TEMPLATE_STT_6MAX, TEMPLATE_MTT, PAYOUTS_STANDARD } from './config.ts'
import type { TournamentConfig } from './types.ts'
import { makePRNG } from './balancing.ts'

test('TNMT-PAY-010 prize pool = fees (no rake), lifted to guarantee', () => {
  assert.equal(collectedFees(TEMPLATE_STT_6MAX, 6), 6000)
  assert.equal(prizePool(TEMPLATE_STT_6MAX, 6), 6000)
  const guaranteed: TournamentConfig = { ...TEMPLATE_MTT, guaranteedPrizePool: 1_000_000 }
  assert.equal(prizePool(guaranteed, 10), 1_000_000) // 10*1000 = 10k < guarantee
  assert.equal(overlay(guaranteed, 10), 990_000)
  assert.equal(overlay(TEMPLATE_STT_6MAX, 6), 0)
})

test('TNMT-PAY-022 resolvePaidWeights picks highest matching tier', () => {
  assert.deepEqual(resolvePaidWeights(PAYOUTS_STANDARD, 2), [100])
  assert.deepEqual(resolvePaidWeights(PAYOUTS_STANDARD, 6), [65, 35])
  assert.deepEqual(resolvePaidWeights(PAYOUTS_STANDARD, 12), [50, 30, 20])
  assert.deepEqual(resolvePaidWeights(PAYOUTS_STANDARD, 100), [30, 20, 14, 11, 9, 8, 8])
  assert.equal(paidPlacesCount(PAYOUTS_STANDARD, 20), 4)
})

test('never pays more places than players', () => {
  // 3 players but the 10+ tier pays 3 — capped at field size anyway; use a small field.
  const w = resolvePaidWeights(PAYOUTS_STANDARD, 2)
  assert.equal(w.length, 1)
})

test('TNMT-PAY-024 splitByWeights conserves + remainder to top place', () => {
  // pool 6000, weights [65,35] → 3900 / 2100, exact.
  assert.deepEqual(splitByWeights(6000, [65, 35]), [3900, 2100])
  // pool that does not divide evenly: 10, weights [1,1,1] → 4,3,3 (remainder to top)
  assert.deepEqual(splitByWeights(10, [1, 1, 1]), [4, 3, 3])
  // conservation across a fuzz of pools + weights
  const rng = makePRNG('prize-fuzz')
  for (let i = 0; i < 500; i++) {
    const pool = Math.floor(rng() * 1_000_000)
    const n = 1 + Math.floor(rng() * 8)
    const weights = Array.from({ length: n }, () => 1 + Math.floor(rng() * 50))
    const parts = splitByWeights(pool, weights)
    assert.equal(parts.reduce((a, x) => a + x, 0), pool)
    // monotonic-ish: bigger weight never gets strictly less than a smaller weight
    for (let a = 0; a < weights.length; a++) {
      for (let b = 0; b < weights.length; b++) {
        if (weights[a] > weights[b]) assert.ok(parts[a] >= parts[b])
      }
    }
  }
})

test('splitByWeights rejects a non-zero pool with no places', () => {
  assert.throws(() => splitByWeights(100, []))
  assert.deepEqual(splitByWeights(0, []), [])
})

test('TNMT-PAY-011 projectedPayouts returns a full place table', () => {
  const table = projectedPayouts(TEMPLATE_STT_6MAX, 6, 6)
  assert.equal(table.length, 2)
  assert.equal(table[0].place, 1)
  assert.equal(table[0].amount + table[1].amount, 6000)
  assert.ok(table[0].amount > table[1].amount)
})
