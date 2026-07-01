// ── Shared multiplayer infra: typed event envelope ─────────────────────────────────
//
// PURE module — no React, no Supabase. Tested by envelope.test.ts.
//
// One typed wrapper for every authoritative realtime event a game emits. It carries exactly
// the metadata the client reducer needs to order, dedupe, and reconcile (envelope ⇒
// sequence.ts), plus a single PUBLIC payload that is spectator-safe by construction.
//
// 🔴 PRIVACY INVARIANT (security-model SECURITY-HOLE-CARDS-001):
//   The envelope NEVER carries private data (a player's hole cards, an undealt deck card).
//   Private state is delivered out-of-band: the envelope may only NAME the recipients who
//   should re-fetch their own private state (via an RLS read-own path), through
//   `privateRecipients` — a list of user IDs and NOTHING ELSE. There is deliberately no
//   field on this type that can hold a card. A game's public payload type must likewise never
//   include a card-bearing field (the Poker layer enforces this with its own types + a
//   runtime scrub test). This keeps the realtime wire structurally free of secrets.

import { compareVersion, type ActionSeq, type StateVersion } from './sequence.ts'
import type { EpochMs } from './deadline.ts'
import type { EventId } from './ids.ts'

// `TType` is a string-literal union of a game's event types; `TPublic` is the game's
// spectator-safe public payload shape (must never contain cards/deck).
export interface GameEventEnvelope<TType extends string = string, TPublic = unknown> {
  readonly eventId: EventId
  readonly type: TType
  readonly roomId: string // table/room id, e.g. the poker tableId
  readonly handId: string | null // null between hands / for lobby-level events
  readonly stateVersion: StateVersion
  readonly actionSeq: ActionSeq
  readonly serverTs: EpochMs
  readonly public: TPublic
  // User IDs that should re-fetch their OWN private state after this event. NEVER a payload.
  readonly privateRecipients?: readonly string[]
}

// A structural runtime validator: confirms the metadata shape before a payload is trusted by
// the reducer. Game-specific payload validity (board length, etc.) is checked by the game.
export function isValidEnvelope(value: unknown): value is GameEventEnvelope {
  if (typeof value !== 'object' || value === null) return false
  const e = value as Record<string, unknown>
  if (typeof e.eventId !== 'string' || e.eventId.length === 0) return false
  if (typeof e.type !== 'string' || e.type.length === 0) return false
  if (typeof e.roomId !== 'string' || e.roomId.length === 0) return false
  if (!(e.handId === null || typeof e.handId === 'string')) return false
  if (!Number.isInteger(e.stateVersion) || (e.stateVersion as number) < 0) return false
  if (!Number.isInteger(e.actionSeq) || (e.actionSeq as number) < 0) return false
  if (typeof e.serverTs !== 'number' || !Number.isFinite(e.serverTs)) return false
  if (!('public' in e)) return false
  if (e.privateRecipients !== undefined) {
    if (!Array.isArray(e.privateRecipients)) return false
    if (!e.privateRecipients.every((r) => typeof r === 'string')) return false
  }
  return true
}

export interface CreateEnvelopeInput<TType extends string, TPublic> {
  eventId: EventId
  type: TType
  roomId: string
  handId?: string | null
  stateVersion: StateVersion
  actionSeq: ActionSeq
  serverTs?: EpochMs
  public: TPublic
  privateRecipients?: readonly string[]
}

// Construct a validated envelope. Throws if the metadata is malformed so a bad event can
// never enter the pipeline. `serverTs` defaults to now() at the call site (the server).
export function createEnvelope<TType extends string, TPublic>(
  input: CreateEnvelopeInput<TType, TPublic>,
): GameEventEnvelope<TType, TPublic> {
  const env: GameEventEnvelope<TType, TPublic> = {
    eventId: input.eventId,
    type: input.type,
    roomId: input.roomId,
    handId: input.handId ?? null,
    stateVersion: input.stateVersion,
    actionSeq: input.actionSeq,
    serverTs: input.serverTs ?? Date.now(),
    public: input.public,
    ...(input.privateRecipients ? { privateRecipients: input.privateRecipients } : {}),
  }
  if (!isValidEnvelope(env)) throw new Error('createEnvelope: produced an invalid envelope')
  return env
}

// True when `a` is newer than `b` by state version (thin wrapper so envelope consumers don't
// reach into sequence.ts directly).
export function isNewerEnvelope(a: GameEventEnvelope, b: GameEventEnvelope): boolean {
  return compareVersion(a.stateVersion, b.stateVersion) > 0
}

// Bounded duplicate-event detector keyed by `eventId` (security-model D4 / EC-H1). A client
// reducer (or a server command de-duper) records each event it has processed; a repeat —
// from a reconnect replay or a doubled realtime delivery — is recognised and ignored.
// Bounded so it cannot grow without limit on a long-lived table.
export class EnvelopeDedupe {
  private readonly seen = new Set<EventId>()
  private readonly order: EventId[] = []
  private readonly capacity: number
  constructor(capacity = 512) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new Error('EnvelopeDedupe: capacity must be a positive integer')
    }
    this.capacity = capacity
  }

  // Returns true the FIRST time an id is seen (caller should process it), false on repeats.
  accept(eventId: EventId): boolean {
    if (this.seen.has(eventId)) return false
    this.seen.add(eventId)
    this.order.push(eventId)
    if (this.order.length > this.capacity) {
      const evicted = this.order.shift()
      if (evicted !== undefined) this.seen.delete(evicted)
    }
    return true
  }

  has(eventId: EventId): boolean {
    return this.seen.has(eventId)
  }

  get size(): number {
    return this.seen.size
  }
}
