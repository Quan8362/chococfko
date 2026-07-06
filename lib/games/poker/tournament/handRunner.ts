// Tournament hand runner — PURE glue that plays ONE tournament hand with the existing cash engine
// (REUSE, don't fork: TNMT-ENG-010) over tournament CHIP stacks and settles to per-seat chip DELTAS
// that sum to zero. No React, no Supabase, no wallets/coin_ledger — the server persists the returned
// deltas via poker_tournament_apply_hand_result (chips move only within the tournament, TNMT-CHIP).
//
// A hand is represented by (config, actionLog): a seed + blinds/button/seat-stacks + the ordered list
// of applied actions. That pair is fully serializable (stored in poker_tournament_hands.state) and
// deterministic — the live view and the settlement are both pure functions of it.

import { playHand, type HandConfig } from '../engine.ts'
import {
  initHand, applyPlayerAction, legalActionModel, nextStep, enterStreet, markComplete,
  potTotal, type HandState, type LegalActionModel,
} from '../hand.ts'
import { seededShuffle, deal } from '../deck.ts'
import type { AppliedAction, SeatBettingStatus } from '../betting.ts'
import type { Card, Street } from '../types.ts'

export interface TournamentHandSeat {
  readonly seatIndex: number
  readonly stack: number // CHIPS this seat brings to the hand
}

// The immutable configuration of a tournament hand. `seed` drives the deterministic shuffle.
export interface TournamentHandConfig {
  readonly seed: number
  readonly handNo: number
  readonly bigBlind: number
  readonly smallBlind?: number
  readonly buttonSeat: number
  readonly seats: readonly TournamentHandSeat[]
}

// One applied action in the log (who acted + what). Same shape the cash engine replays.
export interface LoggedAction {
  readonly seatIndex: number
  readonly action: AppliedAction
}

export interface ChipDelta {
  readonly seatIndex: number
  readonly delta: number // signed chip change for this hand; the set sums to 0
}

const POSTFLOP_STREETS: readonly Exclude<Street, 'PREFLOP' | 'SHOWDOWN'>[] = ['FLOP', 'TURN', 'RIVER']

function toHandConfig(config: TournamentHandConfig): HandConfig {
  return {
    seed: config.seed,
    bigBlind: config.bigBlind,
    smallBlind: config.smallBlind,
    buttonSeat: config.buttonSeat,
    seats: config.seats.map((s) => ({ seatIndex: s.seatIndex, stack: s.stack })),
  }
}

function boardCards(config: TournamentHandConfig): Record<Exclude<Street, 'PREFLOP' | 'SHOWDOWN'>, readonly Card[]> {
  const dealt = deal(seededShuffle(config.seed), config.seats.length)
  return { FLOP: [...dealt.flop], TURN: [dealt.turn], RIVER: [dealt.river] }
}

// Server-only: a seat's two hole cards (deterministic from the seed). NEVER sent to another client.
export function holeCardsForSeat(config: TournamentHandConfig, seatIndex: number): readonly [Card, Card] {
  const dealt = deal(seededShuffle(config.seed), config.seats.length)
  const ordered = config.seats.map((s) => s.seatIndex).slice().sort((a, b) => a - b)
  const i = ordered.indexOf(seatIndex)
  if (i < 0) throw new Error(`handRunner: seat ${seatIndex} not in hand`)
  return dealt.holeBySeat[i]
}

// Drive the engine incrementally over the log, revealing the board at street boundaries, until the
// log is exhausted (awaiting the next action) or the hand completes (fold-to-one / showdown / runout).
function reconstruct(
  config: TournamentHandConfig,
  log: readonly LoggedAction[],
): { state: HandState; complete: boolean } {
  const board = boardCards(config)
  let { state } = initHand({
    handNo: config.handNo,
    bigBlind: config.bigBlind,
    smallBlind: config.smallBlind,
    buttonSeat: config.buttonSeat,
    seats: config.seats.map((s) => ({ seatIndex: s.seatIndex, stack: s.stack })),
  })
  let cursor = 0
  // Guard against an unbounded loop on malformed input (streets are finite).
  for (let guard = 0; guard < 64; guard++) {
    while (state.turnSeat !== null) {
      if (cursor >= log.length) return { state, complete: false }
      const a = log[cursor]
      const res = applyPlayerAction(state, a.seatIndex, a.action)
      if (!res.ok) throw new Error(`handRunner: illegal logged action at seat ${a.seatIndex}: ${res.error}`)
      state = res.state
      cursor++
    }
    const dir = nextStep(state)
    if (dir.kind === 'one_left' || dir.kind === 'showdown') return { state: markComplete(state), complete: true }
    if (dir.kind === 'deal') {
      // nextStep only emits 'deal' for FLOP/TURN/RIVER (SHOWDOWN is its own directive); narrow the type.
      const st = dir.street as Exclude<Street, 'PREFLOP' | 'SHOWDOWN'>
      state = enterStreet(state, st, board[st]); continue
    }
    if (dir.kind === 'runout') {
      const startIdx = state.street === 'PREFLOP' ? 0 : POSTFLOP_STREETS.indexOf(state.street as Exclude<Street, 'PREFLOP' | 'SHOWDOWN'>) + 1
      for (let k = startIdx; k < POSTFLOP_STREETS.length; k++) {
        const ns = POSTFLOP_STREETS[k]
        state = enterStreet(state, ns, board[ns])
      }
      return { state: markComplete(state), complete: true }
    }
    return { state, complete: false } // await_action with no turn — defensive, shouldn't occur
  }
  throw new Error('handRunner: reconstruction did not terminate')
}

