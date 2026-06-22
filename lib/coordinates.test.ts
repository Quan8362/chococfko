// Canonical coordinate-model tests (Phase 2 coordinate fix).
// Run with:  node --test lib/coordinates.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseCoordinate, isValidLat, isValidLng, isValidCoordinate, isInJapanBounds,
  hasValidCoordinates, validateCoordinateInput, coordinateWarnings,
  latFieldError, lngFieldError,
} from './coordinates.ts'
import { boundingBox } from './placesNearby.ts'
import { haversineKm } from './geo.ts'

// 1. Existing place with valid POSITIVE coordinates.
test('1. valid positive coordinates', () => {
  assert.equal(isValidCoordinate(33.5902, 130.4017), true)
  assert.equal(hasValidCoordinates({ lat: 33.5902, lng: 130.4017 }), true)
  assert.equal(parseCoordinate('33.5902'), 33.5902)
})

// 2. Existing place with valid NEGATIVE coordinates.
test('2. valid negative coordinates', () => {
  assert.equal(isValidCoordinate(-33.8688, -151.2093 + 0), true) // lat -33.86, lng valid
  assert.equal(isValidCoordinate(-89.9, -179.9), true)
  assert.equal(parseCoordinate('-12.34'), -12.34)
})

// 3. Coordinates containing ZERO are valid (the classic truthy-check trap).
test('3. zero coordinates are valid', () => {
  assert.equal(isValidLat(0), true)
  assert.equal(isValidLng(0), true)
  assert.equal(isValidCoordinate(0, 0), true)
  assert.equal(parseCoordinate('0'), 0)
  assert.equal(parseCoordinate(0), 0)
  // demonstrate that a truthy check would be WRONG here:
  assert.equal(!!0 === false, true)
})

// 4. Existing place with NULL coordinates.
test('4. null coordinates', () => {
  assert.equal(parseCoordinate(null), null)
  assert.equal(isValidCoordinate(null, null), false)
  assert.equal(hasValidCoordinates({ lat: null, lng: null }), false)
  assert.equal(hasValidCoordinates({}), false)
})

// 5. Empty-string input normalizes to null (not 0, not NaN).
test('5. empty string -> null', () => {
  assert.equal(parseCoordinate(''), null)
  assert.equal(parseCoordinate('   '), null)
  assert.equal(parseCoordinate(undefined), null)
})

// 6. Invalid latitude above 90.
test('6. latitude > 90 invalid', () => {
  assert.equal(isValidLat(90.0001), false)
  assert.equal(isValidCoordinate(91, 0), false)
  assert.equal(latFieldError('91'), 'invalid_lat')
})

// 7. Invalid latitude below -90.
test('7. latitude < -90 invalid', () => {
  assert.equal(isValidLat(-90.5), false)
  assert.equal(isValidCoordinate(-91, 0), false)
  assert.equal(latFieldError('-90.5'), 'invalid_lat')
})

// 8. Invalid longitude above 180.
test('8. longitude > 180 invalid', () => {
  assert.equal(isValidLng(180.1), false)
  assert.equal(isValidCoordinate(0, 181), false)
  assert.equal(lngFieldError('181'), 'invalid_lng')
})

// 9. Invalid longitude below -180.
test('9. longitude < -180 invalid', () => {
  assert.equal(isValidLng(-180.0001), false)
  assert.equal(isValidCoordinate(0, -181), false)
  assert.equal(lngFieldError('-181'), 'invalid_lng')
})

// 10. STRING coordinates returned from a form are coerced + validated.
test('10. string coordinates from a form', () => {
  const v = validateCoordinateInput('33.5902', '130.4017')
  assert.deepEqual(v, { lat: 33.5902, lng: 130.4017, errors: [] })
  // strict parse: trailing junk is rejected, never silently partial.
  assert.equal(parseCoordinate('33.59abc'), null)
  // isValidCoordinate stays strict about raw strings (stable contract).
  assert.equal(isValidCoordinate('33', '130'), false)
})

