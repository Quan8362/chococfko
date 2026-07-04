// ── Poker BOT baseline suite (pure, seeded) ───────────────────────────────────────────
//
// PURE module — no React, no Supabase, no clock, no I/O. Deterministic given the seed group.
// Tested by baseline.test.ts; timing is added by the CLI (bot/cli.ts), which is the only layer
// allowed to read a clock. Kept OUT of index.ts so nothing app-facing imports it.
//
// Runs a bounded, reproducible matrix (BENCHMARK_MATRIX × a seed group) to establish the pre-
// calibration behavioural + integrity baseline of the EXISTING policies. It reuses the exact
// session engine (runBotSimulation) and a single shared metrics accumulator, so per-difficulty
// metrics aggregate across every environment a difficulty played. It changes NO strategy and
// enables NOTHING — it only measures.

import { runBotSimulation, type BotSimConfig } from './sim.ts'
import { createPolicyMetrics, finalizePolicyMetrics, type PolicyMetrics } from './metrics.ts'
import { BENCHMARK_MATRIX, STACK_BB, SEED_GROUPS, type BenchScenario } from './seeds.ts'
import { BOT_DIFFICULTIES, type BotDifficulty } from './policy.ts'

export type SeedGroupName = 'calibration' | 'validation' | 'holdout'

export interface BaselineOptions {
  readonly group: SeedGroupName
  readonly seedCount: number // how many seeds of the group to use (bounded)
  readonly handsPerRun: number // hands per (environment, scenario, seed) session
  readonly bigBlind: number
  // Which difficulties to run in homogeneous self-play. Default all four.
  readonly difficulties?: readonly BotDifficulty[]
  // Also run a mixed-difficulty table at seatCount ≥ 4 scenarios. Default true.
  readonly includeMixed?: boolean
  // Restrict the scenario grid (default BENCHMARK_MATRIX).
  readonly scenarios?: readonly BenchScenario[]
}

export interface ScenarioSummary {
  readonly environment: string // 'self:hard' | 'mixed'
  readonly label: string // scenario label
  readonly seatCount: number
  readonly stack: string
  readonly handsPlayed: number
  readonly showdowns: number
  readonly sidePotHands: number
  readonly allInHands: number
  readonly fallbacks: number
  readonly conserved: boolean
  readonly defects: number
}

export interface BaselineIntegrity {
  readonly conserved: boolean // every run conserved AND global supply held
  readonly totalDefects: number
  readonly totalFallbacks: number
  readonly negativeStacks: number // final stacks < 0 (must be 0)
  readonly fractionalStacks: number // non-integer final stacks (must be 0)
}

export interface BaselineReport {
  readonly group: SeedGroupName
  readonly seedsUsed: readonly number[] // ACTUAL seeds (not planned)
  readonly handsPerRun: number
  readonly totalHands: number
  readonly runs: number
  readonly perDifficulty: readonly PolicyMetrics[]
  readonly perScenario: readonly ScenarioSummary[]
  readonly integrity: BaselineIntegrity
}

const MIXED_6MAX: readonly BotDifficulty[] = ['hard', 'normal', 'normal', 'easy', 'easy', 'simulation']

function stackChips(scenario: BenchScenario, bigBlind: number): number {
  return STACK_BB[scenario.stack] * bigBlind
}

export function runBaseline(opts: BaselineOptions): BaselineReport {
  const group = SEED_GROUPS[opts.group]
  const seeds = group.slice(0, Math.max(1, Math.min(opts.seedCount, group.length)))
  const difficulties = opts.difficulties ?? BOT_DIFFICULTIES
  const scenarios = opts.scenarios ?? BENCHMARK_MATRIX
  const includeMixed = opts.includeMixed ?? true

  const metrics = createPolicyMetrics()
  const perScenario: ScenarioSummary[] = []
  let totalHands = 0
  let runs = 0
  let conserved = true
  let totalDefects = 0
  let totalFallbacks = 0
  let negativeStacks = 0
  let fractionalStacks = 0

  const runOne = (environment: string, scenario: BenchScenario, difficulties2: readonly BotDifficulty[] | BotDifficulty): void => {
    const start = stackChips(scenario, opts.bigBlind)
    for (const seed of seeds) {
      const config: BotSimConfig = {
        seatCount: scenario.seatCount,
        startingStack: start,
        bigBlind: opts.bigBlind,
        smallBlind: Math.floor(opts.bigBlind / 2),
        hands: opts.handsPerRun,
        difficulties: difficulties2,
      }
      const r = runBotSimulation(config, seed, metrics)
      runs += 1
      totalHands += r.handsPlayed
      totalFallbacks += r.fallbacks
      totalDefects += r.defects.length
      if (!r.conserved) conserved = false
      for (const fs of r.finalStacks) {
        if (fs.stack < 0) negativeStacks += 1
        if (!Number.isInteger(fs.stack)) fractionalStacks += 1
      }
      perScenario.push({
        environment,
        label: scenario.label,
        seatCount: scenario.seatCount,
        stack: scenario.stack,
        handsPlayed: r.handsPlayed,
        showdowns: r.showdowns,
        sidePotHands: r.sidePotHands,
        allInHands: r.allInHands,
        fallbacks: r.fallbacks,
        conserved: r.conserved,
        defects: r.defects.length,
      })
    }
  }

  for (const scenario of scenarios) {
    for (const d of difficulties) {
      runOne(`self:${d}`, scenario, d)
    }
    if (includeMixed && scenario.seatCount === 6) {
      runOne('mixed', scenario, MIXED_6MAX)
    }
  }

  return {
    group: opts.group,
    seedsUsed: seeds,
    handsPerRun: opts.handsPerRun,
    totalHands,
    runs,
    perDifficulty: finalizePolicyMetrics(metrics),
    perScenario,
    integrity: {
      conserved,
      totalDefects,
      totalFallbacks,
      negativeStacks,
      fractionalStacks,
    },
  }
}
