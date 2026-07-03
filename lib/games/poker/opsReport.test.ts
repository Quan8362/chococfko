import test from 'node:test'
import assert from 'node:assert/strict'
import { computePokerMetrics, type MetricsInput } from './metrics.ts'
import {
  buildDailyReport,
  buildWeeklyReport,
  buildMonthlyReport,
  integrityIncidentCount,
  integrityHealth,
  worstHealth,
  renderDailyReportText,
  ZERO_COUNTERS,
  type OpsCounters,
} from './opsReport.ts'
import type { PairSignal } from './admin.ts'

// A healthy baseline metrics input: enough clean traffic to keep every measured SLO green.
function healthyInput(over: Partial<MetricsInput> = {}): MetricsInput {
  return {
    windowHours: 24,
    activePlayers: 40, activeTables: 8,
    handsStarted: 1000, handsCompleted: 995, handsCancelled: 5,
    handDurationsMs: [30000, 45000, 60000], sessionDurationsMs: [600000],
    playersByDevice: { mobile: 25, desktop: 15 },
    playersByLocale: { vi: 30, en: 10 },
    actionsAccepted: 20000, actionsRejected: 20,
    realtimeDisconnects: 3, sequenceGaps: 0, snapshotRecoveries: 2,
    reconnectAttempts: 50, reconnectFailures: 1, timeouts: 4,
    frozenHands: 0, settlementFailures: 0,
    // Fully instrumented so every latency SLO is MEASURED (green), not unknown.
    actionLatencyMs: [40, 60, 80], snapshotLatencyMs: [50, 70],
    settlementLatencyMs: [100, 150], buyInLatencyMs: [120, 180], cashOutLatencyMs: [110, 160],
    lobbyQueryLatencyMs: [30, 40], handHistoryLatencyMs: [80, 120],
    coinConservationFailures: 0, duplicateSettlementAttempts: 0, duplicateBuyInAttempts: 0,
    duplicateCashOutAttempts: 0, negativeBalancePrevented: 0, potConstructionFailures: 0,
    privateCardExposures: 0, unauthorizedAdminAttempts: 0,
    ...over,
  }
}

test('REPORT-INTEGRITY-001 integrityIncidentCount sums every counter', () => {
  const s = computePokerMetrics(healthyInput({
    coinConservationFailures: 1, duplicateSettlementAttempts: 2, privateCardExposures: 3,
  }))
  assert.equal(integrityIncidentCount(s.integrity), 6)
  assert.equal(integrityHealth(s.integrity), 'red')
})

test('REPORT-INTEGRITY-002 clean integrity is green', () => {
  const s = computePokerMetrics(healthyInput())
  assert.equal(integrityIncidentCount(s.integrity), 0)
  assert.equal(integrityHealth(s.integrity), 'green')
})

test('REPORT-HEALTH-001 worstHealth ordering red>amber>unknown>green', () => {
  assert.equal(worstHealth(['green', 'green']), 'green')
  assert.equal(worstHealth(['green', 'unknown']), 'unknown')
  assert.equal(worstHealth(['unknown', 'amber']), 'amber')
  assert.equal(worstHealth(['amber', 'red']), 'red')
})

test('REPORT-DAILY-001 healthy day is green with expected rollups', () => {
  const s = computePokerMetrics(healthyInput())
  const r = buildDailyReport({ dateIso: '2026-07-03', snapshot: s, counters: ZERO_COUNTERS })
  assert.equal(r.kind, 'daily')
  assert.equal(r.activePlayers, 40)
  assert.equal(r.activeTables, 8)
  assert.equal(r.handsCompleted, 995)
  assert.equal(r.handsFailed, 5)           // 5 cancelled + 0 settlement failures
  assert.equal(r.coinIncidents, 0)
  assert.equal(r.health, 'green')
  // reconnect fail rate = 1 - 49/50 = 0.02
  assert.equal(r.reconnectFailureRate, 0.02)
})

