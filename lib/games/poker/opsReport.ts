// ── Poker operational reports — PURE report shaping over aggregated metrics ──────────────────
//
// Turns an already-aggregated PokerMetricsSnapshot (from metrics.ts) plus a small set of extra
// operational counters into the DAILY / WEEKLY / MONTHLY report structures ops reviews on a cadence
// (see docs/poker/operations/reporting.md). It is PURE: no DB, no clock, no React, no secrets. The
// server loader (app/admin/poker/metrics-data.ts or a cron) supplies the snapshot + counters and the
// reporting window's date labels; this module only shapes + classifies them, so it is deterministic
// and unit-testable.
//
// It NEVER emits card values or PII — every field it reads is a number, a rate, a device/locale
// bucket, or a correlation id, matching the privacy-safe-logging contract.

import type {
  PokerMetricsSnapshot,
  IntegrityMetrics,
  SloVerdict,
  SloStatus,
} from './metrics.ts'
import { worstSloStatus } from './metrics.ts'
import type { PairSignal } from './admin.ts'

// A traffic-light health for a report section. 'unknown' when the underlying signal is not yet
// instrumented (never silently green).
export type ReportHealth = 'green' | 'amber' | 'red' | 'unknown'

// Roll SLO statuses up into a section health. A breach ⇒ red; a warn ⇒ amber; all ok ⇒ green;
// nothing but unknowns ⇒ unknown.
export function sloToHealth(status: SloStatus): ReportHealth {
  switch (status) {
    case 'breach': return 'red'
    case 'warn': return 'amber'
    case 'ok': return 'green'
    default: return 'unknown'
  }
}

// The worst of several healths (red > amber > unknown > green). 'unknown' beats green so a blind
// spot is never reported as healthy, but loses to a real amber/red signal.
export function worstHealth(healths: readonly ReportHealth[]): ReportHealth {
  if (healths.includes('red')) return 'red'
  if (healths.includes('amber')) return 'amber'
  if (healths.includes('unknown')) return 'unknown'
  return 'green'
}

// Sum every coin/security integrity counter — any non-zero is an incident that must be reviewed.
export function integrityIncidentCount(m: IntegrityMetrics): number {
  return (
    m.coinConservationFailures +
    m.duplicateSettlementAttempts +
    m.duplicateBuyInAttempts +
    m.duplicateCashOutAttempts +
    m.negativeBalancePrevented +
    m.potConstructionFailures +
    m.privateCardExposures +
    m.unauthorizedAdminAttempts
  )
}

// Integrity health: ANY private-card exposure is always red (SEV-0). Any other integrity counter is
// red (these are zero-tolerance invariants). All zero ⇒ green.
export function integrityHealth(m: IntegrityMetrics): ReportHealth {
  return integrityIncidentCount(m) > 0 ? 'red' : 'green'
}

// ── Extra operational counters not covered by the metrics snapshot ───────────────────────────────
export interface OpsCounters {
  // Distinct incident cases opened in the window, by terminal/working status.
  readonly incidentsOpened: number
  readonly incidentsResolved: number
  readonly incidentsRefunded: number
  // Refund workflow activity (audited poker_admin_refund_hand calls).
  readonly refundsIssued: number
  readonly coinsRefunded: number
  // Support / bug pipeline (poker_bug_reports + support tickets), when available.
  readonly bugReportsOpened: number
  readonly supportTicketsOpened: number
  // Critical/error-level ops events (poker_ops_events severity in {error,critical}).
  readonly criticalErrors: number
}