// 11. Save and reload round-trips losslessly through the canonical model.
test('11. save + reload round-trip', () => {
  // form -> validate (save) -> persisted numbers -> read back -> field string
  const saved = validateCoordinateInput('-12.5', '0')
  assert.deepEqual(saved, { lat: -12.5, lng: 0, errors: [] })
  const reloaded = validateCoordinateInput(String(saved.lat), String(saved.lng))
  assert.deepEqual(reloaded, { lat: -12.5, lng: 0, errors: [] })
  // and a missing pair stays missing across the round-trip
  const empty = validateCoordinateInput('', '')
  assert.deepEqual(empty, { lat: null, lng: null, errors: [] })
})

// 12. Clearing existing coordinates -> null pair, no error.
test('12. clearing coordinates', () => {
  assert.deepEqual(validateCoordinateInput('', ''), { lat: null, lng: null, errors: [] })
  // clearing only one -> incomplete (one without the other)
  assert.deepEqual(validateCoordinateInput('33.5', ''), { lat: 33.5, lng: null, errors: ['incomplete_coordinates'] })
  assert.deepEqual(validateCoordinateInput('', '130.4'), { lat: null, lng: 130.4, errors: ['incomplete_coordinates'] })
})

// 13. Warning DISAPPEARS once valid coordinates are supplied.
test('13. warning clears with valid coordinates', () => {
  const before = coordinateWarnings({ lat: null, lng: null, hasMapUrl: false, hasAddress: false })
  assert.ok(before.includes('missing_coordinates'))
  const after = coordinateWarnings({ lat: 33.59, lng: 130.4, hasMapUrl: false, hasAddress: false })
  assert.deepEqual(after, [])
  // zero coordinates also clear the warning
  assert.deepEqual(coordinateWarnings({ lat: 0, lng: 0 }), [])
})

// 14. Warning APPEARS once coordinates are cleared.
test('14. warning appears when cleared', () => {
  const w = coordinateWarnings({ lat: null, lng: null, hasMapUrl: false, hasAddress: false })
  assert.deepEqual(w, ['missing_location', 'missing_coordinates'])
  // with a map link or address present, only the coordinate warning shows
  assert.deepEqual(coordinateWarnings({ lat: null, lng: null, hasMapUrl: true }), ['missing_coordinates'])
  assert.deepEqual(coordinateWarnings({ lat: null, lng: null, hasAddress: true }), ['missing_coordinates'])
})

// 15. Public map / nearby excludes records WITHOUT valid coordinates.
test('15. map excludes records without valid coordinates', () => {
  const rows = [
    { slug: 'ok', lat: 33.59, lng: 130.4 },
    { slug: 'zero', lat: 0, lng: 0 },
    { slug: 'null', lat: null, lng: null },
    { slug: 'partial', lat: 33.59, lng: null },
    { slug: 'oor', lat: 999, lng: 130 },
  ]
  const shown = rows.filter(hasValidCoordinates).map((r) => r.slug)
  assert.deepEqual(shown, ['ok', 'zero'])
})

// 16. Radius search handles normalized values (incl. zero/negative) correctly.
test('16. radius search handles normalized values', () => {
  // bounding box is finite and ordered for a zero-origin center
  const bb = boundingBox(0, 0, 5)
  assert.ok(bb.minLat < bb.maxLat && bb.minLng < bb.maxLng)
  assert.ok(Number.isFinite(bb.minLat) && Number.isFinite(bb.maxLng))
  // a point ~1 km away is within a 5 km radius; one far away is not
  const center = { lat: 33.5902, lng: 130.4017 }
  const near = haversineKm(center, { lat: 33.5992, lng: 130.4017 }) // ~1 km north
  const far = haversineKm(center, { lat: 35.0, lng: 135.0 })
  assert.ok(near <= 5)
  assert.ok(far > 5)
  // negative-hemisphere distance is still finite & symmetric
  const d = haversineKm({ lat: -33.86, lng: 151.2 }, { lat: -33.87, lng: 151.21 })
  assert.ok(Number.isFinite(d) && d > 0)
})

// Bonus: Japan-bounds helper stays correct (used for future soft validation).
test('isInJapanBounds', () => {
  assert.equal(isInJapanBounds(33.5902, 130.4017), true)  // Fukuoka
  assert.equal(isInJapanBounds(48.8, 2.3), false)          // Paris
  assert.equal(isInJapanBounds(0, 0), false)               // null island
})
