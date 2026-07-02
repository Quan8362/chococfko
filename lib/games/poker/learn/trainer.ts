// ── Poker TRAINING driver (pure, scripted, zero-stakes) ──────────────────────────────────────
//
// PURE module — no React, no Supabase, no clock, no crypto, no wallet, no DB. Tested by
// trainer.test.ts. This powers the no-risk TRAINING TABLE: it runs a full Texas Hold'em hand
// using the SAME authoritative rules engine as real play (hand.ts betting/turn logic +
// showdown.ts settlement + evaluator.ts) but with SCRIPTED cards and SCRIPTED opponents, on
// TRAINING CHIPS that never touch a wallet, a ledger, a table row, or any production statistic.
//
// SAFETY INVARIANTS (enforced by construction + trainer.test.ts):
//   • No value transfer — this module imports nothing from lib/supabase, app/**, or economy DB;
//     "stacks" here are ephemeral integers in memory, discarded when the tab closes.
//   • Reveal-safe VIEW — `trainingView()` NEVER exposes an opponent's hole cards before the
//     showdown reveal, exactly mirroring the production privacy boundary (SECURITY-HOLE-CARDS-001).
//     The learner always sees their OWN two cards; opponents' cards appear only via the showdown
//     `reveal` (non-mucking contenders), never earlier.
//   • Integer coins only (COIN-INT-001) — training chips use the same integer discipline.
//
// The scenario supplies the full 5-card board and each seat's hole cards, so a lesson always
// teaches the intended shape regardless of the betting path the learner explores. Opponents act
// from a per-seat scripted queue with a safe fallback (check, else fold) so the table stays
// robust even when a learner deviates from the suggested line.

import type { Card, PokerActionType, Street } from '../types.ts'
import type { AppliedAction } from '../betting.ts'
import {
  initHand,
  applyPlayerAction,
  legalActionModel,
  nextStep,
  enterStreet,
  markComplete,
  handContributions,
  potTotal,
  type HandState,
  type LegalActionModel,
} from '../hand.ts'
import { settleShowdown, type ShowdownResult } from '../showdown.ts'

// ── Scenario definition ──────────────────────────────────────────────────────────────────────
export interface TrainingSeat {
  readonly seatIndex: number
  // i18n key suffix under `games.poker.training.player.*` (e.g. 'you', 'a', 'b'). Kept as a key,
  // not a display string, so the whole table localizes.
  readonly nameKey: string
  readonly stack: number // TRAINING chips (integer)
  readonly hole: readonly [Card, Card]
  readonly isLearner?: boolean
}

// One scripted turn: when it is `seatIndex`'s turn, take `action`. The learner's scripted turns
// form the SUGGESTED line (highlighted in the UI); opponents' turns auto-resolve from these.
export interface ScriptedTurn {
  readonly seatIndex: number
  readonly action: AppliedAction
}

export interface TrainingScenario {
  readonly id: string
  readonly bigBlind: number
  readonly smallBlind: number
  readonly buttonSeat: number
  readonly seats: readonly TrainingSeat[]
  // Exactly five community cards, dealt in scripted order (flop×3, turn, river). The engine only
  // reveals the streets the hand actually reaches.
  readonly board: readonly Card[]
  readonly script: readonly ScriptedTurn[]
  // Canonical engine rule IDs this scenario illustrates (for the "what am I learning" note).
  readonly focusRuleIds: readonly string[]
}

// ── Session (opaque, serializable-ish, all in memory) ──────────────────────────────────────────
interface SeatQueue {
  readonly seatIndex: number
  readonly actions: readonly AppliedAction[]
  cursor: number
}

export interface TrainingSession {
  readonly scenario: TrainingScenario
  readonly learnerSeat: number
  readonly holeBySeat: ReadonlyMap<number, readonly [Card, Card]>
  readonly nameBySeat: ReadonlyMap<number, string>
  state: HandState
  queues: Map<number, SeatQueue>
  boardCursor: number
  settled: ShowdownResult | null
}

function buildQueues(script: readonly ScriptedTurn[]): Map<number, SeatQueue> {
  const map = new Map<number, SeatQueue>()
  for (const turn of script) {
    const q = map.get(turn.seatIndex) ?? { seatIndex: turn.seatIndex, actions: [], cursor: 0 }
    map.set(turn.seatIndex, { ...q, actions: [...q.actions, turn.action] })
  }
  return map
}

// The next scripted action for a seat (peek), or null when exhausted.
function peekQueue(session: TrainingSession, seat: number): AppliedAction | null {
  const q = session.queues.get(seat)
  if (!q || q.cursor >= q.actions.length) return null
  return q.actions[q.cursor]
}

function consumeQueue(session: TrainingSession, seat: number): void {
  const q = session.queues.get(seat)
  if (q && q.cursor < q.actions.length) q.cursor += 1
}

// A safe fallback when a scripted opponent action is missing/illegal: check if allowed, else fold.
function safeFallback(model: LegalActionModel): AppliedAction {
  if (model.allowed.includes('check')) return { type: 'check' }
  return { type: 'fold' }
}

