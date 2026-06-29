// ─────────────────────────────────────────────────────────────────────────────
// Weight optimizer — population-based evolutionary search over BotStrategyWeights.
//
// 1) seed a population around DEFAULT_WEIGHTS, 2) score each on the TRAINING seeds
// vs the opponent field (fitness), 3) keep the elite, 4) mutate/recombine to refill,
// 5) repeat for N generations, 6) pick the best by VALIDATION fitness (a held-out
// set, never the training set) to avoid overfitting one card distribution.
//
// Trains with difficulty 'hard' (no rollouts) for speed — weights are what we tune;
// the endgame search is an orthogonal runtime refinement validated separately.
// ─────────────────────────────────────────────────────────────────────────────
import { type Rules } from '../engine.ts'
import { type SimPolicy } from './simulator.ts'
import { makePolicy } from './policies.ts'
import { runSelfPlay } from './selfPlay.ts'
import { fitness } from './evaluation.ts'
import { runScenarios } from './scenarios.ts'
import {
  type BotStrategyWeights, DEFAULT_WEIGHTS, WEIGHT_SPECS, clampWeights, cloneWeights,
} from '../ai/weights.ts'
import { makeRng } from '../ai/seededRandom.ts'

const KEYS = Object.keys(WEIGHT_SPECS) as Array<keyof BotStrategyWeights>

function mutate(w: BotStrategyWeights, rng: () => number, scale: number, prob: number): BotStrategyWeights {
  const out = cloneWeights(w)
  for (const k of KEYS) {
    if (rng() < prob) out[k] = out[k] * (1 + (rng() * 2 - 1) * scale)
  }
  return clampWeights(out)
}

function crossover(a: BotStrategyWeights, b: BotStrategyWeights, rng: () => number): BotStrategyWeights {
  const out = cloneWeights(a)
  for (const k of KEYS) out[k] = rng() < 0.5 ? a[k] : b[k]
  return clampWeights(out)
}

export interface OptimizeOptions {
  field: SimPolicy[]
  trainSeeds: string[]
  validationSeeds: string[]
  populationSize?: number
  generations?: number
  eliteCount?: number
  mutationScale?: number
  mutationProb?: number
  seed?: string | number
  playerCount?: number
  ruleConfig?: Partial<Rules>
  // Known-good weights to seed generation 0 with (warm start). Including the current
  // production policy guarantees the search starts from a proven elite, so a promoted
  // candidate never regresses below production by construction.
  warmStarts?: BotStrategyWeights[]
  // CONSTRAINED OPTIMIZATION — keep the safety behaviour the promotion gate requires,
  // so the optimizer can't trade defensive correctness for raw win rate. Each failing
  // strategic scenario, and any shortfall below the one-card-block floor, is penalised
  // hard during training (scenarios are pure + cheap, run on the candidate per eval).
  minOneCardBlock?: number      // floor for oneCardBlockRate (e.g. current production's level)
  scenarioPenalty?: number      // fitness penalty per failing scenario (default 25)
  blockFloorPenalty?: number    // fitness penalty per 1.0 of block-rate shortfall (default 300)
}

export interface OptimizeResult {
  best: BotStrategyWeights
  bestTrainFitness: number
  bestValidationFitness: number
  history: Array<{ generation: number; bestFitness: number; meanFitness: number }>
  // The validation-ranked finalists (best-ever + last-generation elites), so a caller
  // can re-evaluate the top few on a larger UNSEEN holdout (staged evaluation).
  finalists: Array<{ weights: BotStrategyWeights; validationFitness: number }>
}

export function optimizeWeights(opts: OptimizeOptions): OptimizeResult {
  const populationSize = opts.populationSize ?? 12
  const generations = opts.generations ?? 6
  const eliteCount = opts.eliteCount ?? 4
  const mutationScale = opts.mutationScale ?? 0.25
  const mutationProb = opts.mutationProb ?? 0.4
  const rng = makeRng(opts.seed ?? 'optimizer')

  const scenarioPenalty = opts.scenarioPenalty ?? 25
  const blockFloorPenalty = opts.blockFloorPenalty ?? 300
  const minBlock = opts.minOneCardBlock ?? 0
  const scenRng = makeRng('opt-scenarios')

  const evalFitness = (w: BotStrategyWeights, seeds: string[]): number => {
    const candidate = makePolicy('candidateTrained', { difficulty: 'hard', weights: w })
    const report = runSelfPlay({ candidate, field: opts.field, seeds, playerCount: opts.playerCount, ruleConfig: opts.ruleConfig })
    let f = fitness(report)
    // Hard safety constraints (mirror the promotion gate so training stays admissible).
    if (scenarioPenalty > 0 || minBlock > 0) {
      const fails = runScenarios((s, seat) => candidate.decide(s, seat, scenRng, [])).filter(r => !r.pass).length
      f -= fails * scenarioPenalty
      f -= Math.max(0, minBlock - report.oneCardBlockRate) * blockFloorPenalty
    }
    return f
  }

  // Generation 0: the warm-start elites (kept verbatim) + mutated variants of each.
  const warm = [cloneWeights(DEFAULT_WEIGHTS), ...(opts.warmStarts ?? []).map(cloneWeights)]
  let population: BotStrategyWeights[] = warm.map(cloneWeights)
  let wi = 0
  while (population.length < populationSize) {
    const parent = warm[wi++ % warm.length]
    population.push(mutate(parent, rng, mutationScale * 1.5, 0.6))
  }

  const history: OptimizeResult['history'] = []
  let bestEver: { w: BotStrategyWeights; train: number } = { w: cloneWeights(DEFAULT_WEIGHTS), train: -Infinity }

  for (let gen = 0; gen < generations; gen++) {
    const scored = population.map(w => ({ w, f: evalFitness(w, opts.trainSeeds) }))
    scored.sort((a, b) => b.f - a.f)
    const best = scored[0]
    const mean = scored.reduce((acc, s) => acc + s.f, 0) / scored.length
    history.push({ generation: gen, bestFitness: best.f, meanFitness: mean })
    if (best.f > bestEver.train) bestEver = { w: cloneWeights(best.w), train: best.f }

    // Next generation: elites + offspring (crossover of elites + mutation).
    const elites = scored.slice(0, eliteCount).map(s => s.w)
    const next: BotStrategyWeights[] = elites.map(cloneWeights)
    while (next.length < populationSize) {
      const a = elites[Math.floor(rng() * elites.length)]
      const b = elites[Math.floor(rng() * elites.length)]
      next.push(mutate(crossover(a, b, rng), rng, mutationScale, mutationProb))
    }
    population = next
  }

  // Pick the final winner by VALIDATION fitness among the last elites + best-ever.
  // Dedup by a stable signature so we don't validate the same weights twice.
  const candidates = [bestEver.w, ...population.slice(0, eliteCount)]
  const seen = new Set<string>()
  const ranked: Array<{ weights: BotStrategyWeights; validationFitness: number }> = []
  for (const w of candidates) {
    const sig = KEYS.map(k => w[k].toFixed(3)).join(',')
    if (seen.has(sig)) continue
    seen.add(sig)
    ranked.push({ weights: cloneWeights(w), validationFitness: evalFitness(w, opts.validationSeeds) })
  }
  ranked.sort((a, b) => b.validationFitness - a.validationFitness)
  const chosen = ranked[0]

  return {
    best: chosen.weights,
    bestTrainFitness: bestEver.train,
    bestValidationFitness: chosen.validationFitness,
    history,
    finalists: ranked,
  }
}
