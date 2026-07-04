// ── Poker BOT interactive hand driver (pure, seeded) ──────────────────────────────────
//
// PURE module — no React, no Supabase, no clock, no I/O. Deterministic given its seed + rng.
// Tested by runner.test.ts.
//
// This is the INTERACTIVE counterpart of the scripted `engine.playHand`. Where the engine
// consumes a pre-written action list, this driver asks a `BotPolicy` for each decision as the
// hand unfolds — building the fairness-bounded `BotObservation` at every turn and validating the
// chosen action through the SAME authoritative `applyAction` a human action goes through.
//
// It shares ALL the engine's pure primitives (deck / betting / order / showdown / pot). Crucially,
// after driving the hand it re-runs the recorded action log through the canonical `engine.playHand`
// and asserts an identical board + settlement. Any divergence is surfaced as a DEFECT — which is
// exactly how a large bot simulation catches rare engine state bugs (primary objective #1).

import type { Card, Street } from '../types.ts'
import { seededShuffle, deal } from '../deck.ts'
import {
  createRound,
  makePlayer,
  applyAction,
  legalActions,
  amountToCall,
  minRaiseTo,
  maxRaiseTo,
  isRoundComplete,
  isAllInRunout,
  advanceStreet,
  getPlayer,
  type BettingRound,
  type BettingPlayer,
  type AppliedAction,
} from '../betting.ts'
import { assignBlinds, firstToActPreflop, nextActor, type RingSeat, type ActorSeat } from '../order.ts'
import { settleShowdown, type ShowdownResult } from '../showdown.ts'
import { isSettlementConserved, type SeatContribution } from '../pot.ts'
import { playHand, type HandConfig, type ScriptedAction } from '../engine.ts'
import { buildObservation, type ObservedSeat, type PublicActionEntry } from './observation.ts'
export type { PublicActionEntry } from './observation.ts'
import { decideSafely, type BotPolicy } from './policy.ts'

export interface BotSeatConfig {
  readonly seatIndex: number
  readonly stack: number
  readonly policy: BotPolicy
}

export interface BotHandConfig {
  readonly seed: number
  readonly bigBlind: number
  readonly smallBlind?: number
  readonly buttonSeat: number
  readonly seats: readonly BotSeatConfig[]
}

export interface HandDefect {
  readonly kind:
    | 'illegal_applied' // a policy action passed legality but applyAction rejected it (engine bug)
    | 'nonterminating' // the per-hand action cap tripped (possible infinite loop)
    | 'not_conserved' // Σ payouts + refund ≠ Σ contributions (coin leak/creation)
    | 'engine_crosscheck' // driver settlement ≠ canonical engine settlement for the same log
    | 'crosscheck_threw' // canonical engine threw while replaying the driver's own action log
  readonly detail: string
  readonly seatIndex?: number
}

export interface HandOutcome {
  readonly board: readonly Card[]
  readonly streetReached: Street
  readonly actionLog: readonly ScriptedAction[]
  // Public, street-attributed action history (same facts everyone at the table saw). Additive:
  // exposed so a baseline harness can attribute VPIP/PFR/sizing per street. Carries NO cards.
  readonly history: readonly PublicActionEntry[]
  readonly showdown: ShowdownResult
  readonly stackDeltas: ReadonlyMap<number, number> // seatIndex → net chip change this hand (Σ = 0)
  readonly potTotal: number
  readonly sidePotCount: number // number of side pots beyond the main pot
  readonly wentToShowdown: boolean
  readonly fallbacks: number // times a policy degraded to a safe action
  readonly defects: readonly HandDefect[]
}

const STREETS: readonly Street[] = ['PREFLOP', 'FLOP', 'TURN', 'RIVER']

function ringSeats(config: BotHandConfig): RingSeat[] {
  return config.seats.map((s) => ({ seatIndex: s.seatIndex, eligible: true }))
}

function actorSeats(round: BettingRound): ActorSeat[] {
  return round.players.map((p) => ({ seatIndex: p.seatIndex, canAct: p.status === 'active' && p.stack > 0 }))
}

function firstActorFrom(round: BettingRound, startSeat: number): number | null {
  const start = round.players.find((p) => p.seatIndex === startSeat)
  if (start && start.status === 'active' && start.stack > 0) return startSeat
  return nextActor(actorSeats(round), startSeat)
}

// Identical to engine.postBlinds — replicated (it is not exported) so the driver stays exactly on
// the engine's rails. The cross-check below would flag any drift, but we avoid drift by design.
function postBlinds(config: BotHandConfig, sbSeat: number, bbSeat: number): BettingRound {
  const sb = config.smallBlind ?? Math.floor(config.bigBlind / 2)
  const players: BettingPlayer[] = config.seats.map((s) => {
    const owed = s.seatIndex === sbSeat ? sb : s.seatIndex === bbSeat ? config.bigBlind : 0
    const post = Math.min(owed, s.stack)
    const stack = s.stack - post
    return makePlayer({
      seatIndex: s.seatIndex,
      stack,
      committedThisStreet: post,
      committedTotal: post,
      status: post > 0 && stack === 0 ? 'allin' : 'active',
    })
  })
  return createRound({ street: 'PREFLOP', bigBlind: config.bigBlind, players })
}

