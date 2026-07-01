// Unit tests for the pure poker metrics aggregation + SLO evaluation.
// Run with:  node --test lib/games/poker/metrics.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  rate,
  percentile,
  mean,
  POKER_SLO,
  computePokerMetrics,
  evaluatePokerSlo,
  worstSloStatus,
  type MetricsInput,
} from './metrics.ts'

function baseInput(over: Partial<MetricsInput> = {}): MetricsInput {
  return {
    windowHours: 24,
    activePlayers: 0, activeTables: 0, handsStarted: 0, handsCompleted: 0, handsCancelled: 0,
    handDurationsMs: [], sessionDurationsMs: [], playersByDevice: {}, playersByLocale: {},
    actionsAccepted: 0, actionsRejected: 0, realtimeDisconnects: 0, sequenceGaps: 0,
    snapshotRecoveries: 0, reconnectAttempts: 0, reconnectFailures: 0, timeouts: 0,
    frozenHands: 0, settlementFailures: 0,
    actionLatencyMs: [], snapshotLatencyMs: [], settlementLatencyMs: [], buyInLatencyMs: [],
    cashOutLatencyMs: [], lobbyQueryLatencyMs: [], handHistoryLatencyMs: [],
    coinConservationFailures: 0, duplicateSettlementAttempts: 0, duplicateBuyInAttempts: 0,
    duplicateCashOutAttempts: 0, negativeBalancePrevented: 0, potConstructionFailures: 0,
    privateCardExposures: 0, unauthorizedAdminAttempts: 0,
    ...over,
  }
}

test('rate: zero denominator is unknown (null), not fabricated zero', () => {
  assert.equal(rate(0, 0), null)
  assert.equal(rate(5, 0), null)
  assert.equal(rate(3, 4), 0.75)
})

test('percentile / mean: empty sample is null; nearest-rank is integer', () => {
  assert.equal(percentile([], 0.95), null)
  assert.equal(mean([]), null)
  assert.equal(percentile([100], 0.95), 100)
  assert.equal(percentile([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 0.95), 100)
  assert.equal(percentile([10, 20, 30, 40], 0.5), 20)
  assert.equal(mean([10, 20, 30]), 20)
})

test('no traffic: rates are unknown and SLOs report unknown, not breach', () => {
  const snap = computePokerMetrics(baseInput())
  assert.equal(snap.reliability.handCompletionRate, null)
  assert.equal(snap.reliability.actionAcceptanceRate, null)
  assert.equal(snap.performance.action.p95, null)
  const rateVerdicts = snap.slo.filter((v) => v.kind !== 'max_count')
  for (const v of rateVerdicts) assert.equal(v.status, 'unknown', `${v.key} should be unknown`)
  // Zero-tolerance integrity counters are measured (0) and therefore OK even with no traffic.
  const coin = snap.slo.find((v) => v.key === 'coinIntegrityFailures')!
  assert.equal(coin.status, 'ok')
})

test('healthy traffic: rates computed, SLOs ok', () => {
  const snap = computePokerMetrics(baseInput({
    handsStarted: 100, handsCompleted: 99, handsCancelled: 1,
    actionsAccepted: 990, actionsRejected: 10,
    reconnectAttempts: 100, reconnectFailures: 2,
    actionLatencyMs: Array.from({ length: 20 }, () => 300),
    settlementLatencyMs: Array.from({ length: 20 }, () => 500),
  }))
  assert.equal(snap.reliability.handCompletionRate, 0.99)
  assert.equal(snap.reliability.actionAcceptanceRate, 0.99)
  assert.equal(snap.reliability.reconnectSuccessRate, 0.98)
  const worst = worstSloStatus(snap.slo)
  assert.ok(worst === 'ok' || worst === 'unknown', `expected healthy, got ${worst}`)
})

test('coin conservation failure => breach on zero-tolerance SLO', () => {
  const snap = computePokerMetrics(baseInput({ coinConservationFailures: 1 }))
  const coin = snap.slo.find((v) => v.key === 'coinIntegrityFailures')!
  assert.equal(coin.target, POKER_SLO.coinIntegrityFailures)
  assert.equal(coin.measured, 1)
  assert.equal(coin.status, 'breach')
  assert.equal(worstSloStatus(snap.slo), 'breach')
})

test('latency budget: p95 over budget breaches, mild over warns', () => {
  const overBudget = evaluatePokerSlo({
    reliability: computePokerMetrics(baseInput()).reliability,
    performance: computePokerMetrics(baseInput({ actionLatencyMs: Array.from({ length: 100 }, () => 5000) })).performance,
    integrity: computePokerMetrics(baseInput()).integrity,
  }).find((v) => v.key === 'actionLatencyP95Ms')!
  assert.equal(overBudget.status, 'breach')
})
