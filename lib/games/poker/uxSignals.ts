// ── Poker UX usability signals — privacy-safe CLIENT-side interaction telemetry (PURE) ──────
//
// This is the client counterpart to `telemetry.ts`. Where telemetry.ts captures SERVER/DB
// operational events (rejected actions, coin invariants, RLS denials), this module captures the
// UX-research signals that only the browser can observe: how long a decision took, whether a
// player changed their mind before submitting, whether they cancelled a raise, whether the device
// was rotated, and so on. These are the signals a UX researcher needs to tell a real usability
// problem ("everyone abandons the raise composer") from ordinary thoughtful play.
//
// Design principles (kept deliberately conservative):
//   • PURE — no window/DOM/React/DB/console imports; deterministic; unit-testable in isolation.
//   • PRIVATE BY CONSTRUCTION — a signal's `detail` may hold ONLY finite numbers. Card strings,
//     hole cards, deck order, user ids, free text, tokens CANNOT be represented, so nothing
//     sensitive can ride along even by accident. This mirrors the bug-report allowlist stance.
//   • LOW CARDINALITY — a fixed, versioned taxonomy so counts aggregate cleanly.
//   • NON-JUDGEMENTAL — a signal is an observation, not a verdict. "action changed before submit"
//     is a data point, not a failure. Interpretation lives in the UX docs, not here.
//
// Nothing here decides game state, and no signal is required for play — the whole subsystem is
// best-effort instrumentation that degrades to a silent no-op if a sink is not attached.

// ════════════════════════════════════════════════════════════════════════════════════
// 1. Schema version
// ════════════════════════════════════════════════════════════════════════════════════
export const UX_SIGNAL_SCHEMA_VERSION = 1 as const

// ════════════════════════════════════════════════════════════════════════════════════
// 2. Signal taxonomy
// ════════════════════════════════════════════════════════════════════════════════════
// Each name maps to a question a UX researcher is trying to answer. Keep additions rare and
// documented in docs/poker/ux/design-decision-log.md.
export const UX_SIGNAL_NAMES = [
  'turn_started',                   // marks t0 for the current decision (time-to-action baseline)
  'action_submitted',              // an intent was fired (detail.elapsedMs = decision time)
  'action_changed_before_submit',  // the composed amount was changed at least once pre-submit
  'invalid_amount_attempt',        // a typed/dragged amount fell outside the legal bounds (clamped)
  'stale_action_rejected',         // the server rejected an action as stale (UX recovery moment)
  'raise_composer_opened',         // the raise/bet composer was opened
  'raise_composer_cancelled',      // the composer was dismissed WITHOUT submitting
  'allin_confirm_opened',          // the irreversible all-in confirm step was shown
  'allin_confirm_cancelled',       // the all-in confirm was backed out of
  'device_rotated',                // the rotate-to-landscape prompt was shown (portrait on table)
  'chat_opened_on_turn',           // chat/social opened while it was the viewer's turn
  'reconnect_recovered',           // an authoritative snapshot was recovered (detail.elapsedMs)
  'help_opened_in_hand',           // rules/glossary/help opened during a live hand
  'why_cant_i_raise_opened',       // the disabled-action explanation was requested
] as const

export type UxSignalName = (typeof UX_SIGNAL_NAMES)[number]

const UX_SIGNAL_NAME_SET: ReadonlySet<string> = new Set(UX_SIGNAL_NAMES)

export function isUxSignalName(v: unknown): v is UxSignalName {
  return typeof v === 'string' && UX_SIGNAL_NAME_SET.has(v)
}

// ════════════════════════════════════════════════════════════════════════════════════
// 3. Detail redaction — NUMBERS ONLY
// ════════════════════════════════════════════════════════════════════════════════════
// The single most important privacy property of this module: a signal's detail can only carry
// finite numbers (e.g. elapsedMs, an attempt count, a bet ratio). Everything else — strings,
// objects, arrays, NaN, ±Infinity — is dropped. Card ranks/suits are strings, hole cards are
// arrays, user ids are strings: NONE can survive this filter. Keys are length-capped as a final
// tidiness guard.
const MAX_DETAIL_KEYS = 8
const MAX_KEY_LEN = 32

export type UxSignalDetail = Record<string, number>

export function redactUxDetail(detail: unknown): UxSignalDetail {
  const out: UxSignalDetail = {}
  if (detail == null || typeof detail !== 'object' || Array.isArray(detail)) return out
  let n = 0
  for (const [k, v] of Object.entries(detail as Record<string, unknown>)) {
    if (n >= MAX_DETAIL_KEYS) break
    if (typeof k !== 'string' || k.length === 0 || k.length > MAX_KEY_LEN) continue
    if (typeof v !== 'number' || !Number.isFinite(v)) continue
    // Round to an integer where it is one; keep small ratios (0..≤4) at 3 decimals.
    out[k] = Number.isInteger(v) ? v : Math.round(v * 1000) / 1000
    n++
  }
  return out
}

// ════════════════════════════════════════════════════════════════════════════════════
// 4. Signal record
// ════════════════════════════════════════════════════════════════════════════════════
export interface UxSignalRecord {
  readonly schema: number
  readonly name: UxSignalName
  readonly at: number // epoch ms (caller-supplied so this stays pure/deterministic in tests)
  readonly detail: UxSignalDetail
}

