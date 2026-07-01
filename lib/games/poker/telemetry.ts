// ── Poker telemetry — versioned event taxonomy + privacy-safe structured records (PURE) ─────
//
// This is the single source of truth for WHAT poker emits to observability and HOW a log/metric
// record is shaped. It is a pure module (no DB, no React, no console, no secrets) so the exact
// same taxonomy + redaction is testable in isolation and reused identically by the server emitter
// (telemetryServer.ts), the metrics aggregation (metrics.ts), and the admin dashboards.
//
// Design principles enforced here:
//   • The taxonomy is VERSIONED (TELEMETRY_SCHEMA_VERSION). A consumer can detect drift.
//   • Every record carries CORRELATION IDs so an operator can join a symptom (a rejected action)
//     to its cause (a stale state_version on a specific hand) without free-text spelunking.
//   • Stable ERROR CODES replace reliance on free-text messages.
//   • `detail` is always redacted before it leaves this module: hole cards, decks, seeds, tokens,
//     passwords AND coarse PII (email / phone / ip) are stripped. This is defense-in-depth on top
//     of the DB-side scrub — SECURITY-HOLE-CARDS-001.

import { scrubDetail, type OpsEventKind } from './admin.ts'

// ════════════════════════════════════════════════════════════════════════════════════
// 1. Schema version
// ════════════════════════════════════════════════════════════════════════════════════
// Bump when the taxonomy or record shape changes in a way consumers must notice.
export const TELEMETRY_SCHEMA_VERSION = 1 as const

// ════════════════════════════════════════════════════════════════════════════════════
// 2. Event taxonomy (grouped by domain)
// ════════════════════════════════════════════════════════════════════════════════════
export type TelemetryDomain = 'table' | 'seat' | 'hand' | 'action' | 'realtime' | 'coin' | 'security'

export type TableEvent =
  | 'table_created' | 'table_joined' | 'table_left' | 'table_closing' | 'table_closed'
  | 'table_paused' | 'table_resumed'

export type SeatEvent =
  | 'seat_reserved' | 'seat_occupied' | 'seat_released'
  | 'player_sit_out' | 'player_returned' | 'player_disconnected' | 'player_reconnected'

export type HandEvent =
  | 'hand_started' | 'blind_posted' | 'street_started' | 'hand_completed'
  | 'hand_cancelled' | 'hand_frozen'

export type ActionEvent =
  | 'action_requested' | 'action_accepted' | 'action_rejected' | 'action_duplicate'
  | 'action_stale' | 'timeout_applied'

export type RealtimeEvent =
  | 'realtime_connected' | 'realtime_disconnected' | 'sequence_gap'
  | 'snapshot_requested' | 'snapshot_recovered' | 'reconnect_failed'

export type CoinEvent =
  | 'buy_in_completed' | 'top_up_pending' | 'top_up_activated' | 'pot_settled'
  | 'refund_applied' | 'cash_out_completed' | 'coin_invariant_failed'

export type SecurityEvent =
  | 'private_data_access_denied' | 'rls_sensitive_denial'
  | 'unauthorized_admin_command' | 'invalid_private_table_access'

export type TelemetryEvent =
  | TableEvent | SeatEvent | HandEvent | ActionEvent | RealtimeEvent | CoinEvent | SecurityEvent

const EVENTS_BY_DOMAIN: Record<TelemetryDomain, readonly TelemetryEvent[]> = {
  table: ['table_created', 'table_joined', 'table_left', 'table_closing', 'table_closed', 'table_paused', 'table_resumed'],
  seat: ['seat_reserved', 'seat_occupied', 'seat_released', 'player_sit_out', 'player_returned', 'player_disconnected', 'player_reconnected'],
  hand: ['hand_started', 'blind_posted', 'street_started', 'hand_completed', 'hand_cancelled', 'hand_frozen'],
  action: ['action_requested', 'action_accepted', 'action_rejected', 'action_duplicate', 'action_stale', 'timeout_applied'],
  realtime: ['realtime_connected', 'realtime_disconnected', 'sequence_gap', 'snapshot_requested', 'snapshot_recovered', 'reconnect_failed'],
  coin: ['buy_in_completed', 'top_up_pending', 'top_up_activated', 'pot_settled', 'refund_applied', 'cash_out_completed', 'coin_invariant_failed'],
  security: ['private_data_access_denied', 'rls_sensitive_denial', 'unauthorized_admin_command', 'invalid_private_table_access'],
}

export const TELEMETRY_EVENTS: readonly TelemetryEvent[] = Object.values(EVENTS_BY_DOMAIN).flat()

