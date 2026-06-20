// Framework-free tests for place search semantics.
// Run with:  node --test lib/placeSearch.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filterPlaces, extractFeeIntent, normalizeText, type PlaceCriteria } from './placeSearch.ts'
import type { Place, Fee } from './places.ts'

function place(p: Partial<Place> & { slug: string; category: string; categoryLabel: string; fee: Fee }): Place {
  return {
    name: p.name ?? p.slug,
    area: p.area ?? 'Itoshima',
    desc: p.desc ?? '',
    mapUrl: '', photoUrl: '', img: '', imgFallback: '',
    prefecture: p.prefecture ?? 'fukuoka',
    ...p,
  } as Place
}

// Mirrors the production "Biển & BBQ" (sea) set + a few others.
const DATA: Place[] = [
  place({ slug: 'momochi', name: 'Momochi Seaside Park', category: 'sea', categoryLabel: 'Biển', fee: 'free', desc: 'Dễ đi nhất trong city, ngắm biển, cafe' }),
  place({ slug: 'keya', name: 'Keya Beach', category: 'sea', categoryLabel: 'Biển', fee: 'free' }),
  place({ slug: 'nogita', name: 'Nogita Beach', category: 'sea', categoryLabel: 'Biển', fee: 'free' }),
  place({ slug: 'uminonakamichi-saitozaki', name: 'Uminonakamichi / Saitozaki', category: 'sea', categoryLabel: 'Biển', fee: 'free', desc: 'Bãi Saitozaki free; công viên có phí' }),
  // A paid sea place — must be excluded from "free" searches.
  place({ slug: 'paid-beach', name: 'Paid Beach Club', category: 'sea', categoryLabel: 'Biển', fee: 'paid' }),
  // A landmark whose ONLY BBQ signal is a passing mention in its long description.
  // It must still match, but rank BELOW the dedicated Biển & BBQ places.
  place({ slug: 'bbq-landmark', name: 'Uminonakamichi Seaside Park', category: 'landmark', categoryLabel: 'Du lịch', fee: 'paid', desc: 'Công viên rộng lớn, có khu BBQ và picnic gia đình' }),
  place({ slug: 'camp-aburayama', name: 'Aburayama', category: 'camp', categoryLabel: 'Camping', fee: 'free', desc: 'Picnic, BBQ, đi bộ thiên nhiên' }),
  place({ slug: 'onsen-1', name: 'Some Onsen', category: 'onsen', categoryLabel: 'Onsen', fee: 'paid', desc: 'Tắm nước nóng' }),
]

function slugs(rows: Place[]): string[] {
  return rows.map((r) => r.slug).sort()
}
function run(q: string, extra: Partial<PlaceCriteria> = {}): string[] {
  return slugs(filterPlaces(DATA, { q, ...extra }))
}
/** Ranked order as returned (NOT sorted) — for relevance assertions. */
function ordered(q: string, extra: Partial<PlaceCriteria> = {}): string[] {
  return filterPlaces(DATA, { q, ...extra }).map((r) => r.slug)
}

test('extractFeeIntent detects free/paid across locales and strips the phrase', () => {
  assert.equal(extractFeeIntent(normalizeText('miễn phí')).fee, 'free')
  assert.equal(extractFeeIntent(normalizeText('free')).fee, 'free')
  assert.equal(extractFeeIntent('無料').fee, 'free')
  assert.equal(extractFeeIntent('무료').fee, 'free')
  assert.equal(extractFeeIntent('免费').fee, 'free')
  assert.equal(extractFeeIntent(normalizeText('có phí')).fee, 'paid')
  assert.equal(extractFeeIntent('有料').fee, 'paid')
  // residual concept survives
  const { fee, rest } = extractFeeIntent(normalizeText('BBQ miễn phí'))
  assert.equal(fee, 'free')
  assert.equal(rest.includes('bbq'), true)
  assert.equal(rest.includes('mien'), false)
})

test('"BBQ" reliably matches the Biển & BBQ (sea) category, not only stray text', () => {
  const r = run('BBQ')
  // all 5 sea places match via the category concept
  assert.ok(r.includes('momochi'))
  assert.ok(r.includes('keya'))
  assert.ok(r.includes('nogita'))
  assert.ok(r.includes('uminonakamichi-saitozaki'))
  assert.ok(r.includes('paid-beach'))
  // the camp place mentions BBQ in its description → also matches (valid source)
  assert.ok(r.includes('camp-aburayama'))
  // the onsen does NOT
  assert.ok(!r.includes('onsen-1'))
})

test('"BBQ miễn phí" = (BBQ concept) AND (free) — excludes paid', () => {
  const r = run('BBQ miễn phí')
  assert.ok(r.includes('momochi'))
  assert.ok(r.includes('keya'))
  assert.ok(r.includes('camp-aburayama')) // free + BBQ in desc
  assert.ok(!r.includes('paid-beach'))    // BBQ but paid → excluded
  assert.ok(!r.includes('onsen-1'))       // paid + no BBQ
  assert.notEqual(r.length, 0)            // regression: must NOT be 0 results
})

test('"miễn phí" returns all structurally-free places, regardless of text', () => {
  const r = run('miễn phí')
  assert.deepEqual(r, ['camp-aburayama', 'keya', 'momochi', 'nogita', 'uminonakamichi-saitozaki'])
  // free across locales behaves the same
  assert.deepEqual(run('free'), r)
  assert.deepEqual(run('無料'), r)
  assert.deepEqual(run('免费'), r)
})

test('"có phí" returns only paid places', () => {
  const r = run('có phí')
  assert.deepEqual(r, ['bbq-landmark', 'onsen-1', 'paid-beach'])
})

test('relevance: Biển & BBQ / Camping rank ABOVE a description-only landmark match', () => {
  const r = ordered('BBQ')
  assert.ok(r.includes('bbq-landmark'))            // still matched (BBQ in its desc)
  assert.equal(r[r.length - 1], 'bbq-landmark')    // …but ranked last (weak signal)
  const landmarkPos = r.indexOf('bbq-landmark')
  for (const s of ['momochi', 'keya', 'nogita', 'uminonakamichi-saitozaki', 'paid-beach', 'camp-aburayama']) {
    assert.ok(r.indexOf(s) < landmarkPos, `${s} should rank before bbq-landmark`)
  }
})

test('"Biển" and "Biển & BBQ" both match the sea category', () => {
  const bien = run('Biển')
  assert.ok(bien.includes('momochi') && bien.includes('keya'))
  const both = run('Biển & BBQ') // the "&" must not break matching
  assert.ok(both.includes('momochi') && both.includes('keya'))
})

test('"camping" and "onsen" match their categories', () => {
  assert.ok(run('camping').includes('camp-aburayama'))
  assert.ok(run('onsen').includes('onsen-1'))
  // Japanese / Korean concept queries also work
  assert.ok(run('温泉').includes('onsen-1'))
  assert.ok(run('海').filter((s) => s.startsWith('momochi') || s === 'keya').length > 0)
})

test('multi-word place names match order-independently (AND of tokens)', () => {
  assert.deepEqual(run('Keya Beach'), ['keya'])
  assert.deepEqual(run('beach keya'), ['keya'])
})

test('prefecture filter still applies alongside concept search', () => {
  assert.deepEqual(run('BBQ', { prefecture: 'osaka' }), []) // none in osaka
  assert.ok(run('BBQ', { prefecture: 'fukuoka' }).length > 0)
})
