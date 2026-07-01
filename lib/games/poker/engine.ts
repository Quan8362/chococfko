// ── Poker full-hand orchestrator (pure, deterministic) ─────────────────────────────
//
// PURE module — no React, no Supabase, no browser API, no clock. Tested by engine.test.ts.
//
// Runs a COMPLETE hand headlessly: shuffle (seeded) → deal → post blinds → drive the four
// betting rounds from a scripted action list → run out the board on all-in → showdown/settle.
// This is the deterministic, replayable core (ENGINE-DETERMINISM-001 / ENGINE-REPLAY-001): the
// same seed + same ordered actions reproduces identical cards, pots, and winners. The server
// (Phase P3) owns the clock, persistence, and turn authority; this proves the RULES compose.
//
// 🔴 The returned `holeBySeat` is the engine's internal knowledge for settlement. The server
// must project only the PUBLIC view + legally-revealed showdown cards to clients — never this.

import type { Card, Street } from './types.ts'
import { seededShuffle, deal } from './deck.ts'
import {
  createRound,
  makePlayer,
  applyAction,
  isRoundComplete,
  isAllInRunout,
  advanceStreet,
  type BettingRound,
  type BettingPlayer,
  type AppliedAction,
  type ActionResult,
} from './betting.ts'
import { assignBlinds, firstToActPreflop, nextActor, type RingSeat, type ActorSeat } from './order.ts'
import { settleShowdown, type ShowdownResult } from './showdown.ts'
import type { SeatContribution } from './pot.ts'

export interface SeatConfig {
  readonly seatIndex: number
  readonly stack: number
}

export interface HandConfig {
  readonly seed: number
  readonly bigBlind: number
  readonly smallBlind?: number // default floor(bigBlind / 2) (BLIND-SB-001)
  readonly buttonSeat: number
  readonly seats: readonly SeatConfig[] // eligible seats; order by seatIndex
}

// A scripted action with the seat that must act (used for validation + audit/replay).
export interface ScriptedAction {
  readonly seatIndex: number
  readonly action: AppliedAction
}

export interface HandResult {
  readonly board: readonly Card[]
  readonly holeBySeat: ReadonlyMap<number, readonly [Card, Card]>
  readonly showdown: ShowdownResult
  readonly actionLog: readonly ScriptedAction[] // exactly the actions consumed, for replay
}

function ringSeats(config: HandConfig): RingSeat[] {
  return config.seats.map((s) => ({ seatIndex: s.seatIndex, eligible: true }))
}

function actorSeats(round: BettingRound): ActorSeat[] {
  return round.players.map((p) => ({
    seatIndex: p.seatIndex,
    canAct: p.status === 'active' && p.stack > 0,
  }))
}

function firstActorFrom(round: BettingRound, startSeat: number): number | null {
  const start = round.players.find((p) => p.seatIndex === startSeat)
  if (start && start.status === 'active' && start.stack > 0) return startSeat
  return nextActor(actorSeats(round), startSeat)
}

// Build the preflop round with blinds posted (BLIND-POST-001 / BLIND-SHORT-001 short all-in).
function postBlinds(config: HandConfig, sbSeat: number, bbSeat: number): BettingRound {
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

// Drive one betting round from the scripted actions, consuming exactly the actions needed.
function runStreet(
  round: BettingRound,
  firstSeat: number,
  script: readonly ScriptedAction[],
  cursor: number,
  log: ScriptedAction[],
): { round: BettingRound; cursor: number; lastAggressor: number | null } {
  let current: BettingRound = round
  let actor: number | null = firstActorFrom(current, firstSeat)
  let lastAggressor: number | null = null

  while (!isRoundComplete(current) && actor !== null) {
    if (cursor >= script.length) throw new Error('engine: action script exhausted mid-street')
    const scripted = script[cursor]
    if (scripted.seatIndex !== actor) {
      throw new Error(`engine: out-of-turn action; expected seat ${actor}, got ${scripted.seatIndex}`)
    }
    const before = current.currentBet
    const res: ActionResult = applyAction(current, actor, scripted.action)
    if (!res.ok) throw new Error(`engine: illegal action at seat ${actor}: ${res.error}`)
    current = res.round
    log.push(scripted)
    cursor++
    if (current.currentBet > before) lastAggressor = actor // tracked for SHOWDOWN-ORDER-001
    if (isRoundComplete(current)) break
    actor = nextActor(actorSeats(current), actor)
  }
  return { round: current, cursor, lastAggressor }
}

const STREETS: readonly Street[] = ['PREFLOP', 'FLOP', 'TURN', 'RIVER']

// Play a full hand. `script` lists actions in turn order; betting on streets that no longer
// require action (all-in runout / one player left) consumes nothing.
export function playHand(config: HandConfig, script: readonly ScriptedAction[]): HandResult {
  if (config.seats.length < 2 || config.seats.length > 6) {
    throw new Error('engine: a hand needs 2..6 seats')
  }
  const shuffled = seededShuffle(config.seed)
  const dealt = deal(shuffled, config.seats.length)

  // Map deal order (0..n-1) onto the configured seat indexes (ascending).
  const orderedSeats = config.seats.map((s) => s.seatIndex).sort((a, b) => a - b)
  const holeBySeat = new Map<number, readonly [Card, Card]>()
  orderedSeats.forEach((seatIndex, i) => holeBySeat.set(seatIndex, dealt.holeBySeat[i]))
  const fullBoard: Card[] = [...dealt.flop, dealt.turn, dealt.river]

  const blinds = assignBlinds(ringSeats(config), config.buttonSeat)
  let round = postBlinds(config, blinds.smallBlindSeat, blinds.bigBlindSeat)

  const log: ScriptedAction[] = []
  let cursor = 0
  let lastAggressor: number | null = null

  for (let i = 0; i < STREETS.length; i++) {
    const street = STREETS[i]
    if (i > 0) round = advanceStreet(round, street)

    // Determine the first seat to act this street.
    const firstSeat =
      street === 'PREFLOP'
        ? firstToActPreflop(ringSeats(config), blinds)
        : firstActiveLeftOfButton(round, config.buttonSeat)

    const stillIn = nonFolded(round)
    const canBet = stillIn.filter((p) => p.status === 'active' && p.stack > 0).length >= 2
    if (canBet && firstSeat !== null) {
      const out = runStreet(round, firstSeat, script, cursor, log)
      round = out.round
      cursor = out.cursor
      if (out.lastAggressor !== null) lastAggressor = out.lastAggressor
    }

    if (nonFolded(round).length <= 1) break // POT-ONELEFT-001 short-circuit
    if (isAllInRunout(round)) {
      // No further betting possible — deal the rest of the board to showdown (ROUND-ALLIN-RUNOUT-001).
      break
    }
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

  return { board: fullBoard, holeBySeat, showdown, actionLog: log }
}

// First active (can-act) seat clockwise-left of the button (postflop start, BLIND-POSTFLOP-ORDER-001).
function firstActiveLeftOfButton(round: BettingRound, buttonSeat: number): number | null {
  return nextActor(actorSeats(round), buttonSeat)
}

// Replay a recorded action log against a seed and config; must reproduce the same settlement
// (ENGINE-REPLAY-001). This is just `playHand` with the captured log as the script.
export function replayHand(config: HandConfig, actionLog: readonly ScriptedAction[]): HandResult {
  return playHand(config, actionLog)
}
