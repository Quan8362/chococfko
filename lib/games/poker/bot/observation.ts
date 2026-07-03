// ── Poker BOT information boundary (pure) ─────────────────────────────────────────────
//
// PURE module — no React, no Supabase, no browser API, no clock. Tested by observation.test.ts
// and fairness.test.ts.
//
// 🔴 THIS FILE IS THE FAIRNESS BOUNDARY. A bot may see ONLY what a human in the same seat can
// see (docs/poker/bots/fairness-boundary.md). That guarantee is made STRUCTURAL here, not by a
// promise elsewhere: a `BotObservation` is the COMPLETE input a policy receives, and it simply
// has no field for hidden state. There is nowhere on this object to read an opponent's hole
// cards, an undealt board card, the remaining deck, or the shuffle seed — so a policy cannot.
//
// The harness/server builds this projection from authoritative state and hands ONLY this object
// to `BotPolicy`. `assertObservationClean` is defence-in-depth: it re-checks, at runtime, that
// the projection is internally consistent (board matches the street, own cards are disjoint from
// the board) and carries no forbidden key a future refactor might accidentally widen it with.

import type { Card, Street, PokerActionType } from '../types.ts'
import type { LegalAction } from '../betting.ts'
import { isCard } from '../deck.ts'

// One earlier public action in this hand — exactly what everyone at the table observed. Contains
// NO card information (a bet/raise reveals chips, never cards).
export interface PublicActionEntry {
  readonly seatIndex: number
  readonly street: Street
  readonly type: PokerActionType
  // Resulting "to" total this street for aggressive actions (bet/raise/all_in); absent for
  // fold/check/call. Public — the whole table sees the bet size.
  readonly to?: number
  // Chips this action moved from the actor's stack into the pot. Public (pot math is public).
  readonly addedChips: number
}

// A seat as a BOT observes it — the human-visible PublicSeat facts minus display identity
// (a policy needs no name/avatar to decide). Deliberately has NO card field.
export interface ObservedSeat {
  readonly seatIndex: number
  readonly stack: number // chips behind (public)
  readonly committedThisStreet: number // public
  readonly committedTotal: number // public
  readonly status: 'active' | 'folded' | 'allin' | 'sitout'
  readonly inHand: boolean // active or all-in (still contesting the pot)
}

// The COMPLETE, closed set of information a bot policy is allowed to use. Everything here is
// public OR the bot's own private cards — nothing else exists on the object.
export interface BotObservation {
  readonly seatIndex: number // the acting bot's own seat
  readonly holeCards: readonly [Card, Card] // ITS OWN two cards — never another seat's
  readonly board: readonly Card[] // revealed community cards ONLY (never a future street)
  readonly street: Street
  readonly seats: readonly ObservedSeat[] // public per-seat facts, ascending by seatIndex
  readonly buttonSeat: number
  readonly bigBlind: number
  readonly potTotal: number // all chips already committed this hand (public)
  readonly currentBet: number // highest committedThisStreet this round (public)
  readonly toCall: number // chips the bot still owes to call (public, derivable)
  readonly minRaiseTo: number // smallest legal raise-to (0 when raising is not available)
  readonly maxRaiseTo: number // largest legal raise-to = own committed + own stack
  readonly legal: readonly LegalAction[] // the authoritative legal-action set for this seat
  readonly opponentsInHand: number // other non-folded seats still contesting
  readonly actionHistory: readonly PublicActionEntry[] // public actions so far, in order
}

// The exact number of revealed community cards for a street. A bot NEVER sees more than this —
// the projection slices the full board so future streets are structurally absent.
export function revealedBoardCount(street: Street): number {
  switch (street) {
    case 'PREFLOP':
      return 0
    case 'FLOP':
      return 3
    case 'TURN':
      return 4
    case 'RIVER':
    case 'SHOWDOWN':
      return 5
  }
}

// Slice a full 5-card board down to only what `street` has revealed. Given the full board this
// is the ONLY place a future card could leak; it is removed here, before a policy ever runs.
export function boardForStreet(fullBoard: readonly Card[], street: Street): Card[] {
  return fullBoard.slice(0, revealedBoardCount(street))
}

