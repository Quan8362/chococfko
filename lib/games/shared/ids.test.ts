// Framework-free tests for shared id + idempotency-key helpers.
// Run with:  node --test lib/games/shared/ids.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeEventId, makeIdempotencyKey, makeActionKey } from './ids.ts'

test('makeEventId returns unique non-empty strings', () => {
  const ids = new Set<string>()
  for (let i = 0; i < 1000; i++) {
    const id = makeEventId()
    assert.equal(typeof id, 'string')
    assert.ok(id.length > 0)
    assert.ok(!ids.has(id), 'event ids must be unique')
    ids.add(id)
  }
})

test('makeIdempotencyKey is deterministic for the same inputs', () => {
  assert.equal(makeIdempotencyKey('a', 'b', 1), makeIdempotencyKey('a', 'b', 1))
})

test('makeIdempotencyKey distinguishes different tuples (no collision)', () => {
  // The classic ambiguity: ['a:b'] vs ['a','b'] must NOT collapse to the same key.
  assert.notEqual(makeIdempotencyKey('a:b'), makeIdempotencyKey('a', 'b'))
  assert.notEqual(makeIdempotencyKey('hand', 1), makeIdempotencyKey('hand', 11))
})

test('makeIdempotencyKey rejects empty input and non-finite numbers', () => {
  assert.throws(() => makeIdempotencyKey())
  assert.throws(() => makeIdempotencyKey('x', Number.NaN))
  assert.throws(() => makeIdempotencyKey('x', Infinity))
})

test('makeActionKey is stable per (hand, seq) and validates seq', () => {
  assert.equal(makeActionKey('hand-1', 5), makeActionKey('hand-1', 5))
  assert.notEqual(makeActionKey('hand-1', 5), makeActionKey('hand-1', 6))
  assert.notEqual(makeActionKey('hand-1', 5), makeActionKey('hand-2', 5))
  assert.throws(() => makeActionKey('hand-1', -1))
  assert.throws(() => makeActionKey('hand-1', 1.5))
})
