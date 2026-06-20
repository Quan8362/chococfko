// Pure tests for homepage search-URL + logo-reset helpers.
// Run with:  node --test lib/homeNav.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { searchUrl, queryFromParams, isHomePath, HOME_RESET_EVENT } from './homeNav.ts'

test('searchUrl encodes a query and drops it when empty', () => {
  assert.equal(searchUrl('/', 'ggggg'), '/?q=ggggg')
  assert.equal(searchUrl('/', 'BBQ miễn phí'), '/?q=BBQ%20mi%E1%BB%85n%20ph%C3%AD')
  assert.equal(searchUrl('/', ''), '/')        // empty → clean path (logo reset)
  assert.equal(searchUrl('/', '   '), '/')     // whitespace-only → clean path
  assert.equal(searchUrl('', ''), '/')         // never returns empty string
})

test('queryFromParams reads and trims ?q', () => {
  const params = new Map([['q', '  hello  ']])
  assert.equal(queryFromParams((k) => params.get(k) ?? null), 'hello')
  assert.equal(queryFromParams(() => null), '')
})

test('isHomePath identifies the homepage for same-route reset', () => {
  assert.equal(isHomePath('/'), true)
  assert.equal(isHomePath('/places'), false)
  assert.equal(isHomePath(null), false)
})

test('HOME_RESET_EVENT is a stable namespaced event name', () => {
  assert.equal(HOME_RESET_EVENT, 'choco:home-reset')
})
