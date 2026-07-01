// ── Poker metrics — pure aggregation over plain rows (no DB, no React) ──────────────────────
//
// The metrics-data loader (app/admin/poker/metrics-data.ts) reads the authoritative poker_* tables
// with the service role and hands the resulting plain arrays/counts to the pure functions here.
// Keeping the math pure means every rate, percentile, and SLO verdict is unit-testable without a
// database and cannot leak private state (it only ever sees numbers).
//
// HONESTY CONTRACT: a metric whose denominator is 0 (or whose sample set is empty) is reported as
// `null` = "unknown because there is no traffic yet", NEVER as a fabricated 0%/0ms. The SLO
// evaluator distinguishes target vs. measured vs. unknown so a dashboard can never imply we have
// achieved a number we have not actually observed.
//
// Coin values are integers (virtual "xu"); all arithmetic here stays in integer space.

// ════════════════════════════════════════════════════════════════════════════════════
// 1. Small numeric helpers (integer-safe)
// ════════════════════════════════════════════════════════════════════════════════════

/** Ratio in [0,1], or null when the denominator is 0 (unknown, not zero). */
export function rate(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(denominator) || denominator <= 0) return null
  return numerator / denominator
}

/** Integer nearest-rank percentile of a sample (ms). null when the sample is empty. */
export function percentile(samples: readonly number[], p: number): number | null {
  const xs = samples.filter((n) => Number.isFinite(n)).slice().sort((a, b) => a - b)
  if (xs.length === 0) return null
  const clamped = Math.min(1, Math.max(0, p))
  const rank = Math.ceil(clamped * xs.length)
  const idx = Math.min(xs.length - 1, Math.max(0, rank - 1))
  return Math.round(xs[idx])
}

/** Integer mean of a sample. null when empty. */
export function mean(samples: readonly number[]): number | null {
  const xs = samples.filter((n) => Number.isFinite(n))
  if (xs.length === 0) return null
  return Math.round(xs.reduce((s, x) => s + x, 0) / xs.length)
}

// ════════════════════════════════════════════════════════════════════════════════════
// 2. Service level objectives (internal reliability GOALS — not measured results)
// ════════════════════════════════════════════════════════════════════════════════════
// These are targets. `evaluatePokerSlo` compares them to measured values and marks each as
// ok / warn / breach / unknown. Latency budgets are in milliseconds.
export const POKER_SLO = {
  // Integrity — absolute zero-tolerance counters.
  coinIntegrityFailures: 0,
  privateCardExposure: 0,
  duplicateSettlement: 0,
  unauthorizedAdminAccess: 0,
  // Rates (fraction 0..1).
  handCompletionRate: 0.98,
  actionAcceptanceRate: 0.95,
  reconnectSuccessRate: 0.95,
  // Latency budgets (p95, ms).
  actionLatencyP95Ms: 1500,
  snapshotLatencyP95Ms: 1200,
  settlementLatencyP95Ms: 3000,
  buyInLatencyP95Ms: 1500,
  cashOutLatencyP95Ms: 2000,
  lobbyQueryLatencyP95Ms: 800,
  handHistoryLatencyP95Ms: 1000,
} as const

export type SloKey = keyof typeof POKER_SLO
export type SloStatus = 'ok' | 'warn' | 'breach' | 'unknown'

export interface SloVerdict {
  readonly key: SloKey
  /** 'max_count' = measured must stay <= target; 'min_rate' = measured must stay >= target;
   *  'max_latency' = measured p95 must stay <= target. */
  readonly kind: 'max_count' | 'min_rate' | 'max_latency'
  readonly target: number
  readonly measured: number | null
  readonly status: SloStatus
}

// ════════════════════════════════════════════════════════════════════════════════════
// 3. Metric inputs (assembled by the loader from existing tables) and outputs
// ════════════════════════════════════════════════════════════════════════════════════
export interface MetricsInput {
  readonly windowHours: number
  // Usage --------------------------------------------------------------------------------
  readonly activePlayers: number
  readonly activeTables: number
  readonly handsStarted: number
  readonly handsCompleted: number
  readonly handsCancelled: number
  /** Completed-hand durations in ms (created_at → completed_at). */
  readonly handDurationsMs: readonly number[]
  /** Player session durations in ms, when derivable. */
  readonly sessionDurationsMs: readonly number[]
  readonly playersByDevice: Readonly<Record<string, number>>
  readonly playersByLocale: Readonly<Record<string, number>>
  // Reliability counters (from poker_ops_events over the window) --------------------------
  readonly actionsAccepted: number
  readonly actionsRejected: number
  readonly realtimeDisconnects: number
  readonly sequenceGaps: number
  readonly snapshotRecoveries: number
  readonly reconnectAttempts: number
  readonly reconnectFailures: number
  readonly timeouts: number
  readonly frozenHands: number
  readonly settlementFailures: number
  // Performance latency samples (ms). Empty ⇒ unknown. -----------------------------------
  readonly actionLatencyMs: readonly number[]
  readonly snapshotLatencyMs: readonly number[]
  readonly settlementLatencyMs: readonly number[]
  readonly buyInLatencyMs: readonly number[]
  readonly cashOutLatencyMs: readonly number[]
  readonly lobbyQueryLatencyMs: readonly number[]
  readonly handHistoryLatencyMs: readonly number[]
  // Integrity counters -------------------------------------------------------------------
  readonly coinConservationFailures: number
  readonly duplicateSettlementAttempts: number
  readonly duplicateBuyInAttempts: number
  readonly duplicateCashOutAttempts: number
  readonly negativeBalancePrevented: number
  readonly potConstructionFailures: number
  readonly privateCardExposures: number
  readonly unauthorizedAdminAttempts: number
}

