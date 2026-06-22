// node --test lib/metrics.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rate, formatPct, formatCount, searchRates, usefulActionRate } from './metrics.ts'

test('rate returns null on zero/invalid denominator (no fabrication)', () => {
  assert.equal(rate(5, 0), null)
  assert.equal(rate(0, 0), null)
  assert.equal(rate(3, 10), 0.3)
})

test('formatPct renders dash for null, percent otherwise', () => {
  assert.equal(formatPct(null), '—')
  assert.equal(formatPct(0.1234), '12.3%')
  assert.equal(formatPct(0), '0.0%')
})

test('formatCount distinguishes real 0 from unknown', () => {
  assert.equal(formatCount(0), '0')
  assert.equal(formatCount(null), '—')
  assert.equal(formatCount(1500), (1500).toLocaleString())
})

test('searchRates computes success / zero-result / CTR', () => {
  const r = searchRates({ total: 100, withResults: 80, clicked: 40 })
  assert.equal(r.successRate, 0.8)
  assert.equal(r.zeroResultRate, 0.2)
  assert.equal(r.clickThroughRate, 0.4)
})

test('searchRates with no data → all null', () => {
  const r = searchRates({ total: 0, withResults: 0, clicked: 0 })
  assert.equal(r.successRate, null)
  assert.equal(r.zeroResultRate, null)
})

test('usefulActionRate', () => {
  assert.equal(usefulActionRate(25, 100), 0.25)
  assert.equal(usefulActionRate(0, 0), null)
})
