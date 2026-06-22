// Phase 2 structured filters, sorting, and zero-result relaxation.
// node --test lib/placeSearchFilters.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filterPlaces, suggestRelaxation, type PlaceCriteria } from './placeSearch.ts'
import type { Place, Fee } from './places.ts'

function place(p: Partial<Place> & { slug: string }): Place {
  return {
    name: p.name ?? p.slug, area: p.area ?? 'Hakata', desc: p.desc ?? '',
    category: p.category ?? 'food', categoryLabel: p.categoryLabel ?? 'Food',
    fee: (p.fee ?? null) as Fee, mapUrl: '', photoUrl: '', img: '', imgFallback: '',
    prefecture: p.prefecture ?? 'fukuoka', ...p,
  } as Place
}

// JST Monday 10:00 = UTC 2024-01-08 01:00
const MON_10 = new Date(Date.UTC(2024, 0, 8, 1, 0))

const DATA: Place[] = [
  place({ slug: 'free-park', category: 'park', fee: 'free', priceType: 'free', lat: 33.59, lng: 130.40,
    openingHours: { mon: [{ open: '00:00', close: '23:59' }] }, goodForChildren: true, rainyDayOk: false,
    verificationStatus: 'verified', lastVerifiedAt: '2024-02-01', createdAt: '2023-01-01', communityActivity: 2 }),
  place({ slug: 'ramen-cheap', category: 'food', fee: 'paid', priceMin: 800, priceMax: 1200, lat: 33.60, lng: 130.41,
    openingHours: { mon: [{ open: '09:00', close: '15:00' }] }, reservationRequired: false, reservationRecommended: true,
    paymentMethods: ['cash', 'ic_card'], supportedLanguages: ['ja', 'en'], createdAt: '2024-05-01', communityActivity: 10 }),
  place({ slug: 'kaiseki-pricey', category: 'japanese', fee: 'paid', priceMin: 8000, priceMax: 15000, lat: 35.0, lng: 135.0,
    openingHours: { mon: [{ open: '17:00', close: '22:00' }] }, reservationRequired: true, smokingPolicy: 'no_smoking',
    createdAt: '2024-06-01', communityActivity: 1 }),
  place({ slug: 'bbq-beach', category: 'sea', fee: 'free', priceType: 'free', bbqAvailable: true, lat: 33.7, lng: 130.2,
    nearestStation: 'Itoshima', goodForGroups: true, createdAt: '2022-01-01' }),
  place({ slug: 'unknown-price-cafe', category: 'cafe_milk_tea', fee: null, lat: 33.58, lng: 130.39, createdAt: '2024-07-01' }),
  place({ slug: 'hidden', category: 'food', fee: 'paid', priceMin: 500, searchEligible: false, lat: 33.59, lng: 130.40 }),
]

const slugs = (rows: Place[]) => rows.map((r) => r.slug)
const run = (c: PlaceCriteria) => slugs(filterPlaces(DATA, c)).sort()

test('search_eligible=false is hidden by default, shown with includeIneligible', () => {
  assert.ok(!run({ q: 'hidden' }).includes('hidden'))
  assert.ok(filterPlaces(DATA, { q: 'hidden', includeIneligible: true }).some((p) => p.slug === 'hidden'))
})

test('openNow uses JST hours + excludes unknown hours', () => {
  const open = run({ openNow: true, now: MON_10 })
  assert.ok(open.includes('free-park'))   // 00–23:59
  assert.ok(open.includes('ramen-cheap')) // 09–15
  assert.ok(!open.includes('kaiseki-pricey')) // 17–22, closed at 10:00
  assert.ok(!open.includes('unknown-price-cafe')) // no hours → excluded
})

test('priceMax: free passes, in-range passes, over-budget & unknown excluded', () => {
  const r = run({ priceMax: 1500 })
  assert.ok(r.includes('free-park'))   // free always under budget
  assert.ok(r.includes('ramen-cheap')) // 800–1200 within
  assert.ok(!r.includes('kaiseki-pricey')) // 8000+ over
  assert.ok(!r.includes('unknown-price-cafe')) // unknown price excluded
})

test('priceMin overlaps the place range', () => {
  assert.ok(run({ priceMin: 5000 }).includes('kaiseki-pricey'))
  assert.ok(!run({ priceMin: 5000 }).includes('ramen-cheap'))
})

test('boolean facility/suitability filters require the structured signal', () => {
  assert.deepEqual(run({ children: true }), ['free-park'])
  assert.deepEqual(run({ bbq: true }), ['bbq-beach'])
  assert.deepEqual(run({ reservationRequired: true }), ['kaiseki-pricey'])
  assert.deepEqual(run({ reservationAvailable: true }).sort(), ['kaiseki-pricey', 'ramen-cheap'])
})

test('payment + language filters match ANY selected', () => {
  assert.deepEqual(run({ paymentMethods: ['ic_card'] }), ['ramen-cheap'])
  assert.deepEqual(run({ languages: ['en'] }), ['ramen-cheap'])
  assert.deepEqual(run({ paymentMethods: ['paypay'] }), []) // none accept it
})

test('verifiedOnly + area/station', () => {
  assert.deepEqual(run({ verifiedOnly: true }), ['free-park'])
  assert.deepEqual(run({ station: 'Itoshima' }), ['bbq-beach'])
})

test('nearby radius filters + attaches distanceKm; nearest sort orders by it', () => {
  const here = { lat: 33.59, lng: 130.40, radiusKm: 5 }
  const near = filterPlaces(DATA, { nearby: here, sort: 'nearest' })
  // kaiseki (Kyoto) is far outside 5 km; excluded
  assert.ok(!near.some((p) => p.slug === 'kaiseki-pricey'))
  assert.ok(near.every((p) => typeof p.distanceKm === 'number'))
  // first result is the closest
  for (let i = 1; i < near.length; i++) assert.ok((near[i - 1].distanceKm ?? 0) <= (near[i].distanceKm ?? 0))
})

test('sort options: price_low, newest, community', () => {
  const cheapFirst = filterPlaces(DATA, { sort: 'price_low' }).map((p) => p.slug)
  assert.equal(cheapFirst[0] === 'free-park' || cheapFirst[0] === 'bbq-beach', true) // free = 0
  const newest = filterPlaces(DATA, { sort: 'newest' }).map((p) => p.slug)
  assert.equal(newest[0], 'unknown-price-cafe') // createdAt 2024-07
  const community = filterPlaces(DATA, { sort: 'community' }).map((p) => p.slug)
  assert.equal(community[0], 'ramen-cheap') // activity 10
})

test('back-compat: legacy {q, categories, prefecture} unaffected', () => {
  assert.deepEqual(run({ categories: ['sea'] }), ['bbq-beach'])
  assert.deepEqual(run({ prefecture: 'osaka' }), []) // none in osaka
})

test('suggestRelaxation ranks the filter whose removal recovers the most', () => {
  // Over-constrained: open now (Mon 10:00) AND reservationRequired AND priceMax 1000
  const crit: PlaceCriteria = { openNow: true, now: MON_10, reservationRequired: true, priceMax: 1000 }
  assert.equal(filterPlaces(DATA, crit).length, 0)
  const sugg = suggestRelaxation(DATA, crit)
  assert.ok(sugg.length > 0)
  assert.ok(sugg.every((s) => s.count > 0))
  // dropping reservationRequired recovers results (ramen-cheap is open & cheap)
  assert.ok(sugg.some((s) => s.filter === 'reservationRequired'))
})