function nonFolded(round: BettingRound): BettingPlayer[] {
  return round.players.filter((p) => p.status !== 'folded')
}

function observedSeats(round: BettingRound): ObservedSeat[] {
  return round.players
    .map((p) => ({
      seatIndex: p.seatIndex,
      stack: p.stack,
      committedThisStreet: p.committedThisStreet,
      committedTotal: p.committedTotal,
      status: p.status,
      inHand: p.status === 'active' || p.status === 'allin',
    }))
    .sort((a, b) => a.seatIndex - b.seatIndex)
}

// Drive one betting street interactively, querying each actor's policy. Mutates `log`, `history`,
// and `defects`; returns the resulting round + updated fallback count + last aggressor.
function runStreetInteractive(
  round: BettingRound,
  street: Street,
  firstSeat: number,
  policyBySeat: ReadonlyMap<number, BotPolicy>,
  holeBySeat: ReadonlyMap<number, readonly [Card, Card]>,
  fullBoard: readonly Card[],
  buttonSeat: number,
  bigBlind: number,
  rng: () => number,
  log: ScriptedAction[],
  history: PublicActionEntry[],
  defects: HandDefect[],
  actionBudget: { remaining: number },
): { round: BettingRound; fallbacks: number; lastAggressor: number | null } {
  let current = round
  let actor: number | null = firstActorFrom(current, firstSeat)
  let lastAggressor: number | null = null
  let fallbacks = 0

  while (!isRoundComplete(current) && actor !== null) {
    if (actionBudget.remaining-- <= 0) {
      defects.push({ kind: 'nonterminating', detail: `action budget exhausted on ${street}` })
      break
    }

    const seat = actor
    const hole = holeBySeat.get(seat)
    if (!hole) throw new Error(`bot runner: missing hole cards for acting seat ${seat}`)
    const before = getPlayer(current, seat)
    const legal = legalActions(current, seat)
    // The observation is built with ONLY this seat's own cards — the builder receives no other
    // seat's private cards, which is the structural fairness guarantee.
    const obs = buildObservation({
      seatIndex: seat,
      holeCards: hole,
      fullBoard,
      street,
      seats: observedSeats(current),
      buttonSeat,
      bigBlind,
      currentBet: current.currentBet,
      toCall: amountToCall(current, seat),
      minRaiseTo: minRaiseTo(current),
      maxRaiseTo: maxRaiseTo(current, seat),
      legal,
      actionHistory: history.slice(),
    })

    const policy = policyBySeat.get(seat)
    const outcome = policy
      ? decideSafely(policy, obs, rng)
      : { kind: 'fallback' as const, decision: { action: { type: 'fold' } as AppliedAction }, reason: 'illegal' as const }
    if (outcome.kind === 'fallback') fallbacks += 1
    let action = outcome.decision.action

    const beforeBet = current.currentBet
    let res = applyAction(current, seat, action)
    if (!res.ok) {
      // A validated-legal action the engine rejected is a genuine engine inconsistency.
      defects.push({ kind: 'illegal_applied', detail: `${action.type} rejected: ${res.error}`, seatIndex: seat })
      // Force progress with a fold (always legal for an active seat) so the sim never wedges.
      const fold = applyAction(current, seat, { type: 'fold' })
      if (!fold.ok) break
      res = fold
      action = { type: 'fold' }
      fallbacks += 1
    }
    current = res.round

    const after = getPlayer(current, seat)
    const addedChips = after.committedTotal - before.committedTotal
    const entry: PublicActionEntry = {
      seatIndex: seat,
      street,
      type: action.type,
      addedChips,
      ...(action.type === 'bet' || action.type === 'raise' || action.type === 'all_in'
        ? { to: after.committedThisStreet }
        : {}),
    }
    history.push(entry)
    log.push({ seatIndex: seat, action })

    if (current.currentBet > beforeBet) lastAggressor = seat
    if (isRoundComplete(current)) break
    actor = nextActor(actorSeats(current), seat)
  }

  return { round: current, fallbacks, lastAggressor }
}

