// node --test lib/recentPlaces.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addRecent, parseRecent, recentSlugs, RECENT_CAP } from './recentPlaces.ts'

test('addRecent moves slug to front, dedups, and caps', () => {
  let list = addRecent([], 'a', 1)
  list = addRecent(list, 'b', 2)
  list = addRecent(list, 'a', 3) // re-view a → front, no duplicate
  assert.deepEqual(list.map((i) => i.slug), ['a', 'b'])
  assert.equal(list[0].ts, 3)
})

test('addRecent caps the list length', () => {
  let list: { slug: string; ts: number }[] = []
  for (let i = 0; i < RECENT_CAP + 10; i++) list = addRecent(list, `s${i}`, i)
  assert.equal(list.length, RECENT_CAP)
  assert.equal(list[0].slug, `s${RECENT_CAP + 9}`) // newest first
})

test('addRecent ignores blank slugs', () => {
  assert.deepEqual(addRecent([], '  ', 1), [])
})

test('parseRecent + recentSlugs', () => {
  assert.deepEqual(parseRecent('not json'), [])
  const items = parseRecent('[{"slug":"a","ts":1},{"slug":"b","ts":5},{"bad":1}]')
  assert.deepEqual(items, [{ slug: 'a', ts: 1 }, { slug: 'b', ts: 5 }])
  assert.deepEqual(recentSlugs(items), ['b', 'a']) // sorted by ts desc
})
