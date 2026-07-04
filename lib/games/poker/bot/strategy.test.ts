import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeRng } from '../../tlmn/ai/seededRandom.ts'
import { seededShuffle, deal } from '../deck.ts'
import { createRound, makePlayer, legalActions, amountToCall, minRaiseTo, maxRaiseTo, type BettingPlayer } from '../betting.ts'
import { buildObservation, type ObservedSeat } from './observation.ts'
import { policyFor, policyWithPersonality } from './policies.ts'
import { isDecisionLegal, type BotDifficulty } from './policy.ts'
import { runBotSimulation, type BotSimConfig } from './sim.ts'
import { resolvePokerFlags } from '../flags.ts'
import { SEED_GROUPS } from './seeds.ts'
import type { Street } from '../types.ts'

const SKILL: BotDifficulty[] = ['easy', 'normal', 'hard']

// A broad, realistic sample of legal observations (mirrors policies.test's generator).
function* observations(count: number) {
  const streets: Street[] = ['PREFLOP', 'FLOP', 'TURN', 'RIVER']
  for (let i = 0; i < count; i++) {
    const rng = makeRng(3000 + i)
    const seatCount = 2 + Math.floor(rng() * 5)
    const dealt = deal(seededShuffle(3000 + i), seatCount)
    const fullBoard = [...dealt.flop, dealt.turn, dealt.river]
    const street = streets[Math.floor(rng() * streets.length)]
    const players: BettingPlayer[] = Array.from({ length: seatCount }, (_, s) =>
      makePlayer({ seatIndex: s, stack: 200 + Math.floor(rng() * 90) * 100, committedThisStreet: Math.floor(rng() * 3) * 100 }),
    )
    const round = createRound({ street, bigBlind: 100, players })
    const actor = Math.floor(rng() * seatCount)
    const legal = legalActions(round, actor)
    if (legal.length === 0) continue
    const seats: ObservedSeat[] = players.map((p) => ({ seatIndex: p.seatIndex, stack: p.stack, committedThisStreet: p.committedThisStreet, committedTotal: p.committedTotal, status: p.status, inHand: p.status === 'active' || p.status === 'allin' }))
    yield buildObservation({
      seatIndex: actor,
      holeCards: dealt.holeBySeat[actor],
      fullBoard,
      street,
      seats,
      buttonSeat: 0,
      bigBlind: 100,
      currentBet: round.currentBet,
      toCall: amountToCall(round, actor),
      minRaiseTo: minRaiseTo(round),
      maxRaiseTo: maxRaiseTo(round, actor),
      legal,
      actionHistory: [],
    })
  }
}

test('determinism: same observation + same policy seed ⇒ identical action', () => {
  for (const d of SKILL) {
    const policy = policyFor(d)
    for (const obs of observations(80)) {
      const a = policy(obs, makeRng(42))
      const b = policy(obs, makeRng(42))
      assert.deepEqual(a.action, b.action, `${d} not deterministic`)
    }
  }
})

test('every skill decision is legal + integer-sized across a broad sample', () => {
  for (const d of SKILL) {
    const policy = policyFor(d)
    for (const obs of observations(120)) {
      const a = policy(obs, makeRng(obs.seatIndex * 13 + 1)).action
      assert.ok(isDecisionLegal(obs, a), `${d} illegal action ${JSON.stringify(a)}`)
      if (a.type === 'bet' || a.type === 'raise') assert.ok(Number.isInteger(a.to))
    }
  }
})

test('short-stack 4-max sim: conserves, exercises side pots + all-ins, no stuck/duplicate, integer stacks', () => {
  const config: BotSimConfig = {
    seatCount: 6,
    startingStack: 1200, // ~12 bb: forces frequent all-ins; uneven post-hand stacks ⇒ layered side pots
    bigBlind: 100,
    smallBlind: 50,
    hands: 800,
    // `simulation` seats guarantee chaotic multi-way all-ins with UNEVEN stacks (the source of side
    // pots) so the NEW skill policies' side-pot settlement is exercised (mirrors 27C-A's grid).
    difficulties: ['hard', 'normal', 'easy', 'simulation', 'simulation', 'simulation'],
  }
  const seed = SEED_GROUPS.calibration[0]
  const r = runBotSimulation(config, seed)

  assert.equal(r.conserved, true, 'coin conservation must hold')
  assert.equal(r.defects.length, 0, `no engine/settlement defects, got ${JSON.stringify(r.defects.slice(0, 2))}`)
  assert.equal(r.fallbacks, 0, 'skill policies force no safe fallbacks')
  assert.equal(r.handsPlayed, 800, 'rebuy sim plays every requested hand (no stuck hand)')
  assert.ok(r.allInHands > 0, 'short stacks must produce all-in hands')
  assert.ok(r.sidePotHands > 0, 'multi-way all-ins must produce side pots')
  for (const fs of r.finalStacks) {
    assert.ok(Number.isInteger(fs.stack), `non-integer stack ${fs.stack}`)
    assert.ok(fs.stack >= 0, `negative stack ${fs.stack}`)
  }
})

test('seeded replay is bit-for-bit identical with the new strategy', () => {
  const config: BotSimConfig = { seatCount: 6, startingStack: 10000, bigBlind: 100, hands: 120, difficulties: ['hard', 'normal', 'normal', 'easy', 'easy', 'simulation'] }
  const seed = SEED_GROUPS.calibration[1]
  const a = runBotSimulation(config, seed)
  const b = runBotSimulation(config, seed)
  assert.deepEqual(a.finalStacks, b.finalStacks)
  assert.deepEqual(a.byDifficulty, b.byDifficulty)
})

test('difficulty and personality are independent: an aggressive personality never widens a capability', () => {
  // Easy cannot 3-bet regardless of personality — the capability toggle, not the personality, governs.
  const aggressiveEasy = policyWithPersonality('easy', 'aggressive')
  const balancedEasy = policyWithPersonality('easy', 'balanced')

  const seats: ObservedSeat[] = [
    { seatIndex: 0, stack: 9700, committedThisStreet: 0, committedTotal: 0, status: 'active', inHand: true },
    { seatIndex: 1, stack: 9950, committedThisStreet: 50, committedTotal: 50, status: 'active', inHand: true },
    { seatIndex: 2, stack: 9900, committedThisStreet: 100, committedTotal: 100, status: 'active', inHand: true },
    { seatIndex: 5, stack: 9700, committedThisStreet: 300, committedTotal: 300, status: 'active', inHand: true },
  ]
  const obs = buildObservation({
    seatIndex: 0,
    holeCards: ['As', 'Ah'],
    fullBoard: [],
    street: 'PREFLOP',
    seats,
    buttonSeat: 5,
    bigBlind: 100,
    currentBet: 300,
    toCall: 300,
    minRaiseTo: 500,
    maxRaiseTo: 9700,
    legal: [{ type: 'fold' }, { type: 'call', amount: 300 }, { type: 'raise', min: 500, max: 9700 }],
    actionHistory: [{ seatIndex: 5, street: 'PREFLOP', type: 'raise', to: 300, addedChips: 300 }],
  })
  assert.equal(aggressiveEasy(obs, makeRng(1)).action.type, 'call', 'aggressive-easy still cannot 3-bet')
  assert.equal(balancedEasy(obs, makeRng(1)).action.type, 'call')
})

test('feature flags remain OFF (bots disabled; no tournament path)', () => {
  const flags = resolvePokerFlags({})
  assert.equal(flags.bot, false)
  assert.equal(flags.tournament, false)
  assert.equal(flags.practiceBots, false)
})
