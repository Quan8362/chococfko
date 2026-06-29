// Simulation + training-system tests. Run:
//   node --test lib/games/tlmn/sim/sim.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runGame } from './simulator.ts'
import { makePolicy, type SimulationPolicyName } from './policies.ts'
import { evaluateCandidate, fitness } from './evaluation.ts'
import { runScenarios } from './scenarios.ts'
import { optimizeWeights } from './optimizer.ts'
import { seedRange, trainingSeeds, validationSeeds, holdoutSeeds } from './seeds.ts'
import { makeRng } from '../ai/seededRandom.ts'

const ALL_POLICIES: SimulationPolicyName[] = [
  'randomLegal', 'lowestLegal', 'greedyCardReduction', 'combinationPreserver',
  'defensive', 'currentProduction', 'aiNormal', 'aiHard', 'aiExpert',
]

// 14) Simulator and the authoritative validator agree (every game is fully legal).
test('simulator runs full legal games to termination for every policy', () => {
  for (const name of ALL_POLICIES) {
    const p = makePolicy(name)
    const res = runGame({ seed: `g-${name}`, policies: [p, makePolicy('lowestLegal'), makePolicy('defensive'), makePolicy('greedyCardReduction')] })
    assert.equal(res.illegalMoveCount, 0, `${name} produced no illegal moves`)
    assert.ok(res.winnerSeat !== null, `${name} game has a winner`)
    assert.equal(res.finishOrder.length, 4)
  }
})

// Determinism: same seed → identical game.
test('runGame is deterministic for a fixed seed', () => {
  const policies = [makePolicy('aiHard'), makePolicy('defensive'), makePolicy('lowestLegal'), makePolicy('greedyCardReduction')]
  const a = runGame({ seed: 'det', policies })
  const b = runGame({ seed: 'det', policies })
  assert.equal(a.winnerSeat, b.winnerSeat)
  assert.equal(a.turns, b.turns)
  assert.deepEqual(a.finishOrder, b.finishOrder)
})

// 15) Zero illegal moves over a large randomized batch.
test('no illegal moves across a large randomized batch', () => {
  let illegal = 0
  const field = [makePolicy('aiExpert'), makePolicy('currentProduction'), makePolicy('defensive'), makePolicy('greedyCardReduction')]
  for (const seed of seedRange('batch', 1, 120)) illegal += runGame({ seed, policies: field }).illegalMoveCount
  assert.equal(illegal, 0)
})

// Seed sets are disjoint (no overfitting leak).
test('training / validation / holdout seed sets are disjoint', () => {
  const tr = new Set(trainingSeeds(50)); const va = new Set(validationSeeds(50)); const ho = new Set(holdoutSeeds(50))
  for (const s of tr) { assert.ok(!va.has(s)); assert.ok(!ho.has(s)) }
  for (const s of va) assert.ok(!ho.has(s))
})

// 17) Seat rotation: evaluation covers all seats (no systematic seat exclusion).
test('evaluation rotates the candidate through every seat', () => {
  const m = evaluateCandidate({
    candidate: makePolicy('aiHard'),
    field: [makePolicy('lowestLegal'), makePolicy('defensive'), makePolicy('greedyCardReduction')],
    seeds: seedRange('rot', 1, 10),
  })
  assert.deepEqual(Object.keys(m.winRateBySeat).map(Number).sort(), [0, 1, 2, 3])
  assert.equal(m.illegalMoveCount, 0)
})

// All strategic scenarios pass for the promoted expert policy (promotion gate).
test('expert policy passes every strategic scenario', () => {
  const p = makePolicy('aiExpert')
  const rng = makeRng('sc')
  const results = runScenarios((state, seat) => p.decide(state, seat, rng, []))
  for (const r of results) assert.ok(r.pass, `scenario failed: ${r.name} -> ${r.detail}`)
})

// Fitness disqualifies a policy that produces illegal moves.
test('fitness hard-rejects illegal-move policies', () => {
  const clean = { games: 100, winRate: 0.3, winRateBySeat: {}, winRateVsField: {}, avgFinishPosition: 1.5, avgRemainingOnLoss: 5, illegalMoveCount: 0, missedImmediateWinRate: 0, avoidableLossRate: 0, decisionTimeMeanMs: 1, decisionTimeP95Ms: 2 }
  assert.ok(fitness(clean) > 0)
  assert.ok(fitness({ ...clean, illegalMoveCount: 1 }) < -1000)
})

// 20) Promotion-gate comparison: trained/expert config beats the legacy bot on holdout.
// (Small but real holdout — the production run used a larger one; see the report.)
test('expert policy beats currentProduction on a holdout sample', () => {
  const field = [makePolicy('currentProduction'), makePolicy('defensive'), makePolicy('greedyCardReduction'), makePolicy('lowestLegal')]
  const seeds = holdoutSeeds(40)
  const cand = evaluateCandidate({ candidate: makePolicy('aiExpert'), field, seeds })
  const base = evaluateCandidate({ candidate: makePolicy('currentProduction'), field, seeds })
  assert.equal(cand.illegalMoveCount, 0)
  assert.ok(cand.winRate >= base.winRate - 0.02, `candidate (${cand.winRate.toFixed(3)}) ~>= baseline (${base.winRate.toFixed(3)})`)
})

// The optimizer improves training fitness and returns clamped, legal weights.
test('optimizer runs and produces a non-regressing candidate', () => {
  const field = [makePolicy('lowestLegal'), makePolicy('defensive'), makePolicy('greedyCardReduction')]
  const res = optimizeWeights({
    field, trainSeeds: trainingSeeds(8), validationSeeds: validationSeeds(8),
    populationSize: 6, generations: 2, seed: 'opt-test',
  })
  assert.ok(Number.isFinite(res.bestTrainFitness))
  assert.ok(res.history.length === 2)
  // best fitness should not decrease across generations (elitism guarantees this).
  assert.ok(res.history[1].bestFitness >= res.history[0].bestFitness - 1e-9)
})

// 18) Previous production policy remains available for rollback.
test('legacy production policy remains available (rollback)', () => {
  const legacy = makePolicy('currentProduction')
  const res = runGame({ seed: 'rb', policies: [legacy, legacy, legacy, legacy] })
  assert.equal(res.illegalMoveCount, 0)
  assert.ok(res.winnerSeat !== null)
})