// Play one full hand with bots. Deterministic given the seed (deal) + rng (policy choices).
export function playBotHand(config: BotHandConfig, rng: () => number): HandOutcome {
  if (config.seats.length < 2 || config.seats.length > 6) {
    throw new Error('bot runner: a hand needs 2..6 seats')
  }

  const shuffled = seededShuffle(config.seed)
  const dealt = deal(shuffled, config.seats.length)
  const orderedSeats = config.seats.map((s) => s.seatIndex).sort((a, b) => a - b)
  const holeBySeat = new Map<number, readonly [Card, Card]>()
  orderedSeats.forEach((seatIndex, i) => holeBySeat.set(seatIndex, dealt.holeBySeat[i]))
  const fullBoard: Card[] = [...dealt.flop, dealt.turn, dealt.river]

  const policyBySeat = new Map<number, BotPolicy>(config.seats.map((s) => [s.seatIndex, s.policy]))

  const blinds = assignBlinds(ringSeats(config), config.buttonSeat)
  let round = postBlinds(config, blinds.smallBlindSeat, blinds.bigBlindSeat)

  const log: ScriptedAction[] = []
  const history: PublicActionEntry[] = []
  const defects: HandDefect[] = []
  let lastAggressor: number | null = null
  let fallbacks = 0
  let streetReached: Street = 'PREFLOP'
  const actionBudget = { remaining: config.seats.length * 200 }

  for (let i = 0; i < STREETS.length; i++) {
    const street = STREETS[i]
    if (i > 0) round = advanceStreet(round, street)
    streetReached = street

    const firstSeat =
      street === 'PREFLOP'
        ? firstToActPreflop(ringSeats(config), blinds)
        : nextActor(actorSeats(round), config.buttonSeat)

    const stillIn = nonFolded(round)
    const canBet = stillIn.filter((p) => p.status === 'active' && p.stack > 0).length >= 2
    if (canBet && firstSeat !== null) {
      const out = runStreetInteractive(
        round, street, firstSeat, policyBySeat, holeBySeat, fullBoard, config.buttonSeat, config.bigBlind,
        rng, log, history, defects, actionBudget,
      )
      round = out.round
      fallbacks += out.fallbacks
      if (out.lastAggressor !== null) lastAggressor = out.lastAggressor
    }

    if (nonFolded(round).length <= 1) break
    if (isAllInRunout(round)) break
  }

  const contesting = nonFolded(round)
  const settlementBoard = contesting.length <= 1 ? [] : fullBoard
  const contribs: SeatContribution[] = round.players.map((p) => ({
    seatIndex: p.seatIndex,
    committed: p.committedTotal,
    folded: p.status === 'folded',
  }))

  const showdown = settleShowdown({
    contribs,
    board: settlementBoard,
    holeBySeat,
    buttonSeat: config.buttonSeat,
    showFirstSeat: lastAggressor ?? undefined,
  })

  // Coin conservation for THIS hand (POT-CONSERVE-001).
  if (!isSettlementConserved(contribs, showdown.payouts, showdown.refund)) {
    defects.push({ kind: 'not_conserved', detail: 'settlement did not conserve coins' })
  }

  // Cross-check against the canonical scripted engine using our OWN recorded log. Identical seed +
  // identical action list must reproduce an identical board + settlement, or the engine (or driver)
  // has a state bug.
  const handConfig: HandConfig = {
    seed: config.seed,
    bigBlind: config.bigBlind,
    smallBlind: config.smallBlind,
    buttonSeat: config.buttonSeat,
    seats: config.seats.map((s) => ({ seatIndex: s.seatIndex, stack: s.stack })),
  }
  try {
    const canonical = playHand(handConfig, log)
    if (!sameCards(canonical.board, fullBoard)) {
      defects.push({ kind: 'engine_crosscheck', detail: 'board differs from canonical engine' })
    }
    if (!samePayouts(canonical.showdown, showdown)) {
      defects.push({ kind: 'engine_crosscheck', detail: 'payouts differ from canonical engine' })
    }
  } catch (e) {
    defects.push({ kind: 'crosscheck_threw', detail: String(e instanceof Error ? e.message : e) })
  }

  // Net stack change per seat (zero-sum by construction).
  const payoutMap = new Map<number, number>()
  for (const p of showdown.payouts) payoutMap.set(p.seatIndex, p.amount)
  const stackDeltas = new Map<number, number>()
  for (const c of contribs) {
    const gained = (payoutMap.get(c.seatIndex) ?? 0) + (showdown.refund && showdown.refund.seatIndex === c.seatIndex ? showdown.refund.amount : 0)
    stackDeltas.set(c.seatIndex, gained - c.committed)
  }

  return {
    board: fullBoard,
    streetReached,
    actionLog: log,
    history,
    showdown,
    stackDeltas,
    potTotal: contribs.reduce((s, c) => s + c.committed, 0),
    sidePotCount: Math.max(0, showdown.pots.length - 1),
    wentToShowdown: showdown.wentToShowdown,
    fallbacks,
    defects,
  }
}

function sameCards(a: readonly Card[], b: readonly Card[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

function samePayouts(a: ShowdownResult, b: ShowdownResult): boolean {
  if (a.payouts.length !== b.payouts.length) return false
  const map = new Map<number, number>()
  for (const p of a.payouts) map.set(p.seatIndex, p.amount)
  for (const p of b.payouts) {
    if (map.get(p.seatIndex) !== p.amount) return false
  }
  const ar = a.refund ? `${a.refund.seatIndex}:${a.refund.amount}` : 'none'
  const br = b.refund ? `${b.refund.seatIndex}:${b.refund.amount}` : 'none'
  return ar === br
}
