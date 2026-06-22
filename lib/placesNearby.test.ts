// node --test lib/placesNearby.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { boundingBox } from './placesNearby.ts'
import { haversineKm } from './geo.ts'

test('boundingBox spans roughly the radius and contains the center', () => {
  const b = boundingBox(33.59, 130.40, 5)
  assert.ok(b.minLat < 33.59 && b.maxLat > 33.59)
  assert.ok(b.minLng < 130.40 && b.maxLng > 130.40)
  // 5 km north edge should be ~5 km from center (lat-only)
  const north = haversineKm({ lat: 33.59, lng: 130.40 }, { lat: b.maxLat, lng: 130.40 })
  assert.ok(north > 4.8 && north < 5.2, `north edge ~5km, got ${north}`)
})

test('boundingBox longitude widens near the equator, narrows near poles', () => {
  const eq = boundingBox(0, 0, 10)
  const high = boundingBox(60, 0, 10)
  const eqWidth = eq.maxLng - eq.minLng
  const highWidth = high.maxLng - high.minLng
  assert.ok(highWidth > eqWidth, 'a degree of longitude is shorter at 60°, so the box must be wider in degrees')
})

test('a point just inside the box can still be outside the true radius (needs haversine)', () => {
  // The NE corner of a 5km box is ~7km away (diagonal) — confirms why the SQL
  // function applies haversine after the bbox prefilter.
  const b = boundingBox(33.59, 130.40, 5)
  const corner = haversineKm({ lat: 33.59, lng: 130.40 }, { lat: b.maxLat, lng: b.maxLng })
  assert.ok(corner > 5, `corner ${corner} should exceed the 5km radius`)
})
