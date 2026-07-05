// ── Poker PRACTICE server-authoritative runtime (pure, seeded) ────────────────────────
//
// PURE module — no React, no Supabase, no clock, no I/O. Deterministic given its seeds. Tested by
// runtime.test.ts, worker.test.ts, soak.test.ts.
//
// The interactive practice engine. It REUSES the same pure authority as the cash game
// (lib/games/poker/hand.ts: initHand / applyPlayerAction / legalActionModel / nextStep /
// enterStreet / settleShowdown) — there is NO duplicate rules or settlement implementation here.
// The only differences from cash are isolation concerns:
//   • chips are the isolated practice supply (economy.ts), never real coins;
//   • bots act through the SAME authoritative action core humans use (`applyActionAuthoritative`);
//   • server-only secrets (holeBySeat / deckStub / seed) never leave the trusted runtime.

import type { Card } from '../types.ts'
import { seededShuffle, deal } from '../deck.ts'
import { nextButton, type RingSeat } from '../order.ts'
import type { AppliedAction } from '../betting.ts'
import {
  initHand,
  applyPlayerAction,
  nextStep,
  enterStreet,
  markComplete,
  handContributions,
  serializeHand,
  deserializeHand,
  type HandState,
} from '../hand.ts'
import { settleShowdown } from '../showdown.ts'
import { evaluateHand, describeHand } from '../evaluator.ts'
import { decideSafely, type BotPolicy, type BotFallbackReason } from '../bot/policy.ts'
import { policyFor } from '../bot/policies.ts'
import type {
  PracticeGame,
  PracticeTableConfig,
  PracticeSeat,
  PracticePhase,
  PracticeHandResult,
  PracticeRevealedHand,
} from './types.ts'
import { validatePracticeConfig, assertPracticeKind, assertBotSeatAllowed } from './classification.ts'
import { applyPracticePayouts, isPracticeSettlementConserved } from './economy.ts'
import { buildServerObservation } from './observation.ts'

// ── Construction ──────────────────────────────────────────────────────────────────────────

export function createPracticeGame(config: PracticeTableConfig, seed: number): PracticeGame {
  const v = validatePracticeConfig(config)
  if (!v.ok) throw new Error(`practice: invalid config — ${v.errors.join('; ')}`)
  const chips: Record<number, number> = {}
  for (const s of config.seats) chips[s.seatIndex] = s.stack
  return {
    config,
    handNo: 0,
    buttonSeat: null,
    phase: 'IDLE',
    hand: null,
    chips,
    version: 0,
    lastResult: null,
    holeBySeat: {},
    deckStub: [],
    seed: seed >>> 0,
  }
}

// Derive a per-hand deck seed from the game seed + hand number (integer; deck requires integer).
function deriveHandSeed(seed: number, handNo: number): number {
  let h = (seed ^ Math.imul(handNo + 1, 0x9e3779b1)) >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0
  return h >>> 0
}

function fundedSeats(game: PracticeGame): PracticeSeat[] {
  return game.config.seats.filter((s) => (game.chips[s.seatIndex] ?? 0) > 0)
}

function fullBoardFromStub(stub: readonly Card[], seatCount: number): Card[] {
  const dealt = deal(stub, seatCount)
  return [...dealt.flop, dealt.turn, dealt.river]
}

function streetCards(fullBoard: readonly Card[], street: 'FLOP' | 'TURN' | 'RIVER'): Card[] {
  if (street === 'FLOP') return fullBoard.slice(0, 3)
  if (street === 'TURN') return [fullBoard[3]]
  return [fullBoard[4]]
}

// ── Start a hand ───────────────────────────────────────────────────────────────────────────

