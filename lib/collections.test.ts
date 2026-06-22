// node --test lib/collections.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_COLLECTIONS, buildCollectionsFromRows, findCollection } from './collections.ts'
import { filtersToCriteria } from './exploreParams.ts'

test('default collections all use structured filters (no empty filter sets)', () => {
  for (const c of DEFAULT_COLLECTIONS) {
    assert.ok(Object.keys(c.filters).length > 0, `${c.slug} has no filters`)
    assert.ok(c.titleKey && c.descKey, `${c.slug} missing i18n keys`)
  }
})

test('filtersToCriteria maps a collection to engine criteria', () => {
  const cheap = findCollection('cheap-eats')!
  const crit = filtersToCriteria(cheap.filters)
  assert.deepEqual(crit.categories, ['food'])
  assert.equal(crit.priceMax, 3000)
})

test('buildCollectionsFromRows: DB row overrides default + appends new', () => {
  const merged = buildCollectionsFromRows([
    { slug: 'rainy-day', title: 'My rainy picks', emoji: '☔', filters: { rainy: true }, sort_order: 5, is_published: true },
    { slug: 'night-owls', title: 'Night owls', filters: { category: 'izakaya' }, sort_order: 70, is_published: true },
  ])
  const rainy = merged.find((c) => c.slug === 'rainy-day')!
  assert.equal(rainy.title, 'My rainy picks')
  assert.equal(rainy.source, 'db')
  assert.equal(rainy.sortOrder, 5)
  assert.ok(merged.some((c) => c.slug === 'night-owls'))
  // sorted by sortOrder
  assert.equal(merged[0].slug, 'rainy-day')
})

test('buildCollectionsFromRows: admin can hide a default with is_published=false', () => {
  const merged = buildCollectionsFromRows([{ slug: 'onsen', is_published: false }])
  assert.ok(!merged.some((c) => c.slug === 'onsen'))
})

test('unpublished new rows are not added', () => {
  const merged = buildCollectionsFromRows([{ slug: 'draft-x', title: 'x', is_published: false }])
  assert.ok(!merged.some((c) => c.slug === 'draft-x'))
})
