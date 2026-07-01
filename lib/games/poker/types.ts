// ── Poker domain types (NLHE, play-money) — TYPE-ONLY foundation ───────────────────
//
// PURE module — no React, no Supabase, no logic. This file defines the domain vocabulary the
// pure engine (deck/evaluator/betting/pot/engine — built in Phase P1) and the rest of the
// Poker feature will share. It deliberately contains NO rules yet (per the foundation scope:
// "Do not implement complete Poker rules yet").
//
// Canonical rule IDs live in docs/poker/rules/engine-rule-specification.md. The architecture
// boundary (pure lib vs server/UI in app/games/poker) is documented in
// docs/poker/architecture/system-architecture.md §3 and ./README.md.
//
// 🔴 PRIVACY: `HoleCards` is PRIVATE state. It must never appear in a public payload, a
// realtime event, a spectator view, a log, or any shared type. The public table view
// (PublicTableState) has no card-bearing field except `board` (revealed streets only) and the
// showdown `reveal` (non-mucking contenders only). See ./events.ts and security-model §2.

// ── Cards ───────────────────────────────────────────────────────────────────────────
export type Suit = 'c' | 'd' | 'h' | 's' // clubs, diamonds, hearts, spades

// Ranks two-through-ace. 'T' = ten. Stored as single chars to keep a card a 2-char string.
export type Rank =
  | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A'

// A card is a `${Rank}${Suit}` string, e.g. 'As', 'Td', '2c'. Compact + log-greppable.
export type Card = `${Rank}${Suit}`

// Exactly two private hole cards. PRIVATE — never serialized into a public/shared type.
export type HoleCards = readonly [Card, Card]

// ── Streets & hand lifecycle ─────────────────────────────────────────────────────────
export type Street = 'PREFLOP' | 'FLOP' | 'TURN' | 'RIVER' | 'SHOWDOWN'

// Hand-level lifecycle phases (a subset of the FSM in docs/poker/rules/state-machine.md;
// the full FSM is implemented in Phase P3, not here).
export type HandPhase =
  | 'STARTING'
  | 'BETTING'
  | 'SHOWDOWN'
  | 'SETTLEMENT'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'PAUSED_FOR_REVIEW'

// ── Player actions (intent vocabulary) ──────────────────────────────────────────────
// The browser sends one of these as INTENT; the server decides legality (security-model §4).
export type PokerActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all_in'

// An action as submitted/recorded. `amount` is the target total bet for bet/raise (integer
// coins); omitted for fold/check/call. `all_in` amount is derived from the stack server-side.
export interface PokerAction {
  readonly type: PokerActionType
  readonly amount?: number
}

// ── Seats & stacks (public) ──────────────────────────────────────────────────────────
// Re-exports the shared seat status so Poker speaks the platform vocabulary (and imports it
// locally so PublicSeat below can reference it).
import type { SeatStatus } from '../shared/contracts.ts'
export type { SeatStatus }

export interface PublicSeat {
  readonly seatIndex: number
  readonly userId: string | null
  readonly displayName: string | null
  readonly avatarUrl: string | null
  readonly stack: number // PUBLIC by design (pot math is public)
  readonly committedThisStreet: number
  readonly lastAction: PokerActionType | null
  readonly allIn: boolean
  // Seat lifecycle + presence — PUBLIC, spectator-safe (no card information). `connected`
  // is the inverse of `disconnected_at IS NULL`; a temporary disconnect keeps the seat and
  // its escrowed stack (RECONNECT-001), so this only drives a "disconnected" badge, never a
  // seat/stack change. `status` distinguishes sitting_in / sitting_out / reserved / leaving.
  readonly status: SeatStatus
  readonly connected: boolean
  // No card field here — a seat's hole cards live ONLY in private HoleCards storage.
}

// ── Pots (public, integer) ───────────────────────────────────────────────────────────
export interface Pot {
  readonly amount: number // integer coins
  readonly eligibleSeatIndexes: readonly number[] // who can win this (main/side) pot
}

export interface Pots {
  readonly main: Pot
  readonly sides: readonly Pot[]
}

// A computed award at settlement: integer coins to a seat. Sum (+ uncalled refunds) == pot
// (coin-model POT-CONSERVE-001), enforced via shared `isConserved`.
export interface Payout {
  readonly seatIndex: number
  readonly amount: number
}

// ── Public table state (spectator-safe projection) ──────────────────────────────────
// Exactly the shape `fetchTableState` / the published `poker_hands` row exposes
// (realtime-model §5). Contains NO private hole cards and NO undealt deck card.
export interface PublicTableState {
  readonly tableId: string
  readonly handId: string | null
  readonly handNo: number
  readonly stateVersion: number
  readonly phase: HandPhase
  readonly street: Street | null
  readonly board: readonly Card[] // ONLY revealed streets — never future cards
  readonly pots: Pots
  readonly seats: readonly PublicSeat[]
  readonly buttonSeat: number | null
  readonly turnSeat: number | null
  readonly turnDeadline: number | null // epoch ms (server-authoritative)
  readonly turnStartedAt: number | null
  // ONLY at SHOWDOWN→SETTLEMENT, only non-mucking contenders (SHOWDOWN-REVEAL-001).
  readonly reveal?: readonly { seatIndex: number; cards: HoleCards }[]
}

// The caller's OWN private state — fetched via the RLS read-own path, NEVER broadcast.
export interface MyHoleCardsState {
  readonly handId: string
  readonly seatIndex: number
  readonly cards: HoleCards
}
