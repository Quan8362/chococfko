// Tests for the pure data-driven concept merge (no DB / no next/cache).
// Run with:  node --test lib/searchConceptsBuild.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildConfigFromRows, flattenLang, filterPlaces, DEFAULT_SEARCH_CONFIG, validateConceptInput, aliasConflicts, rowMergeStatus, defaultConceptKeys, type ConceptRow, type ConceptInput } from './placeSearch.ts'
import type { Place } from './places.ts'

function place(p: Partial<Place> & { slug: string; category: string; categoryLabel: string }): Place {
  return { name: p.name ?? p.slug, area: 'Itoshima', desc: p.desc ?? '', fee: p.fee ?? null, mapUrl: '', photoUrl: '', img: '', imgFallback: '', prefecture: 'fukuoka', ...p } as Place
}

test('flattenLang merges all language arrays and de-dupes', () => {
  assert.deepEqual(
    flattenLang({ vi: ['kayak', 'cheo kayak'], en: ['kayak'], ja: ['カヤック'] }).sort(),
    ['cheo kayak', 'kayak', 'カヤック'].sort(),
  )
  assert.deepEqual(flattenLang(null), [])
})

test('a NEW facet row becomes searchable WITHOUT touching placeSearch.ts', () => {
  const rows: ConceptRow[] = [{
    key: 'kayak', type: 'facet', enabled: true,
    aliases: { vi: ['kayak', 'cheo kayak'], ja: ['カヤック'], ko: ['카약'], zh: ['皮划艇'] },
    evidence: { strong: { en: ['kayak'], ja: ['カヤック'], ko: ['카약'], zh: ['皮划艇'] } },
  }]
  const cfg = buildConfigFromRows(rows)
  const data = [
    place({ slug: 'kayak-cove', name: 'Bãi Chèo', category: 'sea', categoryLabel: 'Biển', fee: 'free', desc: 'Cho thuê kayak' }),
    place({ slug: 'plain-beach', name: 'Keya', category: 'sea', categoryLabel: 'Biển', fee: 'free', desc: 'Biển đẹp' }),
  ]
  // JA alias resolves to the place's "kayak" evidence via the configured concept
  assert.ok(filterPlaces(data, { q: 'カヤック' }, cfg).some((p) => p.slug === 'kayak-cove'))
  // a beach without kayak evidence is excluded (feature claim needs item evidence)
  assert.ok(!filterPlaces(data, { q: 'kayak' }, cfg).some((p) => p.slug === 'plain-beach'))
  // base config (no row) does NOT know the JA alias
  assert.ok(!filterPlaces(data, { q: 'カヤック' }).some((p) => p.slug === 'kayak-cove'))
})

test('disabling a concept (enabled=false) removes its facet behavior', () => {
  const cfg = buildConfigFromRows([{ key: 'bbq', type: 'facet', enabled: false }])
  assert.ok(!cfg.facets.some((f) => f.key === 'bbq')) // bbq facet gone
  const data = [place({ slug: 'beach', name: 'Beach', category: 'sea', categoryLabel: 'Biển', fee: 'free', desc: 'Biển có BBQ' })]
  // with bbq facet removed, "bbq" is now plain text and matches the desc word
  assert.ok(filterPlaces(data, { q: 'bbq' }, cfg).some((p) => p.slug === 'beach'))
  // base config keeps bbq as a facet
  assert.ok(DEFAULT_SEARCH_CONFIG.facets.some((f) => f.key === 'bbq'))
})

test('a NEW category row makes its aliases searchable (category-precise concept)', () => {
  const rows: ConceptRow[] = [{
    key: 'cat-aquarium', type: 'category', enabled: true, category_code: 'aquarium',
    aliases: { vi: ['thuy cung'], en: ['aquarium'], ja: ['水族館'] },
  }]
  const cfg = buildConfigFromRows(rows)
  const data = [place({ slug: 'marine', name: 'Marine World', category: 'aquarium', categoryLabel: 'Thủy cung', desc: 'Cá heo' })]
  assert.ok(filterPlaces(data, { q: 'aquarium' }, cfg).some((p) => p.slug === 'marine'))
  assert.ok(filterPlaces(data, { q: '水族館' }, cfg).some((p) => p.slug === 'marine'))
})

test('a new combined category does NOT create child-feature false positives', () => {
  // category alias for a combined "Surf & Beach" must not prove a "surfing" facet
  const rows: ConceptRow[] = [
    { key: 'cat-surfbeach', type: 'category', enabled: true, category_code: 'surfbeach', aliases: { vi: ['bai bien'], en: ['seaside'] } },
    { key: 'surfing', type: 'facet', enabled: true, aliases: { en: ['surf', 'surfing'] }, evidence: { strong: { en: ['surf', 'surfing'] } } },
  ]
  const cfg = buildConfigFromRows(rows)
  const data = [
    place({ slug: 'plain', name: 'Plain Cove', category: 'surfbeach', categoryLabel: 'Surf & Beach', desc: 'Bãi cát đẹp, yên tĩnh' }),
    place({ slug: 'surf-spot', name: 'Big Wave', category: 'surfbeach', categoryLabel: 'Surf & Beach', desc: 'Điểm surf nổi tiếng' }),
  ]
  // category alias is searchable → both places match "seaside"
  assert.equal(filterPlaces(data, { q: 'seaside' }, cfg).length, 2)
  // but "surfing" only matches the place with actual surf evidence (NOT the whole category)
  assert.deepEqual(filterPlaces(data, { q: 'surfing' }, cfg).map((p) => p.slug), ['surf-spot'])
})