// ── Public API ─────────────────────────────────────────────────────────────────────────────────
export function startTraining(scenario: TrainingScenario): TrainingSession {
  const learner = scenario.seats.find((s) => s.isLearner)
  if (!learner) throw new Error('trainer: scenario has no learner seat')

  const holeBySeat = new Map<number, readonly [Card, Card]>()
  const nameBySeat = new Map<number, string>()
  for (const s of scenario.seats) {
    holeBySeat.set(s.seatIndex, s.hole)
    nameBySeat.set(s.seatIndex, s.nameKey)
  }

  const { state } = initHand({
    handNo: 1,
    bigBlind: scenario.bigBlind,
    smallBlind: scenario.smallBlind,
    buttonSeat: scenario.buttonSeat,
    seats: scenario.seats.map((s) => ({ seatIndex: s.seatIndex, stack: s.stack })),
  })

  const session: TrainingSession = {
    scenario,
    learnerSeat: learner.seatIndex,
    holeBySeat,
    nameBySeat,
    state,
    queues: buildQueues(scenario.script),
    boardCursor: 0,
    settled: null,
  }
  advance(session)
  return session
}

// Apply the learner's chosen action, then auto-resolve opponents/streets until it is the
// learner's turn again or the hand settles. Returns the same (mutated) session for chaining.
export type TrainingApplyResult =
  | { readonly ok: true; readonly session: TrainingSession }
  | { readonly ok: false; readonly error: string }

export function trainingApply(session: TrainingSession, action: AppliedAction): TrainingApplyResult {
  if (session.settled || session.state.complete) return { ok: false, error: 'hand_complete' }
  if (session.state.turnSeat !== session.learnerSeat) return { ok: false, error: 'not_your_turn' }
  const res = applyPlayerAction(session.state, session.learnerSeat, action)
  if (!res.ok) return { ok: false, error: res.error }
  session.state = res.state
  // Advance the learner's scripted line so `suggested` points at the NEXT step of the good line.
  // (Best-effort: if the learner deviated, later suggestions may not fit — a hint, never a rule.)
  consumeQueue(session, session.learnerSeat)
  advance(session)
  return { ok: true, session }
}

// Peek the suggested learner action for the current turn (the scripted "good line"), or null.
export function suggestedLearnerAction(session: TrainingSession): AppliedAction | null {
  if (session.state.turnSeat !== session.learnerSeat) return null
  return peekQueue(session, session.learnerSeat)
}

// ── Internal advance loop (opponents + board + settlement) ──────────────────────────────────────
function revealNext(session: TrainingSession, count: number): Card[] {
  const cards = session.scenario.board.slice(session.boardCursor, session.boardCursor + count)
  if (cards.length !== count) throw new Error('trainer: scenario board ran out of cards')
  session.boardCursor += count
  return cards as Card[]
}

function settle(session: TrainingSession): void {
  const contribs = handContributions(session.state)
  const contesting = contribs.filter((c) => !c.folded)
  // Mirror engine.ts: a hand won without a showdown reveals no board.
  const board = contesting.length <= 1 ? [] : session.state.board
  session.settled = settleShowdown({
    contribs,
    board,
    holeBySeat: session.holeBySeat,
    buttonSeat: session.state.buttonSeat,
    showFirstSeat: session.state.lastAggressor ?? undefined,
  })
  session.state = markComplete(session.state)
}

function advance(session: TrainingSession): void {
  // Bounded loop — every iteration either settles, deals a street, or applies exactly one
  // opponent action. The cap guards against any pathological scenario script.
  for (let guard = 0; guard < 200; guard++) {
    if (session.settled) return
    const dir = nextStep(session.state)
    switch (dir.kind) {
      case 'await_action': {
        if (dir.seatIndex === session.learnerSeat) return // hand back to the learner
        const model = legalActionModel(session.state)
        if (!model) return
        const scripted = peekQueue(session, dir.seatIndex)
        const legalScripted = scripted && isActionAllowed(model, scripted) ? scripted : null
        const action = legalScripted ?? safeFallback(model)
        if (legalScripted) consumeQueue(session, dir.seatIndex)
        const res = applyPlayerAction(session.state, dir.seatIndex, action)
        if (!res.ok) {
          // Last-resort: fold to keep the table alive (never happens with well-formed scenarios).
          const fold = applyPlayerAction(session.state, dir.seatIndex, { type: 'fold' })
          if (!fold.ok) return
          session.state = fold.state
        } else {
          session.state = res.state
        }
        break
      }
      case 'deal': {
        const cards = revealNext(session, dir.revealCount)
        session.state = enterStreet(session.state, dir.street as Exclude<Street, 'PREFLOP' | 'SHOWDOWN'>, cards)
        break
      }
      case 'runout': {
        // No more betting possible — reveal every remaining street, then settle at showdown.
        const streets: Exclude<Street, 'PREFLOP' | 'SHOWDOWN'>[] = ['FLOP', 'TURN', 'RIVER']
        for (const st of streets) {
          if (session.state.street === st) continue
          if (indexOfStreet(st) <= indexOfStreet(session.state.street)) continue
          const count = st === 'FLOP' ? 3 : 1
          const cards = revealNext(session, count)
          session.state = enterStreet(session.state, st, cards)
        }
        settle(session)
        return
      }
      case 'showdown':
      case 'one_left': {
        settle(session)
        return
      }
    }
  }
}

