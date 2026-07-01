// Framework-free tests for safe integer coin arithmetic.
// Run with:  node --test lib/games/shared/coins.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isCoinAmount,
  assertCoin,
  addCoins,
  subCoins,
  sumCoins,
  clampToStack,
  clampNonNegative,
  splitInteger,
  isConserved,
  MAX_SAFE_COINS,
} from './coins.ts'

test('isCoinAmount accepts only safe non-negative integers', () => {
  assert.ok(isCoinAmount(0))
  assert.ok(isCoinAmount(1_000_000))
  assert.ok(isCoinAmount(MAX_SAFE_COINS))
  assert.ok(!isCoinAmount(-1))
  assert.ok(!isCoinAmount(1.5))
  assert.ok(!isCoinAmount(Number.NaN))
  assert.ok(!isCoinAmount(Infinity))
  assert.ok(!isCoinAmount('100' as unknown))
  assert.ok(!isCoinAmount(MAX_SAFE_COINS + 1)) // not a safe integer
})

test('assertCoin throws on invalid amounts', () => {
  assert.doesNotThrow(() => assertCoin(10))
  assert.throws(() => assertCoin(-1))
  assert.throws(() => assertCoin(2.5))
})

test('addCoins / subCoins are integer and guarded', () => {
  assert.equal(addCoins(100, 250), 350)
  assert.equal(subCoins(250, 100), 150)
  assert.equal(subCoins(100, 100), 0)
  assert.throws(() => subCoins(100, 101), /negative/) // never goes negative (B6)
  assert.throws(() => addCoins(MAX_SAFE_COINS, 1), /overflow/) // overflow guard
  assert.throws(() => addCoins(1.5, 1))
})

test('sumCoins sums a list with validation', () => {
  assert.equal(sumCoins([]), 0)
  assert.equal(sumCoins([1, 2, 3]), 6)
  assert.throws(() => sumCoins([1, -2]))
})

test('clampToStack never exceeds the stack', () => {
  assert.equal(clampToStack(500, 200), 200) // over-bet clamped to stack
  assert.equal(clampToStack(150, 200), 150)
  assert.equal(clampToStack(0, 200), 0)
})

test('clampNonNegative floors at zero and truncates', () => {
  assert.equal(clampNonNegative(-5), 0)
  assert.equal(clampNonNegative(7.9), 7)
  assert.throws(() => clampNonNegative(Number.NaN))
})

test('splitInteger does integer division and reports remainder (odd chip)', () => {
  assert.deepEqual(splitInteger(100, 2), { base: 50, remainder: 0 })
  assert.deepEqual(splitInteger(101, 2), { base: 50, remainder: 1 }) // odd chip by position
  assert.deepEqual(splitInteger(10, 3), { base: 3, remainder: 1 })
  // conservation: base*parts + remainder == total
  const total = 9_999_997
  const { base, remainder } = splitInteger(total, 7)
  assert.equal(base * 7 + remainder, total)
  assert.throws(() => splitInteger(100, 0))
})

test('isConserved enforces awards + refunds == contributions exactly', () => {
  assert.ok(isConserved(300, [100, 200]))
  assert.ok(isConserved(300, [100, 150], [50])) // with uncalled refund
  assert.ok(!isConserved(300, [100, 199])) // 1 coin destroyed
  assert.ok(!isConserved(300, [100, 201])) // 1 coin created
})
