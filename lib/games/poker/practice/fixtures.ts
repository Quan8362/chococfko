// ── Poker PRACTICE test fixtures (pure) ───────────────────────────────────────────────
//
// PURE test-support helpers shared by the practice *.test.ts files. Not imported by any runtime
// path. Kept out of index.ts so it never reaches the app bundle.

import type { BotDifficulty } from '../bot/policy.ts'
import type { PracticeSeat, PracticeTableConfig, PracticeGame } from './types.ts'
import { deserializeHand } from '../hand.ts'
import { simulationPolicy } from '../bot/policies.ts'
import { decideSafely } from '../bot/policy.ts'
import {
  currentActor,
  runBotsUntilHumanOrEnd,
  humanActionAuthoritative,
} from './runtime.ts'
import { buildServerObservation } from './observation.ts'

export function botSeat(seatIndex: number, difficulty: BotDifficulty, stack: number): PracticeSeat {
  return {
    seatIndex,
    occupant: { kind: 'bot', botId: `bot-${seatIndex}`, difficulty, displayName: `Bot ${seatIndex + 1}` },
    stack,
  }
}

export function humanSeat(seatIndex: number, userId: string, stack: number): PracticeSeat {
  return {
    seatIndex,
    occupant: { kind: 'human', userId, displayName: `Human ${seatIndex + 1}` },
    stack,
  }
}

export function practiceConfig(input: {
  tableId?: string
  bigBlind?: number
  smallBlind?: number
  startingStack?: number
  actionTimeMs?: number
  seats: readonly PracticeSeat[]
}): PracticeTableConfig {
  return {
    tableId: input.tableId ?? 'practice-1',
    kind: 'practice',
    bigBlind: input.bigBlind ?? 100,
    smallBlind: input.smallBlind ?? 50,
    startingStack: input.startingStack ?? 10000,
    actionTimeMs: input.actionTimeMs ?? 800,
    seats: input.seats,
  }
}

// A 1-human + (n-1) bots table, all with `stack` chips. Difficulty applies to the bots.
export function mixedTable(seatCount: number, difficulty: BotDifficulty, stack: number, bigBlind = 100): PracticeTableConfig {
  const seats: PracticeSeat[] = []
  seats.push(humanSeat(0, 'human-user', stack))
  for (let i = 1; i < seatCount; i++) seats.push(botSeat(i, difficulty, stack))
  return practiceConfig({ seats, startingStack: stack, bigBlind, smallBlind: Math.floor(bigBlind / 2) })
}

// Drive human actors (deterministically, via the simulation policy through the HUMAN authoritative
// path) until the CURRENT actor is a bot. Returns null if the hand ends before a bot is to act.
// Used by tests that specifically exercise the bot action path.
export function advanceToBotActor(startGame: PracticeGame, rng: () => number): PracticeGame | null {
  let game = startGame
  let guard = 0
  while (game.phase === 'BETTING') {
    if (++guard > 60) return null
    const actor = currentActor(game)
    if (!actor) return null
    if (actor.isBot) return game
    const state = deserializeHand(game.hand!)
    const hole = game.holeBySeat[actor.seatIndex]!
    const obs = buildServerObservation(state, actor.seatIndex, hole)
    const decision = decideSafely(simulationPolicy, obs, rng)
    const res = humanActionAuthoritative(game, actor.seatIndex, decision.decision.action, state.actionSeq)
    if (!res.ok) return null
    game = res.game
  }
  return null
}

export interface PlayHandStats {
  game: PracticeGame
  humanActions: number
  botActions: number
  fallbacks: number
}

// Drive one LIVE practice hand to completion. Bots act via the runtime's authoritative bot core;
// the human seat is driven here by the deterministic simulation policy but submitted through the
// HUMAN authoritative path (`humanActionAuthoritative`) — so the test exercises BOTH entry points
// against the same shared engine authority. Assumes a hand is already started (phase BETTING).
export function playPracticeHandToEnd(startGame: PracticeGame, rng: () => number): PlayHandStats {
  let game = startGame
  let humanActions = 0
  let botActions = 0
  let fallbacks = 0
  let guard = 0
  while (game.phase === 'BETTING') {
    if (++guard > 600) throw new Error('practice fixture: hand did not terminate')
    const bots = runBotsUntilHumanOrEnd(game, rng)
    game = bots.game
    botActions += bots.botActions
    fallbacks += bots.fallbacks
    if (game.phase !== 'BETTING') break

    const actor = currentActor(game)
    if (!actor) break
    if (actor.isBot) continue // runBots will pick it up next loop
    // Human seat: build the fair observation and act through the HUMAN authoritative path.
    const state = deserializeHand(game.hand!)
    const hole = game.holeBySeat[actor.seatIndex]!
    const obs = buildServerObservation(state, actor.seatIndex, hole)
    const decision = decideSafely(simulationPolicy, obs, rng)
    if (decision.kind === 'fallback') fallbacks += 1
    const res = humanActionAuthoritative(game, actor.seatIndex, decision.decision.action, state.actionSeq)
    if (!res.ok) throw new Error(`practice fixture: human action rejected: ${res.error}`)
    game = res.game
    humanActions += 1
  }
  return { game, humanActions, botActions, fallbacks }
}
