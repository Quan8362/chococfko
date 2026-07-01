// ── Poker step-wise authoritative hand controller (pure, serializable) ─────────────────
//
// PURE module — no React, no Supabase, no clock, no crypto, no cards-dealing. Tested by
// hand.test.ts. This is the bridge Phase P3 needs between the per-street betting engine
// (betting.ts) and DB persistence (app/games/poker/actions.ts): where engine.ts `playHand`
// runs a WHOLE hand from a scripted list in one call, this controller advances ONE action at
// a time and is fully SERIALIZABLE, so the server can persist the hand after every action and
// resume it later (RELOAD-001 — a refresh never reshuffles, never redeals, never repeats).
//
// AUTHORITY MODEL (matches the betting engine): this module decides what is LEGAL, whose turn
// it is, when a street/hand ends, and what board work is needed next — it NEVER owns the clock,
// the deck, persistence, or settlement coin movement. It also NEVER holds hole cards: the
// server reads those from the read-own / service-role private store and runs the evaluator at
// showdown. The serialized state here is therefore spectator-safe (no cards but the revealed
// board). Coins are integer-only (COIN-INT-001).
//
// Flow the server runs per action:
//   apply  → applyPlayerAction(state, action)          (validate + mutate betting)
//   then loop on nextStep(state):
//     'await_action' → persist, wait for the next actor
//     'deal'         → server reveals 1 street from the deck, call enterStreet(), loop again
//     'runout'       → server reveals the rest of the board, then settle by showdown
//     'showdown'     → server settles from DB hole cards + the full board
//     'one_left'     → server settles the single remaining seat (no reveal, POT-ONELEFT-001)

import type { Card, Street, PokerActionType } from './types.ts'
import {
  createRound,
  makePlayer,
  applyAction,
  amountToCall,
  minOpeningBet,
  minRaiseTo,
  maxRaiseTo,
  legalActions,
  isRoundComplete,
  isAllInRunout,
  advanceStreet as advanceBettingStreet,
  type BettingRound,
  type BettingPlayer,
  type AppliedAction,
} from './betting.ts'
import {
  assignBlinds,
  firstToActPreflop,
  firstToActPostflop,
  nextActor,
  type RingSeat,
  type ActorSeat,
} from './order.ts'
import type { SeatContribution } from './pot.ts'

// ── Hand state (serializable; the canonical resume snapshot) ────────────────────────────
export interface HandState {
  readonly handNo: number
  readonly bigBlind: number
  readonly smallBlind: number
  readonly buttonSeat: number
  readonly sbSeat: number
  readonly bbSeat: number
  readonly isHeadsUp: boolean
  readonly street: Exclude<Street, 'SHOWDOWN'> // PREFLOP..RIVER (the betting street)
  readonly board: readonly Card[] // REVEALED community cards only (never future)
  readonly round: BettingRound // the CURRENT street's betting state
  readonly turnSeat: number | null // whose action; null = round complete / no action pending
  readonly actionSeq: number // monotonic; every applied player action increments this
  readonly lastAggressor: number | null // last seat to raise (SHOWDOWN-ORDER-001 show-first)
  readonly complete: boolean // settlement directive emitted; no further actions accepted
}

export interface SeatStart {
  readonly seatIndex: number
  readonly stack: number // EFFECTIVE starting stack (after pending top-ups folded in)
}

export interface HandStartInput {
  readonly handNo: number
  readonly bigBlind: number
  readonly smallBlind?: number // default floor(bigBlind/2) (BLIND-SB-001)
  readonly buttonSeat: number // an ELIGIBLE seat (caller advanced the button via nextButton)
  readonly seats: readonly SeatStart[] // eligible, dealt-in seats; >= 2 required
}

// A forced bet recorded for the audit log (poker_actions.type post_sb / post_bb).
export interface BlindPost {
  readonly seatIndex: number
  readonly type: 'post_sb' | 'post_bb'
  readonly amount: number // chips actually posted (capped at the short stack)
}

const STREET_ORDER: readonly Exclude<Street, 'SHOWDOWN'>[] = ['PREFLOP', 'FLOP', 'TURN', 'RIVER']

function nextStreetOf(street: Exclude<Street, 'SHOWDOWN'>): Exclude<Street, 'SHOWDOWN'> | null {
  const i = STREET_ORDER.indexOf(street)
  return i >= 0 && i < STREET_ORDER.length - 1 ? STREET_ORDER[i + 1] : null
}

// Community cards revealed when ENTERING a street (DECK-DEAL-001 board indices).
export function streetRevealCount(street: Exclude<Street, 'PREFLOP'>): number {
  return street === 'FLOP' ? 3 : 1
}

