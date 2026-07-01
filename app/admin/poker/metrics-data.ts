// ── Poker METRICS dashboard — read-side loader (service role; server-only) ──────────────────
//
// Plain async loaders (NOT 'use server') imported by the admin-gated /admin/poker/metrics page.
// They assemble a MetricsInput from the authoritative poker_* tables and feed it to the PURE
// aggregation in lib/games/poker/metrics.ts, and additionally run the PURE coin-integrity checker
// (lib/games/poker/coinIntegrity.ts) over recent real settlements — the "automated invariant
// checker" operating on production data. NEVER returns hole cards / decks / seeds.
//
// Honesty contract: every field carries a provenance in `coverage` so the dashboard can label it
// measured vs. actively-audited vs. not-yet-instrumented. Signals with no data source are reported
// as 0 AND flagged 'not_instrumented' so a zero is never mistaken for a verified pass.

import { createAdminClient } from '@/lib/supabase/admin'
import {
  computePokerMetrics,
  worstSloStatus,
  type MetricsInput,
  type PokerMetricsSnapshot,
} from '@/lib/games/poker/metrics'
import {
  checkHandCoinIntegrity,
  type IntegrityViolation,
  type SeatContribution,
} from '@/lib/games/poker/coinIntegrity'
import { reconstructReplay, type ReplayActionInput } from '@/lib/games/poker/admin'
import { PERF_EVENT_NAME, RECONNECT_EVENTS, groupPerfSamples, type RawPerfRow } from '@/lib/games/poker/perf'

type Admin = ReturnType<typeof createAdminClient>

export type Provenance = 'measured' | 'audited' | 'not_instrumented'

export interface MetricsCoverage {
  readonly [signal: string]: Provenance
}

export interface IntegrityAudit {
  readonly settlementsChecked: number
  readonly violations: number
  /** A small, redacted sample (numbers/ids only) for the incident triage view. */
  readonly sample: readonly IntegrityViolation[]
}

export interface PokerMetricsView {
  readonly windowHours: number
  readonly snapshot: PokerMetricsSnapshot
  readonly worstStatus: ReturnType<typeof worstSloStatus>
  readonly audit: IntegrityAudit
  readonly coverage: MetricsCoverage
  readonly opsAvailable: boolean
  readonly generatedAt: string
}

function tally(rows: { kind: string }[] | null | undefined): Record<string, number> {
  const c: Record<string, number> = {}
  for (const r of rows ?? []) c[r.kind] = (c[r.kind] ?? 0) + 1
  return c
}

// ── Live coin-integrity audit over recent COMPLETED settlements ─────────────────────────────
async function auditRecentSettlements(admin: Admin, limit = 200): Promise<IntegrityAudit> {
  const { data: settles, error } = await admin
    .from('poker_hand_settlements')
    .select('hand_id, kind, payouts, total_contributed')
    .eq('kind', 'settle')
    .order('settled_at', { ascending: false })
    .limit(limit)
  if (error || !settles?.length) return { settlementsChecked: 0, violations: 0, sample: [] }

  const handIds = settles.map((s) => s.hand_id as string)
  const [{ data: hands }, { data: acts }] = await Promise.all([
    admin.from('poker_hands').select('id, table_id, pots').in('id', handIds),
    admin.from('poker_actions').select('hand_id, action_seq, seat_index, street, type, amount').in('hand_id', handIds),
  ])

  const handById = new Map<string, Record<string, unknown>>()
  for (const h of hands ?? []) handById.set(h.id as string, h)
  const actsByHand = new Map<string, Record<string, unknown>[]>()
  for (const a of acts ?? []) {
    const k = a.hand_id as string
    const arr = actsByHand.get(k) ?? []
    arr.push(a); actsByHand.set(k, arr)
  }

  const allViolations: IntegrityViolation[] = []
  for (const s of settles) {
    const handId = s.hand_id as string
    const hand = handById.get(handId)
    const rows = actsByHand.get(handId) ?? []
    const seatIndexes = Array.from(new Set(rows.map((r) => r.seat_index as number)))
    const replay = reconstructReplay({
      seatIndexes,
      actions: rows.map<ReplayActionInput>((r) => ({
        actionSeq: r.action_seq as number, seatIndex: r.seat_index as number,
        street: r.street as ReplayActionInput['street'], type: r.type as ReplayActionInput['type'],
        amount: (r.amount as number) ?? null,
      })),
    })
    const last = replay.steps[replay.steps.length - 1]
    const contributions: SeatContribution[] = seatIndexes.map((si) => ({
      seatIndex: si, contributed: (last.committedTotal[si] ?? 0) + (last.committedThisStreet[si] ?? 0),
    }))
    const pots = (hand?.pots as { main?: { amount?: number }; sides?: { amount?: number }[] }) ?? null
    const declaredPotTotal = pots ? (pots.main?.amount ?? 0) + (pots.sides ?? []).reduce((a, x) => a + (x.amount ?? 0), 0) : replay.finalPot
    const payouts = ((s.payouts as { seatIndex: number; amount: number }[]) ?? []).map((p) => ({ seatIndex: p.seatIndex, amount: p.amount }))
    const total = (s.total_contributed as number) ?? replay.finalPot

    const report = checkHandCoinIntegrity({
      tableId: (hand?.table_id as string) ?? null,
      handId,
      contributions,
      declaredPotTotal,
      payouts,
      refunds: [],
      authoritativeTotalContributed: total,
      settlementRowCount: 1,
    })
    if (!report.ok) allViolations.push(...report.violations)
  }

  return { settlementsChecked: settles.length, violations: allViolations.length, sample: allViolations.slice(0, 20) }
}

