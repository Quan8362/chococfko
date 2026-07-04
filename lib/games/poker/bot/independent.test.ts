import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  INDEPENDENT_SEEDS,
  assertIndependentSeedsFresh,
  overlappingWithExistingGroups,
  ALL_OPPONENT_IDS,
  INDIE_BENCHMARK_IDS,
  opponentPolicyFor,
  INDIE_TABLES,
  runMatchup,
  runSelfPlay,
  runMixedSoak,
  runIndependent,
} from './independent.ts'
import { BENCHMARK_IDS } from './benchmarks.ts'
import { SEED_GROUPS } from './seeds.ts'
import { STRATEGY_VERSION } from './strategyConfig.ts'
import { decideSafely } from './policy.ts'
import { buildObservation } from './observation.ts'
import { makeRng } from '../../tlmn/ai/seededRandom.ts'
import { seededShuffle, deal } from '../deck.ts'
import { createRound, makePlayer, legalActions, amountToCall, minRaiseTo, maxRaiseTo } from '../betting.ts'
import type { Street } from '../types.ts'

test('27D independent seeds are fresh: disjoint from calibration/validation/holdout', () => {
  assert.doesNotThrow(() => assertIndependentSeedsFresh())
  assert.equal(overlappingWithExistingGroups().length, 0)
  // Spot-prove against each group explicitly.
  const existing = new Set<number>([...SEED_GROUPS.calibration, ...SEED_GROUPS.validation, ...SEED_GROUPS.holdout])
  for (const s of INDEPENDENT_SEEDS) assert.ok(!existing.has(s), `seed ${s} reused from an existing group`)
  assert.equal(new Set(INDEPENDENT_SEEDS).size, INDEPENDENT_SEEDS.length)
})

test('27D independent seeds are deterministic 32-bit unsigned integers', () => {
  for (const s of INDEPENDENT_SEEDS) {
    assert.ok(Number.isInteger(s) && s >= 0 && s <= 0xffffffff)
  }
})

test('opponent registry: 7 fixed benchmarks + 4 extra probes, all resolvable', () => {
  assert.equal(ALL_OPPONENT_IDS.length, BENCHMARK_IDS.length + INDIE_BENCHMARK_IDS.length)
  for (const id of ALL_OPPONENT_IDS) {
    assert.equal(typeof opponentPolicyFor(id), 'function')
  }
})

// The extra probing archetypes must be LEGAL by construction on every street / seat count — run each
// through decideSafely on a spread of built observations and assert it never has to force a fallback.
test('extra probe benchmarks are legal by construction (never force a safe fallback)', () => {
  const streets: Street[] = ['PREFLOP', 'FLOP', 'TURN', 'RIVER']
  for (const id of INDIE_BENCHMARK_IDS) {
    const policy = opponentPolicyFor(id)
    for (let seatCount = 2; seatCount <= 6; seatCount++) {
      for (const street of streets) {
        const shuffled = seededShuffle(1234 + seatCount)
        const dealt = deal(shuffled, seatCount)
        const fullBoard = [...dealt.flop, dealt.turn, dealt.river]
        const boardLen = street === 'PREFLOP' ? 0 : street === 'FLOP' ? 3 : street === 'TURN' ? 4 : 5
        const players = Array.from({ length: seatCount }, (_, i) =>
          makePlayer({ seatIndex: i, stack: 10000, committedThisStreet: i === 1 ? 100 : 0 }),
        )
        const round = createRound({ street, bigBlind: 100, players })
        const seats = players.map((p) => ({
          seatIndex: p.seatIndex,
          stack: p.stack,
          committedThisStreet: p.committedThisStreet,
          committedTotal: p.committedTotal,
          status: p.status,
          inHand: true,
        }))
        const seatIndex = seatCount - 1
        const obs = buildObservation({
          seatIndex,
          holeCards: dealt.holeBySeat[seatIndex],
          fullBoard: fullBoard.slice(0, boardLen),
          street,
          seats,
          buttonSeat: 0,
          bigBlind: 100,
          currentBet: round.currentBet,
          toCall: amountToCall(round, seatIndex),
          minRaiseTo: minRaiseTo(round),
          maxRaiseTo: maxRaiseTo(round, seatIndex),
          legal: legalActions(round, seatIndex),
          actionHistory: [],
        })
        const res = decideSafely(policy, obs, makeRng(`probe:${id}:${seatCount}:${street}`))
        assert.equal(res.kind, 'ok', `probe ${id} forced a fallback at ${seatCount}p/${street}: ${res.kind === 'fallback' ? res.reason : ''}`)
      }
    }
  }
})

test('runMatchup conserves coins and produces a finite winrate (extra probe included)', () => {
  const seeds = INDEPENDENT_SEEDS.slice(0, 2)
  const m = runMatchup('normal', 'over_aggressive', INDIE_TABLES['hu-standard'], seeds, 40, 100)
  assert.equal(m.integrity.conserved, true)
  assert.equal(m.integrity.defects, 0)
  assert.equal(m.integrity.canonicalMismatches, 0)
  assert.equal(m.integrity.stuckHands, 0)
  assert.equal(m.integrity.negativeStacks, 0)
  assert.equal(m.integrity.fractionalStacks, 0)
  assert.ok(Number.isFinite(m.winrate.mean))
  assert.ok(m.totalHands > 0)
})

test('runSelfPlay + runMixedSoak conserve coins on fresh seeds', () => {
  const seeds = INDEPENDENT_SEEDS.slice(0, 2)
  for (const d of ['easy', 'normal', 'hard'] as const) {
    const r = runSelfPlay(d, INDIE_TABLES['6max-standard'], seeds, 40, 100)
    assert.equal(r.integrity.conserved, true)
    assert.equal(r.integrity.defects, 0)
  }
  const soak = runMixedSoak(INDIE_TABLES['6max-short'], seeds, 40, 100)
  assert.equal(soak.integrity.conserved, true)
  assert.equal(soak.integrity.defects, 0)
})

test('runIndependent (small) stamps the frozen version, proves fresh seeds, conserves', () => {
  const report = runIndependent({
    strategyVersion: STRATEGY_VERSION,
    seeds: INDEPENDENT_SEEDS.slice(0, 2),
    opponents: ['tight', 'over_aggressive'],
    matchupTables: [INDIE_TABLES['hu-standard']],
    selfPlayTables: [INDIE_TABLES['hu-standard']],
    mixedTables: [INDIE_TABLES['6max-standard']],
    handsPerSeed: 40,
    selfPlayHands: 40,
    mixedHands: 40,
  })
  assert.equal(report.strategyVersion, STRATEGY_VERSION)
  assert.equal(report.seedsFresh, true)
  assert.equal(report.integrity.conserved, true)
  assert.equal(report.integrity.defects, 0)
  assert.equal(report.integrity.canonicalMismatches, 0)
  assert.ok(report.matchups.length > 0 && report.selfPlay.length > 0 && report.mixedSoak.length > 0)
})
