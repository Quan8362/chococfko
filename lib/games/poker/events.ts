// ── Poker realtime events — typed envelope on the shared infra ─────────────────────
//
// PURE module — no React, no Supabase. Tested by events.test.ts.
//
// Poker instantiates the shared `GameEventEnvelope` with its own event-type union and a
// PUBLIC, spectator-safe payload. Per realtime-model §5 the public payload is exactly a
// `PublicTableState` projection (or a thin delta of it) — it has NO private hole card and NO
// undealt deck card. When an event means "some seats must re-read their own cards" (e.g. a
// new hand was dealt), the envelope only NAMES those user ids in `privateRecipients`; the
// cards themselves travel solely on the RLS read-own path (security-model §2, Layer 4).

import {
  createEnvelope,
  type GameEventEnvelope,
} from '../shared/envelope.ts'
import type { CreateEnvelopeInput } from '../shared/envelope.ts'
import type { PublicTableState } from './types.ts'

// One channel per table: `poker:${tableId}` (realtime-model §1).
export const POKER_CHANNEL_NS = 'poker'

export type PokerEventType =
  | 'table_updated' // any public hand-state transition (bet, street reveal, turn change)
  | 'seat_changed' // a seat sat down / stood up / sat out (public seat row changed)
  | 'hand_started' // a new hand was dealt — seated players must re-fetch their hole cards
  | 'hand_settled' // payouts applied; may carry public showdown reveal of non-muckers

// Every Poker public payload is the spectator-safe table projection. (Deltas, if introduced
// later, must remain a strict subset of this type — never widen it with a private field.)
export type PokerPublicPayload = PublicTableState

export type PokerEvent = GameEventEnvelope<PokerEventType, PokerPublicPayload>

// Keys that must NEVER appear anywhere inside a public payload. This is the structural guard
// behind the privacy invariant (SECURITY-HOLE-CARDS-001): even if a future refactor wires a
// private field into a public object by mistake, this catches it before it reaches the wire.
// `board` (revealed streets) and `reveal` (non-mucking showdown) are the ONLY allowed
// card-bearing fields and are intentionally not listed here.
const FORBIDDEN_PUBLIC_KEYS = /^(holecards|hole_cards|holecard|deck|stub|burn|undealt|privatecards|private_cards)$/i

// Recursively assert a value carries no forbidden (private) field. Throws on the first leak.
export function assertSpectatorSafe(value: unknown, path = 'public'): void {
  if (value === null || typeof value !== 'object') return
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertSpectatorSafe(v, `${path}[${i}]`))
    return
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_PUBLIC_KEYS.test(key)) {
      throw new Error(`poker: forbidden private field "${key}" found in public payload at ${path}`)
    }
    assertSpectatorSafe(child, `${path}.${key}`)
  }
}

// Build a Poker event with the privacy guard wired in: the public payload is scrubbed before
// the envelope is constructed, so a leak is impossible to emit. The server passes the
// already-public projection; this is the single chokepoint for emitting a poker event.
export function createPokerEvent(
  input: CreateEnvelopeInput<PokerEventType, PokerPublicPayload>,
): PokerEvent {
  assertSpectatorSafe(input.public)
  return createEnvelope(input)
}
