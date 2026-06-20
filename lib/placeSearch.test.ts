// Framework-free tests for place search semantics.
// Run with:  node --test lib/placeSearch.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filterPlaces, extractFeeIntent, extractFacets, normalizeText, normalizeConfig, bbqEvidenceScore, explainMatch, DEFAULT_SEARCH_CONFIG, type SearchConfig, type FeatureFacet, type PlaceCriteria } from './placeSearch.ts'
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

function campingTag(): LocalizedTag {
  return {
    id: 'camping', name: 'camping',
    display_name_vi: 'Cắm trại', display_name_en: 'Camping',
    display_name_ja: 'キャンプ', display_name_ko: '캠핑', display_name_zh: '露营',
  } as unknown as LocalizedTag
}

function nightlifeTag(): LocalizedTag {
  return {
    id: 'nightlife', name: 'nightlife',
    display_name_vi: 'Vui chơi đêm', display_name_en: 'Nightlife',
    display_name_ja: 'ナイトライフ', display_name_ko: '나이트라이프', display_name_zh: '夜生活',
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
  // ── "Camping & picnic" umbrella: camping vs picnic are SEPARATE facets ──
  // Picnic-only camp place (also mentions BBQ) → matches picnic + BBQ, NOT camping.
  place({ slug: 'camp-aburayama', name: 'Aburayama', category: 'camp', categoryLabel: 'Camping', fee: 'free', desc: 'Picnic, BBQ, đi bộ thiên nhiên' }),
  // Camping-only camp place → matches camping (vi "cắm trại"), NOT picnic, NOT BBQ.
  place({ slug: 'camp-cantrai', name: 'Khu cắm trại rừng', category: 'camp', categoryLabel: 'Camping', fee: 'free', desc: 'Khu cắm trại yên tĩnh giữa rừng, có suối' }),
  // Camp place whose camping signal is an explicit TAG (strongest) — desc has no camp word.
  place({ slug: 'camp-tagged', name: 'Tagged Camp', category: 'camp', categoryLabel: 'Camping', fee: 'paid', desc: 'Khu vực thiên nhiên rộng', tags: [campingTag()] }),
  // ── "Ăn uống & vui chơi đêm" umbrella: nightlife is a SEPARATE facet ──
  // Strong nightlife evidence (izakaya + bar) in description.
  place({ slug: 'izakaya-bar', name: 'Yokocho Alley', category: 'food', categoryLabel: 'Ăn đêm', fee: null, desc: 'Izakaya, bar, nhậu khuya' }),
  // Nightlife via explicit TAG (strongest).
  place({ slug: 'club-tagged', name: 'Tagged Club', category: 'food', categoryLabel: 'Ăn đêm', fee: null, desc: 'Quán về khuya', tags: [nightlifeTag()] }),
  // Daytime restaurant — NO nightlife evidence (lunch/breakfast only).
  place({ slug: 'day-diner', name: 'Sunrise Diner', category: 'food', categoryLabel: 'Ăn đêm', fee: null, desc: 'Cơm trưa, ăn sáng, gia đình' }),
  // ONLY a weak alcohol mention ("rượu") — must NOT establish nightlife by itself.
  place({ slug: 'wine-only', name: 'Góc Nhỏ', category: 'food', categoryLabel: 'Ăn đêm', fee: null, desc: 'Quán rượu, cà phê, bia' }),
  // Substring-precision fixture: a shrine whose name contains "Tenmangu" (has the
  // substring "an") but whose text has NO standalone "an"/"uong" word.
  place({ slug: 'tenmangu-shrine', name: 'Dazaifu Tenmangu', category: 'landmark', categoryLabel: 'Du lịch', fee: null, desc: 'Den tho co kinh, cau may hoc hanh' }),
  // Onsen — no BBQ / camping / picnic at all.
  place({ slug: 'onsen-1', name: 'Some Onsen', category: 'onsen', categoryLabel: 'Onsen', fee: 'paid', desc: 'Tắm nước nóng' }),
]

const NIGHTLIFE_MATCHES = ['club-tagged', 'izakaya-bar'] // genuine strong nightlife evidence

const BBQ_MATCHES = ['camp-aburayama', 'shingu', 'tagged-beach']      // the only genuine BBQ places
const CAMPING_MATCHES = ['camp-cantrai', 'camp-tagged']              // genuine camping evidence
const PICNIC_MATCHES = ['camp-aburayama']                            // genuine picnic evidence
const BEACH_ONLY = ['keya', 'momochi', 'nogita', 'paid-beach']       // beaches with NO BBQ evidence

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
  assert.deepEqual(r, ['camp-aburayama', 'camp-cantrai', 'keya', 'momochi', 'nogita', 'shingu', 'tagged-beach'])
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

// ── "Camping & picnic" umbrella: camping & picnic are SEPARATE item-level facets ──

test('camping & picnic are separate facets — neither implies the other via category', () => {
  // camping matches ONLY camping-evidence places (not picnic-only camp-aburayama)
  assert.deepEqual(run('camping'), CAMPING_MATCHES)
  // picnic matches ONLY picnic-evidence places (not camping-only places)
  assert.deepEqual(run('picnic'), PICNIC_MATCHES)
  // the umbrella false positives are gone:
  assert.ok(!run('camping').includes('camp-aburayama'), 'picnic-only place must NOT match camping')
  assert.ok(!run('picnic').includes('camp-cantrai'), 'camping-only place must NOT match picnic')
  assert.ok(!run('picnic').includes('camp-tagged'), 'camping-tagged place must NOT match picnic')
})

test('camping evidence: explicit tag (strong) and vi "cắm trại" in description both match', () => {
  assert.ok(run('camping').includes('camp-tagged'))  // tag
  assert.ok(run('camping').includes('camp-cantrai')) // "cắm trại" in desc
  // tag (structured) ranks above a description-only camping mention
  const r = ordered('camping')
  assert.ok(r.indexOf('camp-tagged') < r.indexOf('camp-cantrai'))
})

test('camping facet resolves across vi/en/ja/ko/zh aliases', () => {
  for (const alias of ['camping', 'cắm trại', 'キャンプ', '캠핑', '露营']) {
    assert.ok(run(alias).includes('camp-tagged'), `alias "${alias}" should match the camping-tagged place`)
  }
})

test('"camping miễn phí" = camping evidence AND free (excludes PAID camping place)', () => {
  const r = run('camping miễn phí')
  assert.ok(r.includes('camp-cantrai'))   // camping + free
  assert.ok(!r.includes('camp-tagged'))   // camping but PAID → excluded
  assert.ok(!r.includes('camp-aburayama'))// free but picnic-only (no camping)
})

test('extractFacets isolates facet intent (incl. multi-word) and keeps residual text', () => {
  assert.deepEqual(extractFacets(normalizeText('cắm trại')).facets.map((f) => f.key), ['camping'])
  const r2 = extractFacets(normalizeText('bbq itoshima'))
  assert.deepEqual(r2.facets.map((f) => f.key), ['bbq'])
  assert.equal(r2.rest, 'itoshima')
  // "camp" alias must NOT be swallowed from inside "camping" (word boundary)
  assert.deepEqual(extractFacets(normalizeText('camping')).facets.map((f) => f.key), ['camping'])
  // a plain query with no facet leaves text untouched, no facets
  const r3 = extractFacets(normalizeText('keya beach'))
  assert.equal(r3.facets.length, 0)
  assert.equal(r3.rest, 'keya beach')
})

test('non-facet category concepts still match their categories (onsen, sea)', () => {
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

// ── Nightlife facet ("Ăn uống & vui chơi đêm" umbrella) ──────────────────────

test('nightlife: explicit tag + izakaya/bar evidence match; daytime & weak-alcohol do NOT', () => {
  const r = run('vui chơi đêm')
  assert.deepEqual(r, NIGHTLIFE_MATCHES)
  assert.ok(r.includes('izakaya-bar'))  // izakaya + bar in summary
  assert.ok(r.includes('club-tagged'))  // explicit nightlife tag
  assert.ok(!r.includes('day-diner'))   // daytime restaurant, no nightlife evidence
  assert.ok(!r.includes('wine-only'))   // only weak "rượu"/"bia" → not nightlife
})

test('nightlife: food-category membership does NOT prove nightlife for all food places', () => {
  const food = filterPlaces(DATA, { categories: ['food'] }).map((p) => p.slug)
  assert.ok(food.includes('day-diner') && food.includes('wine-only')) // both ARE food
  const nl = run('vui chơi đêm')
  assert.ok(!nl.includes('day-diner') && !nl.includes('wine-only'))   // but NOT nightlife
})

test('nightlife: a bare alcohol mention alone never matches (strong evidence required)', () => {
  assert.ok(!run('nightlife').includes('wine-only'))
  assert.ok(run('bar').includes('izakaya-bar'))   // en alias "bar" → bar/izakaya evidence
  assert.ok(!run('bar').includes('day-diner'))
})

test('nightlife resolves across vi/en/ja/ko/zh aliases', () => {
  for (const alias of ['vui chơi đêm', 'nightlife', '夜遊び', '나이트라이프', '夜生活'])
    assert.ok(run(alias).includes('club-tagged'), `alias "${alias}"`)
})

test('"quán nhậu Nhật" still returns the izakaya CATEGORY (nightlife alias did not hijack it)', () => {
  // izakaya/quán nhậu are NOT nightlife aliases → category concept preserved
  const r = extractFacets(normalizeText('quan nhau nhat'))
  assert.equal(r.facets.length, 0)            // no facet triggered
  assert.equal(r.rest, 'quan nhau nhat')      // text left for category matching
})

// ── Substring precision (Class B fix) ───────────────────────────────────────

test('short Latin tokens do not match inside unrelated words', () => {
  assert.ok(!run('an').includes('tenmangu-shrine'))      // "an" ⊄ "tenmangu"
  assert.ok(!run('ăn uống').includes('tenmangu-shrine')) // neither token matches the shrine
})

test('meaningful whole words & phrases still match', () => {
  assert.deepEqual(run('Keya Beach'), ['keya'])  // exact multi-word
  assert.ok(run('beach').includes('keya'))        // whole word
  assert.ok(run('seaside').includes('momochi'))   // "Momochi Seaside Park" name word
})

test('English plural handled narrowly (parks↔park), not as a broad prefix', () => {
  assert.ok(run('parks').includes('momochi'))     // plural query → singular name word "park"
  // but a 3-letter Vietnamese syllable must NOT prefix-match a different word
  assert.ok(!run('nhậu').includes('day-diner'))   // "nhau" ⊄ "nha"-words; day-diner has no nhậu
})

// ── Normalization (NFKD / width / case / accents / connectors / whitespace) ──

test('normalization: full-width, case, accents, dakuten, jamo, connectors, whitespace', () => {
  assert.deepEqual(run('ＢＢＱ'), run('BBQ'))              // full-width → NFKD fold
  assert.ok(run('BIỂN').includes('keya'))                 // uppercase + accents
  assert.ok(run('バーベキュー').includes('tagged-beach'))  // JA dakuten alias
  assert.ok(run('캠핑').includes('camp-tagged'))           // KO jamo alias
  assert.ok(run('biển và bbq').includes('shingu'))        // "và" connector ignored
  assert.ok(run('biển and bbq').includes('shingu'))       // "and" connector ignored
  assert.deepEqual(run('  keya   beach  '), ['keya'])     // collapse whitespace
})

// ── Config-driven extensibility (no code change for new concepts) ───────────

test('engine is config-driven: a NEW facet adds multilingual aliases without code change', () => {
  const kayak: FeatureFacet = {
    key: 'kayak',
    aliases: ['kayak', 'cheo kayak', 'カヤック', '카약', '皮划艇'],
    evidence: ['kayak', 'カヤック', '카약', '皮划艇'],
  }
  const cfg: SearchConfig = normalizeConfig({ ...DEFAULT_SEARCH_CONFIG, facets: [...DEFAULT_SEARCH_CONFIG.facets, kayak] })
  const data = [
    place({ slug: 'kayak-cove', name: 'Bãi Chèo', category: 'sea', categoryLabel: 'Biển', fee: 'free', desc: 'Cho thuê kayak, ngắm biển' }),
    ...DATA,
  ]
  const has = (q: string, c?: SearchConfig) => filterPlaces(data, { q }, c).some((p) => p.slug === 'kayak-cove')
  // The Japanese alias only resolves to the place's "kayak" evidence WHEN configured.
  assert.equal(has('カヤック'), false)        // no config → JA alias unknown
  assert.equal(has('カヤック', cfg), true)     // configured → searchable, no code change
  assert.equal(has('kayak', cfg), true)
  // a beach with NO kayak evidence is excluded (feature claim needs item evidence)
  assert.equal(filterPlaces(data, { q: 'kayak' }, cfg).some((p) => p.slug === 'keya'), false)
})

test('explainMatch reports why a place matched (dev diagnostics)', () => {
  const tagged = DATA.find((p) => p.slug === 'tagged-beach')!
  const ex = explainMatch(tagged, 'BBQ')
  assert.equal(ex.matched, true)
  assert.ok(ex.reasons.some((r) => r.concept === 'facet:bbq' && r.weight >= 12)) // structured/tag
  const miss = explainMatch(DATA.find((p) => p.slug === 'keya')!, 'BBQ')
  assert.equal(miss.matched, false) // beach-only, no BBQ evidence
})
