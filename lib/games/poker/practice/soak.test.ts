import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeRng } from '../../tlmn/ai/seededRandom.ts'
import {
  createPracticeGame,
  startPracticeHand,
  currentActor,
  botActOnce,
  humanActionAuthoritative,
  type PracticeActResult,
} from './runtime.ts'
import { deserializeHand } from '../hand.ts'
import { buildServerObservation } from './observation.ts'
import { simulationPolicy } from '../bot/policies.ts'
import { decideSafely } from '../bot/policy.ts'
import { practiceSupply } from './economy.ts'
import { mixedTable } from './fixtures.ts'
import type { PracticeGame, PracticeTableConfig } from './types.ts'
import type { BotDifficulty } from '../bot/policy.ts'

// Fast, always-legal driver: both entry points (bot core + human core) act via the cheap uniform
// simulation policy (no Monte-Carlo), so we can push tens of thousands of hands while still
// exercising every settlement path (all-ins, side pots, folds, runouts).
function fastPlay(game: PracticeGame, rng: () => number): { game: PracticeGame; fallbacks: number } {
  let g = game
  let fallbacks = 0
  let guard = 0
  while (g.phase === 'BETTING') {
    if (++guard > 800) throw new Error('soak: hand did not terminate (possible infinite loop)')
    const actor = currentActor(g)
    if (!actor) break
    const state = deserializeHand(g.hand!)
    if (actor.isBot) {
      const out = botActOnce(g, rng, simulationPolicy)
      if (!out.result.ok) break
      g = out.result.game
      if (out.usedFallback) fallbacks += 1
    } else {
      const hole = g.holeBySeat[actor.seatIndex]! // server-side read (test is the trusted server)
      const obs = buildServerObservation(state, actor.seatIndex, hole) // throws on any boundary breach
      const d = decideSafely(simulationPolicy, obs, rng)
      if (d.kind === 'fallback') fallbacks += 1
      const res: PracticeActResult = humanActionAuthoritative(g, actor.seatIndex, d.decision.action, state.actionSeq)
      if (!res.ok) break
      g = res.game
    }
  }
  return { game: g, fallbacks }
}

interface SoakStats {
  played: number
  conservationFailures: number
  stuck: number
  nonIntegerOrNegative: number
  allInHands: number
  sidePotHands: number
  fallbacks: number
}

function soakSession(config: PracticeTableConfig, seed: number, hands: number, acc: SoakStats): void {
  let game = createPracticeGame(config, seed)
  const rng = makeRng(seed * 2654435761)

  for (let h = 0; h < hands; h++) {
    // Auto-rebuy busted seats so the fuzzer keeps running. Conservation is verified PER HAND below
    // (supply after settlement == supply on the table before the hand), independent of rebuys.
    const chips: Record<number, number> = { ...game.chips }
    for (const s of config.seats) {
      if ((chips[s.seatIndex] ?? 0) < config.bigBlind) {
        chips[s.seatIndex] = config.startingStack
      }
    }
    game = { ...game, chips }
    if (config.seats.filter((s) => chips[s.seatIndex] > 0).length < 2) break

    game = startPracticeHand(game)
    const before = practiceSupply(game.chips) + (game.hand ? game.hand.players.reduce((s, p) => s + p.committedTotal, 0) : 0)
    const started = game
    const r = fastPlay(game, rng)
    game = r.game
    acc.fallbacks += r.fallbacks
    acc.played += 1

    if (game.phase !== 'COMPLETED') { acc.stuck += 1; continue }
    // supply of behind-stacks after settlement must equal what was on the table before the hand.
    if (practiceSupply(game.chips) !== before) acc.conservationFailures += 1
    for (const s of config.seats) {
      const v = game.chips[s.seatIndex]
      if (!Number.isInteger(v) || v < 0) acc.nonIntegerOrNegative += 1
    }
    const hand = game.hand!
    if (started.hand!.players.some((p) => p.status === 'allin') || hand.players.some((p) => p.status === 'allin')) acc.allInHands += 1
    // unequal all-in contributions ⇒ side pots
    const totals = new Set(hand.players.filter((p) => p.committedTotal > 0).map((p) => p.committedTotal))
    if (totals.size > 1 && hand.players.some((p) => p.status === 'allin')) acc.sidePotHands += 1
  }
}

test('SOAK — 25,000+ practice hands across seeds/sizes: conserved, integer, no stuck hands', () => {
  const acc: SoakStats = {
    played: 0, conservationFailures: 0, stuck: 0, nonIntegerOrNegative: 0,
    allInHands: 0, sidePotHands: 0, fallbacks: 0,
  }

  const plan: Array<{ config: PracticeTableConfig; seeds: number[]; hands: number }> = [
    // heads-up, deep
    { config: mixedTable(2, 'easy', 20000, 100), seeds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], hands: 500 },
    // 3-max
    { config: mixedTable(3, 'normal', 20000, 100), seeds: [11, 12, 13, 14, 15, 16], hands: 500 },
    // 4-max SHORT stacks (heavy all-ins + layered side pots)
    { config: mixedTable(4, 'normal', 400, 100), seeds: [21, 22, 23, 24, 25, 26, 27, 28, 29, 30], hands: 500 },
    // 5-max
    { config: mixedTable(5, 'hard', 20000, 100), seeds: [31, 32, 33, 34], hands: 500 },
    // 6-max deep
    { config: mixedTable(6, 'normal', 20000, 100), seeds: [41, 42, 43, 44, 45, 46, 47, 48, 49, 50], hands: 500 },
    // 6-max short (more side pots)
    { config: mixedTable(6, 'easy', 600, 100), seeds: [51, 52, 53, 54, 55, 56, 57, 58, 59, 60], hands: 500 },
  ]

  for (const p of plan) for (const seed of p.seeds) soakSession(p.config, seed, p.hands, acc)

  assert.ok(acc.played >= 25000, `expected >= 25000 hands, played ${acc.played}`)
  assert.equal(acc.conservationFailures, 0, 'chip conservation failure(s) in the soak')
  assert.equal(acc.stuck, 0, 'stuck / non-terminating hand(s) in the soak')
  assert.equal(acc.nonIntegerOrNegative, 0, 'non-integer or negative stack(s) in the soak')
  assert.ok(acc.allInHands > 0, 'expected all-in hands from the short-stack tables')
  assert.ok(acc.sidePotHands > 0, 'expected layered side-pot hands from the short-stack tables')
})

test('SOAK — real difficulty policies play a full session in-runtime with exact conservation', () => {
  const acc: SoakStats = {
    played: 0, conservationFailures: 0, stuck: 0, nonIntegerOrNegative: 0,
    allInHands: 0, sidePotHands: 0, fallbacks: 0,
  }
  const difficulties: BotDifficulty[] = ['easy', 'normal', 'hard']
  for (const d of difficulties) {
    soakSession(mixedTable(4, d, 8000, 100), 900 + difficulties.indexOf(d), 150, acc)
  }
  assert.ok(acc.played >= 300)
  assert.equal(acc.conservationFailures, 0)
  assert.equal(acc.stuck, 0)
  assert.equal(acc.nonIntegerOrNegative, 0)
})
