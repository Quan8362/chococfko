// ── Shared multiplayer infra: identifiers & idempotency keys ───────────────────────
//
// PURE module — no React, no Supabase, no browser-only API. Safe to import from a pure
// engine, a server action, or a client component. Tested by ids.test.ts.
//
// These helpers give every authoritative game (Poker first, others later) one vocabulary
// for the two id kinds the realtime + coin-integrity model needs:
//   • EventId        — a unique id per emitted realtime event (duplicate-event dedupe).
//   • IdempotencyKey  — a *deterministic* key derived from stable inputs so that a retried
//                       command (double-click, reconnect replay, duplicate realtime nudge)
//                       collapses to a single authoritative effect (coin-model §4).

export type EventId = string

export type IdempotencyKey = string

// `crypto` is a global in both Node (>=19) and every browser, so this stays dependency-
// and platform-neutral (no `import 'crypto'`, no browser-only `window`).
function randomUUID(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  // Deterministic-free fallback for exotic runtimes without WebCrypto. Still unique
  // enough for an event id; never used for security or coin authority.
  return `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

// A fresh, unique id for one emitted event. Use for duplicate-event detection on the
// client reducer (see envelope.ts EnvelopeDedupe).
export function makeEventId(): EventId {
  return randomUUID()
}

// A DETERMINISTIC idempotency key from stable parts. The same inputs always produce the
// same key, so a duplicated command is recognised and applied once. Parts are joined with
// a separator that cannot appear inside a normalized part, so distinct input tuples can
// never collide (e.g. ['a:b'] vs ['a','b']).
const SEP = '␟' // SYMBOL FOR UNIT SEPARATOR — never present in ids/amounts

export function makeIdempotencyKey(...parts: Array<string | number>): IdempotencyKey {
  if (parts.length === 0) throw new Error('makeIdempotencyKey: at least one part required')
  return parts
    .map((p) => {
      if (typeof p === 'number') {
        if (!Number.isFinite(p)) throw new Error('makeIdempotencyKey: non-finite numeric part')
        return String(p)
      }
      if (p.includes(SEP)) throw new Error('makeIdempotencyKey: part contains reserved separator')
      return p
    })
    .join(SEP)
}

// Convenience for the single most common poker/realtime key: one action within one hand.
// Mirrors the `(hand_id, action_seq)` dedupe in the coin-model (ACTION-IDEMPOTENT-001).
export function makeActionKey(handId: string, actionSeq: number): IdempotencyKey {
  if (!Number.isInteger(actionSeq) || actionSeq < 0) {
    throw new Error('makeActionKey: actionSeq must be a non-negative integer')
  }
  return makeIdempotencyKey('action', handId, actionSeq)
}