export interface UxSignalInput {
  readonly name: UxSignalName
  readonly at: number
  readonly detail?: Record<string, number>
}

/** Build an immutable, privacy-safe signal record. Returns null for an unknown name. */
export function buildUxSignal(input: UxSignalInput): UxSignalRecord | null {
  if (!isUxSignalName(input.name)) return null
  const at = Number.isFinite(input.at) ? Math.trunc(input.at) : 0
  return {
    schema: UX_SIGNAL_SCHEMA_VERSION,
    name: input.name,
    at,
    detail: redactUxDetail(input.detail),
  }
}

// ════════════════════════════════════════════════════════════════════════════════════
// 5. Bounded ring buffer (breadcrumb trail)
// ════════════════════════════════════════════════════════════════════════════════════
// A fixed-capacity FIFO of the most recent signals. Its purpose is to give a "what did the player
// just do" breadcrumb trail that can be attached (as a bounded SUMMARY string) to a bug/UX report,
// so a confused-tester report arrives with the recent interaction context already on it — without
// any new ingestion pipeline. Never throws.
export const DEFAULT_UX_BUFFER_CAPACITY = 40

export class UxSignalBuffer {
  private readonly cap: number
  private readonly items: UxSignalRecord[] = []

  constructor(capacity: number = DEFAULT_UX_BUFFER_CAPACITY) {
    this.cap = Math.max(1, Math.trunc(capacity) || DEFAULT_UX_BUFFER_CAPACITY)
  }

  push(input: UxSignalInput): UxSignalRecord | null {
    const rec = buildUxSignal(input)
    if (!rec) return null
    this.items.push(rec)
    if (this.items.length > this.cap) this.items.splice(0, this.items.length - this.cap)
    return rec
  }

  /** Records at or after `sinceMs` (all if omitted), oldest → newest. */
  recent(sinceMs?: number): readonly UxSignalRecord[] {
    if (sinceMs == null) return this.items.slice()
    return this.items.filter((r) => r.at >= sinceMs)
  }

  /** Count of each signal name currently held. */
  summary(): Partial<Record<UxSignalName, number>> {
    const out: Partial<Record<UxSignalName, number>> = {}
    for (const r of this.items) out[r.name] = (out[r.name] ?? 0) + 1
    return out
  }

  size(): number {
    return this.items.length
  }

  clear(): void {
    this.items.length = 0
  }
}

// ════════════════════════════════════════════════════════════════════════════════════
// 6. Trail summary → a bounded, allowlist-safe string
// ════════════════════════════════════════════════════════════════════════════════════
// Renders the buffer's counts as a compact "name:count" string suitable for attaching to a
// feedback report's sanitised context (which only accepts short strings). Deterministic order
// (taxonomy order) so summaries are comparable. Bounded length.
export const MAX_TRAIL_STRING_LEN = 280

export function summarizeUxTrail(
  source: UxSignalBuffer | readonly UxSignalRecord[],
): string {
  const counts: Partial<Record<UxSignalName, number>> =
    source instanceof UxSignalBuffer
      ? source.summary()
      : source.reduce<Partial<Record<UxSignalName, number>>>((acc, r) => {
          if (isUxSignalName(r?.name)) acc[r.name] = (acc[r.name] ?? 0) + 1
          return acc
        }, {})

  const parts: string[] = []
  for (const name of UX_SIGNAL_NAMES) {
    const c = counts[name]
    if (c && c > 0) parts.push(`${name}:${c}`)
  }
  const s = parts.join(' ')
  return s.length > MAX_TRAIL_STRING_LEN ? s.slice(0, MAX_TRAIL_STRING_LEN) : s
}

// ════════════════════════════════════════════════════════════════════════════════════
// 7. Process-local singleton sink (best-effort, never throws)
// ════════════════════════════════════════════════════════════════════════════════════
// A module-level buffer lets UI components record a signal without threading a buffer through
// props. It is intentionally NOT persisted anywhere by itself — a consumer (e.g. the report flow)
// reads it via `getUxTrailSummary()`. Attaching a durable sink is a deliberate follow-up; until
// then signals live only in memory for the current table session.
let singleton: UxSignalBuffer | null = null

function buffer(): UxSignalBuffer {
  if (!singleton) singleton = new UxSignalBuffer()
  return singleton
}

/** Record a UX signal into the process-local trail. Best-effort; swallows any error. */
export function recordUxSignal(name: UxSignalName, detail?: Record<string, number>, at?: number): void {
  try {
    buffer().push({ name, at: at ?? Date.now(), detail })
  } catch {
    /* instrumentation must never affect play */
  }
}

/** A bounded, privacy-safe summary of the current trail (for attaching to a report). */
export function getUxTrailSummary(): string {
  try {
    return summarizeUxTrail(buffer())
  } catch {
    return ''
  }
}

/** Reset the process-local trail (e.g. when leaving a table). */
export function resetUxTrail(): void {
  try {
    buffer().clear()
  } catch {
    /* no-op */
  }
}