export const ZERO_COUNTERS: OpsCounters = {
  incidentsOpened: 0, incidentsResolved: 0, incidentsRefunded: 0,
  refundsIssued: 0, coinsRefunded: 0,
  bugReportsOpened: 0, supportTicketsOpened: 0, criticalErrors: 0,
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// DAILY
// ════════════════════════════════════════════════════════════════════════════════════════════════
export interface DailyReport {
  readonly kind: 'daily'
  readonly dateIso: string          // caller-supplied YYYY-MM-DD (no clock in this module)
  readonly windowHours: number
  readonly activePlayers: number
  readonly activeTables: number
  readonly handsCompleted: number
  readonly handsFailed: number       // cancelled + settlement failures
  readonly frozenHands: number
  readonly coinIncidents: number
  readonly reconnectFailureRate: number | null
  readonly criticalErrors: number
  readonly slo: readonly SloVerdict[]
  readonly health: ReportHealth
}

export interface DailyReportInput {
  readonly dateIso: string
  readonly snapshot: PokerMetricsSnapshot
  readonly counters: OpsCounters
}

export function buildDailyReport(i: DailyReportInput): DailyReport {
  const { snapshot: s, counters: c } = i
  const coinIncidents = integrityIncidentCount(s.integrity)
  const handsFailed = s.usage.handsCancelled + s.reliability.settlementFailures
  // reconnect failure rate = 1 - success rate (null when uninstrumented).
  const rr = s.reliability.reconnectSuccessRate
  const reconnectFailureRate = rr == null ? null : Number((1 - rr).toFixed(4))
  const health = worstHealth([
    sloToHealth(worstSloStatus(s.slo)),
    integrityHealth(s.integrity),
    s.reliability.frozenHands > 0 ? 'amber' : 'green',
    c.criticalErrors > 0 ? 'amber' : 'green',
  ])
  return {
    kind: 'daily',
    dateIso: i.dateIso,
    windowHours: s.windowHours,
    activePlayers: s.usage.activePlayers,
    activeTables: s.usage.activeTables,
    handsCompleted: s.usage.handsCompleted,
    handsFailed,
    frozenHands: s.reliability.frozenHands,
    coinIncidents,
    reconnectFailureRate,
    criticalErrors: c.criticalErrors,
    slo: s.slo,
    health,
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// WEEKLY
// ════════════════════════════════════════════════════════════════════════════════════════════════
export interface WeeklyReport {
  readonly kind: 'weekly'
  readonly weekStartIso: string
  readonly weekEndIso: string
  readonly reliability: PokerMetricsSnapshot['reliability']
  readonly performance: PokerMetricsSnapshot['performance']
  readonly playersByDevice: Readonly<Record<string, number>>
  readonly playersByLocale: Readonly<Record<string, number>>
  readonly bugReportsOpened: number
  readonly supportTicketsOpened: number
  // Top suspicious account pairs (evidence-only; advisory, never auto-punishment).
  readonly suspiciousPairs: readonly PairSignal[]
  readonly slo: readonly SloVerdict[]
  readonly health: ReportHealth
}

export interface WeeklyReportInput {
  readonly weekStartIso: string
  readonly weekEndIso: string
  readonly snapshot: PokerMetricsSnapshot
  readonly counters: OpsCounters
  readonly suspiciousPairs?: readonly PairSignal[]
  // How many top pairs to surface (by suspicion). Default 10.
  readonly topPairs?: number
}

export function buildWeeklyReport(i: WeeklyReportInput): WeeklyReport {
  const { snapshot: s } = i
  const topN = i.topPairs ?? 10
  const suspiciousPairs = [...(i.suspiciousPairs ?? [])]
    .sort((a, b) => b.suspicion - a.suspicion)
    .slice(0, topN)
  // A very high-suspicion pair is amber (needs investigation), not red — collusion signals are
  // advisory evidence, and only a confirmed integrity incident is red.
  const collusionHealth: ReportHealth = suspiciousPairs.some((p) => p.suspicion >= 80) ? 'amber' : 'green'
  const health = worstHealth([
    sloToHealth(worstSloStatus(s.slo)),
    integrityHealth(s.integrity),
    collusionHealth,
  ])
  return {
    kind: 'weekly',
    weekStartIso: i.weekStartIso,
    weekEndIso: i.weekEndIso,
    reliability: s.reliability,
    performance: s.performance,
    playersByDevice: s.usage.playersByDevice,
    playersByLocale: s.usage.playersByLocale,
    bugReportsOpened: i.counters.bugReportsOpened,
    supportTicketsOpened: i.counters.supportTicketsOpened,
    suspiciousPairs,
    slo: s.slo,
    health,
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// MONTHLY
// ════════════════════════════════════════════════════════════════════════════════════════════════
export interface MonthlyReport {
  readonly kind: 'monthly'
  readonly monthIso: string          // YYYY-MM
  // Coin-integrity audit: total incidents + whether the ledger reconciled clean.
  readonly coinIntegrityIncidents: number
  readonly coinIntegrityClean: boolean
  readonly refundsIssued: number
  readonly coinsRefunded: number
  // Capacity: peak concurrent tables/players seen in the window (caller-supplied observed peaks).
  readonly peakActiveTables: number
  readonly peakActivePlayers: number
  // Security: unauthorized admin attempts + private-card exposures (must be 0).
  readonly unauthorizedAdminAttempts: number
  readonly privateCardExposures: number
  readonly securityClean: boolean
  readonly incidentsOpened: number
  readonly incidentsResolved: number
  readonly slo: readonly SloVerdict[]
  readonly health: ReportHealth
}

export interface MonthlyReportInput {
  readonly monthIso: string
  readonly snapshot: PokerMetricsSnapshot
  readonly counters: OpsCounters
  readonly peakActiveTables: number
  readonly peakActivePlayers: number
}

export function buildMonthlyReport(i: MonthlyReportInput): MonthlyReport {
  const { snapshot: s, counters: c } = i
  const coinIntegrityIncidents = integrityIncidentCount(s.integrity)
  const securityClean = s.integrity.unauthorizedAdminAttempts === 0 && s.integrity.privateCardExposures === 0
  const health = worstHealth([
    sloToHealth(worstSloStatus(s.slo)),
    integrityHealth(s.integrity),
  ])
  return {
    kind: 'monthly',
    monthIso: i.monthIso,
    coinIntegrityIncidents,
    coinIntegrityClean: coinIntegrityIncidents === 0,
    refundsIssued: c.refundsIssued,
    coinsRefunded: c.coinsRefunded,
    peakActiveTables: i.peakActiveTables,
    peakActivePlayers: i.peakActivePlayers,
    unauthorizedAdminAttempts: s.integrity.unauthorizedAdminAttempts,
    privateCardExposures: s.integrity.privateCardExposures,
    securityClean,
    incidentsOpened: c.incidentsOpened,
    incidentsResolved: c.incidentsResolved,
    slo: s.slo,
    health,
  }
}

// ── Compact text renderer (for a cron summary / greppable log / copy-paste) ──────────────────────
// Plain ASCII, no i18n — an internal ops artifact, not user-facing UI. Never contains card values.
function pct(v: number | null): string {
  return v == null ? '—' : `${(v * 100).toFixed(1)}%`
}

export function renderDailyReportText(r: DailyReport): string {
  return [
    `[poker-report] daily ${r.dateIso} (${r.windowHours}h) health=${r.health}`,
    `  players=${r.activePlayers} tables=${r.activeTables} handsCompleted=${r.handsCompleted}`,
    `  handsFailed=${r.handsFailed} frozen=${r.frozenHands} coinIncidents=${r.coinIncidents}`,
    `  reconnectFailRate=${pct(r.reconnectFailureRate)} criticalErrors=${r.criticalErrors}`,
  ].join('\n')
}