export interface UsageMetrics {
  readonly activePlayers: number
  readonly activeTables: number
  readonly handsStarted: number
  readonly handsCompleted: number
  readonly handsCancelled: number
  readonly avgHandDurationMs: number | null
  readonly avgSessionDurationMs: number | null
  readonly playersByDevice: Readonly<Record<string, number>>
  readonly playersByLocale: Readonly<Record<string, number>>
}

export interface ReliabilityMetrics {
  readonly handCompletionRate: number | null
  readonly actionAcceptanceRate: number | null
  readonly actionRejectionRate: number | null
  readonly realtimeDisconnects: number
  readonly sequenceGaps: number
  readonly snapshotRecoveries: number
  readonly reconnectSuccessRate: number | null
  readonly timeouts: number
  readonly frozenHands: number
  readonly settlementFailures: number
}

export interface LatencyStat {
  readonly p50: number | null
  readonly p95: number | null
  readonly p99: number | null
  readonly count: number
}

export interface PerformanceMetrics {
  readonly action: LatencyStat
  readonly snapshot: LatencyStat
  readonly settlement: LatencyStat
  readonly buyIn: LatencyStat
  readonly cashOut: LatencyStat
  readonly lobbyQuery: LatencyStat
  readonly handHistory: LatencyStat
}

export interface IntegrityMetrics {
  readonly coinConservationFailures: number
  readonly duplicateSettlementAttempts: number
  readonly duplicateBuyInAttempts: number
  readonly duplicateCashOutAttempts: number
  readonly negativeBalancePrevented: number
  readonly potConstructionFailures: number
  readonly privateCardExposures: number
  readonly unauthorizedAdminAttempts: number
}

export interface PokerMetricsSnapshot {
  readonly windowHours: number
  readonly usage: UsageMetrics
  readonly reliability: ReliabilityMetrics
  readonly performance: PerformanceMetrics
  readonly integrity: IntegrityMetrics
  readonly slo: readonly SloVerdict[]
}

// ════════════════════════════════════════════════════════════════════════════════════
// 4. Aggregators
// ════════════════════════════════════════════════════════════════════════════════════
function latencyStat(samples: readonly number[]): LatencyStat {
  return { p50: percentile(samples, 0.5), p95: percentile(samples, 0.95), p99: percentile(samples, 0.99), count: samples.length }
}

export function computeUsageMetrics(i: MetricsInput): UsageMetrics {
  return {
    activePlayers: i.activePlayers,
    activeTables: i.activeTables,
    handsStarted: i.handsStarted,
    handsCompleted: i.handsCompleted,
    handsCancelled: i.handsCancelled,
    avgHandDurationMs: mean(i.handDurationsMs),
    avgSessionDurationMs: mean(i.sessionDurationsMs),
    playersByDevice: { ...i.playersByDevice },
    playersByLocale: { ...i.playersByLocale },
  }
}

export function computeReliabilityMetrics(i: MetricsInput): ReliabilityMetrics {
  const actionsTotal = i.actionsAccepted + i.actionsRejected
  return {
    handCompletionRate: rate(i.handsCompleted, i.handsCompleted + i.handsCancelled),
    actionAcceptanceRate: rate(i.actionsAccepted, actionsTotal),
    actionRejectionRate: rate(i.actionsRejected, actionsTotal),
    realtimeDisconnects: i.realtimeDisconnects,
    sequenceGaps: i.sequenceGaps,
    snapshotRecoveries: i.snapshotRecoveries,
    reconnectSuccessRate: rate(i.reconnectAttempts - i.reconnectFailures, i.reconnectAttempts),
    timeouts: i.timeouts,
    frozenHands: i.frozenHands,
    settlementFailures: i.settlementFailures,
  }
}