const STREET_INDEX: Readonly<Record<string, number>> = { PREFLOP: 0, FLOP: 1, TURN: 2, RIVER: 3 }
function indexOfStreet(s: Street): number {
  return STREET_INDEX[s] ?? 0
}

// Cheap pre-check that a scripted action is currently allowed (so we fall back instead of throwing).
function isActionAllowed(model: LegalActionModel, action: AppliedAction): boolean {
  const type: PokerActionType = action.type
  if (!model.allowed.includes(type)) return false
  if (action.type === 'bet') return action.to >= model.minOpeningBet && action.to <= model.maxRaiseTo
  if (action.type === 'raise') return action.to >= model.minRaiseTo && action.to <= model.maxRaiseTo
  return true
}

// ── Reveal-safe VIEW projection (what the UI renders) ─────────────────────────────────────────
export interface TrainingSeatView {
  readonly seatIndex: number
  readonly nameKey: string
  readonly stack: number
  readonly committedThisStreet: number
  readonly totalCommitted: number
  readonly folded: boolean
  readonly allIn: boolean
  readonly isButton: boolean
  readonly isSmallBlind: boolean
  readonly isBigBlind: boolean
  readonly isCurrentActor: boolean
  readonly isLearner: boolean
  // OWN cards always; opponents' cards ONLY once revealed at showdown. null = face-down.
  readonly cards: readonly [Card, Card] | null
  readonly lastAction: PokerActionType | null
  readonly winAmount: number
}

export interface TrainingView {
  readonly scenarioId: string
  readonly street: Exclude<Street, 'SHOWDOWN'>
  readonly board: readonly Card[] // revealed streets only
  readonly pot: number
  readonly bigBlind: number
  readonly smallBlind: number
  readonly learnerSeat: number
  readonly turnSeat: number | null
  readonly seats: readonly TrainingSeatView[]
  readonly legal: LegalActionModel | null // only when it is the learner's turn
  readonly suggested: { readonly type: PokerActionType; readonly to?: number } | null
  readonly settled: boolean
  readonly showdown: ShowdownResult | null
}

export function trainingView(session: TrainingSession): TrainingView {
  const { state } = session
  const revealBySeat = new Map<number, readonly [Card, Card]>()
  if (session.settled) {
    for (const r of session.settled.reveal) revealBySeat.set(r.seatIndex, r.cards)
  }
  const winBySeat = new Map<number, number>()
  if (session.settled) {
    for (const p of session.settled.payouts) winBySeat.set(p.seatIndex, (winBySeat.get(p.seatIndex) ?? 0) + p.amount)
  }

  const seats: TrainingSeatView[] = state.round.players.map((p) => {
    const isLearner = p.seatIndex === session.learnerSeat
    // Own cards always visible; others only via the showdown reveal.
    const cards: readonly [Card, Card] | null = isLearner
      ? (session.holeBySeat.get(p.seatIndex) ?? null)
      : (revealBySeat.get(p.seatIndex) ?? null)
    return {
      seatIndex: p.seatIndex,
      nameKey: session.nameBySeat.get(p.seatIndex) ?? 'a',
      stack: p.stack,
      committedThisStreet: p.committedThisStreet,
      totalCommitted: p.committedTotal,
      folded: p.status === 'folded',
      allIn: p.status === 'allin',
      isButton: p.seatIndex === state.buttonSeat,
      isSmallBlind: p.seatIndex === state.sbSeat,
      isBigBlind: p.seatIndex === state.bbSeat,
      isCurrentActor: p.seatIndex === state.turnSeat,
      isLearner,
      cards,
      lastAction: lastActionOf(p.status, p.hasActedThisRound),
      winAmount: winBySeat.get(p.seatIndex) ?? 0,
    }
  })

  const isLearnerTurn = state.turnSeat === session.learnerSeat && !session.settled
  const legal = isLearnerTurn ? legalActionModel(state) : null
  const sug = isLearnerTurn ? peekQueue(session, session.learnerSeat) : null

  return {
    scenarioId: session.scenario.id,
    street: state.street,
    board: state.board,
    pot: potTotal(state),
    bigBlind: state.bigBlind,
    smallBlind: state.smallBlind,
    learnerSeat: session.learnerSeat,
    turnSeat: state.turnSeat,
    seats,
    legal,
    suggested: sug ? (sug.type === 'bet' || sug.type === 'raise' ? { type: sug.type, to: sug.to } : { type: sug.type }) : null,
    settled: !!session.settled,
    showdown: session.settled,
  }
}

// The betting engine does not persist a per-seat "last action verb"; we only surface fold/all-in
// which are visible from status (the UI reads live legality for everything else). Kept minimal so
// the view never implies a verb the engine did not record.
function lastActionOf(status: string, _hasActed: boolean): PokerActionType | null {
  if (status === 'folded') return 'fold'
  if (status === 'allin') return 'all_in'
  return null
}
