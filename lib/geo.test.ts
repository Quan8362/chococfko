// node --test lib/geo.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { haversineKm, formatDistanceKm } from './geo.ts'

test('haversineKm: 0 for same point, ~known city distance', () => {
  assert.equal(haversineKm({ lat: 33.59, lng: 130.4 }, { lat: 33.59, lng: 130.4 }), 0)
  // Hakata (33.59,130.42) → Tenjin (33.59,130.40) ≈ 1.8 km
  const d = haversineKm({ lat: 33.5902, lng: 130.4203 }, { lat: 33.5916, lng: 130.3990 })
  assert.ok(d > 1.5 && d < 2.5, `expected ~2km, got ${d}`)
  // Fukuoka → Tokyo ≈ 880 km
  const ft = haversineKm({ lat: 33.59, lng: 130.40 }, { lat: 35.68, lng: 139.77 })
  assert.ok(ft > 850 && ft < 920, `expected ~880km, got ${ft}`)
})

test('formatDistanceKm renders metres / km sensibly', () => {
  assert.equal(formatDistanceKm(0.35), '350 m')
  assert.equal(formatDistanceKm(1.23), '1.2 km')
  assert.equal(formatDistanceKm(42), '42 km')
})