// ── Admin validation (server + client share validateConceptInput) ───────────

const facetBase: ConceptInput = {
  key: 'kayak', type: 'facet',
  aliases: { en: ['kayak', 'kayaking'], ja: ['カヤック'] },
  evidence: { strong: { en: ['kayak'] } },
}

test('validateConceptInput accepts a well-formed facet', () => {
  assert.equal(validateConceptInput(facetBase).ok, true)
})

test('validateConceptInput rejects empty/invalid keys', () => {
  assert.ok(validateConceptInput({ ...facetBase, key: '' }).errors.includes('key_required'))
  assert.ok(validateConceptInput({ ...facetBase, key: 'Bad Key!' }).errors.includes('key_format'))
  assert.ok(validateConceptInput({ ...facetBase, key: '1bad' }).errors.includes('key_format'))
})

test('validateConceptInput rejects invalid type / weight / mode', () => {
  assert.ok(validateConceptInput({ ...facetBase, type: 'nonsense' }).errors.includes('type_invalid'))
  assert.ok(validateConceptInput({ ...facetBase, weight: 1.5 }).errors.includes('weight_invalid'))
  assert.ok(validateConceptInput({ ...facetBase, matching_mode: 'fuzzy' }).errors.includes('mode_invalid'))
})

test('validateConceptInput flags unsafe short Latin aliases and duplicates and blanks', () => {
  assert.ok(validateConceptInput({ ...facetBase, aliases: { en: ['a'] } }).errors.includes('alias_too_short'))
  assert.ok(validateConceptInput({ ...facetBase, aliases: { en: ['kayak', 'kayak'] } }).errors.includes('alias_duplicate'))
  assert.ok(validateConceptInput({ ...facetBase, aliases: { en: ['  '] } }).errors.includes('alias_blank'))
  // CJK aliases of length 1 are allowed (legitimate)
  assert.equal(validateConceptInput({ ...facetBase, aliases: { zh: ['海'] } }).ok, true)
})

test('validateConceptInput requires evidence for facets and a code for categories', () => {
  assert.ok(validateConceptInput({ key: 'x', type: 'facet', aliases: { en: ['x'] } }).errors.includes('facet_no_evidence'))
  // structured flag alone is enough evidence
  assert.equal(validateConceptInput({ key: 'pet', type: 'facet', aliases: { en: ['pet'] }, evidence: { structured_flags: ['pet_friendly'] } }).ok, true)
  assert.ok(validateConceptInput({ key: 'aq', type: 'category', aliases: { en: ['aquarium'] } }).errors.includes('category_no_code'))
})

test('aliasConflicts detects shared aliases with other ENABLED concepts only', () => {
  const others = [
    { key: 'other', enabled: true, aliases: { en: ['kayak'] } },
    { key: 'disabled-one', enabled: false, aliases: { en: ['kayak'] } },
    { key: 'kayak', enabled: true, aliases: { en: ['kayak'] } }, // self — ignored
  ]
  const hits = aliasConflicts(facetBase, others)
  assert.deepEqual(hits, ['other'])
})

// ── Default ↔ database merge status ─────────────────────────────────────────

test('rowMergeStatus classifies db / override / db-disabled', () => {
  const keys = defaultConceptKeys()
  assert.equal(rowMergeStatus({ key: 'kayak', type: 'facet', enabled: true }, keys), 'db')        // new
  assert.equal(rowMergeStatus({ key: 'bbq', type: 'facet', enabled: true }, keys), 'override')     // shadows default
  assert.equal(rowMergeStatus({ key: 'bbq', type: 'facet', enabled: false }, keys), 'db-disabled') // turns default off
})

test('defaultConceptKeys exposes built-in facet keys + category codes', () => {
  const keys = defaultConceptKeys()
  assert.ok(keys.facetKeys.has('bbq') && keys.facetKeys.has('nightlife'))
  assert.ok(keys.categoryCodes.has('sea') && keys.categoryCodes.has('camp'))
})

test('disabling a default concept via DB row removes it from the merged config', () => {
  const cfg = buildConfigFromRows([{ key: 'nightlife', type: 'facet', enabled: false }] as ConceptRow[])
  assert.ok(!cfg.facets.some((f) => f.key === 'nightlife')) // gone → search no longer treats it as a facet
})