export function computePerformanceMetrics(i: MetricsInput): PerformanceMetrics {
  return {
    action: latencyStat(i.actionLatencyMs),
    snapshot: latencyStat(i.snapshotLatencyMs),
    settlement: latencyStat(i.settlementLatencyMs),
    buyIn: latencyStat(i.buyInLatencyMs),
    cashOut: latencyStat(i.cashOutLatencyMs),
    lobbyQuery: latencyStat(i.lobbyQueryLatencyMs),
    handHistory: latencyStat(i.handHistoryLatencyMs),
  }
}

export function computeIntegrityMetrics(i: MetricsInput): IntegrityMetrics {
  return {
    coinConservationFailures: i.coinConservationFailures,
    duplicateSettlementAttempts: i.duplicateSettlementAttempts,
    duplicateBuyInAttempts: i.duplicateBuyInAttempts,
    duplicateCashOutAttempts: i.duplicateCashOutAttempts,
    negativeBalancePrevented: i.negativeBalancePrevented,
    potConstructionFailures: i.potConstructionFailures,
    privateCardExposures: i.privateCardExposures,
    unauthorizedAdminAttempts: i.unauthorizedAdminAttempts,
  }
}

// ════════════════════════════════════════════════════════════════════════════════════
// 5. SLO evaluation
// ════════════════════════════════════════════════════════════════════════════════════
function verdictMaxCount(key: SloKey, measured: number | null): SloVerdict {
  const target = POKER_SLO[key]
  let status: SloStatus = 'unknown'
  if (measured !== null) status = measured <= target ? 'ok' : 'breach'
  return { key, kind: 'max_count', target, measured, status }
}

function verdictMinRate(key: SloKey, measured: number | null, warnBandFraction = 0.01): SloVerdict {
  const target = POKER_SLO[key]
  let status: SloStatus = 'unknown'
  if (measured !== null) {
    if (measured >= target) status = 'ok'
    else if (measured >= target - warnBandFraction) status = 'warn'
    else status = 'breach'
  }
  return { key, kind: 'min_rate', target, measured, status }
}

function verdictMaxLatency(key: SloKey, measured: number | null): SloVerdict {
  const target = POKER_SLO[key]
  let status: SloStatus = 'unknown'
  if (measured !== null) {
    if (measured <= target) status = 'ok'
    else if (measured <= target * 1.25) status = 'warn'
    else status = 'breach'
  }
  return { key, kind: 'max_latency', target, measured, status }
}

export function evaluatePokerSlo(snapshot: {
  reliability: ReliabilityMetrics
  performance: PerformanceMetrics
  integrity: IntegrityMetrics
}): readonly SloVerdict[] {
  const { reliability: r, performance: p, integrity: g } = snapshot
  return [
    // Zero-tolerance integrity counters.
    verdictMaxCount('coinIntegrityFailures', g.coinConservationFailures + g.potConstructionFailures),
    verdictMaxCount('privateCardExposure', g.privateCardExposures),
    verdictMaxCount('duplicateSettlement', g.duplicateSettlementAttempts),
    verdictMaxCount('unauthorizedAdminAccess', g.unauthorizedAdminAttempts),
    // Rates.
    verdictMinRate('handCompletionRate', r.handCompletionRate),
    verdictMinRate('actionAcceptanceRate', r.actionAcceptanceRate),
    verdictMinRate('reconnectSuccessRate', r.reconnectSuccessRate),
    // Latency budgets (p95).
    verdictMaxLatency('actionLatencyP95Ms', p.action.p95),
    verdictMaxLatency('snapshotLatencyP95Ms', p.snapshot.p95),
    verdictMaxLatency('settlementLatencyP95Ms', p.settlement.p95),
    verdictMaxLatency('buyInLatencyP95Ms', p.buyIn.p95),
    verdictMaxLatency('cashOutLatencyP95Ms', p.cashOut.p95),
    verdictMaxLatency('lobbyQueryLatencyP95Ms', p.lobbyQuery.p95),
    verdictMaxLatency('handHistoryLatencyP95Ms', p.handHistory.p95),
  ]
}

/** Full snapshot from a single input. */
export function computePokerMetrics(i: MetricsInput): PokerMetricsSnapshot {
  const usage = computeUsageMetrics(i)
  const reliability = computeReliabilityMetrics(i)
  const performance = computePerformanceMetrics(i)
  const integrity = computeIntegrityMetrics(i)
  const slo = evaluatePokerSlo({ reliability, performance, integrity })
  return { windowHours: i.windowHours, usage, reliability, performance, integrity, slo }
}

/** Worst SLO status across all verdicts (unknown treated as neutral). Handy for a header badge. */
export function worstSloStatus(verdicts: readonly SloVerdict[]): SloStatus {
  const order: Record<SloStatus, number> = { ok: 0, unknown: 1, warn: 2, breach: 3 }
  return verdicts.reduce<SloStatus>((worst, v) => (order[v.status] > order[worst] ? v.status : worst), 'ok')
}