export function startPracticeHand(game: PracticeGame): PracticeGame {
  assertPracticeKind(game.config.kind)
  if (game.phase === 'BETTING') throw new Error('practice: a hand is already live')

  const funded = fundedSeats(game)
  if (funded.length < 2) throw new Error('practice: need at least 2 funded seats to start a hand')

  const handNo = game.handNo + 1
  const ring: RingSeat[] = funded.map((s) => ({ seatIndex: s.seatIndex, eligible: true }))
  const buttonSeat = nextButton(ring, game.buttonSeat)

  const startSeats = funded.map((s) => ({ seatIndex: s.seatIndex, stack: game.chips[s.seatIndex] }))
  const seed = deriveHandSeed(game.seed, handNo)
  const stub = seededShuffle(seed)
  const dealt = deal(stub, funded.length)
  const orderedSeats = startSeats.map((s) => s.seatIndex).sort((a, b) => a - b)
  const holeBySeat: Record<number, readonly [Card, Card]> = {}
  orderedSeats.forEach((seatIndex, i) => { holeBySeat[seatIndex] = dealt.holeBySeat[i] })

  const { state } = initHand({
    handNo,
    bigBlind: game.config.bigBlind,
    smallBlind: game.config.smallBlind,
    buttonSeat,
    seats: startSeats,
  })

  // Debit the blinds/committed chips from the isolated stacks up-front so `chips` always reflects
  // the true behind-stack; the pot lives in the engine state and is returned at settlement.
  const chips: Record<number, number> = { ...game.chips }
  for (const p of state.round.players) chips[p.seatIndex] = p.stack

  const started: PracticeGame = {
    ...game,
    handNo,
    buttonSeat,
    phase: 'BETTING',
    hand: serializeHand(state),
    chips,
    version: game.version + 1,
    lastResult: null, // a new hand clears the previous hand's settled result
    holeBySeat,
    deckStub: stub,
    seed,
  }
  // If the hand starts with no actor (everyone all-in from blinds), run it straight to settlement.
  return state.turnSeat === null ? progress(started, state) : started
}

// ── The SHARED authoritative action core (humans AND bots use this) ─────────────────────────

export type PracticeActResult =
  | { readonly ok: true; readonly game: PracticeGame; readonly applied: AppliedAction; readonly phase: PracticePhase }
  | { readonly ok: false; readonly error: string; readonly game: PracticeGame }

// Apply ONE action for `seatIndex`, validated + settled through the pure engine. `expectedSeq`
// (the live hand's actionSeq) provides optimistic-concurrency / idempotency: a stale or replayed
// submission is rejected, so a duplicate invocation can never produce two actions.
export function applyActionAuthoritative(
  game: PracticeGame,
  seatIndex: number,
  action: AppliedAction,
  expectedSeq: number,
): PracticeActResult {
  if (game.phase !== 'BETTING' || !game.hand) return { ok: false, error: 'no_live_hand', game }
  const state = deserializeHand(game.hand)
  if (state.turnSeat === null) return { ok: false, error: 'no_actor', game }
  if (state.turnSeat !== seatIndex) return { ok: false, error: 'not_actor_turn', game }
  if (expectedSeq !== state.actionSeq) return { ok: false, error: 'stale_state', game }

  const res = applyPlayerAction(state, seatIndex, action)
  if (!res.ok) return { ok: false, error: res.error, game }

  // Debit the acting seat's behind-stack from the engine result (isolated chips bookkeeping).
  const chips: Record<number, number> = { ...game.chips }
  const actor = res.state.round.players.find((p) => p.seatIndex === seatIndex)!
  chips[seatIndex] = actor.stack

  const afterAction: PracticeGame = {
    ...game,
    hand: serializeHand(res.state),
    chips,
    version: game.version + 1,
  }
  const progressed = progress(afterAction, res.state)
  return { ok: true, game: progressed, applied: action, phase: progressed.phase }
}

