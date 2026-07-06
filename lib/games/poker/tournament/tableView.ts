// PURE viewer-safe model for the internal-alpha tournament LIVE TABLE (E3A-3C).
//
// This is the single redaction boundary between the server-authoritative hand (config + action
// log, which is enough to derive EVERY seat's hole cards) and what a client is allowed to see. It
// takes the full hand + the VIEWER's own seat and produces a spectator-safe projection PLUS the
// viewer's own two cards — and structurally NOTHING else private:
//   • opponents' hole cards are never computed here (only holeCardsForSeat(viewer) is called);
//   • the legal-action model is attached ONLY when it is the viewer's turn;
//   • the board only ever contains cards the engine has already revealed for the current street;
//   • the raw serialized hand state / deck order never appears in the output.
//
// No React, no Supabase, no wallets. The server does the DB reads (seats, tournament meta, the
// viewer's own seat) and hands them in; this function decides what crosses to the browser. Because
// it is pure it is unit-tested (tableView.test.ts) to PROVE the isolation for every seat.

import { assignBlinds, type RingSeat } from '../order.ts'
import type { LegalActionModel } from '../hand.ts'
import type { AppliedAction } from '../betting.ts'
import type { Card, Street } from '../types.ts'
import {
  liveView,
  holeCardsForSeat,
  type TournamentHandConfig,
  type LoggedAction,
  type TournamentHandSeatView,
} from './handRunner.ts'
import type { TournamentState } from './types.ts'
import type { ParticipantDisplayState } from './uiModel.ts'

// A public seat at the table. `cards` is populated ONLY for the viewer's own seat; it is always
// null for everyone else (enforced in the builder — opponent cards are never derived).
export interface TableSeatView {
  readonly seatIndex: number
  readonly userId: string | null
  readonly displayName: string | null
  readonly avatarUrl: string | null
  readonly stack: number
  readonly seatState: string // 'active' | 'sitting_out' | 'busted'
  readonly inHand: boolean
  readonly committedTotal: number
  readonly status: TournamentHandSeatView['status'] | 'idle'
  readonly folded: boolean
  readonly allIn: boolean
  readonly isButton: boolean
  readonly isSmallBlind: boolean
  readonly isBigBlind: boolean
  readonly isTurn: boolean
  readonly isSelf: boolean
  readonly cards: readonly [Card, Card] | null // own cards only
}

export interface TournamentTableMeta {
  readonly tournamentId: string
  readonly title: string
  readonly state: TournamentState
  readonly levelIndex: number
  readonly smallBlind: number
  readonly bigBlind: number
  readonly ante: number
}

// The RAW (already privacy-filtered by the server's column selection) seat row from
// poker_tournament_seats joined with the player's public profile.
export interface RawSeatRow {
  readonly seatIndex: number
  readonly userId: string | null
  readonly displayName: string | null
  readonly avatarUrl: string | null
  readonly stack: number
  readonly state: string
}

export interface TableHandInput {
  readonly handId: string
  readonly config: TournamentHandConfig
  readonly log: readonly LoggedAction[]
}

export interface BuildTableViewInput {
  readonly meta: TournamentTableMeta
  readonly seats: readonly RawSeatRow[]
  readonly tableNo: number
  readonly viewerSeatIndex: number | null
  readonly participantState: ParticipantDisplayState
  readonly hand: TableHandInput | null
}

export interface TournamentTableView {
  readonly meta: TournamentTableMeta
  readonly tableNo: number
  readonly seats: readonly TableSeatView[]
  readonly viewerSeatIndex: number | null
  readonly participantState: ParticipantDisplayState
  // ── live hand (null when no hand is in progress at the table) ──
  readonly handId: string | null
  readonly handNo: number
  readonly street: Exclude<Street, 'SHOWDOWN'> | null
  readonly board: readonly Card[]
  readonly pot: number
  readonly turnSeat: number | null
  readonly actionSeq: number
  readonly complete: boolean
  readonly buttonSeat: number | null
  // The viewer's own legal-action model — ONLY when it is the viewer's turn (else null).
  readonly legal: LegalActionModel | null
  readonly isMyTurn: boolean
  // Whether the table has ≥2 chipped seats and can play another hand (drives next-hand start).
  readonly canContinue: boolean
  // Monotonic ordering token for realtime staleness drops (handNo↑ then actionSeq↑).
  readonly version: number
}

// Small blind / big blind seat indexes for the CURRENT hand (derived from the authoritative
// button + participating seats via the tested ring order). Defensive: returns nulls if the ring
// can't be resolved rather than guessing wrong.
function deriveBlindSeats(config: TournamentHandConfig): { sb: number | null; bb: number | null } {
  const ring: RingSeat[] = config.seats
    .map((s) => ({ seatIndex: s.seatIndex, eligible: true }))
    .sort((a, b) => a.seatIndex - b.seatIndex)
  if (ring.length < 2 || !ring.some((r) => r.seatIndex === config.buttonSeat)) return { sb: null, bb: null }
  try {
    const b = assignBlinds(ring, config.buttonSeat)
    return { sb: b.smallBlindSeat, bb: b.bigBlindSeat }
  } catch {
    return { sb: null, bb: null }
  }
}

