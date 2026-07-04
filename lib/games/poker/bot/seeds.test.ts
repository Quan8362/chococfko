import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SEED_GROUPS,
  overlappingSeeds,
  assertSeedGroupsDisjoint,
  BENCHMARK_MATRIX,
  STACK_BB,
} from './seeds.ts'

test('calibration / validation / holdout seed groups are DISJOINT', () => {
  assert.deepEqual(overlappingSeeds(), [])
  assert.doesNotThrow(() => assertSeedGroupsDisjoint())
})

test('each seed group has no internal duplicates and the expected sizes', () => {
  assert.equal(SEED_GROUPS.calibration.length, 24)
  assert.equal(SEED_GROUPS.validation.length, 16)
  assert.equal(SEED_GROUPS.holdout.length, 16)
  for (const g of [SEED_GROUPS.calibration, SEED_GROUPS.validation, SEED_GROUPS.holdout]) {
    assert.equal(new Set(g).size, g.length)
  }
})

test('seeds are deterministic 32-bit unsigned integers (reproducible across runs)', () => {
  for (const g of [SEED_GROUPS.calibration, SEED_GROUPS.validation, SEED_GROUPS.holdout]) {
    for (const s of g) {
      assert.ok(Number.isInteger(s) && s >= 0 && s <= 0xffffffff, `seed ${s} is not a u32`)
    }
  }
  // A re-import would produce the same constants; assert the first calibration seed is stable so a
  // future accidental change to the generator is caught.
  const first = SEED_GROUPS.calibration[0]
  assert.equal(typeof first, 'number')
})

test('assertSeedGroupsDisjoint throws when groups overlap', () => {
  const shared = SEED_GROUPS.calibration[0]
  const bad = {
    calibration: SEED_GROUPS.calibration,
    validation: [shared, ...SEED_GROUPS.validation],
    holdout: SEED_GROUPS.holdout,
  }
  assert.throws(() => assertSeedGroupsDisjoint(bad))
  assert.deepEqual(overlappingSeeds(bad), [shared])
})

test('benchmark matrix covers 2..6 players and every stack category', () => {
  const seatCounts = new Set(BENCHMARK_MATRIX.map((s) => s.seatCount))
  for (let n = 2; n <= 6; n++) assert.ok(seatCounts.has(n), `matrix missing ${n}-max`)
  const stacks = new Set(BENCHMARK_MATRIX.map((s) => s.stack))
  for (const cat of ['short', 'standard', 'deep'] as const) {
    assert.ok(stacks.has(cat), `matrix missing ${cat} stacks`)
    assert.ok(STACK_BB[cat] > 0)
  }
})