export interface TournamentHandSeatView {
  readonly seatIndex: number
  readonly stack: number
  readonly committedTotal: number
  readonly status: SeatBettingStatus
}

// The PUBLIC live view of a hand — spectator-safe: board + betting bookkeeping, NEVER hole cards.
export interface TournamentHandView {
  readonly handNo: number
  readonly street: Exclude<Street, 'SHOWDOWN'>
  readonly board: readonly Card[]
  readonly pot: number
  readonly turnSeat: number | null
  readonly actionSeq: number
  readonly complete: boolean
  readonly legal: LegalActionModel | null
  readonly seats: readonly TournamentHandSeatView[]
}

export function liveView(config: TournamentHandConfig, log: readonly LoggedAction[]): TournamentHandView {
  const { state, complete } = reconstruct(config, log)
  return {
    handNo: state.handNo,
    street: state.street,
    board: state.board,
    pot: potTotal(state),
    turnSeat: state.turnSeat,
    actionSeq: state.actionSeq,
    complete,
    legal: legalActionModel(state),
    seats: state.round.players.map((p) => ({
      seatIndex: p.seatIndex,
      stack: p.stack,
      committedTotal: p.committedTotal,
      status: p.status,
    })),
  }
}

export function isComplete(config: TournamentHandConfig, log: readonly LoggedAction[]): boolean {
  return reconstruct(config, log).complete
}

// Validate + append one action. Returns the new log and whether the hand is now complete.
// Enforces: hand not already complete, it IS this seat's turn, and the action is legal.
export type ApplyResult =
  | { readonly ok: true; readonly log: LoggedAction[]; readonly complete: boolean }
  | { readonly ok: false; readonly error: string }

export function applyAction(
  config: TournamentHandConfig,
  log: readonly LoggedAction[],
  seatIndex: number,
  action: AppliedAction,
): ApplyResult {
  const { state, complete } = reconstruct(config, log)
  if (complete) return { ok: false, error: 'hand_complete' }
  if (state.turnSeat === null) return { ok: false, error: 'no_actor' }
  if (state.turnSeat !== seatIndex) return { ok: false, error: 'not_your_turn' }
  const res = applyPlayerAction(state, seatIndex, action)
  if (!res.ok) return { ok: false, error: res.error }
  const nextLog = [...log, { seatIndex, action }]
  return { ok: true, log: nextLog, complete: reconstruct(config, nextLog).complete }
}

// Settle a COMPLETED hand into per-seat chip deltas (received − committed). Uses the tested engine +
// showdown as the single settlement oracle; the deltas sum to 0 (chips only move within the table).
export function settle(config: TournamentHandConfig, log: readonly LoggedAction[]): ChipDelta[] {
  const { state, complete } = reconstruct(config, log)
  if (!complete) throw new Error('handRunner: settle() called on an unfinished hand')
  const result = playHand(toHandConfig(config), log.map((l) => ({ seatIndex: l.seatIndex, action: l.action })))
  const received = new Map<number, number>()
  for (const p of result.showdown.payouts) received.set(p.seatIndex, (received.get(p.seatIndex) ?? 0) + p.amount)
  if (result.showdown.refund) {
    const r = result.showdown.refund
    received.set(r.seatIndex, (received.get(r.seatIndex) ?? 0) + r.amount)
  }
  const committed = new Map<number, number>()
  for (const p of state.round.players) committed.set(p.seatIndex, p.committedTotal)
  const deltas: ChipDelta[] = config.seats.map((s) => ({
    seatIndex: s.seatIndex,
    delta: (received.get(s.seatIndex) ?? 0) - (committed.get(s.seatIndex) ?? 0),
  }))
  const sum = deltas.reduce((a, d) => a + d.delta, 0)
  if (sum !== 0) throw new Error(`handRunner: chip deltas do not conserve (sum=${sum})`)
  return deltas
}
