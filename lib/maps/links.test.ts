// Google Maps URL parser — pure tests (Map UX Phase 5).
// Run with:  node --test lib/maps/links.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseGoogleMapsUrl, isGoogleMapsHost } from './links.ts'

test('full /maps/place link → coords + name', () => {
  const r = parseGoogleMapsUrl('https://www.google.com/maps/place/Dazaifu+Tenmangu/@33.5213,130.5347,17z/data=!3m1')
  assert.equal(r?.kind, 'coords')
  assert.equal((r as any).lat, 33.5213)
  assert.equal((r as any).lng, 130.5347)
  assert.equal((r as any).name, 'Dazaifu Tenmangu')
})

test('prefers !3d!4d data marker for coords', () => {
  const r = parseGoogleMapsUrl('https://www.google.com/maps/place/X/@33.0,130.0,17z/data=!3m1!4b1!4m5!3m4!1s0x0:0x0!8m2!3d33.5902!4d130.4017')
  assert.deepEqual([(r as any).lat, (r as any).lng], [33.5902, 130.4017])
})

test('search api link with coord query → coords', () => {
  const r = parseGoogleMapsUrl('https://www.google.com/maps/search/?api=1&query=33.59,130.40')
  assert.equal(r?.kind, 'coords')
  assert.deepEqual([(r as any).lat, (r as any).lng], [33.59, 130.4])
})

test('search api link with text query → query', () => {
  const r = parseGoogleMapsUrl('https://www.google.com/maps/search/?api=1&query=Ohori%20Park%20Fukuoka')
  assert.equal(r?.kind, 'query')
  assert.equal((r as any).query, 'Ohori Park Fukuoka')
})

test('directions destination coords → coords', () => {
  const r = parseGoogleMapsUrl('https://www.google.com/maps/dir/?api=1&destination=35.6586,139.7454')
  assert.equal(r?.kind, 'coords')
})

test('destination_place_id → placeId', () => {
  const r = parseGoogleMapsUrl('https://www.google.com/maps/dir/?api=1&destination=Tokyo&destination_place_id=ChIJ51cu8IcbXWARiRtXIothAS4')
  assert.equal(r?.kind, 'placeId')
  assert.equal((r as any).placeId, 'ChIJ51cu8IcbXWARiRtXIothAS4')
})

test('query_place_id alongside coords keeps the placeId', () => {
  const r = parseGoogleMapsUrl('https://www.google.com/maps/search/?api=1&query=33.5,130.4&query_place_id=ChIJaaaaaaaaaaaaaaaaaaaaaa')
  assert.equal(r?.kind, 'coords')
  assert.equal((r as any).placeId, 'ChIJaaaaaaaaaaaaaaaaaaaaaa')
})

test('short links are flagged for server-side expansion', () => {
  assert.equal(parseGoogleMapsUrl('https://maps.app.goo.gl/abc123')?.kind, 'short')
  assert.equal(parseGoogleMapsUrl('https://goo.gl/maps/abc123')?.kind, 'short')
})

test('geo: URI → coords', () => {
  const r = parseGoogleMapsUrl('geo:33.5902,130.4017')
  assert.equal(r?.kind, 'coords')
})

test('maps.google.com host with q coords', () => {
  const r = parseGoogleMapsUrl('https://maps.google.co.jp/?q=33.59,130.40')
  assert.equal(r?.kind, 'coords')
})

test('rejects non-google hosts and bare text (SSRF/open-redirect safe)', () => {
  assert.equal(parseGoogleMapsUrl('https://evil.example.com/maps/@33.5,130.4'), null)
  assert.equal(parseGoogleMapsUrl('just some place name'), null)
  assert.equal(parseGoogleMapsUrl(''), null)
})

test('rejects out-of-range coordinates', () => {
  // lat 999 invalid; no other coord/placeId/name → null
  assert.equal(parseGoogleMapsUrl('https://www.google.com/maps/@999,130,17z'), null)
})

test('isGoogleMapsHost allowlist', () => {
  for (const h of ['google.com', 'www.google.com', 'maps.google.com', 'google.co.jp', 'maps.app.goo.gl', 'goo.gl', 'g.co'])
    assert.equal(isGoogleMapsHost(h), true, h)
  for (const h of ['evil.com', 'notgoogle.com', 'google.evil.com'])
    assert.equal(isGoogleMapsHost(h), false, h)
})