const DOMAIN_BY_EVENT: Record<TelemetryEvent, TelemetryDomain> = (() => {
  const m = {} as Record<TelemetryEvent, TelemetryDomain>
  for (const [domain, events] of Object.entries(EVENTS_BY_DOMAIN) as [TelemetryDomain, readonly TelemetryEvent[]][]) {
    for (const e of events) m[e] = domain
  }
  return m
})()

export function telemetryDomain(event: TelemetryEvent): TelemetryDomain {
  return DOMAIN_BY_EVENT[event]
}

export function isTelemetryEvent(v: unknown): v is TelemetryEvent {
  return typeof v === 'string' && v in DOMAIN_BY_EVENT
}

// ════════════════════════════════════════════════════════════════════════════════════
// 3. Severity
// ════════════════════════════════════════════════════════════════════════════════════
export type TelemetrySeverity = 'debug' | 'info' | 'warn' | 'error' | 'critical'

// Default severity per event. Coin/security integrity failures are always critical; ordinary
// lifecycle transitions are info; expected-but-noteworthy conditions are warn/error. Callers may
// override (e.g. a first reconnect_failed is warn, a repeated one is error) but the default keeps
// unclassified emissions honest.
const CRITICAL_EVENTS: ReadonlySet<TelemetryEvent> = new Set<TelemetryEvent>([
  'coin_invariant_failed', 'private_data_access_denied',
])
const ERROR_EVENTS: ReadonlySet<TelemetryEvent> = new Set<TelemetryEvent>([
  'hand_frozen', 'reconnect_failed', 'unauthorized_admin_command', 'invalid_private_table_access',
])
const WARN_EVENTS: ReadonlySet<TelemetryEvent> = new Set<TelemetryEvent>([
  'action_rejected', 'action_stale', 'sequence_gap', 'timeout_applied',
  'hand_cancelled', 'player_disconnected', 'realtime_disconnected',
  'rls_sensitive_denial', 'top_up_pending',
])

export function defaultEventSeverity(event: TelemetryEvent): TelemetrySeverity {
  if (CRITICAL_EVENTS.has(event)) return 'critical'
  if (ERROR_EVENTS.has(event)) return 'error'
  if (WARN_EVENTS.has(event)) return 'warn'
  return 'info'
}

// ════════════════════════════════════════════════════════════════════════════════════
// 4. Stable error codes (prefer these over free-text messages)
// ════════════════════════════════════════════════════════════════════════════════════
export const POKER_ERROR_CODES = [
  'PKR_OK',
  'PKR_ACTION_STALE',        // client acted on an out-of-date state_version / action_seq
  'PKR_ACTION_DUPLICATE',    // same idempotency key replayed
  'PKR_ACTION_ILLEGAL',      // server rejected an action that is not currently legal
  'PKR_ACTION_NOT_TURN',     // actor is not the current turn seat
  'PKR_ACTION_TIMEOUT',      // server acted for the player after the turn deadline
  'PKR_SEQUENCE_GAP',        // realtime delivered a non-contiguous state_version
  'PKR_RECONNECT_FAILED',    // client could not re-establish an authoritative snapshot
  'PKR_SNAPSHOT_FAILED',     // snapshot fetch failed
  'PKR_HAND_FROZEN',         // hand paused for manual review (inconsistent engine/showdown)
  'PKR_SETTLEMENT_FAILED',   // poker_settle_hand returned an error (recoverable, reaper retries)
  'PKR_COIN_NOT_CONSERVED',  // sum(in) != sum(out) — integrity breach
  'PKR_POT_MISMATCH',        // reconstructed pot != authoritative settled total
  'PKR_NEGATIVE_BALANCE',    // an operation would drive a stack/wallet below zero
  'PKR_DUPLICATE_SETTLEMENT',// more than one settlement row observed for a hand
  'PKR_RLS_DENIED',          // a sensitive read/write was denied by RLS
  'PKR_UNAUTHORIZED_ADMIN',  // a privileged command attempted without authorization
  'PKR_PRIVATE_LEAK_GUARD',  // a payload tripped the private-data redaction guard
  'PKR_UNKNOWN',
] as const
export type PokerErrorCode = (typeof POKER_ERROR_CODES)[number]

export function isPokerErrorCode(v: unknown): v is PokerErrorCode {
  return typeof v === 'string' && (POKER_ERROR_CODES as readonly string[]).includes(v)
}

// ════════════════════════════════════════════════════════════════════════════════════
// 5. Bridge to the durable DB signal stream (poker_ops_events)
// ════════════════════════════════════════════════════════════════════════════════════
// The full taxonomy above is broader than what the poker_ops_events table persists (its CHECK
// constraint knows 13 operational-failure kinds). Lifecycle/usage events are LOG-ONLY (captured in
// Vercel runtime logs and counted from the authoritative game tables); only the failure-shaped
// events map onto a durable ops_events row. `opsKindForEvent` returns null for log-only events so
// the emitter never attempts an out-of-taxonomy DB insert (degrade-safe, no schema change needed).
const EVENT_TO_OPS_KIND: Partial<Record<TelemetryEvent, OpsEventKind>> = {
  action_rejected: 'failed_action',
  action_duplicate: 'duplicate_action',
  action_stale: 'stale_state',
  timeout_applied: 'failed_action',
  sequence_gap: 'sequence_gap',
  reconnect_failed: 'reconnect_failure',
  realtime_disconnected: 'realtime_subscription_error',
  hand_frozen: 'frozen_hand',
  coin_invariant_failed: 'coin_conservation_failure',
}