// Build the viewer-safe table view. The ONLY private datum it produces is the viewer's OWN two
// cards; every opponent seat's `cards` is null and no opponent hole card is ever derived.
export function buildTournamentTableView(input: BuildTableViewInput): TournamentTableView {
  const { meta, seats: rawSeats, tableNo, viewerSeatIndex, participantState, hand } = input

  // No live hand → a between-hands / waiting projection over the seat rows only.
  if (!hand) {
    const seats: TableSeatView[] = rawSeats.map((s) => ({
      seatIndex: s.seatIndex,
      userId: s.userId,
      displayName: s.displayName,
      avatarUrl: s.avatarUrl,
      stack: s.stack,
      seatState: s.state,
      inHand: false,
      committedTotal: 0,
      status: 'idle',
      folded: false,
      allIn: false,
      isButton: false,
      isSmallBlind: false,
      isBigBlind: false,
      isTurn: false,
      isSelf: viewerSeatIndex !== null && s.seatIndex === viewerSeatIndex,
      cards: null,
    }))
    const chipped = rawSeats.filter((s) => s.stack > 0 && s.state !== 'busted').length
    return {
      meta, tableNo, seats, viewerSeatIndex, participantState,
      handId: null, handNo: 0, street: null, board: [], pot: 0, turnSeat: null,
      actionSeq: 0, complete: false, buttonSeat: null, legal: null, isMyTurn: false,
      canContinue: chipped >= 2, version: 0,
    }
  }

  const view = liveView(hand.config, hand.log)
  const byHandSeat = new Map<number, TournamentHandSeatView>(view.seats.map((s) => [s.seatIndex, s]))
  const handSeatSet = new Set(hand.config.seats.map((s) => s.seatIndex))
  const blinds = deriveBlindSeats(hand.config)
  const isMyTurn = viewerSeatIndex !== null && view.turnSeat === viewerSeatIndex && !view.complete

  // The viewer's OWN hole cards — the sole private projection. Derived only for the viewer, and
  // only when the viewer actually sits in THIS hand.
  const myHole =
    viewerSeatIndex !== null && handSeatSet.has(viewerSeatIndex)
      ? holeCardsForSeat(hand.config, viewerSeatIndex)
      : null

  const seats: TableSeatView[] = rawSeats.map((s) => {
    const hs = byHandSeat.get(s.seatIndex)
    const inHand = handSeatSet.has(s.seatIndex)
    const isSelf = viewerSeatIndex !== null && s.seatIndex === viewerSeatIndex
    const folded = hs?.status === 'folded'
    return {
      seatIndex: s.seatIndex,
      userId: s.userId,
      displayName: s.displayName,
      avatarUrl: s.avatarUrl,
      // During a live hand the AUTHORITATIVE live stack lives in the reconstructed view; the raw
      // seat row only updates at settlement. Show the live figure so chips read correctly mid-hand.
      stack: hs ? hs.stack : s.stack,
      seatState: s.state,
      inHand,
      committedTotal: hs?.committedTotal ?? 0,
      status: hs?.status ?? 'idle',
      folded,
      allIn: hs?.status === 'allin',
      isButton: hand.config.buttonSeat === s.seatIndex,
      isSmallBlind: blinds.sb === s.seatIndex,
      isBigBlind: blinds.bb === s.seatIndex,
      isTurn: view.turnSeat === s.seatIndex && !view.complete,
      isSelf,
      // OWN cards only — opponent seats are ALWAYS null (their cards are never derived here).
      cards: isSelf ? myHole : null,
    }
  })

  const chipped = seats.filter((s) => s.stack > 0 && s.seatState !== 'busted').length

  return {
    meta,
    tableNo,
    seats,
    viewerSeatIndex,
    participantState,
    handId: hand.handId,
    handNo: view.handNo,
    street: view.street,
    board: view.board,
    pot: view.pot,
    turnSeat: view.turnSeat,
    actionSeq: view.actionSeq,
    complete: view.complete,
    buttonSeat: hand.config.buttonSeat,
    // Legal model is attached ONLY on the viewer's turn (never leaks the actor model otherwise).
    legal: isMyTurn ? view.legal : null,
    isMyTurn,
    canContinue: chipped >= 2,
    version: view.handNo * 100000 + view.actionSeq,
  }
}

// Translate the ActionControls intent (PokerActionType + optional amount) into the engine's
// AppliedAction. Shared by the client submit path; kept pure + here so it is covered by tests.
export function toAppliedAction(action: string, amount?: number): AppliedAction | null {
  switch (action) {
    case 'fold': return { type: 'fold' }
    case 'check': return { type: 'check' }
    case 'call': return { type: 'call' }
    case 'all_in': return { type: 'all_in' }
    case 'bet': return typeof amount === 'number' ? { type: 'bet', to: amount } : null
    case 'raise': return typeof amount === 'number' ? { type: 'raise', to: amount } : null
    default: return null
  }
}