function ringSeats(state: { seats: readonly { seatIndex: number }[] }): RingSeat[] {
  return state.seats.map((s) => ({ seatIndex: s.seatIndex, eligible: true }))
}

function actorSeats(round: BettingRound): ActorSeat[] {
  return round.players.map((p) => ({
    seatIndex: p.seatIndex,
    canAct: p.status === 'active' && p.stack > 0,
  }))
}

// First actionable seat at or clockwise after `startSeat`.
function firstActorFrom(round: BettingRound, startSeat: number): number | null {
  const start = round.players.find((p) => p.seatIndex === startSeat)
  if (start && start.status === 'active' && start.stack > 0) return startSeat
  return nextActor(actorSeats(round), startSeat)
}

function inHandPlayers(round: BettingRound): BettingPlayer[] {
  return round.players.filter((p) => p.status === 'active' || p.status === 'allin')
}

// ── Start a hand: post blinds, build the preflop round, choose the first actor ──────────
export function initHand(input: HandStartInput): { state: HandState; blinds: BlindPost[] } {
  if (input.seats.length < 2) throw new Error('hand: a hand needs at least 2 eligible seats')
  if (input.seats.length > 6) throw new Error('hand: a hand allows at most 6 seats')
  const seatIndexes = input.seats.map((s) => s.seatIndex)
  if (new Set(seatIndexes).size !== seatIndexes.length) throw new Error('hand: duplicate seat index')

  const bb = input.bigBlind
  const sb = input.smallBlind ?? Math.floor(bb / 2)
  const blindAssign = assignBlinds(
    input.seats.map((s) => ({ seatIndex: s.seatIndex, eligible: true })),
    input.buttonSeat,
  )

  const blinds: BlindPost[] = []
  const players: BettingPlayer[] = input.seats.map((s) => {
    const owed = s.seatIndex === blindAssign.smallBlindSeat ? sb
      : s.seatIndex === blindAssign.bigBlindSeat ? bb
      : 0
    const post = Math.min(owed, s.stack)
    if (post > 0) {
      blinds.push({
        seatIndex: s.seatIndex,
        type: s.seatIndex === blindAssign.smallBlindSeat ? 'post_sb' : 'post_bb',
        amount: post,
      })
    }
    const stack = s.stack - post
    return makePlayer({
      seatIndex: s.seatIndex,
      stack,
      committedThisStreet: post,
      committedTotal: post,
      status: post > 0 && stack === 0 ? 'allin' : 'active',
    })
  })

  // Seed the min-raise tracker at one big blind, and the bet level at the highest blind posted.
  const round = createRound({ street: 'PREFLOP', bigBlind: bb, players, lastFullRaiseSize: bb })

  const firstPos = firstToActPreflop(ringSeats({ seats: input.seats }), blindAssign)
  const turnSeat = isRoundComplete(round) ? null : firstActorFrom(round, firstPos)

  const state: HandState = {
    handNo: input.handNo,
    bigBlind: bb,
    smallBlind: sb,
    buttonSeat: blindAssign.buttonSeat,
    sbSeat: blindAssign.smallBlindSeat,
    bbSeat: blindAssign.bigBlindSeat,
    isHeadsUp: blindAssign.isHeadsUp,
    street: 'PREFLOP',
    board: [],
    round,
    turnSeat,
    actionSeq: 0,
    lastAggressor: null,
    complete: false,
  }
  return { state, blinds }
}

// ── Legal-action model handed to the current player (the SERVER's authority, not the client) ─
export interface LegalActionModel {
  readonly seatIndex: number
  readonly allowed: readonly PokerActionType[]
  readonly callAmount: number // chips to ADD to call (0 when nothing owed)
  readonly minOpeningBet: number // valid only when currentBet === 0
  readonly minRaiseTo: number // smallest legal "raise to" total this street
  readonly maxRaiseTo: number // largest "raise to" (No-Limit: all-in)
  readonly currentStreetContribution: number // already committed THIS street
  readonly totalContribution: number // already committed across ALL streets this hand
  readonly remainingStack: number
  readonly pot: number // total committed across all seats this hand
  readonly street: Exclude<Street, 'SHOWDOWN'>
  readonly actionSeq: number
}

export function potTotal(state: HandState): number {
  return state.round.players.reduce((sum, p) => sum + p.committedTotal, 0)
}

