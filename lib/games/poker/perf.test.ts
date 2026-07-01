// Unit tests for the pure poker perf/reconnect signal shapes.
// Run with:  node --test lib/games/poker/perf.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PERF_OPS,
  isPerfOp,
  PERF_EVENT_NAME,
  RECONNECT_EVENTS,
  groupPerfSamples,
  type RawPerfRow,
} from './perf.ts'

test('PERF_OPS catalog and guard', () => {
  assert.ok(PERF_OPS.includes('action'))
  assert.ok(PERF_OPS.includes('settlement'))
  assert.equal(isPerfOp('snapshot'), true)
  assert.equal(isPerfOp('nope'), false)
  assert.equal(isPerfOp(42), false)
})

test('stable event names', () => {
  assert.equal(PERF_EVENT_NAME, 'poker_perf')
  assert.equal(RECONNECT_EVENTS.attempt, 'poker_reconnect_attempt')
  assert.equal(RECONNECT_EVENTS.success, 'poker_reconnect_success')
  assert.equal(RECONNECT_EVENTS.failure, 'poker_reconnect_failure')
})

test('groupPerfSamples buckets by op and drops malformed samples', () => {
  const rows: RawPerfRow[] = [
    { metadata: { op: 'action', ms: 120 } },
    { metadata: { op: 'action', ms: 80 } },
    { metadata: { op: 'snapshot', ms: 300 } },
    { metadata: { op: 'settlement', ms: 0 } },     // 0 is valid
    { metadata: { op: 'action', ms: -5 } },        // negative → dropped
    { metadata: { op: 'action', ms: 'x' as unknown as number } }, // non-number → dropped
    { metadata: { op: 'unknown_op', ms: 10 } },    // unknown op → dropped
    { metadata: null },                            // no metadata → dropped
    {},                                            // empty → dropped
  ]
  const g = groupPerfSamples(rows)
  assert.deepEqual(g.action, [120, 80])
  assert.deepEqual(g.snapshot, [300])
  assert.deepEqual(g.settlement, [0])
  assert.deepEqual(g.buy_in, [])
  assert.deepEqual(g.cash_out, [])
  assert.deepEqual(g.hand_history, [])
  assert.deepEqual(g.lobby, [])
})

test('groupPerfSamples on empty input yields all-empty buckets', () => {
  const g = groupPerfSamples([])
  for (const op of PERF_OPS) assert.deepEqual(g[op], [])
})
