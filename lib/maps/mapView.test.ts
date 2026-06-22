// Map V2 view-state + viewport maths — pure tests (Map UX Phase 6).
// Run with:  node --test lib/maps/mapView.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  decodeMapView, encodeMapView, mapViewToQuery, shouldOfferSearchArea,
  metersPerPixel, boundsFromCenter, boundsCenter, markerAccent, DEFAULT_MAP_VIEW,
} from './mapView.ts'

const fromObj = (o: Record<string, string>) => (k: string) => o[k] ?? null

test('decode/encode round-trip', () => {
  const s = decodeMapView(fromObj({ c: '33.5902,130.4017', z: '14', cat: 'food', q: 'ramen', open: '1', sel: 'dazaifu', mode: 'list' }))
  assert.deepEqual(s.center, { lat: 33.5902, lng: 130.4017 })
  assert.equal(s.zoom, 14); assert.equal(s.category, 'food'); assert.equal(s.q, 'ramen')
  assert.equal(s.openNow, true); assert.equal(s.selected, 'dazaifu'); assert.equal(s.mode, 'list')
  const enc = encodeMapView(s)
  assert.equal(enc.c, '33.5902,130.4017'); assert.equal(enc.open, '1'); assert.equal(enc.sel, 'dazaifu')
})

test('decode rejects invalid coords / zoom', () => {
  assert.equal(decodeMapView(fromObj({ c: '999,130' })).center, null)
  assert.equal(decodeMapView(fromObj({ c: 'abc' })).center, null)
  assert.equal(decodeMapView(fromObj({ z: '99' })).zoom, null)
})

test('encode omits defaults (short URLs)', () => {
  assert.deepEqual(encodeMapView(DEFAULT_MAP_VIEW), {})
  assert.equal(mapViewToQuery(DEFAULT_MAP_VIEW), '')
  assert.equal(mapViewToQuery({ ...DEFAULT_MAP_VIEW, category: 'cafe' }), '?cat=cafe')
})

test('shouldOfferSearchArea: zoom change → true', () => {
  const c = { lat: 33.59, lng: 130.40 }
  assert.equal(shouldOfferSearchArea({ center: c, zoom: 12 }, { center: c, zoom: 13 }), true)
})

test('shouldOfferSearchArea: tiny pan → false, big pan → true', () => {
  const a = { center: { lat: 33.5900, lng: 130.4000 }, zoom: 14 }
  const tiny = { center: { lat: 33.5902, lng: 130.4003 }, zoom: 14 }
  const big = { center: { lat: 33.80, lng: 130.70 }, zoom: 14 }
  assert.equal(shouldOfferSearchArea(a, tiny), false)
  assert.equal(shouldOfferSearchArea(a, big), true)
})

test('metersPerPixel decreases as zoom increases', () => {
  assert.ok(metersPerPixel(35, 10) > metersPerPixel(35, 14))
})

test('boundsFromCenter contains the center; boundsCenter inverts', () => {
  const c = { lat: 33.5902, lng: 130.4017 }
  const b = boundsFromCenter(c, 0.2)
  assert.ok(b.north > c.lat && b.south < c.lat && b.east > c.lng && b.west < c.lng)
  const bc = boundsCenter(b)
  assert.ok(Math.abs(bc.lat - c.lat) < 1e-9 && Math.abs(bc.lng - c.lng) < 1e-9)
})

test('markerAccent: limited palette + brand fallback', () => {
  assert.equal(markerAccent('food'), markerAccent('japanese')) // same food group
  assert.equal(markerAccent('park'), markerAccent('sea'))      // same nature group
  assert.notEqual(markerAccent('food'), markerAccent('cafe_milk_tea'))
  assert.equal(markerAccent('unknown_category'), markerAccent('landmark')) // brand fallback
})