test('REPORT-DAILY-002 a coin-conservation failure turns the day red', () => {
  const s = computePokerMetrics(healthyInput({ coinConservationFailures: 1 }))
  const r = buildDailyReport({ dateIso: '2026-07-03', snapshot: s, counters: ZERO_COUNTERS })
  assert.equal(r.coinIncidents, 1)
  assert.equal(r.health, 'red')
})

test('REPORT-DAILY-003 settlement failures count as failed hands and critical errors amber', () => {
  const s = computePokerMetrics(healthyInput({ settlementFailures: 2 }))
  const counters: OpsCounters = { ...ZERO_COUNTERS, criticalErrors: 3 }
  const r = buildDailyReport({ dateIso: '2026-07-03', snapshot: s, counters })
  assert.equal(r.handsFailed, 5 + 2)
  assert.equal(r.criticalErrors, 3)
  // No SLO tracks the settlement-failure COUNT directly (completion rate 993/1000 stays fine), so
  // the day is amber from the critical-error signal rather than red.
  assert.equal(r.health, 'amber')
})

test('REPORT-WEEKLY-001 surfaces top suspicious pairs sorted + capped, amber at >=80', () => {
  const s = computePokerMetrics(healthyInput())
  const pairs: PairSignal[] = [
    { userA: 'a', userB: 'b', handsTogether: 30, tablesTogether: 2, netFlowAToB: 500, grossFlow: 500, oneWayRatio: 1, suspicion: 90 },
    { userA: 'c', userB: 'd', handsTogether: 10, tablesTogether: 1, netFlowAToB: 100, grossFlow: 300, oneWayRatio: 0.33, suspicion: 20 },
  ]
  const r = buildWeeklyReport({
    weekStartIso: '2026-06-29', weekEndIso: '2026-07-05',
    snapshot: s, counters: ZERO_COUNTERS, suspiciousPairs: pairs, topPairs: 1,
  })
  assert.equal(r.suspiciousPairs.length, 1)
  assert.equal(r.suspiciousPairs[0].suspicion, 90) // highest first
  assert.equal(r.health, 'amber')                   // >=80 suspicion ⇒ amber (advisory)
})

test('REPORT-MONTHLY-001 clean month green; capacity peaks + security flags carried', () => {
  const s = computePokerMetrics(healthyInput())
  const r = buildMonthlyReport({
    monthIso: '2026-06', snapshot: s, counters: { ...ZERO_COUNTERS, refundsIssued: 2, coinsRefunded: 1500 },
    peakActiveTables: 22, peakActivePlayers: 130,
  })
  assert.equal(r.coinIntegrityClean, true)
  assert.equal(r.securityClean, true)
  assert.equal(r.peakActiveTables, 22)
  assert.equal(r.peakActivePlayers, 130)
  assert.equal(r.refundsIssued, 2)
  assert.equal(r.coinsRefunded, 1500)
  assert.equal(r.health, 'green')
})

test('REPORT-MONTHLY-002 an unauthorized admin attempt fails securityClean and reddens', () => {
  const s = computePokerMetrics(healthyInput({ unauthorizedAdminAttempts: 1 }))
  const r = buildMonthlyReport({
    monthIso: '2026-06', snapshot: s, counters: ZERO_COUNTERS, peakActiveTables: 10, peakActivePlayers: 40,
  })
  assert.equal(r.securityClean, false)
  assert.equal(r.health, 'red')
})

test('REPORT-RENDER-001 daily text is privacy-safe and greppable', () => {
  const s = computePokerMetrics(healthyInput())
  const txt = renderDailyReportText(buildDailyReport({ dateIso: '2026-07-03', snapshot: s, counters: ZERO_COUNTERS }))
  assert.match(txt, /^\[poker-report\] daily 2026-07-03/)
  assert.match(txt, /health=green/)
  // No card-like tokens should ever appear.
  assert.doesNotMatch(txt, /\b[2-9TJQKA][cdhs]\b/)
})