// Live pot summary for the PUBLIC table view DURING a hand: a single gross pot (everything
// committed so far) whose eligible set is the non-folded seats. Precise layered side-pots are
// only computed at settlement (settleShowdown) — mid-street, an as-yet-uncalled bet must NOT be
// shown as "refunded", so the gross total is the truthful live figure.
export interface LivePots {
  readonly main: { readonly amount: number; readonly eligibleSeatIndexes: readonly number[] }
  readonly sides: readonly never[]
}
export function livePots(state: HandState): LivePots {
  const eligible = state.round.players
    .filter((p) => p.status !== 'folded')
    .map((p) => p.seatIndex)
  return { main: { amount: potTotal(state), eligibleSeatIndexes: eligible }, sides: [] }
}

export function legalActionModel(state: HandState): LegalActionModel | null {
  if (state.complete || state.turnSeat === null) return null
  const seat = state.turnSeat
  const p = state.round.players.find((x) => x.seatIndex === seat)
  if (!p) return null
  const acts = legalActions(state.round, seat)
  return {
    seatIndex: seat,
    allowed: acts.map((a) => a.type),
    callAmount: amountToCall(state.round, seat),
    minOpeningBet: minOpeningBet(state.round),
    minRaiseTo: minRaiseTo(state.round),
    maxRaiseTo: maxRaiseTo(state.round, seat),
    currentStreetContribution: p.committedThisStreet,
    totalContribution: p.committedTotal,
    remainingStack: p.stack,
    pot: potTotal(state),
    street: state.street,
    actionSeq: state.actionSeq,
  }
}

// ── Apply ONE player action (validate legality + turn, mutate betting, advance the turn) ──
export type HandActionError =
  | 'hand_complete'
  | 'no_actor'
  | 'not_your_turn'
  | { readonly betting: ReturnType<typeof applyAction> extends infer _ ? string : string }

export type HandActionResult =
  | { readonly ok: true; readonly state: HandState }
  | { readonly ok: false; readonly error: string }

export function applyPlayerAction(
  state: HandState,
  seatIndex: number,
  action: AppliedAction,
): HandActionResult {
  if (state.complete) return { ok: false, error: 'hand_complete' }
  if (state.turnSeat === null) return { ok: false, error: 'no_actor' }
  if (seatIndex !== state.turnSeat) return { ok: false, error: 'not_your_turn' }

  const before = state.round.currentBet
  const res = applyAction(state.round, seatIndex, action)
  if (!res.ok) return { ok: false, error: res.error }
  const round = res.round

  const lastAggressor = round.currentBet > before ? seatIndex : state.lastAggressor
  const turnSeat = isRoundComplete(round) ? null : nextActor(actorSeats(round), seatIndex)

  return {
    ok: true,
    state: { ...state, round, turnSeat, lastAggressor, actionSeq: state.actionSeq + 1 },
  }
}

// ── What does the server do next? (street advance / runout / showdown / one-left) ───────
export type HandDirective =
  | { readonly kind: 'await_action'; readonly seatIndex: number }
  | { readonly kind: 'deal'; readonly street: Exclude<Street, 'PREFLOP'>; readonly revealCount: number }
  | { readonly kind: 'runout'; readonly toStreet: 'RIVER' }
  | { readonly kind: 'showdown' }
  | { readonly kind: 'one_left'; readonly seatIndex: number }

export function nextStep(state: HandState): HandDirective {
  const contenders = inHandPlayers(state.round)
  if (contenders.length <= 1) {
    // POT-ONELEFT-001: a single unfolded seat wins immediately, no showdown, no reveal.
    return { kind: 'one_left', seatIndex: contenders[0]?.seatIndex ?? -1 }
  }
  if (state.turnSeat !== null) {
    return { kind: 'await_action', seatIndex: state.turnSeat }
  }
  // Betting round is complete with >1 seat still in the hand.
  if (isAllInRunout(state.round)) {
    // No further betting possible. Run the rest of the board out, then showdown.
    return state.street === 'RIVER' ? { kind: 'showdown' } : { kind: 'runout', toStreet: 'RIVER' }
  }
  if (state.street === 'RIVER') return { kind: 'showdown' }
  const next = nextStreetOf(state.street)!
  return { kind: 'deal', street: next as Exclude<Street, 'PREFLOP'>, revealCount: streetRevealCount(next as Exclude<Street, 'PREFLOP'>) }
}

// ── Enter the next betting street (server has revealed `newCards` from the deck) ─────────
// Resets per-street contributions + re-arms active seats, appends the revealed cards, and sets
// the first postflop actor (first active seat clockwise-left of the button, BLIND-POSTFLOP-ORDER-001).
export function enterStreet(
  state: HandState,
  street: Exclude<Street, 'PREFLOP' | 'SHOWDOWN'>,
  newCards: readonly Card[],
): HandState {
  const expected = streetRevealCount(street)
  if (newCards.length !== expected) {
    throw new Error(`hand: ${street} reveal must be ${expected} card(s), got ${newCards.length}`)
  }
  const round = advanceBettingStreet(state.round, street)
  // Betting only happens when at least two players can still act; with one (or zero) player
  // holding chips and the rest all-in, the street has no decision — the board runs out with
  // no turn (mirrors engine.ts `canBet >= 2`). Postflop currentBet starts at 0, so a lone
  // actionable seat owes nothing and simply checks down to showdown.
  const actionable = round.players.filter((p) => p.status === 'active' && p.stack > 0)
  const turnSeat = actionable.length >= 2 ? firstToActPostflop(actorSeats(round), state.buttonSeat) : null
  return { ...state, street, board: [...state.board, ...newCards], round, turnSeat }
}

