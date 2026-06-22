// Place location domain model + data-quality scans (Map UX Phase 4).
// Run with:  node --test lib/placeLocation.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizePlaceLocation, parseLocationProvider, parseLocationSource,
  findDuplicateProviderPlaceIds, findDuplicateCoordinates, pointInViewport,
  isSuspiciousCoordinate, hasIncompleteCoordinatePair, auditPlaceLocations, isPublished,
  LOCATION_SOURCES, LOCATION_PROVIDERS,
} from './placeLocation.ts'
import { boundingBox } from './placesNearby.ts'
import { haversineKm } from './geo.ts'

// 1. OLD row without any new fields → safe nulls/defaults (back-compat).
test('1. old row without new fields normalizes safely', () => {
  const loc = normalizePlaceLocation({ slug: 'legacy', lat: null, lng: null })
  assert.equal(loc.provider, null)
  assert.equal(loc.providerPlaceId, null)
  assert.equal(loc.source, null)
  assert.equal(loc.countryCode, null)
  assert.equal(loc.manuallyAdjusted, false)
  assert.equal(loc.hasValidCoordinates, false)
  assert.equal(loc.hasAddress, false)
})

// 2. Row with coordinates only (no provider).
test('2. coordinates only', () => {
  const loc = normalizePlaceLocation({ slug: 'c', lat: 33.59, lng: 130.4 })
  assert.equal(loc.hasValidCoordinates, true)
  assert.equal(loc.provider, null)
  assert.equal(loc.providerPlaceId, null)
})

// 3. Row with Google provider data.
test('3. google provider data', () => {
  const loc = normalizePlaceLocation({
    slug: 'g', lat: 33.5213, lng: 130.5347,
    location_provider: 'google', provider_place_id: 'ChIJxxx',
    provider_formatted_address: '4-7-1 Saifu, Dazaifu', location_source: 'admin_search',
    country_code: 'JP',
  })
  assert.equal(loc.provider, 'google')
  assert.equal(loc.providerPlaceId, 'ChIJxxx')
  assert.equal(loc.source, 'admin_search')
  assert.equal(loc.hasAddress, true) // provider_formatted_address counts
  assert.equal(loc.countryCode, 'JP')
})

// 4. Row with manually adjusted coordinates.
test('4. manually adjusted', () => {
  const loc = normalizePlaceLocation({
    slug: 'm', lat: 33.6, lng: 130.4, location_provider: 'google',
    location_source: 'marker_drag', location_manually_adjusted: true,
  })
  assert.equal(loc.manuallyAdjusted, true)
  assert.equal(loc.source, 'marker_drag')
})

// 5. Null address (and no provider address) → hasAddress false.
test('5. null address', () => {
  const loc = normalizePlaceLocation({ slug: 'n', lat: 33.6, lng: 130.4, address: null })
  assert.equal(loc.hasAddress, false)
  const loc2 = normalizePlaceLocation({ slug: 'n2', address: '   ' })
  assert.equal(loc2.hasAddress, false)
})

// 6. Duplicate provider place IDs — what the unique index forbids.
test('6. duplicate provider place id detection', () => {
  const rows = [
    { slug: 'a', location_provider: 'google', provider_place_id: 'ChIJ-1' },
    { slug: 'b', location_provider: 'google', provider_place_id: 'ChIJ-1' }, // dup
    { slug: 'c', location_provider: 'google', provider_place_id: 'ChIJ-2' },
    { slug: 'd', location_provider: 'manual', provider_place_id: null },      // ignored
  ]
  const dups = findDuplicateProviderPlaceIds(rows)
  assert.equal(dups.length, 1)
  assert.deepEqual(dups[0].rows.map((r) => r.slug), ['a', 'b'])
  // different providers with same id string do NOT collide (composite key)
  const cross = findDuplicateProviderPlaceIds([
    { slug: 'x', location_provider: 'google', provider_place_id: 'ID' },
    { slug: 'y', location_provider: 'osm', provider_place_id: 'ID' },
  ])
  assert.equal(cross.length, 0)
})

// 7. Viewport (bounding-box) query predicate.
test('7. viewport query predicate', () => {
  const b = { north: 34, south: 33, east: 131, west: 130 }
  assert.equal(pointInViewport(b, { lat: 33.5, lng: 130.5 }), true)
  assert.equal(pointInViewport(b, { lat: 33, lng: 130 }), true) // inclusive edges
  assert.equal(pointInViewport(b, { lat: 35, lng: 130.5 }), false)
  assert.equal(pointInViewport(b, { lat: 33.5, lng: 131.5 }), false)
})

