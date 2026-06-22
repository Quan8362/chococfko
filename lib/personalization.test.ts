// node --test lib/personalization.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  type PlaceLite, hasSignal, categoryAffinity, savedCategories, recommend,
} from './personalization.ts'

const places: PlaceLite[] = [
  { slug: 'ramen-1', category: 'food', prefecture: 'fukuoka' },
  { slug: 'ramen-2', category: 'food', prefecture: 'fukuoka' },
  { slug: 'ramen-3', category: 'food', prefecture: 'tokyo' },
  { slug: 'cafe-1', category: 'cafe_milk_tea', prefecture: 'fukuoka' },
  { slug: 'onsen-1', category: 'onsen', prefecture: 'fukuoka' },
  { slug: 'park-1', category: 'park', prefecture: 'osaka' },
]

test('hasSignal: false for empty new user, true with any signal', () => {
  assert.equal(hasSignal({ savedSlugs: [], recentSlugs: [] }), false)
  assert.equal(hasSignal({ savedSlugs: ['x'], recentSlugs: [] }), true)
  assert.equal(hasSignal({ savedSlugs: [], recentSlugs: [], region: 'fukuoka' }), true)
})

test('categoryAffinity / savedCategories rank by count', () => {
  const idx = new Map(places.map((p) => [p.slug, p]))
  const aff = categoryAffinity(['ramen-1', 'ramen-2', 'cafe-1'], idx)
  assert.equal(aff.get('food'), 2)
  assert.equal(aff.get('cafe_milk_tea'), 1)
  assert.deepEqual(savedCategories(['ramen-1', 'ramen-2', 'cafe-1'], idx), ['food', 'cafe_milk_tea'])
})

test('new user (no signal) gets empty recs → caller falls back', () => {
  assert.deepEqual(recommend({ candidates: places, signal: { savedSlugs: [], recentSlugs: [] } }), [])
})

test('recommend excludes already-saved/recent and explains by saved category', () => {
  const recs = recommend({
    candidates: places,
    signal: { savedSlugs: ['ramen-1'], recentSlugs: [] },
    limit: 8,
  })
  const slugs = recs.map((r) => r.slug)
  assert.ok(!slugs.includes('ramen-1'))                 // already saved
  assert.ok(slugs.includes('ramen-2'))                  // same affinity category
  const r2 = recs.find((r) => r.slug === 'ramen-2')!
  assert.equal(r2.reason.key, 'because_saved_category')
  assert.equal(r2.reason.params?.category, 'food')
})

test('diversity: a single category cannot dominate (maxPerCategory)', () => {
  const many: PlaceLite[] = Array.from({ length: 6 }, (_, i) => ({ slug: `food-${i}`, category: 'food', prefecture: 'fukuoka' }))
  const recs = recommend({
    candidates: many,
    signal: { savedSlugs: ['seed'], recentSlugs: [] }, // seed not in candidates → affinity 0
    limit: 8,
    maxPerCategory: 2,
  })
  // no affinity at all (seed unknown) and no region → nothing scores
  assert.equal(recs.length, 0)

  const recs2 = recommend({
    candidates: [...many, { slug: 'seed', category: 'food', prefecture: 'fukuoka' }],
    signal: { savedSlugs: ['seed'], recentSlugs: [] },
    limit: 8,
    maxPerCategory: 2,
  })
  assert.equal(recs2.length, 2) // capped to 2 food recs despite many candidates
})

test('region signal yields popular_in_region reason when no category affinity', () => {
  const recs = recommend({
    candidates: places,
    signal: { savedSlugs: [], recentSlugs: [], region: 'osaka' },
    limit: 5,
  })
  assert.ok(recs.some((r) => r.slug === 'park-1' && r.reason.key === 'popular_in_region'))
})