// Drive the hand forward with no further input: reveal streets from the server deck, or settle.
function progress(game: PracticeGame, startState: HandState): PracticeGame {
  let state = startState
  let current = game
  let guard = 0
  for (;;) {
    if (++guard > 40) break
    const step = nextStep(state)
    if (step.kind === 'await_action') {
      return { ...current, hand: serializeHand(state), phase: 'BETTING' }
    }
    if (step.kind === 'deal' || step.kind === 'runout') {
      const n = state.round.players.length
      const full = fullBoardFromStub(current.deckStub, n)
      const street =
        step.kind === 'runout'
          ? (state.street === 'PREFLOP' ? 'FLOP' : state.street === 'FLOP' ? 'TURN' : 'RIVER')
          : (step.street as 'FLOP' | 'TURN' | 'RIVER')
      state = enterStreet(state, street, streetCards(full, street))
      current = { ...current, hand: serializeHand(state), version: current.version + 1 }
      continue
    }
    // showdown or one_left → settle authoritatively (isolated chips only).
    return settle(current, state)
  }
  return current
}

// ── Settlement (reuses settleShowdown; moves ONLY isolated practice chips) ───────────────────

function settle(game: PracticeGame, state: HandState): PracticeGame {
  const contribs = handContributions(state)
  const contesting = contribs.filter((c) => !c.folded).map((c) => c.seatIndex)
  const board = contesting.length <= 1 ? [] : [...state.board]

  const holeBySeat = new Map<number, readonly [Card, Card]>()
  for (const [seat, cards] of Object.entries(game.holeBySeat)) holeBySeat.set(Number(seat), cards)

  const showdown = settleShowdown({
    contribs,
    board,
    holeBySeat,
    buttonSeat: state.buttonSeat,
    showFirstSeat: state.lastAggressor ?? undefined,
  })

  const contributed = contribs.map((c) => c.committed)
  if (!isPracticeSettlementConserved(contributed, showdown.payouts, showdown.refund)) {
    throw new Error('practice: settlement did not conserve isolated chips')
  }

  // Credit results back to the isolated stacks (contributions were already debited during betting).
  const contributedBySeat: Record<number, number> = {}
  for (const c of contribs) contributedBySeat[c.seatIndex] = c.committed
  const chips = applyPracticePayouts(game.chips, contributedBySeat, showdown.payouts, showdown.refund)

  const finalState = markComplete(state)
  const lastResult = buildHandResult(state, contribs, showdown)
  return {
    ...game,
    hand: serializeHand(finalState),
    chips,
    phase: 'COMPLETED',
    version: game.version + 1,
    lastResult,
    holeBySeat: {}, // clear the per-hand secret once the hand is settled
  }
}

// Build the PUBLIC-safe settled-hand result from the canonical showdown output. The winner, pot,
// awards, and hand labels come straight from the engine (NEVER recomputed elsewhere), and only the
// legally-revealed contenders' cards are included — `showdown.reveal` already excludes folded/mucked
// hands (SHOWDOWN-REVEAL-001), so no private card can leak through here.
function buildHandResult(
  state: HandState,
  contribs: ReturnType<typeof handContributions>,
  showdown: ReturnType<typeof settleShowdown>,
): PracticeHandResult {
  const fullBoard = showdown.wentToShowdown ? [...state.board] : []
  const reveal: PracticeRevealedHand[] = showdown.reveal.map((r) => ({
    seatIndex: r.seatIndex,
    cards: r.cards,
    handLabel: describeHand(evaluateHand(r.cards, fullBoard)).label,
  }))
  const winners = Array.from(new Set(showdown.winnersByPot.flat()))
  const awards = showdown.payouts
    .filter((p) => p.amount > 0)
    .map((p) => ({ seatIndex: p.seatIndex, amount: p.amount }))
  const potTotal = contribs.reduce((sum, c) => sum + c.committed, 0)
  return {
    handNo: state.handNo,
    wentToShowdown: showdown.wentToShowdown,
    board: fullBoard,
    reveal,
    winners,
    awards,
    potTotal,
    refund: showdown.refund ? { seatIndex: showdown.refund.seatIndex, amount: showdown.refund.amount } : null,
  }
}

// ── Current actor & bot orchestration ────────────────────────────────────────────────────────

export interface CurrentActor {
  readonly seatIndex: number
  readonly isBot: boolean
}

