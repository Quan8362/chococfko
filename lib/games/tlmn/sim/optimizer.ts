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
}

export interface OptimizeResult {
  best: BotStrategyWeights
  bestTrainFitness: number
  bestValidationFitness: number
  history: Array<{ generation: number; bestFitness: number; meanFitness: number }>
}

export function optimizeWeights(opts: OptimizeOptions): OptimizeResult {
  const populationSize = opts.populationSize ?? 12
  const generations = opts.generations ?? 6
  const eliteCount = opts.eliteCount ?? 4
  const mutationScale = opts.mutationScale ?? 0.25
  const mutationProb = opts.mutationProb ?? 0.4
  const rng = makeRng(opts.seed ?? 'optimizer')

  const evalFitness = (w: BotStrategyWeights, seeds: string[]): number => {
    const candidate = makePolicy('candidateTrained', { difficulty: 'hard', weights: w })
    const report = runSelfPlay({ candidate, field: opts.field, seeds, playerCount: opts.playerCount, ruleConfig: opts.ruleConfig })
    return fitness(report)
  }

  // Generation 0: DEFAULT plus mutated variants.
  let population: BotStrategyWeights[] = [cloneWeights(DEFAULT_WEIGHTS)]
  while (population.length < populationSize) population.push(mutate(DEFAULT_WEIGHTS, rng, mutationScale * 1.5, 0.6))

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
  const finalists = [bestEver.w, ...population.slice(0, eliteCount)]
  let chosen = { w: bestEver.w, valid: -Infinity }
  for (const w of finalists) {
    const v = evalFitness(w, opts.validationSeeds)
    if (v > chosen.valid) chosen = { w, valid: v }
  }

  return {
    best: chosen.w,
    bestTrainFitness: bestEver.train,
    bestValidationFitness: chosen.valid,
    history,
  }
}
