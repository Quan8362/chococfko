import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hashSeed, mulberry32, dailySeed, seededShuffle, seededPick } from './daily.ts'

test('hashSeed is deterministic and varies by input', () => {
  assert.equal(hashSeed('abc'), hashSeed('abc'))
  assert.notEqual(hashSeed('abc'), hashSeed('abd'))
})

test('dailySeed differs by date and level but is stable', () => {
  assert.equal(dailySeed('2026-06-22', 'N5'), dailySeed('2026-06-22', 'N5'))
  assert.notEqual(dailySeed('2026-06-22', 'N5'), dailySeed('2026-06-23', 'N5'))
  assert.notEqual(dailySeed('2026-06-22', 'N5'), dailySeed('2026-06-22', 'N4'))
})

test('mulberry32 same seed → same sequence', () => {
  const a = mulberry32(123)
  const b = mulberry32(123)
  for (let i = 0; i < 10; i++) assert.equal(a(), b())
})

test('seededShuffle is deterministic and a permutation', () => {
  const input = [1, 2, 3, 4, 5, 6, 7, 8]
  const s1 = seededShuffle(input, mulberry32(42))
  const s2 = seededShuffle(input, mulberry32(42))
  assert.deepEqual(s1, s2)
  assert.deepEqual([...s1].sort((a, b) => a - b), input)
  // does not mutate input
  assert.deepEqual(input, [1, 2, 3, 4, 5, 6, 7, 8])
})

test('seededPick reproduces the same set for the same daily seed', () => {
  const pool = Array.from({ length: 100 }, (_, i) => `id${i}`)
  const seed = dailySeed('2026-06-22', 'N3')
  const a = seededPick(pool, 10, seed)
  const b = seededPick(pool, 10, seed)
  assert.deepEqual(a, b)
  assert.equal(a.length, 10)
  assert.equal(new Set(a).size, 10) // no duplicates
})

test('seededPick returns whole pool when pool <= count', () => {
  assert.deepEqual(seededPick(['a', 'b'], 10, 1), ['a', 'b'])
})
