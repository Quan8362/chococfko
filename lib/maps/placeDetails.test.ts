// Place Details → location mapping — pure tests (Map UX Phase 5).
// Run with:  node --test lib/maps/placeDetails.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  mapPlaceToLocation, addressComponentsToParts, placeLatLng, PLACE_DETAIL_FIELDS,
} from './placeDetails.ts'

// Japanese address components (New API camelCase longText/shortText).
const JP_COMPONENTS = [
  { types: ['postal_code'], longText: '818-0117', shortText: '818-0117' },
  { types: ['country', 'political'], longText: 'Japan', shortText: 'JP' },
  { types: ['administrative_area_level_1', 'political'], longText: '福岡県', shortText: '福岡県' },
  { types: ['locality', 'political'], longText: '太宰府市', shortText: '太宰府市' },
  { types: ['sublocality_level_1'], longText: '宰府', shortText: '宰府' },
]

test('1. select a place: full mapping (literal location)', () => {
  const place = {
    id: 'ChIJ_dazaifu', displayName: 'Dazaifu Tenmangu',
    formattedAddress: '4-7-1 Saifu, Dazaifu, Fukuoka', googleMapsURI: 'https://maps.google.com/?cid=1',
    location: { lat: 33.5213, lng: 130.5347 }, addressComponents: JP_COMPONENTS,
  }
  const d = mapPlaceToLocation(place)
  assert.ok(d)
  assert.deepEqual([d!.lat, d!.lng], [33.5213, 130.5347])
  assert.equal(d!.providerPlaceId, 'ChIJ_dazaifu')
  assert.equal(d!.name, 'Dazaifu Tenmangu')
  assert.equal(d!.mapsUrl, 'https://maps.google.com/?cid=1')
})

test('3. Japanese address components → structured parts', () => {
  const parts = addressComponentsToParts(JP_COMPONENTS)
  assert.equal(parts.postalCode, '818-0117')
  assert.equal(parts.countryCode, 'JP')      // shortText preferred for country
  assert.equal(parts.prefecture, '福岡県')
  assert.equal(parts.city, '太宰府市')
  assert.equal(parts.ward, '宰府')
})

test('method-style LatLng (place.location.lat() / lng())', () => {
  const place = { id: 'x', location: { lat: () => 35.0, lng: () => 135.0 } }
  assert.deepEqual(placeLatLng(place), { lat: 35.0, lng: 135.0 })
})

test('displayName object form { text }', () => {
  const d = mapPlaceToLocation({ id: 'x', displayName: { text: 'Ohori Park' }, location: { lat: 33.58, lng: 130.37 } })
  assert.equal(d!.name, 'Ohori Park')
})

test('5. null/missing address → nulls, still maps coords', () => {
  const d = mapPlaceToLocation({ id: 'x', location: { lat: 33.5, lng: 130.4 } })
  assert.ok(d)
  assert.equal(d!.formattedAddress, null)
  assert.equal(d!.city, null)
  assert.equal(d!.providerPlaceId, 'x')
})

test('place without a valid coordinate → null (unusable)', () => {
  assert.equal(mapPlaceToLocation({ id: 'x', location: null }), null)
  assert.equal(mapPlaceToLocation({ id: 'x', location: { lat: 999, lng: 130 } }), null)
})

test('ward via legacy snake_case (reverse-geocode result shape)', () => {
  const parts = addressComponentsToParts([
    { types: ['ward'], long_name: '博多区', short_name: '博多区' },
    { types: ['country'], long_name: 'Japan', short_name: 'JP' },
  ])
  assert.equal(parts.ward, '博多区')
  assert.equal(parts.countryCode, 'JP')
})

test('field mask is the minimal Essentials set', () => {
  assert.deepEqual([...PLACE_DETAIL_FIELDS],
    ['id', 'displayName', 'formattedAddress', 'location', 'addressComponents', 'googleMapsURI'])
})
