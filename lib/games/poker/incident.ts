// ── Poker SEV-1 incident contract — PURE, server-agnostic, privacy-safe ─────────────────────────
//
// The ONE reusable shape for a "must-page-an-operator" poker/tournament rollback incident (27G-M1,
// blocker B1). A SEV-1 is one of the zero-tolerance invariant breaches that, if real, is grounds for
// pausing/rolling back the public launch: a private-state leak, a cross-user action, an economy
// conservation mismatch, a duplicate payout/refund, a duplicate accepted action, or more than one
// active hand at a table.
//
// This module is PURE (no DB, no console, no clock unless injected, no secrets). It builds the record
// and — as defense-in-depth on top of every caller already handing it numbers/ids — RE-REDACTS the
// summary and HARD-ASSERTS it carries nothing sensitive. The server notifier (incidentNotifier.ts)
// is the only thing that turns a record into an alert; it can therefore never emit anything this
// module did not first certify safe.
//
// Design mirrors telemetry.ts (stable codes + correlation ids) and reuses the notification redaction
// scanners (redaction.ts) so a leak has to defeat BOTH the builder allowlist AND the same scanners
// that already guard the push path.

import { scanText } from './notifications/redaction.ts'
import { redactTelemetryDetail } from './telemetry.ts'

// ════════════════════════════════════════════════════════════════════════════════════
// 1. Schema version + stable incident codes
// ════════════════════════════════════════════════════════════════════════════════════
export const SEV1_SCHEMA_VERSION = 1 as const

// One stable code per required SEV-1 signal (B1). Codes are the join key between a detector, the
// dedupe store, the alert, and the runbook — never rely on free-text.
export const SEV1_CODES = [
  'PKR_SEV1_PRIVATE_STATE_LEAK',      // a snapshot/view would expose private state (cards/own-seat)
  'PKR_SEV1_CROSS_USER_ACTION',       // an action attributed to a seat the actor does not own
  'PKR_SEV1_ECONOMY_NOT_CONSERVED',   // money-in != money-out (conservation / reconcile / pot)
  'PKR_SEV1_DUPLICATE_PAYOUT',        // more than one payout observed for one hand/entry
  'PKR_SEV1_DUPLICATE_REFUND',        // more than one refund observed for one entry
  'PKR_SEV1_DUPLICATE_ACTION',        // a duplicate action accepted despite idempotency
  'PKR_SEV1_DUPLICATE_ACTIVE_HAND',   // more than one active (non-terminal) hand at one table
  'PKR_SEV1_CONTRADICTORY_SETTLEMENT',// settlement state contradicts itself (e.g. settled, no row)
] as const
export type Sev1Code = (typeof SEV1_CODES)[number]

export function isSev1Code(v: unknown): v is Sev1Code {
  return typeof v === 'string' && (SEV1_CODES as readonly string[]).includes(v)
}

// Human-facing one-liner per code (ASCII, no secrets). Used to build the alert summary + subject.
export const SEV1_TITLES: Record<Sev1Code, string> = {
  PKR_SEV1_PRIVATE_STATE_LEAK: 'Private state would be exposed',
  PKR_SEV1_CROSS_USER_ACTION: 'Action attributed to a seat the actor does not own',
  PKR_SEV1_ECONOMY_NOT_CONSERVED: 'Coin conservation mismatch',
  PKR_SEV1_DUPLICATE_PAYOUT: 'Duplicate payout observed',
  PKR_SEV1_DUPLICATE_REFUND: 'Duplicate refund observed',
  PKR_SEV1_DUPLICATE_ACTION: 'Duplicate action accepted despite idempotency',
  PKR_SEV1_DUPLICATE_ACTIVE_HAND: 'More than one active hand at a table',
  PKR_SEV1_CONTRADICTORY_SETTLEMENT: 'Contradictory settlement state',
}

// ════════════════════════════════════════════════════════════════════════════════════
// 2. Safe correlation identifiers (opaque ids only — never PII / secrets)
// ════════════════════════════════════════════════════════════════════════════════════
// UUIDs for a tournament / table / hand are non-sensitive (already in URLs + the realtime pointer).
// A userId is intentionally NOT part of the contract: user attribution belongs behind RLS in the DB
// audit, never in an alert. `source` names the emitter (e.g. 'cron/poker-integrity', 'settle').
export interface Sev1Correlation {
  readonly tournamentId?: string | null
  readonly tableId?: string | null
  readonly handId?: string | null
  readonly source?: string | null
}

// ════════════════════════════════════════════════════════════════════════════════════
// 3. The incident record
// ════════════════════════════════════════════════════════════════════════════════════
export interface Sev1Incident {
  readonly schema: number
  readonly code: Sev1Code
  readonly severity: 'SEV1'
  readonly ts: string
  readonly correlation: Sev1Correlation
  /** Redacted, ASCII, single-line human summary (never contains cards/secrets/PII). */
  readonly summary: string
  /** Numbers/ids-only facts backing the summary (redacted). */
  readonly facts: Record<string, number | string>
  /** Deterministic key for deduplication + cooldown (code + correlation, no timestamp/count). */
  readonly dedupeKey: string
  /** How many times this dedupeKey has fired in the current cooldown window (>= 1). */
  readonly occurrenceCount: number
}

