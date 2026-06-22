// node --test lib/dataQuality.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { auditPlaces, auditEvents, totalFindings } from './dataQuality.ts'
import type { Place } from './places.ts'
import type { PlaceEvent } from './events.ts'

const base: Place = {
  slug: 'ok', name: 'OK Place', area: 'Hakata', desc: 'd', category: 'food', categoryLabel: 'Food',
  fee: 'free', mapUrl: 'https://maps.example/ok', photoUrl: '', img: '', imgFallback: '',
  lat: 33.59, lng: 130.42, priceType: 'free', officialWebsite: 'https://ok.example',
  openingHours: { mon: [{ open: '09:00', close: '18:00' }] }, temporaryStatus: 'open',
  lastVerifiedAt: new Date().toISOString().slice(0, 10),
}

const NOW = new Date('2026-06-22T00:00:00Z')

test('clean place yields no findings', () => {
  const m = auditPlaces([{ ...base }], { now: NOW })
  // a fully populated place should only possibly trip nothing
  assert.equal(totalFindings(m), 0)
})

test('detects missing identity / coordinates / price', () => {
  const bad: Place = { ...base, slug: '', lat: null, lng: null, priceType: null, fee: null, priceMin: null, priceMax: null }
  const m = auditPlaces([bad], { now: NOW })
  assert.ok(m.missing_identity)
  assert.ok(m.missing_coordinates)
  assert.ok(m.missing_price)
})

test('detects invalid coordinates and invalid url', () => {
  const m = auditPlaces([{ ...base, slug: 'badcoord', lat: 999, lng: 130 }, { ...base, slug: 'badurl', officialWebsite: 'javascript:alert(1)' }], { now: NOW })
  assert.deepEqual(m.invalid_coordinates, ['badcoord'])
  assert.deepEqual(m.invalid_url, ['badurl'])
})

test('detects contradictory price and open-with-unknown-hours', () => {
  const m = auditPlaces([
    { ...base, slug: 'price', priceMin: 5000, priceMax: 1000 },
    { ...base, slug: 'openunk', openingHours: null },
  ], { now: NOW })
  assert.deepEqual(m.contradictory_price, ['price'])
  assert.ok(m.open_unknown_hours.includes('openunk'))
  assert.ok(m.missing_hours.includes('openunk'))
})

test('detects stale verification and duplicate slug', () => {
  const m = auditPlaces([
    { ...base, slug: 'dup', lastVerifiedAt: '2020-01-01' },
    { ...base, slug: 'dup' },
  ], { now: NOW, verifyStaleDays: 365 })
  assert.ok(m.not_verified_recently.includes('dup'))
  assert.deepEqual(m.duplicate_slug, ['dup'])
})

const ev = (o: Partial<PlaceEvent>): PlaceEvent => ({
  id: 'e', slug: null, title: 't', description: null, placeSlug: null, venue: null, area: null, prefecture: null,
  startsAt: '2026-07-01T00:00:00Z', endsAt: '2026-07-01T03:00:00Z',
  priceType: null, priceMin: null, priceMax: null, currency: null,
  sourceUrl: 'https://src.example', registrationUrl: null, lastVerifiedAt: null,
  status: 'published', isCancelled: false, ...o,
})

test('auditEvents flags expired-published, missing-source, cancelled-published, bad url', () => {
  const m = auditEvents([
    ev({ id: 'expired', startsAt: '2026-06-01T00:00:00Z', endsAt: '2026-06-01T01:00:00Z' }),
    ev({ id: 'nosrc', sourceUrl: null }),
    ev({ id: 'cancelled', isCancelled: true }),
    ev({ id: 'badurl', registrationUrl: 'ftp://x' }),
  ], NOW)
  assert.ok(m.expired_published.includes('expired'))
  assert.ok(m.missing_source.includes('nosrc'))
  assert.ok(m.cancelled_published.includes('cancelled'))
  assert.ok(m.invalid_url.includes('badurl'))
})
