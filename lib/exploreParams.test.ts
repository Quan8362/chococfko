// node --test lib/exploreParams.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { encodeFilters, decodeFilters, activeFilterCount, type ExploreFilters } from './exploreParams.ts'

function roundtrip(f: ExploreFilters): ExploreFilters {
  const sp = encodeFilters(f)
  return decodeFilters((k) => sp.get(k))
}

test('encode/decode round-trips a rich filter set', () => {
  const f: ExploreFilters = {
    q: 'ramen', category: 'food', prefecture: 'fukuoka', area: 'hakata', station: 'tenjin',
    sort: 'nearest', fee: 'paid', priceMin: 1000, priceMax: 3500,
    openNow: true, nearby: true, children: true, parking: true,
    smoking: 'no_smoking', payment: ['cash', 'qr'], lang: ['en', 'vi'], verified: true,
  }
  assert.deepEqual(roundtrip(f), f)
})

test('defaults: recommended sort and falsy booleans are omitted', () => {
  const sp = encodeFilters({ q: 'x', sort: 'recommended', openNow: false })
  assert.equal(sp.get('sort'), null)
  assert.equal(sp.get('openNow'), null)
  assert.equal(sp.get('q'), 'x')
})

test('decode ignores invalid sort + negative numbers', () => {
  const f = decodeFilters((k) => ({ sort: 'bogus', priceMax: '-5', q: ' hi ' } as Record<string, string>)[k] ?? null)
  assert.equal(f.sort, undefined)
  assert.equal(f.priceMax, undefined)
  assert.equal(f.q, 'hi')
})

test('activeFilterCount counts chips but not q/sort', () => {
  assert.equal(activeFilterCount({ q: 'ramen', sort: 'nearest' }), 0)
  assert.equal(activeFilterCount({ category: 'food', openNow: true, payment: ['cash'] }), 3)
  assert.equal(activeFilterCount({ payment: [] }), 0)
})