// 8. Radius query (bbox prefilter + haversine refine), zero-safe.
test('8. radius query with normalized coords', () => {
  const center = { lat: 33.5902, lng: 130.4017 }
  const bb = boundingBox(center.lat, center.lng, 5)
  const near = { lat: 33.6, lng: 130.4017 }
  const far = { lat: 34.5, lng: 131.5 }
  // near passes bbox AND haversine; far fails radius.
  assert.equal(near.lat >= bb.minLat && near.lat <= bb.maxLat, true)
  assert.ok(haversineKm(center, near) <= 5)
  assert.ok(haversineKm(center, far) > 5)
})

// 9. Migration rollback / compatibility: the model is additive — a row shaped
//    like a POST-rollback row (new columns gone) behaves identically to an old
//    row. (No DB test harness here; this asserts the back-compat guarantee the
//    rollback relies on.)
test('9. rollback/back-compat: post-rollback row shape still works', () => {
  const postRollback = { slug: 'r', lat: 33.59, lng: 130.4, address: 'somewhere' }
  const loc = normalizePlaceLocation(postRollback)
  assert.equal(loc.hasValidCoordinates, true)
  assert.equal(loc.provider, null)
  assert.equal(loc.manuallyAdjusted, false)
})

// Suspicious (0,0) & incomplete pair.
test('suspicious zero + incomplete pair', () => {
  assert.equal(isSuspiciousCoordinate(0, 0), true)
  assert.equal(isSuspiciousCoordinate(33.5, 130.4), false)
  assert.equal(hasIncompleteCoordinatePair({ lat: 33.5, lng: null }), true)
  assert.equal(hasIncompleteCoordinatePair({ lat: 33.5, lng: 130.4 }), false)
  assert.equal(hasIncompleteCoordinatePair({ lat: null, lng: null }), false)
})

// Duplicate coordinates.
test('duplicate coordinate grouping', () => {
  const dups = findDuplicateCoordinates([
    { slug: 'a', lat: 33.59021, lng: 130.40171 },
    { slug: 'b', lat: 33.59021, lng: 130.40171 },
    { slug: 'c', lat: 35.0, lng: 135.0 },
  ])
  assert.equal(dups.length, 1)
  assert.deepEqual(dups[0].rows.map((r) => r.slug).sort(), ['a', 'b'])
})

// Enum parsing + publication classification.
test('enum parsing + publication', () => {
  assert.equal(parseLocationProvider('google'), 'google')
  assert.equal(parseLocationProvider('bogus'), null)
  assert.equal(parseLocationSource('map_click'), 'map_click')
  assert.equal(parseLocationSource(''), null)
  assert.equal(LOCATION_PROVIDERS.includes('manual'), true)
  assert.equal(LOCATION_SOURCES.includes('current_location'), true)
  assert.equal(isPublished({ status: 'approved' }), true)
  assert.equal(isPublished({ status: null }), true)
  assert.equal(isPublished({ status: 'pending' }), false)
})

// Full audit tally over a crafted set covering every class.
test('auditPlaceLocations tallies all classes', () => {
  const rows = [
    { slug: 'ok', status: 'approved', lat: 33.59, lng: 130.4, address: 'a' },        // valid + coords+addr
    { slug: 'pub-miss', status: 'approved', lat: null, lng: null, address: 'a' },     // published missing + addr no coords
    { slug: 'draft', status: 'pending', lat: null, lng: null },                       // draft
    { slug: 'zero', status: 'approved', lat: 0, lng: 0 },                             // suspicious + coords no addr
    { slug: 'paris', status: 'approved', lat: 48.8, lng: 2.3, address: 'x' },         // outside Japan
    { slug: 'half', status: 'approved', lat: 33.5, lng: null },                       // incomplete pair
    { slug: 'oor', status: 'approved', lat: 999, lng: 130 },                          // out of range
  ]
  const c = auditPlaceLocations(rows)
  assert.equal(c.total, 7)
  assert.equal(c.published, 6)
  assert.equal(c.draft, 1)
  assert.equal(c.validCoordinates, 3)          // ok, zero, paris
  assert.equal(c.suspiciousZero, 1)            // zero
  assert.equal(c.outsideJapan, 2)              // paris AND (0,0) — both outside Japan bounds
  assert.equal(c.incompletePair, 1)            // half
  assert.equal(c.invalidRange, 1)              // oor
  assert.equal(c.publishedMissingCoordinates >= 1, true)
  assert.equal(c.coordinatesButNoAddress, 1)   // zero
  assert.equal(c.addressButNoCoordinates, 1)   // pub-miss
})
