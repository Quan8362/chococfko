// Central price/budget boundaries, overlap semantics, and selection mapping.
// node --test lib/placeBudget.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PRICE_RANGES, placeIsFree, priceInRange, placeMatchesPriceSelection,
  effectiveMinPrice, formatYen, isPriceRangeKey, type PricedPlace, type PriceSelection,
} from './placeBudget.ts'

const single = (yen: number): PricedPlace => ({ priceMin: yen, priceMax: yen })
const free: PricedPlace = { fee: 'free' }
const unknown: PricedPlace = {}

test('buckets cover every single price with no gaps or overlaps', () => {
  // Each test price belongs to EXACTLY one paid bucket (free is separate).
  const samples = [1, 500, 999, 1000, 2999, 3000, 4999, 5000, 99999]
  for (const yen of samples) {
    const hits = (['under_1000', '1000_3000', '3000_5000', 'over_5000'] as const)
      .filter((k) => { const r = PRICE_RANGES[k]; return priceInRange(single(yen), r.min, r.max) })
    assert.equal(hits.length, 1, `¥${yen} should match exactly one bucket, got ${hits.join(',')}`)
  }
})

test('bucket boundaries are correct (half-open via inclusive integer bounds)', () => {
  assert.deepEqual(
    [1, 999, 1000].map((y) => placeMatchesPriceSelection(single(y), 'under_1000')),
    [true, true, false],
  )
  assert.deepEqual(
    [999, 1000, 2999, 3000].map((y) => placeMatchesPriceSelection(single(y), '1000_3000')),
    [false, true, true, false],
  )
  assert.deepEqual(
    [4999, 5000].map((y) => placeMatchesPriceSelection(single(y), 'over_5000')),
    [false, true],
  )
})

test('free is free only by explicit flag; never by null/unknown price', () => {
  assert.equal(placeIsFree(free), true)
  assert.equal(placeIsFree({ priceType: 'free' }), true)
  assert.equal(placeIsFree(single(0)), false) // price 0 without a free flag is NOT free
  assert.equal(placeIsFree(unknown), false)
  assert.equal(placeMatchesPriceSelection(free, 'free'), true)
  assert.equal(placeMatchesPriceSelection(unknown, 'free'), false)
})

test('free is excluded from paid buckets', () => {
  assert.equal(placeMatchesPriceSelection(free, 'under_1000'), false)
  assert.equal(placeMatchesPriceSelection(free, 'over_5000'), false)
})

test('unknown price never matches a numeric range or custom range', () => {
  assert.equal(placeMatchesPriceSelection(unknown, 'under_1000'), false)
  assert.equal(placeMatchesPriceSelection(unknown, 'custom', { min: 0, max: 100000 }), false)
  assert.equal(placeMatchesPriceSelection(unknown, 'all'), true) // but appears unfiltered
})

test('a stored min–max range uses overlap semantics for discovery', () => {
  const spanning: PricedPlace = { priceMin: 2500, priceMax: 3500 }
  assert.equal(placeMatchesPriceSelection(spanning, '1000_3000'), true)
  assert.equal(placeMatchesPriceSelection(spanning, '3000_5000'), true)
  assert.equal(placeMatchesPriceSelection(spanning, 'over_5000'), false)
})

test('custom range honours an open upper/lower bound', () => {
  assert.equal(priceInRange(single(8000), 5000, null), true)
  assert.equal(priceInRange(single(4000), 5000, null), false)
  assert.equal(priceInRange(single(300), null, 500), true)
  assert.equal(priceInRange(free, null, 500), true) // free satisfies any upper bound
})

test('effectiveMinPrice: free=0, known=min, unknown=+Infinity', () => {
  assert.equal(effectiveMinPrice(free), 0)
  assert.equal(effectiveMinPrice({ priceMin: 1200, priceMax: 3000 }), 1200)
  assert.equal(effectiveMinPrice(unknown), Number.POSITIVE_INFINITY)
})

test('formatYen has no decimals and uses locale grouping', () => {
  assert.equal(formatYen(1000, 'en'), '¥1,000')
  assert.equal(formatYen(1000, 'vi'), '¥1.000')
  assert.equal(formatYen(0, 'en'), '¥0')
})

test('isPriceRangeKey validates URL input', () => {
  assert.equal(isPriceRangeKey('under_1000'), true)
  assert.equal(isPriceRangeKey('over_5000'), true)
  assert.equal(isPriceRangeKey('free'), false) // free is a separate dimension
  assert.equal(isPriceRangeKey('garbage'), false)
  const sel: PriceSelection = 'all'
  assert.equal(sel, 'all')
})
