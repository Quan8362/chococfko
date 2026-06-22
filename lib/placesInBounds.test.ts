// Viewport (bounding-box) filtering — pure tests (Map UX Phase 6).
// Run with:  node --test lib/placesInBounds.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { placesWithinBounds } from './placesNearby.ts'
import type { Place } from './places.ts'

const BOUNDS = { north: 34, south: 33, east: 131, west: 130 }

function mk(slug: string, lat: number | null, lng: number | null, extra: Partial<Place> = {}): Place {
  return {
    slug, name: slug, area: 'Area', desc: '', category: 'food', categoryLabel: 'Food',
    fee: null, mapUrl: '', photoUrl: '', img: '', imgFallback: '', lat, lng, ...extra,
  } as Place
}

test('excludes invalid / out-of-range / missing coordinates', () => {
  const rows = [
    mk('ok', 33.5, 130.5),
    mk('null', null, null),
    mk('partial', 33.5, null),
    mk('oor', 999, 130.5),
  ]
  const out = placesWithinBounds(rows, BOUNDS)
  assert.deepEqual(out.map((p) => p.slug), ['ok'])
})

test('excludes points outside the viewport', () => {
  const out = placesWithinBounds([mk('in', 33.5, 130.5), mk('out', 35.0, 135.0)], BOUNDS)
  assert.deepEqual(out.map((p) => p.slug), ['in'])
})

test('excludes search-ineligible places', () => {
  const out = placesWithinBounds([mk('a', 33.5, 130.5), mk('hidden', 33.6, 130.6, { searchEligible: false })], BOUNDS)
  assert.deepEqual(out.map((p) => p.slug), ['a'])
})

test('category + text filters', () => {
  const rows = [
    mk('cafe1', 33.5, 130.5, { category: 'cafe_milk_tea', name: 'Cozy Cafe' }),
    mk('food1', 33.6, 130.6, { category: 'food', name: 'Ramen House' }),
  ]
  assert.deepEqual(placesWithinBounds(rows, BOUNDS, { category: 'food' }).map((p) => p.slug), ['food1'])
  assert.deepEqual(placesWithinBounds(rows, BOUNDS, { q: 'ramen' }).map((p) => p.slug), ['food1'])
  assert.deepEqual(placesWithinBounds(rows, BOUNDS, { q: 'cozy' }).map((p) => p.slug), ['cafe1'])
})

test('sorted by distance from viewport centre', () => {
  const center = mk('center', 33.5, 130.5)       // exact centre
  const edge = mk('edge', 33.95, 130.95)          // near a corner
  const out = placesWithinBounds([edge, center], BOUNDS)
  assert.deepEqual(out.map((p) => p.slug), ['center', 'edge'])
})

test('handles hundreds of markers and caps to the limit', () => {
  const rows: Place[] = []
  for (let i = 0; i < 600; i++) {
    const lat = 33 + (i % 100) / 100      // 33.00..33.99 (inside)
    const lng = 130 + Math.floor(i / 100) / 10 // 130.0..130.5 (inside)
    rows.push(mk(`p${i}`, lat, lng))
  }
  const out = placesWithinBounds(rows, BOUNDS, { limit: 300 })
  assert.equal(out.length, 300)
  assert.ok(out.every((p) => p.lat >= 33 && p.lat <= 34 && p.lng >= 130 && p.lng <= 131))
})
