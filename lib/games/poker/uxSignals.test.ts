// Unit tests for the pure poker UX usability-signal module.
// Run with:  node --test lib/games/poker/uxSignals.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  UX_SIGNAL_NAMES,
  UX_SIGNAL_SCHEMA_VERSION,
  isUxSignalName,
  redactUxDetail,
  buildUxSignal,
  UxSignalBuffer,
  summarizeUxTrail,
  MAX_TRAIL_STRING_LEN,
  recordUxSignal,
  getUxTrailSummary,
  resetUxTrail,
} from './uxSignals.ts'

test('taxonomy is non-empty, unique, and recognised', () => {
  assert.ok(UX_SIGNAL_NAMES.length > 0)
  assert.equal(new Set(UX_SIGNAL_NAMES).size, UX_SIGNAL_NAMES.length)
  for (const n of UX_SIGNAL_NAMES) assert.equal(isUxSignalName(n), true)
  assert.equal(isUxSignalName('not_a_signal'), false)
  assert.equal(isUxSignalName(42), false)
})

test('redactUxDetail keeps ONLY finite numbers — strings/objects/arrays/NaN dropped', () => {
  const d = redactUxDetail({
    elapsedMs: 1200,
    ratio: 0.6667,
    holeCards: ['As', 'Kd'], // must be dropped (array of card strings)
    seat: 'seat-2',          // dropped (string)
    nested: { x: 1 },        // dropped (object)
    bad: Number.NaN,         // dropped (NaN)
    inf: Number.POSITIVE_INFINITY, // dropped (±Infinity)
  })
  assert.deepEqual(Object.keys(d).sort(), ['elapsedMs', 'ratio'])
  assert.equal(d.elapsedMs, 1200)
  assert.equal(d.ratio, 0.667) // rounded to 3 decimals
  // No card-shaped value can survive by construction.
  assert.equal(JSON.stringify(d).includes('As'), false)
})

test('redactUxDetail is safe on non-objects', () => {
  assert.deepEqual(redactUxDetail(null), {})
  assert.deepEqual(redactUxDetail('As Kd'), {})
  assert.deepEqual(redactUxDetail(['As', 'Kd']), {})
})

test('buildUxSignal produces an immutable, schema-stamped record; unknown name → null', () => {
  const r = buildUxSignal({ name: 'action_submitted', at: 1000.9, detail: { elapsedMs: 800 } })
  assert.ok(r)
  assert.equal(r!.schema, UX_SIGNAL_SCHEMA_VERSION)
  assert.equal(r!.name, 'action_submitted')
  assert.equal(r!.at, 1000) // truncated
  assert.deepEqual(r!.detail, { elapsedMs: 800 })
  // @ts-expect-error deliberately invalid
  assert.equal(buildUxSignal({ name: 'nope', at: 1 }), null)
})

test('UxSignalBuffer evicts oldest beyond capacity (FIFO ring)', () => {
  const buf = new UxSignalBuffer(3)
  for (let i = 0; i < 5; i++) buf.push({ name: 'turn_started', at: i })
  assert.equal(buf.size(), 3)
  const ats = buf.recent().map((r) => r.at)
  assert.deepEqual(ats, [2, 3, 4]) // oldest two evicted
})

test('UxSignalBuffer.recent(since) and summary() count by name', () => {
  const buf = new UxSignalBuffer()
  buf.push({ name: 'raise_composer_opened', at: 10 })
  buf.push({ name: 'raise_composer_cancelled', at: 20 })
  buf.push({ name: 'raise_composer_opened', at: 30 })
  assert.equal(buf.recent(15).length, 2)
  assert.deepEqual(buf.summary(), { raise_composer_opened: 2, raise_composer_cancelled: 1 })
})

test('summarizeUxTrail renders deterministic, bounded name:count string', () => {
  const buf = new UxSignalBuffer()
  buf.push({ name: 'invalid_amount_attempt', at: 1 })
  buf.push({ name: 'raise_composer_opened', at: 2 })
  buf.push({ name: 'raise_composer_opened', at: 3 })
  const s = summarizeUxTrail(buf)
  // taxonomy order: raise_composer_opened precedes invalid_amount_attempt? Check ordering is by taxonomy.
  assert.ok(s.includes('invalid_amount_attempt:1'))
  assert.ok(s.includes('raise_composer_opened:2'))
  assert.ok(s.length <= MAX_TRAIL_STRING_LEN)
})

test('summarizeUxTrail accepts a raw record array and ignores junk', () => {
  const s = summarizeUxTrail([
    { schema: 1, name: 'device_rotated', at: 1, detail: {} },
    // @ts-expect-error junk element
    { name: 'garbage', at: 2, detail: {} },
  ])
  assert.equal(s, 'device_rotated:1')
})

test('module singleton: recordUxSignal / getUxTrailSummary / resetUxTrail never throw', () => {
  resetUxTrail()
  recordUxSignal('turn_started', undefined, 100)
  recordUxSignal('action_submitted', { elapsedMs: 900 }, 200)
  const s = getUxTrailSummary()
  assert.ok(s.includes('turn_started:1'))
  assert.ok(s.includes('action_submitted:1'))
  resetUxTrail()
  assert.equal(getUxTrailSummary(), '')
})
