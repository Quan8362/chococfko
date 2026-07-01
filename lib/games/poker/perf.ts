// ── Poker performance / reconnect signal shapes (PURE) ──────────────────────────────────────
//
// Prompt 17 left latency and reconnect-rate metrics as "unknown" because no timing/attempt samples
// were persisted. Prompt 17B closes that WITHOUT a schema change or new vendor by reusing the
// existing generic `analytics_events` table (open INSERT, service-role SELECT, free-text event_name
// + jsonb metadata):
//   • server operation durations are written as `poker_perf` rows  ({ op, ms });
//   • realtime reconnect signals are written as `poker_reconnect_*` rows via the existing client
//     analytics path (trackEvent).
//
// This module holds only the PURE, testable pieces: the op catalog and the row→sample grouping used
// by the metrics loader. No DB, no secrets, no PII — a perf row carries an operation name and an
// integer millisecond value, nothing else.

export const PERF_OPS = ['action', 'snapshot', 'settlement', 'lobby', 'buy_in', 'cash_out', 'hand_history'] as const
export type PerfOp = (typeof PERF_OPS)[number]

const PERF_OP_SET: ReadonlySet<string> = new Set(PERF_OPS)
export function isPerfOp(v: unknown): v is PerfOp {
  return typeof v === 'string' && PERF_OP_SET.has(v)
}

/** The `analytics_events.event_name` value used for a persisted server-latency sample. */
export const PERF_EVENT_NAME = 'poker_perf'

/** The `analytics_events.event_name` values used for realtime reconnect signals. */
export const RECONNECT_EVENTS = {
  attempt: 'poker_reconnect_attempt',
  success: 'poker_reconnect_success',
  failure: 'poker_reconnect_failure',
} as const
export type ReconnectEventName = (typeof RECONNECT_EVENTS)[keyof typeof RECONNECT_EVENTS]

export interface RawPerfRow {
  readonly metadata?: { op?: unknown; ms?: unknown } | null
}

function emptyBuckets(): Record<PerfOp, number[]> {
  return { action: [], snapshot: [], settlement: [], lobby: [], buy_in: [], cash_out: [], hand_history: [] }
}

/**
 * Bucket persisted perf rows by operation, keeping only well-formed samples (known op + a finite,
 * non-negative millisecond value). Unknown ops / malformed values are dropped rather than guessed.
 */
export function groupPerfSamples(rows: readonly RawPerfRow[]): Record<PerfOp, number[]> {
  const out = emptyBuckets()
  for (const r of rows) {
    const op = r.metadata?.op
    const ms = r.metadata?.ms
    if (!isPerfOp(op)) continue
    if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) continue
    out[op].push(ms)
  }
  return out
}