export function opsKindForEvent(event: TelemetryEvent): OpsEventKind | null {
  return EVENT_TO_OPS_KIND[event] ?? null
}

/** True when this event should be persisted as a durable poker_ops_events row (vs log-only). */
export function isPersistedEvent(event: TelemetryEvent): boolean {
  return opsKindForEvent(event) !== null
}

// ════════════════════════════════════════════════════════════════════════════════════
// 6. Correlation identifiers
// ════════════════════════════════════════════════════════════════════════════════════
// Everything an operator needs to join a symptom to its cause. All optional — populate whatever the
// call site knows. `userId` is intentionally NOT here: user attribution belongs in the DB ops row
// (RLS-protected), never in a plaintext log line.
export interface CorrelationIds {
  readonly requestId?: string | null
  readonly eventId?: string | null
  readonly tableId?: string | null
  readonly handId?: string | null
  readonly actionId?: string | null
  readonly txId?: string | null
  readonly stateVersion?: number | null
  readonly actionSeq?: number | null
  readonly region?: string | null
  readonly buildVersion?: string | null
}

function compactCorrelation(c: CorrelationIds): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  for (const [k, v] of Object.entries(c)) {
    if (v === null || v === undefined || v === '') continue
    out[k] = v as string | number
  }
  return out
}

// ════════════════════════════════════════════════════════════════════════════════════
// 7. Privacy-safe detail redaction (extends the DB-side scrub with coarse PII)
// ════════════════════════════════════════════════════════════════════════════════════
// scrubDetail already removes cards / decks / seeds / tokens / passwords. Telemetry additionally
// drops coarse PII keys (email / phone / ip) that have no place in an ops log line. Value scrubbing
// (card-shaped strings) is inherited from scrubDetail.
const PII_KEY_RE = /(email|phone|msisdn|ip_address|ipaddr|remote_addr|client_ip|user_agent)/i

function stripPii(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripPii)
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (PII_KEY_RE.test(k)) { o[k] = '[redacted]'; continue }
      o[k] = stripPii(val)
    }
    return o
  }
  return v
}

/** Redact a detail payload for telemetry: cards/secrets (via scrubDetail) THEN coarse PII. */
export function redactTelemetryDetail(detail: unknown): Record<string, unknown> {
  return stripPii(scrubDetail(detail)) as Record<string, unknown>
}

// ════════════════════════════════════════════════════════════════════════════════════
// 8. Telemetry record
// ════════════════════════════════════════════════════════════════════════════════════
export interface TelemetryRecord {
  readonly schema: number
  readonly ts: string
  readonly domain: TelemetryDomain
  readonly event: TelemetryEvent
  readonly severity: TelemetrySeverity
  readonly code: PokerErrorCode | null
  readonly correlation: Record<string, string | number>
  readonly detail: Record<string, unknown>
  readonly persisted: boolean
}

export interface TelemetryInput {
  readonly event: TelemetryEvent
  readonly severity?: TelemetrySeverity
  readonly code?: PokerErrorCode | null
  readonly correlation?: CorrelationIds
  readonly detail?: Record<string, unknown>
  /** Override the timestamp (mostly for deterministic tests). */
  readonly now?: () => string
}

/**
 * Build an immutable, privacy-safe telemetry record. `detail` is redacted; severity/domain default
 * from the taxonomy. This never throws on ordinary input and is safe to feed to any sink.
 */
export function buildTelemetryRecord(input: TelemetryInput): TelemetryRecord {
  const nowIso = input.now ? input.now() : new Date().toISOString()
  return {
    schema: TELEMETRY_SCHEMA_VERSION,
    ts: nowIso,
    domain: telemetryDomain(input.event),
    event: input.event,
    severity: input.severity ?? defaultEventSeverity(input.event),
    code: input.code ?? null,
    correlation: compactCorrelation(input.correlation ?? {}),
    detail: redactTelemetryDetail(input.detail ?? {}),
    persisted: isPersistedEvent(input.event),
  }
}

/** Render a record as a single greppable structured log line (JSON.stringify keeps it parseable). */
export function formatTelemetryLine(rec: TelemetryRecord): string {
  return `[poker-telemetry] ${JSON.stringify(rec)}`
}