// ── Mark settled: the server has moved coins; no further action is accepted (idempotency) ─
export function markComplete(state: HandState): HandState {
  return { ...state, complete: true, turnSeat: null }
}

// ── Settlement inputs the server hands to the showdown evaluator ─────────────────────────
export function handContributions(state: HandState): SeatContribution[] {
  return state.round.players.map((p) => ({
    seatIndex: p.seatIndex,
    committed: p.committedTotal,
    folded: p.status === 'folded',
  }))
}

// Seats still contesting (not folded) — used to know who needs hole cards at showdown.
export function contestingSeats(state: HandState): number[] {
  return inHandPlayers(state.round).map((p) => p.seatIndex)
}

// ── Serialization (the engine_state jsonb snapshot persisted on poker_hands) ─────────────
// Spectator-safe by construction: contains NO hole cards and NO undealt deck card — only the
// revealed board and the public betting bookkeeping (stacks/contributions are already public).
export interface SerializedHand {
  readonly v: 1
  readonly handNo: number
  readonly bigBlind: number
  readonly smallBlind: number
  readonly buttonSeat: number
  readonly sbSeat: number
  readonly bbSeat: number
  readonly isHeadsUp: boolean
  readonly street: Exclude<Street, 'SHOWDOWN'>
  readonly board: readonly Card[]
  readonly currentBet: number
  readonly lastFullRaiseSize: number
  readonly players: ReadonlyArray<{
    readonly seatIndex: number
    readonly status: BettingPlayer['status']
    readonly stack: number
    readonly committedThisStreet: number
    readonly committedTotal: number
    readonly hasActedThisRound: boolean
  }>
  readonly turnSeat: number | null
  readonly actionSeq: number
  readonly lastAggressor: number | null
  readonly complete: boolean
}

export function serializeHand(state: HandState): SerializedHand {
  return {
    v: 1,
    handNo: state.handNo,
    bigBlind: state.bigBlind,
    smallBlind: state.smallBlind,
    buttonSeat: state.buttonSeat,
    sbSeat: state.sbSeat,
    bbSeat: state.bbSeat,
    isHeadsUp: state.isHeadsUp,
    street: state.street,
    board: state.board,
    currentBet: state.round.currentBet,
    lastFullRaiseSize: state.round.lastFullRaiseSize,
    players: state.round.players.map((p) => ({
      seatIndex: p.seatIndex,
      status: p.status,
      stack: p.stack,
      committedThisStreet: p.committedThisStreet,
      committedTotal: p.committedTotal,
      hasActedThisRound: p.hasActedThisRound,
    })),
    turnSeat: state.turnSeat,
    actionSeq: state.actionSeq,
    lastAggressor: state.lastAggressor,
    complete: state.complete,
  }
}

export function deserializeHand(data: SerializedHand): HandState {
  if (data.v !== 1) throw new Error(`hand: unsupported engine_state version ${(data as { v: number }).v}`)
  const players: BettingPlayer[] = data.players.map((p) =>
    makePlayer({
      seatIndex: p.seatIndex,
      stack: p.stack,
      status: p.status,
      committedThisStreet: p.committedThisStreet,
      committedTotal: p.committedTotal,
      hasActedThisRound: p.hasActedThisRound,
    }),
  )
  const round: BettingRound = {
    street: data.street,
    bigBlind: data.bigBlind,
    players: [...players].sort((a, b) => a.seatIndex - b.seatIndex),
    currentBet: data.currentBet,
    lastFullRaiseSize: data.lastFullRaiseSize,
  }
  return {
    handNo: data.handNo,
    bigBlind: data.bigBlind,
    smallBlind: data.smallBlind,
    buttonSeat: data.buttonSeat,
    sbSeat: data.sbSeat,
    bbSeat: data.bbSeat,
    isHeadsUp: data.isHeadsUp,
    street: data.street,
    board: data.board,
    round,
    turnSeat: data.turnSeat,
    actionSeq: data.actionSeq,
    lastAggressor: data.lastAggressor,
    complete: data.complete,
  }
}