export function currentActor(game: PracticeGame): CurrentActor | null {
  if (game.phase !== 'BETTING' || !game.hand) return null
  const state = deserializeHand(game.hand)
  if (state.turnSeat === null) return null
  const seat = game.config.seats.find((s) => s.seatIndex === state.turnSeat)
  if (!seat) return null
  return { seatIndex: state.turnSeat, isBot: seat.occupant.kind === 'bot' }
}

// The seat's resolved policy (bot seats only). Kept here so the worker/tests can inject a custom
// policy while production uses the difficulty registry.
export function policyForSeat(seat: PracticeSeat): BotPolicy {
  if (seat.occupant.kind !== 'bot') throw new Error('practice: policyForSeat on a non-bot seat')
  return policyFor(seat.occupant.difficulty)
}

export interface BotActOutcome {
  readonly result: PracticeActResult
  readonly usedFallback: boolean
  readonly fallbackReason: BotFallbackReason | null
}

// Have the CURRENT bot actor act once, through the shared authoritative core. Builds the server
// observation, runs the seat's policy (or an injected one), corrects any illegal/throwing decision
// to a safe fallback, and submits with the live actionSeq for idempotency. Returns a rejection
// result (never throws) if it is not a bot's turn.
export function botActOnce(
  game: PracticeGame,
  rng: () => number,
  policyOverride?: BotPolicy,
): BotActOutcome {
  const actor = currentActor(game)
  if (!actor) return { result: { ok: false, error: 'no_actor', game }, usedFallback: false, fallbackReason: null }
  if (!actor.isBot) return { result: { ok: false, error: 'not_bot_seat', game }, usedFallback: false, fallbackReason: null }

  const seat = game.config.seats.find((s) => s.seatIndex === actor.seatIndex)!
  assertBotSeatAllowed(game.config, seat)

  const state = deserializeHand(game.hand!)
  const ownHole = game.holeBySeat[actor.seatIndex]
  if (!ownHole) return { result: { ok: false, error: 'missing_hole', game }, usedFallback: false, fallbackReason: null }

  const obs = buildServerObservation(state, actor.seatIndex, ownHole)
  const policy = policyOverride ?? policyForSeat(seat)
  const outcome = decideSafely(policy, obs, rng)
  const result = applyActionAuthoritative(game, actor.seatIndex, outcome.decision.action, state.actionSeq)
  return {
    result,
    usedFallback: outcome.kind === 'fallback',
    fallbackReason: outcome.kind === 'fallback' ? outcome.reason : null,
  }
}

export interface RunBotsResult {
  readonly game: PracticeGame
  readonly botActions: number
  readonly fallbacks: number
}

// Run bots until it is a HUMAN's turn, the hand ends, or a safety cap trips. Used by the server
// loop after a human action (and at hand start) so the human is never left waiting on a bot.
export function runBotsUntilHumanOrEnd(game: PracticeGame, rng: () => number): RunBotsResult {
  let current = game
  let botActions = 0
  let fallbacks = 0
  let guard = 0
  for (;;) {
    if (++guard > 400) break // infinite-loop backstop
    const actor = currentActor(current)
    if (!actor || !actor.isBot) break
    const out = botActOnce(current, rng)
    if (!out.result.ok) break // stale/rejection — let the caller re-drive from fresh state
    current = out.result.game
    botActions += 1
    if (out.usedFallback) fallbacks += 1
  }
  return { game: current, botActions, fallbacks }
}

// Convenience for humans: assert the seat is human, then act through the shared core.
export function humanActionAuthoritative(
  game: PracticeGame,
  seatIndex: number,
  action: AppliedAction,
  expectedSeq: number,
): PracticeActResult {
  const seat = game.config.seats.find((s) => s.seatIndex === seatIndex)
  if (!seat) return { ok: false, error: 'no_such_seat', game }
  if (seat.occupant.kind !== 'human') return { ok: false, error: 'not_human_seat', game }
  return applyActionAuthoritative(game, seatIndex, action, expectedSeq)
}