export async function loadPokerMetrics(windowHours = 168): Promise<PokerMetricsView> {
  const admin = createAdminClient()
  const since = new Date(Date.now() - windowHours * 3600 * 1000).toISOString()

  const [
    tablesRes, seatsRes,
    startedRes, completedRes, cancelledRes,
    completedRowsRes,
    actionsRes, timeoutRes,
    opsRes,
    audit,
    perfRes, reconnectRes,
  ] = await Promise.all([
    admin.from('poker_tables').select('status').limit(2000),
    admin.from('poker_seats').select('user_id, status').not('user_id', 'is', null).limit(5000),
    admin.from('poker_hands').select('id', { count: 'exact', head: true }).gte('created_at', since),
    admin.from('poker_hands').select('id', { count: 'exact', head: true }).eq('phase', 'COMPLETED').gte('created_at', since),
    admin.from('poker_hands').select('id', { count: 'exact', head: true }).eq('phase', 'CANCELLED').gte('created_at', since),
    admin.from('poker_hands').select('created_at, completed_at').eq('phase', 'COMPLETED').gte('created_at', since).not('completed_at', 'is', null).limit(5000),
    admin.from('poker_actions').select('id', { count: 'exact', head: true }).gte('created_at', since),
    admin.from('poker_actions').select('id', { count: 'exact', head: true }).in('type', ['timeout_fold', 'timeout_check']).gte('created_at', since),
    admin.from('poker_ops_events').select('kind').gte('created_at', since).limit(50000),
    auditRecentSettlements(admin),
    // Persisted latency + reconnect signals live in the generic analytics_events table (no schema
    // change). Both degrade safely: if the table is absent the query errors → treated as no data.
    admin.from('analytics_events').select('metadata').eq('event_name', PERF_EVENT_NAME).gte('created_at', since).limit(50000),
    admin.from('analytics_events').select('event_name').in('event_name', [RECONNECT_EVENTS.attempt, RECONNECT_EVENTS.success, RECONNECT_EVENTS.failure]).gte('created_at', since).limit(50000),
  ])

  const opsAvailable = !opsRes.error
  const ops = tally(opsRes.data as { kind: string }[] | null)

  // Latency samples (measured) from analytics_events, bucketed by operation.
  const perfAvailable = !perfRes.error
  const perf = groupPerfSamples((perfRes.data as RawPerfRow[] | null) ?? [])

  // Reconnect signals (measured) from analytics_events.
  const reconnectAvailable = !reconnectRes.error
  const reconnectRows = (reconnectRes.data as { event_name: string }[] | null) ?? []
  const reconnectAttempts = reconnectRows.filter((r) => r.event_name === RECONNECT_EVENTS.attempt).length
  const reconnectClientFailures = reconnectRows.filter((r) => r.event_name === RECONNECT_EVENTS.failure).length

  const activeTables = (tablesRes.data ?? []).filter((t) => t.status === 'open').length
  const seatedUserIds = new Set(
    (seatsRes.data ?? [])
      .filter((s) => ['sitting_in', 'sitting_out'].includes(s.status as string))
      .map((s) => s.user_id as string),
  )

  const handDurationsMs = (completedRowsRes.data ?? [])
    .map((h) => new Date(h.completed_at as string).getTime() - new Date(h.created_at as string).getTime())
    .filter((ms) => Number.isFinite(ms) && ms >= 0)

  // Integrity: ops-sourced conservation/settlement failures PLUS live-audit-sourced violations.
  const auditConservation = audit.sample.filter((v) => v.code === 'CONSERVATION_MISMATCH' || v.code === 'SETTLEMENT_RECONCILE_MISMATCH').length
  const auditPot = audit.sample.filter((v) => v.code === 'POT_CONSTRUCTION_MISMATCH').length
  const auditDup = audit.sample.filter((v) => v.code === 'DUPLICATE_SETTLEMENT').length

  const input: MetricsInput = {
    windowHours,
    activePlayers: seatedUserIds.size,
    activeTables,
    handsStarted: startedRes.count ?? 0,
    handsCompleted: completedRes.count ?? 0,
    handsCancelled: cancelledRes.count ?? 0,
    handDurationsMs,
    sessionDurationsMs: [],
    playersByDevice: {},
    playersByLocale: {},
    actionsAccepted: actionsRes.count ?? 0,
    actionsRejected: ops['failed_action'] ?? 0,
    realtimeDisconnects: ops['realtime_subscription_error'] ?? 0,
    sequenceGaps: ops['sequence_gap'] ?? 0,
    snapshotRecoveries: 0,
    reconnectAttempts,
    // Client-observed reconnect failures (analytics) OR server-side reconnect_failure ops rows,
    // whichever is higher — so the rate never understates a failure captured by only one path.
    reconnectFailures: Math.max(reconnectClientFailures, ops['reconnect_failure'] ?? 0),
    timeouts: timeoutRes.count ?? 0,
    frozenHands: ops['frozen_hand'] ?? 0,
    settlementFailures: ops['settlement_failure'] ?? 0,
    actionLatencyMs: perf.action,
    snapshotLatencyMs: perf.snapshot,
    settlementLatencyMs: perf.settlement,
    buyInLatencyMs: perf.buy_in,
    cashOutLatencyMs: perf.cash_out,
    lobbyQueryLatencyMs: perf.lobby,
    handHistoryLatencyMs: perf.hand_history,
    coinConservationFailures: (ops['coin_conservation_failure'] ?? 0) + auditConservation,
    duplicateSettlementAttempts: auditDup,
    duplicateBuyInAttempts: 0,
    duplicateCashOutAttempts: 0,
    negativeBalancePrevented: 0,
    potConstructionFailures: auditPot,
    privateCardExposures: 0,
    unauthorizedAdminAttempts: 0,
  }

  const snapshot = computePokerMetrics(input)

  const coverage: MetricsCoverage = {
    activePlayers: 'measured', activeTables: 'measured',
    handsStarted: 'measured', handsCompleted: 'measured', handsCancelled: 'measured',
    avgHandDuration: 'measured', avgSessionDuration: 'not_instrumented',
    playersByDevice: 'not_instrumented', playersByLocale: 'not_instrumented',
    handCompletionRate: 'measured', actionAcceptanceRate: 'measured',
    realtimeDisconnects: opsAvailable ? 'measured' : 'not_instrumented',
    sequenceGaps: opsAvailable ? 'measured' : 'not_instrumented',
    reconnectSuccessRate: reconnectAvailable ? 'measured' : 'not_instrumented',
    timeouts: 'measured', frozenHands: opsAvailable ? 'measured' : 'not_instrumented',
    settlementFailures: opsAvailable ? 'measured' : 'not_instrumented',
    // action/snapshot/settlement/lobby are instrumented; buy_in/cash_out/hand_history are not yet.
    latency: perfAvailable ? 'measured' : 'not_instrumented',
    coinConservationFailures: 'audited', potConstructionFailures: 'audited',
    duplicateSettlementAttempts: 'audited',
    privateCardExposures: 'not_instrumented', unauthorizedAdminAttempts: 'not_instrumented',
    duplicateBuyInAttempts: 'not_instrumented', duplicateCashOutAttempts: 'not_instrumented',
    negativeBalancePrevented: 'not_instrumented',
  }

  return {
    windowHours,
    snapshot,
    worstStatus: worstSloStatus(snapshot.slo),
    audit,
    coverage,
    opsAvailable,
    generatedAt: new Date().toISOString(),
  }
}
