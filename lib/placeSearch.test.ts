// Framework-free tests for place search semantics.
// Run with:  node --test lib/placeSearch.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filterPlaces, extractFeeIntent, normalizeText, bbqEvidenceScore, type PlaceCriteria } from './placeSearch.ts'
import type { Place, Fee } from './places.ts'
import type { LocalizedTag } from './tags.ts'

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

function bbqTag(): LocalizedTag {
  return {
    id: 'bbq', name: 'bbq',
    display_name_vi: 'BBQ', display_name_en: 'BBQ',
    display_name_ja: 'バーベキュー', display_name_ko: '바비큐', display_name_zh: '烧烤',
  } as unknown as LocalizedTag
}

// Mirrors the production "Biển & BBQ" (sea) set + camp/onsen, with explicit
// item-level BBQ signals attached only where they genuinely exist. This is the
// crux of the false-positive fix: most beaches under the combined "Biển & BBQ"
// category have NO BBQ signal and must NOT match a "BBQ" search.
const DATA: Place[] = [
  // Beach-only places — under "Biển & BBQ" category but ZERO BBQ evidence.
  place({ slug: 'momochi', name: 'Momochi Seaside Park', category: 'sea', categoryLabel: 'Biển', fee: 'free', desc: 'Dễ đi nhất trong city, ngắm biển, cafe' }),
  place({ slug: 'keya', name: 'Keya Beach', category: 'sea', categoryLabel: 'Biển', fee: 'free', desc: 'Biển đẹp, mùa hè đông vui' }),
  place({ slug: 'nogita', name: 'Nogita Beach', category: 'sea', categoryLabel: 'Biển', fee: 'free', desc: 'Cafe biển, lái xe đi rất chill' }),
  // A paid beach-only place — must be excluded from "free" AND "BBQ" searches.
  place({ slug: 'paid-beach', name: 'Paid Beach Club', category: 'sea', categoryLabel: 'Biển', fee: 'paid', desc: 'Bãi tắm có thu phí' }),
  // Beach that explicitly mentions BBQ in its description → genuine BBQ match.
  place({ slug: 'shingu', name: 'Shingu Beach', category: 'sea', categoryLabel: 'Biển', fee: 'free', desc: 'Bãi rộng, đẹp, hợp tắm biển và BBQ' }),
  // Beach with an explicit item-level BBQ TAG (strongest signal).
  place({ slug: 'tagged-beach', name: 'Tagged Beach', category: 'sea', categoryLabel: 'Biển', fee: 'free', desc: 'Bãi biển có khu nướng', tags: [bbqTag()] }),
  // Camp place that mentions BBQ in description → genuine BBQ match.
  place({ slug: 'camp-aburayama', name: 'Aburayama', category: 'camp', categoryLabel: 'Camping', fee: 'free', desc: 'Picnic, BBQ, đi bộ thiên nhiên' }),
  // Onsen — no BBQ at all.
  place({ slug: 'onsen-1', name: 'Some Onsen', category: 'onsen', categoryLabel: 'Onsen', fee: 'paid', desc: 'Tắm nước nóng' }),
]

const BBQ_MATCHES = ['camp-aburayama', 'shingu', 'tagged-beach'] // the only genuine BBQ places
const BEACH_ONLY = ['keya', 'momochi', 'nogita', 'paid-beach']   // beaches with NO BBQ evidence

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
  // residual BBQ concept survives the fee-phrase strip
  const { fee, rest } = extractFeeIntent(normalizeText('BBQ miễn phí'))
  assert.equal(fee, 'free')
  assert.equal(rest.includes('bbq'), true)
  assert.equal(rest.includes('mien'), false)
})

// ── Required regression tests (the false-positive fix) ──────────────────────

// (1) A beach-only location under "Biển & BBQ" does NOT match "BBQ".
test('(1) beach-only places under Biển & BBQ do NOT match "BBQ"', () => {
  const r = run('BBQ')
  for (const s of BEACH_ONLY) assert.ok(!r.includes(s), `${s} (beach-only) must NOT match BBQ`)
})

// (2) A location with an explicit BBQ tag matches "BBQ".
test('(2) a place with an explicit BBQ tag matches "BBQ"', () => {
  assert.ok(run('BBQ').includes('tagged-beach'))
  assert.equal(bbqEvidenceScore(DATA.find((p) => p.slug === 'tagged-beach')!) > 0, true)
})

// (3) A location whose description explicitly mentions BBQ matches "BBQ".
test('(3) a description that explicitly mentions BBQ matches "BBQ"', () => {
  const r = run('BBQ')
  assert.ok(r.includes('shingu'))         // beach + "BBQ" in desc
  assert.ok(r.includes('camp-aburayama')) // camp + "BBQ" in desc
})

// (4) A location with no BBQ evidence does not match "BBQ".
test('(4) no BBQ evidence → no match', () => {
  const r = run('BBQ')
  assert.ok(!r.includes('onsen-1'))
  // exactly the genuine BBQ places, nothing else
  assert.deepEqual(r, BBQ_MATCHES)
})