// Keys that must NEVER appear on a BotObservation. Enumerated so a future accidental widening
// (e.g. spreading a richer internal object into the projection) fails loudly in tests/CI rather
// than silently handing a bot hidden state.
export const FORBIDDEN_OBSERVATION_KEYS: readonly string[] = [
  'holeBySeat',
  'holesBySeat',
  'seed',
  'deck',
  'shuffled',
  'deckOrder',
  'remainingDeck',
  'fullBoard',
  'undealt',
  'winner',
  'winnersByPot',
  'showdown',
  'rng',
]

// Build the observation a bot sees. Callers pass ONLY public facts + the bot's OWN hole cards.
// The signature makes the boundary explicit: there is no parameter through which another seat's
// private cards could arrive.
export function buildObservation(input: {
  readonly seatIndex: number
  readonly holeCards: readonly [Card, Card]
  readonly fullBoard: readonly Card[] // sliced to the street here — future cards never leak out
  readonly street: Street
  readonly seats: readonly ObservedSeat[]
  readonly buttonSeat: number
  readonly bigBlind: number
  readonly currentBet: number
  readonly toCall: number
  readonly minRaiseTo: number
  readonly maxRaiseTo: number
  readonly legal: readonly LegalAction[]
  readonly actionHistory: readonly PublicActionEntry[]
}): BotObservation {
  const board = boardForStreet(input.fullBoard, input.street)
  const potTotal = input.seats.reduce((sum, s) => sum + s.committedTotal, 0)
  const opponentsInHand = input.seats.filter(
    (s) => s.seatIndex !== input.seatIndex && s.inHand,
  ).length
  const obs: BotObservation = {
    seatIndex: input.seatIndex,
    holeCards: input.holeCards,
    board,
    street: input.street,
    seats: input.seats,
    buttonSeat: input.buttonSeat,
    bigBlind: input.bigBlind,
    potTotal,
    currentBet: input.currentBet,
    toCall: input.toCall,
    minRaiseTo: input.minRaiseTo,
    maxRaiseTo: input.maxRaiseTo,
    legal: input.legal,
    opponentsInHand,
    actionHistory: input.actionHistory,
  }
  return obs
}

// Defence-in-depth runtime check that a projection is a legitimate, hidden-info-free observation.
// Throws on the first violation (never repairs). Used by the harness before a policy runs and by
// fairness tests to assert the boundary structurally.
export function assertObservationClean(obs: BotObservation): void {
  for (const key of FORBIDDEN_OBSERVATION_KEYS) {
    if (Object.prototype.hasOwnProperty.call(obs, key)) {
      throw new Error(`bot observation: forbidden hidden-info key "${key}" present`)
    }
  }

  if (!Array.isArray(obs.holeCards) || obs.holeCards.length !== 2) {
    throw new Error('bot observation: holeCards must be exactly two cards')
  }
  for (const c of obs.holeCards) {
    if (!isCard(c)) throw new Error(`bot observation: invalid hole card ${String(c)}`)
  }

  const expectBoard = revealedBoardCount(obs.street)
  if (obs.board.length !== expectBoard) {
    throw new Error(
      `bot observation: board has ${obs.board.length} cards but ${obs.street} reveals ${expectBoard}`,
    )
  }
  for (const c of obs.board) {
    if (!isCard(c)) throw new Error(`bot observation: invalid board card ${String(c)}`)
  }

  // Own cards must be disjoint from the board (they are dealt from the same deck).
  const boardSet = new Set<string>(obs.board)
  for (const c of obs.holeCards) {
    if (boardSet.has(c)) throw new Error(`bot observation: hole card ${c} also on the board`)
  }

  // The bot's own seat must be present and match the observation owner.
  const self = obs.seats.find((s) => s.seatIndex === obs.seatIndex)
  if (!self) throw new Error(`bot observation: own seat ${obs.seatIndex} missing from seats`)
}
