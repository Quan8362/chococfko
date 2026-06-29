// Framework-free tests for the coin-tier resolver + compact coin formatting.
// Run with:  node --test lib/games/coinTier.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getCoinTier, getTierByKey, TIERS } from './coinTier.ts'
import { formatCoinsShort, formatCoinsFull } from '../game/economy.ts'

const B = 1_000_000_000

test('no badge below the first threshold', () => {
  assert.equal(getCoinTier(0), null)
  assert.equal(getCoinTier(null), null)
  assert.equal(getCoinTier(undefined), null)
  assert.equal(getCoinTier(999_999_999), null) // just under 1B
})

test('tier resolves at every threshold (inclusive lower bound)', () => {
  assert.equal(getCoinTier(1 * B)?.key, 'bronze')
  assert.equal(getCoinTier(2 * B)?.key, 'silver')
  assert.equal(getCoinTier(3 * B)?.key, 'gold')
  assert.equal(getCoinTier(5 * B)?.key, 'diamond')
  assert.equal(getCoinTier(10 * B)?.key, 'vip')
})

test('exact threshold equality picks the higher tier', () => {
  // Boundary values belong to the tier they meet, not the one below.
  assert.equal(getCoinTier(2 * B - 1)?.key, 'bronze')
  assert.equal(getCoinTier(2 * B)?.key, 'silver')
  assert.equal(getCoinTier(3 * B - 1)?.key, 'silver')
  assert.equal(getCoinTier(3 * B)?.key, 'gold')
  assert.equal(getCoinTier(5 * B - 1)?.key, 'gold')
  assert.equal(getCoinTier(5 * B)?.key, 'diamond')
  assert.equal(getCoinTier(10 * B - 1)?.key, 'diamond')
  assert.equal(getCoinTier(10 * B)?.key, 'vip')
})

test('within a band the tier stays the same (upgrade/downgrade only at boundaries)', () => {
  assert.equal(getCoinTier(1.5 * B)?.key, 'bronze')
  assert.equal(getCoinTier(2.9 * B)?.key, 'silver')
  assert.equal(getCoinTier(4.99 * B)?.key, 'gold')
  assert.equal(getCoinTier(9.5 * B)?.key, 'diamond')
})

test('very large balances above 10B stay VIP (no overflow)', () => {
  assert.equal(getCoinTier(50 * B)?.key, 'vip')
  assert.equal(getCoinTier(1_000 * B)?.key, 'vip') // 1 trillion
  assert.equal(getCoinTier(9_000_000 * B)?.key, 'vip') // ~9e15, still exact in JS
})

test('thresholds are strictly ascending and ordered', () => {
  for (let i = 1; i < TIERS.length; i++) {
    assert.ok(TIERS[i].minBalance > TIERS[i - 1].minBalance, 'minBalance must ascend')
    assert.ok(TIERS[i].order > TIERS[i - 1].order, 'order must ascend')
  }
  assert.equal(getTierByKey('vip')?.minBalance, 10 * B)
})

test('formatCoinsShort renders K / M / B compactly', () => {
  assert.equal(formatCoinsShort(940), '940')
  assert.equal(formatCoinsShort(1_000), '1K')
  assert.equal(formatCoinsShort(9_320), '9.3K')
  assert.equal(formatCoinsShort(269_260), '269K')
  assert.equal(formatCoinsShort(1_000_000), '1M')
  assert.equal(formatCoinsShort(1_250_000), '1.25M')
  assert.equal(formatCoinsShort(1_000_000_000), '1B')
  assert.equal(formatCoinsShort(1_500_000_000), '1.5B')
  assert.equal(formatCoinsShort(10_000_000_000), '10B')
})

test('formatCoinsFull groups the exact value for tooltips', () => {
  assert.equal(formatCoinsFull(1_000_000_000), '1,000,000,000')
  assert.equal(formatCoinsFull(0), '0')
  assert.equal(formatCoinsFull(1_234_567), '1,234,567')
})
