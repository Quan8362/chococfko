// ── Poker PRACTICE-bot domain types (pure) ────────────────────────────────────────────
//
// PURE module — no React, no Supabase, no clock. Tested by classification.test.ts et al.
//
// The practice-bot mode is a STRICTLY ISOLATED, practice-only gameplay path (Prompt 27B). It
// reuses the same pure engine authority as the cash game (lib/games/poker/hand.ts) but is walled
// off from the real economy:
//   • practice chips live ONLY in this game object; they NEVER touch game_wallets / coin_ledger;
//   • bot seats are structurally barred from any human cash table (a practice table is a distinct
//     `kind` that cash-game code never produces);
//   • results feed NO ranking, achievement, mission, P&L, or anti-abuse statistic.
//
// 🔴 A `PracticeGame` carries SERVER-ONLY secrets (`holeBySeat`, `deckStub`, `seed`). These are
// the trusted server's knowledge for dealing + settlement and must NEVER be serialized to a
// client. The per-viewer client projection is built by the runtime, and a bot only ever sees a
// `BotObservation` (observation.ts).

import type { Card } from '../types.ts'
import type { SerializedHand } from '../hand.ts'
import type { BotDifficulty } from '../bot/policy.ts'

// The one and only table classification bots may occupy. It is a LITERAL union of a single value
// so a "cash" table can never be represented here — the type system itself refuses it.
export type PracticeTableKind = 'practice'

// A practice seat occupant. A bot is NOT a user: it has no user_id and no wallet. A human seat
// carries the authenticated user id (resolved server-side, never client-supplied).
export type PracticeSeatOccupant =
  | { readonly kind: 'human'; readonly userId: string; readonly displayName: string }
  | { readonly kind: 'bot'; readonly botId: string; readonly difficulty: BotDifficulty; readonly displayName: string }

export interface PracticeSeat {
  readonly seatIndex: number
  readonly occupant: PracticeSeatOccupant
  readonly stack: number // isolated integer practice chips (NEVER real coins)
}

// Immutable-after-start table configuration. `kind` is fixed to 'practice'; the runtime refuses
// to start a hand on anything else and refuses to mutate classification once a hand has begun.
export interface PracticeTableConfig {
  readonly tableId: string
  readonly kind: PracticeTableKind
  readonly bigBlind: number
  readonly smallBlind: number
  readonly startingStack: number // the isolated buy-in every seat begins with
  readonly actionTimeMs: number // server-controlled bot think-time budget (practice pacing)
  readonly seats: readonly PracticeSeat[]
}

// The lifecycle phase of a practice game (mirrors the cash HandPhase vocabulary, subset).
export type PracticePhase = 'IDLE' | 'BETTING' | 'SETTLEMENT' | 'COMPLETED'

// The full authoritative practice game. `version` is the monotonic optimistic-concurrency token
// (a bot/human action carries the expected version; a stale action is rejected — idempotency).
export interface PracticeGame {
  readonly config: PracticeTableConfig
  readonly handNo: number
  readonly buttonSeat: number | null
  readonly phase: PracticePhase
  readonly hand: SerializedHand | null // the current hand's engine state (public-safe projection)
  readonly chips: Readonly<Record<number, number>> // seatIndex → isolated stack between hands
  readonly version: number

  // ── SERVER-ONLY secrets (never serialized to any client) ──────────────────────────────────
  readonly holeBySeat: Readonly<Record<number, readonly [Card, Card]>> // dealt hole cards
  readonly deckStub: readonly Card[] // the shuffled deck for this hand (server deck)
  readonly seed: number // deterministic deal seed (server RNG state for THIS hand)
}

// Keys on a PracticeGame that are SERVER-ONLY and must never cross to a client payload.
export const SERVER_ONLY_GAME_KEYS: readonly string[] = ['holeBySeat', 'deckStub', 'seed']

export function isBotSeat(seat: PracticeSeat): boolean {
  return seat.occupant.kind === 'bot'
}

export function isHumanSeat(seat: PracticeSeat): boolean {
  return seat.occupant.kind === 'human'
}

export function botDifficultyOf(seat: PracticeSeat): BotDifficulty | null {
  return seat.occupant.kind === 'bot' ? seat.occupant.difficulty : null
}
