// node --test lib/discoveryShortcuts.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { QUICK_INTENTS, PRIMARY_INTENTS, SECONDARY_INTENTS, intentHref, validateShortcuts } from './discoveryShortcuts.ts'

// The real category codes (kept in sync with lib/places `categories`).
const CATEGORY_CODES = ['landmark', 'food', 'sea', 'camp', 'mountain', 'park', 'viet', 'grocery', 'izakaya', 'japanese', 'thai', 'chinese', 'korean', 'cafe_milk_tea', 'kids_playground', 'onsen']

test('taxonomy passes integrity validation (no dup ids/labels/destinations, no category intents)', () => {
  assert.deepEqual(validateShortcuts(CATEGORY_CODES), [])
})

test('exactly 6 primary intents, the rest secondary', () => {
  assert.equal(PRIMARY_INTENTS.length, 6)
  assert.equal(SECONDARY_INTENTS.length, QUICK_INTENTS.length - 6)
})

test('no intent sets a place category (intent vs category separation)', () => {
  for (const s of QUICK_INTENTS) assert.ok(!s.filters.category, `${s.id} must not set a category`)
})

test('the Phase-7 duplication is gone (no camping/vietnamese intents)', () => {
  const ids = QUICK_INTENTS.map((s) => s.id)
  assert.ok(!ids.includes('camping_bbq'))
  assert.ok(!ids.includes('vietnamese'))
  // and nothing routes to a bare category destination
  for (const s of QUICK_INTENTS) {
    for (const code of CATEGORY_CODES) {
      assert.notEqual(intentHref(s), `/places?category=${code}`)
    }
  }
})

test('every intent produces a non-empty deep link', () => {
  for (const s of QUICK_INTENTS) assert.match(intentHref(s), /^\/places\?.+/)
})

test('eat_cheap is a pure price filter (combinable with any category)', () => {
  const cheap = QUICK_INTENTS.find((s) => s.id === 'eat_cheap')!
  assert.equal(intentHref(cheap), '/places?priceMax=3000')
})

test('all intent label keys exist in every locale (no fallback-only coverage)', () => {
  for (const loc of ['vi', 'en', 'ja', 'ko', 'zh']) {
    const msg = JSON.parse(readFileSync(new URL(`../messages/${loc}.json`, import.meta.url), 'utf-8'))
    const eh = msg.explore_home ?? {}
    for (const s of QUICK_INTENTS) {
      assert.ok(eh[s.labelKey], `${loc}.json missing explore_home.${s.labelKey}`)
    }
    for (const k of ['quick_needs_heading', 'categories_browse_heading', 'discover_sub', 'show_more', 'show_less']) {
      assert.ok(eh[k], `${loc}.json missing explore_home.${k}`)
    }
  }
})

test('VI currency label uses ¥3,000 (comma), not ¥3.000', () => {
  const vi = JSON.parse(readFileSync(new URL('../messages/vi.json', import.meta.url), 'utf-8'))
  const label = vi.explore_home.intent_eat_cheap as string
  assert.ok(label.includes('¥3,000'), `expected ¥3,000 in "${label}"`)
  assert.ok(!label.includes('¥3.000'), `must not use ¥3.000 in "${label}"`)
})
