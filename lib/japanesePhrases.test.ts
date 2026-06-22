// node --test lib/japanesePhrases.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { phrasesForCategory, PHRASE_TEMPLATES } from './japanesePhrases.ts'

test('all templates are complete (ja + romaji + vi, unique ids)', () => {
  const ids = new Set<string>()
  for (const [key, p] of Object.entries(PHRASE_TEMPLATES)) {
    assert.equal(p.id, key)
    assert.ok(p.ja.trim() && p.romaji.trim() && p.vi.trim(), `incomplete phrase ${key}`)
    assert.ok(!ids.has(p.id))
    ids.add(p.id)
  }
})

test('selection is category-aware', () => {
  const food = phrasesForCategory('food').map((p) => p.id)
  assert.ok(food.includes('reservation') && food.includes('private_room') && food.includes('parking'))
  const park = phrasesForCategory('park').map((p) => p.id)
  assert.ok(park.includes('parking'))
  assert.ok(!park.includes('reservation')) // restaurant-only phrase not shown for parks
  assert.ok(phrasesForCategory('onsen').some((p) => p.id === 'tattoo'))
  assert.ok(phrasesForCategory('camp').some((p) => p.id === 'campsite_checkin'))
  assert.ok(phrasesForCategory('kids_playground').some((p) => p.id === 'children'))
})