export interface Sev1IncidentInput {
  readonly code: Sev1Code
  readonly correlation?: Sev1Correlation
  /** Optional numbers/ids-only facts. Non-number/non-safe-string values are dropped. */
  readonly facts?: Record<string, unknown>
  /** Occurrence count from the deduper (defaults to 1). */
  readonly occurrenceCount?: number
  /** Injectable clock for deterministic tests. */
  readonly now?: () => string
}

// ════════════════════════════════════════════════════════════════════════════════════
// 4. Fact sanitisation — allowlist to numbers + short opaque strings
// ════════════════════════════════════════════════════════════════════════════════════
// A fact value is kept ONLY if it is a finite number or a short, non-sensitive string (a uuid, a
// code slug, a status). Everything else is dropped. The result is then run through the telemetry
// redactor (strips card-shaped values, secret keys and coarse PII) as defense-in-depth.
const SAFE_STRING_MAX = 80
function safeFactString(v: string): boolean {
  if (v.length === 0 || v.length > SAFE_STRING_MAX) return false
  // No whitespace-heavy free text, no obvious sentence punctuation that could smuggle detail.
  return scanText('fact', v).length === 0
}

function sanitiseFacts(facts: Record<string, unknown> | undefined): Record<string, number | string> {
  const out: Record<string, number | string> = {}
  if (!facts) return out
  for (const [k, v] of Object.entries(facts)) {
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v
    else if (typeof v === 'string' && safeFactString(v)) out[k] = v
  }
  // Redact defensively (card-shaped values / secret keys / coarse PII) then keep only scalar leaves.
  // Drop a key entirely when its NAME trips the forbidden-word scanner (e.g. "password"/"token") or
  // when its value was scrubbed to the redaction sentinel — a redacted placeholder still named for a
  // secret is noise that would also fail the final safety assertion.
  const redacted = redactTelemetryDetail(out)
  const clean: Record<string, number | string> = {}
  for (const [k, v] of Object.entries(redacted)) {
    if (scanText('key', k).length > 0) continue
    if (v === '[redacted]') continue
    if (typeof v === 'number' && Number.isFinite(v)) clean[k] = v
    else if (typeof v === 'string' && v.length <= SAFE_STRING_MAX) clean[k] = v
  }
  return clean
}

function compactCorrelation(c: Sev1Correlation | undefined): Sev1Correlation {
  const out: { tournamentId?: string; tableId?: string; handId?: string; source?: string } = {}
  if (!c) return out
  if (c.tournamentId) out.tournamentId = c.tournamentId
  if (c.tableId) out.tableId = c.tableId
  if (c.handId) out.handId = c.handId
  if (c.source) out.source = c.source
  return out
}

// ════════════════════════════════════════════════════════════════════════════════════
// 5. Deterministic dedupe key
// ════════════════════════════════════════════════════════════════════════════════════
// code + correlation ids ONLY. No timestamp, no counts — so repeated occurrences of the SAME breach
// collapse to one key (and are suppressed within the cooldown window by the deduper below).
export function sev1DedupeKey(code: Sev1Code, c?: Sev1Correlation): string {
  const cc = compactCorrelation(c)
  return [code, cc.tournamentId ?? '-', cc.tableId ?? '-', cc.handId ?? '-'].join('|')
}

// ════════════════════════════════════════════════════════════════════════════════════
// 6. Build + hard-assert safe
// ════════════════════════════════════════════════════════════════════════════════════
export function buildSev1Incident(input: Sev1IncidentInput): Sev1Incident {
  const facts = sanitiseFacts(input.facts)
  const factBits = Object.entries(facts).map(([k, v]) => `${k}=${v}`)
  const summary = [SEV1_TITLES[input.code], factBits.length ? `(${factBits.join(' ')})` : '']
    .filter(Boolean)
    .join(' ')
    .slice(0, 240)
  const incident: Sev1Incident = {
    schema: SEV1_SCHEMA_VERSION,
    code: input.code,
    severity: 'SEV1',
    ts: input.now ? input.now() : new Date().toISOString(),
    correlation: compactCorrelation(input.correlation),
    summary,
    facts,
    dedupeKey: sev1DedupeKey(input.code, input.correlation),
    occurrenceCount: Math.max(1, Math.floor(input.occurrenceCount ?? 1)),
  }
  assertSev1Safe(incident)
  return incident
}

// Throws if the built incident still carries anything that must never appear in an alert. Uses the
// SAME scanners that guard the push path (cards/secrets/tokens/PII/JWTs/long opaque blobs) plus a
// guard against SQL fragments and stack-trace shapes. A loud, test-catchable failure beats a leak.
const SQL_RE = /\b(select|insert|update|delete|drop|alter|create)\s/i
const STACK_RE = /\bat\s+\S+\s*\(|\.[jt]sx?:\d+/i
export function assertSev1Safe(incident: Sev1Incident): void {
  const strings: string[] = [incident.summary, incident.code, incident.correlation.source ?? '']
  for (const [k, v] of Object.entries(incident.facts)) {
    strings.push(k)
    if (typeof v === 'string') strings.push(v)
  }
  for (const s of strings) {
    const reasons = scanText('incident', s)
    if (reasons.length) throw new Error(`SEV-1 incident unsafe: ${reasons.join('; ')}`)
    if (SQL_RE.test(s)) throw new Error('SEV-1 incident unsafe: contains a SQL fragment')
    if (STACK_RE.test(s)) throw new Error('SEV-1 incident unsafe: contains a stack-trace fragment')
  }
}