// (5) "BBQ miễn phí" = explicit BBQ relevance AND free status.
test('(5) "BBQ miễn phí" requires BBQ evidence AND free price', () => {
  const r = run('BBQ miễn phí')
  assert.ok(r.includes('shingu'))         // free + BBQ
  assert.ok(r.includes('tagged-beach'))   // free + BBQ tag
  assert.ok(r.includes('camp-aburayama')) // free + BBQ
  assert.ok(!r.includes('paid-beach'))    // free beach but no BBQ
  assert.ok(!r.includes('keya'))          // free beach but no BBQ
  assert.notEqual(r.length, 0)            // must NOT be empty
})

// (6) "miễn phí" still matches free beach-only locations, regardless of category.
test('(6) "miễn phí" returns ALL structurally-free places (incl. beach-only)', () => {
  const r = run('miễn phí')
  assert.deepEqual(r, ['camp-aburayama', 'keya', 'momochi', 'nogita', 'shingu', 'tagged-beach'])
  assert.ok(r.includes('keya') && r.includes('momochi')) // beach-only free places included
  // free across locales (vi/en/ja/ko/zh) behaves identically — same structured semantics
  assert.deepEqual(run('free'), r)
  assert.deepEqual(run('無料'), r)
  assert.deepEqual(run('무료'), r)
  assert.deepEqual(run('免费'), r)
})

// (7) The "Biển & BBQ" category page still works (category filter ignores BBQ facet).
test('(7) category filter for sea returns ALL sea places (Biển & BBQ page intact)', () => {
  const sea = slugs(filterPlaces(DATA, { categories: ['sea'] }))
  assert.deepEqual(sea, ['keya', 'momochi', 'nogita', 'paid-beach', 'shingu', 'tagged-beach'])
})

// (8) Category joins do not create duplicate cards.
test('(8) results contain no duplicate slugs', () => {
  for (const q of ['BBQ', 'Biển', 'miễn phí', 'Biển & BBQ', 'beach']) {
    const r = ordered(q)
    assert.equal(new Set(r).size, r.length, `duplicate slug in results for "${q}"`)
  }
})

// (9) Result count reflects deduplicated, genuinely matching locations.
test('(9) "BBQ" count = number of genuinely BBQ-relevant places', () => {
  assert.equal(run('BBQ').length, BBQ_MATCHES.length)
})

// (10) VI/EN/JA/KO/ZH BBQ + free aliases use the same structured semantics.
test('(10) multilingual BBQ aliases resolve to the same item-level evidence', () => {
  for (const alias of ['BBQ', 'barbecue', 'バーベキュー', '바비큐', '烧烤']) {
    assert.deepEqual(run(alias), BBQ_MATCHES, `alias "${alias}" must resolve to the same set`)
  }
})

// ── Ranking & general semantics ─────────────────────────────────────────────

test('relevance: explicit BBQ tag ranks ABOVE description-only BBQ mentions', () => {
  const r = ordered('BBQ')
  assert.equal(r[0], 'tagged-beach') // strongest signal (tag) first
  const tagPos = r.indexOf('tagged-beach')
  for (const s of ['shingu', 'camp-aburayama']) {
    assert.ok(r.indexOf(s) > tagPos, `${s} (desc-only) should rank below the tagged place`)
  }
})

test('"Biển" matches the sea category; "Biển & BBQ" applies AND (beach AND BBQ)', () => {
  const bien = run('Biển')
  // every beach (incl. beach-only) matches "Biển"
  for (const s of [...BEACH_ONLY, 'shingu', 'tagged-beach']) assert.ok(bien.includes(s), `${s} should match Biển`)
  // "Biển & BBQ" tokenizes to [bien, bbq] → AND → beaches WITH BBQ evidence only
  const both = run('Biển & BBQ')
  assert.ok(both.includes('shingu') && both.includes('tagged-beach'))
  for (const s of BEACH_ONLY) assert.ok(!both.includes(s), `${s} (no BBQ) must not match "Biển & BBQ"`)
})

test('"camping" and "onsen" still match their categories', () => {
  assert.ok(run('camping').includes('camp-aburayama'))
  assert.ok(run('onsen').includes('onsen-1'))
  assert.ok(run('温泉').includes('onsen-1'))
  assert.ok(run('海').includes('keya'))
})

test('multi-word place names match order-independently (AND of tokens)', () => {
  assert.deepEqual(run('Keya Beach'), ['keya'])
  assert.deepEqual(run('beach keya'), ['keya'])
})

test('prefecture filter still applies alongside BBQ search', () => {
  assert.deepEqual(run('BBQ', { prefecture: 'osaka' }), []) // none in osaka
  assert.ok(run('BBQ', { prefecture: 'fukuoka' }).length > 0)
})
