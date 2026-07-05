// ── Poker PRACTICE per-viewer client projection (pure, privacy-safe) ──────────────────
//
// PURE module — no React, no Supabase. Tested by view.test.ts.
//
// Builds the ONLY thing a client is ever handed: a public table projection + (if the viewer holds
// a seat) that viewer's OWN hole cards. The full `PracticeGame` carries server-only secrets
// (holeBySeat / deckStub / seed); this builder reads none of them except the ONE viewer's own
// cards. `assertClientViewPrivacy` re-checks that no server secret and no foreign card leaked.

import type { Card } from '../types.ts'
import type { PracticeGame, PracticeHandResult } from './types.ts'
import { SERVER_ONLY_GAME_KEYS } from './types.ts'
import { deserializeHand, legalActionModel, potTotal, type LegalActionModel } from '../hand.ts'

export interface PracticeViewSeat {
  readonly seatIndex: number
  readonly kind: 'human' | 'bot'
  readonly displayName: string
  readonly difficulty: string | null // bot difficulty label; null for humans
  readonly isBot: boolean
  readonly stack: number
  readonly status: string
  readonly committedThisStreet: number
  readonly committedTotal: number
}

export interface PracticeClientView {
  readonly tableId: string
  readonly kind: 'practice'
  readonly practice: true // explicit, immutable disclosure marker for the UI
  readonly noRealReward: true // explicit disclosure: practice moves NO real coins
  readonly handNo: number
  readonly phase: PracticeGame['phase']
  readonly version: number
  // The live hand's monotonic action sequence. The client MUST echo this back when it submits an
  // action (practiceAct) — the authoritative core validates it as `expectedSeq === hand.actionSeq`
  // for idempotency/stale-guard. It is distinct from `version` (the DB-row optimistic token), which
  // advances on every persisted mutation including bot actions, so the two are NOT interchangeable.
  readonly actionSeq: number
  readonly board: readonly Card[] // revealed streets only
  readonly buttonSeat: number | null
  readonly turnSeat: number | null
  readonly seats: readonly PracticeViewSeat[]
  readonly viewerSeatIndex: number | null
  readonly ownHole: readonly [Card, Card] | null // ONLY the viewer's own cards
  // ── Public betting context (all derived from the authoritative hand; no secret) ──────────────
  readonly bigBlind: number
  readonly smallBlind: number
  readonly sbSeat: number | null
  readonly bbSeat: number | null
  readonly street: string | null // PREFLOP..RIVER while a hand is live; null otherwise
  readonly pot: number // total chips committed across all seats this hand
  readonly currentBet: number // the bet level to match on the current street
  // The authoritative legal-action model — present ONLY when it is the viewer's turn. The client
  // renders controls STRICTLY from this (it never invents legality). null when it is not the
  // viewer's turn or no hand is live.
  readonly legal: LegalActionModel | null
  // The most-recently-settled hand's public result (winner/pot/legal reveal). Present at COMPLETED.
  readonly result: PracticeHandResult | null
}

export function toClientView(game: PracticeGame, viewerSeatIndex: number | null): PracticeClientView {
  const hand = game.hand
  const players = hand ? hand.players : []
  // `game.chips` is the AUTHORITATIVE behind-stack at all times: it is kept in sync with the live
  // hand during betting AND receives the payouts at settlement. The hand's per-player `stack` is the
  // pre-payout betting stack, so at COMPLETED it does NOT include a winner's award — reading it here
  // would show final stacks that omit the pot just won. Always prefer `game.chips`.
  const stackOf = (seatIndex: number): number => {
    const c = game.chips[seatIndex]
    if (c !== undefined) return c
    const p = players.find((x) => x.seatIndex === seatIndex)
    return p ? p.stack : 0
  }
  const seats: PracticeViewSeat[] = game.config.seats.map((s) => {
    const p = players.find((x) => x.seatIndex === s.seatIndex)
    return {
      seatIndex: s.seatIndex,
      kind: s.occupant.kind,
      displayName: s.occupant.displayName,
      difficulty: s.occupant.kind === 'bot' ? s.occupant.difficulty : null,
      isBot: s.occupant.kind === 'bot',
      stack: stackOf(s.seatIndex),
      status: p ? p.status : 'idle',
      committedThisStreet: p ? p.committedThisStreet : 0,
      committedTotal: p ? p.committedTotal : 0,
    }
  })

  // A viewer only ever gets their OWN hole cards, and only while a hand is live. Bots never call
  // this (they receive a BotObservation instead), and a human never receives another seat's cards.
  const viewerSeat = viewerSeatIndex !== null ? game.config.seats.find((s) => s.seatIndex === viewerSeatIndex) : undefined
  const ownHole =
    viewerSeat && viewerSeat.occupant.kind === 'human' && game.holeBySeat[viewerSeatIndex as number]
      ? game.holeBySeat[viewerSeatIndex as number]
      : null

  // Reconstruct the live engine state ONCE to derive the public betting context + the viewer's
  // legal actions. The client never receives the engine state itself — only these projected fields.
  const state = hand ? deserializeHand(hand) : null
  const legal =
    state && viewerSeatIndex !== null && state.turnSeat === viewerSeatIndex
      ? legalActionModel(state)
      : null

  const view: PracticeClientView = {
    tableId: game.config.tableId,
    kind: 'practice',
    practice: true,
    noRealReward: true,
    handNo: game.handNo,
    phase: game.phase,
    version: game.version,
    actionSeq: hand ? hand.actionSeq : 0,
    board: hand ? hand.board : [],
    buttonSeat: game.buttonSeat,
    turnSeat: hand ? hand.turnSeat : null,
    seats,
    viewerSeatIndex,
    ownHole,
    bigBlind: game.config.bigBlind,
    smallBlind: game.config.smallBlind,
    sbSeat: hand ? hand.sbSeat : null,
    bbSeat: hand ? hand.bbSeat : null,
    street: hand ? hand.street : null,
    pot: state ? potTotal(state) : 0,
    currentBet: hand ? hand.currentBet : 0,
    legal,
    result: game.lastResult,
  }
  assertClientViewPrivacy(view, game, viewerSeatIndex)
  return view
}

// Defence in depth: refuse to emit a client view that leaked a server secret or a foreign card.
export function assertClientViewPrivacy(
  view: PracticeClientView,
  game: PracticeGame,
  viewerSeatIndex: number | null,
): void {
  for (const key of SERVER_ONLY_GAME_KEYS) {
    if (Object.prototype.hasOwnProperty.call(view, key)) {
      throw new Error(`practice view: server-only key "${key}" leaked into the client view`)
    }
  }
  // The view must not contain any OTHER seat's hole cards. We check by scanning the serialized view
  // for any card token that belongs to a non-viewer seat.
  const foreign: string[] = []
  for (const [seat, cards] of Object.entries(game.holeBySeat)) {
    if (Number(seat) === viewerSeatIndex) continue
    foreign.push(...cards)
  }
  if (foreign.length > 0) {
    const json = JSON.stringify(view)
    for (const c of foreign) {
      if (json.includes(`"${c}"`)) {
        throw new Error('practice view: a foreign hole card leaked into the client view')
      }
    }
  }
}
