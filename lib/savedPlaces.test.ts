// node --test lib/savedPlaces.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergeSlugs, toggleSlug, parseSlugs } from './savedPlaces.ts'

test('mergeSlugs dedups and preserves first-seen order (no duplicates on login merge)', () => {
  assert.deepEqual(mergeSlugs(['a', 'b'], ['b', 'c']), ['a', 'b', 'c'])
  assert.deepEqual(mergeSlugs([], ['x', 'x']), ['x'])
  assert.deepEqual(mergeSlugs([' a ', ''], ['a']), ['a']) // trims + drops blanks
})

test('toggleSlug adds when missing, removes when present', () => {
  assert.deepEqual(toggleSlug(['a'], 'b'), ['a', 'b'])
  assert.deepEqual(toggleSlug(['a', 'b'], 'a'), ['b'])
})

test('parseSlugs is safe against bad JSON', () => {
  assert.deepEqual(parseSlugs('["a","b"]'), ['a', 'b'])
  assert.deepEqual(parseSlugs('not json'), [])
  assert.deepEqual(parseSlugs(null), [])
  assert.deepEqual(parseSlugs('{"x":1}'), []) // not an array
})
