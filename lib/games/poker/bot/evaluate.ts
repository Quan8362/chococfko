// ── Poker BOT 27C-C validation harness (pure, seeded) — EVALUATION ONLY ─────────────────
//
// PURE module — no React, no Supabase, no clock, no I/O. Deterministic given its seeds. NOT exported
// from index.ts and enables NOTHING. It measures the FROZEN calibrated policies against the FIXED
// benchmark opponents (benchmarks.ts) on the reserved HOLDOUT seeds — the final 27C-C gate.
//
// It reuses the exact authoritative primitives the sim uses: `playBotHand` (which itself cross-checks
// every hand against the canonical scripted engine and asserts coin conservation), `recordHand`
// (public-info behavioural metrics), and `nextButton` (button rotation). The only thing this file
// adds over sim.ts is the ability to seat ARBITRARY per-seat policies (a skill bot vs a benchmark),
// which the difficulty-keyed sim config cannot express — so it does not touch sim.ts.

import { makeRng } from '../../tlmn/ai/seededRandom.ts'
import { nextButton, type RingSeat } from '../order.ts'
import { playBotHand, type BotHandConfig } from './runner.ts'
import type { BotPolicy, BotDifficulty } from './policy.ts'
import { policyFor } from './policies.ts'
import { benchmarkFor, type BenchmarkId } from './benchmarks.ts'
import {
  createPolicyMetrics,
  recordHand,
  finalizePolicyMetrics,
  type PolicyMetrics,
  type PolicyMetricsAccumulator,
} from './metrics.ts'
import { SEED_GROUPS, STACK_BB, type StackCategory } from './seeds.ts'

// ── Seated policy (a seat + its policy + optional metrics label) ─────────────────────────────────

export interface SeatPolicy {
  readonly seatIndex: number
  readonly policy: BotPolicy
  // When set, this seat's public actions are attributed to this difficulty in the behavioural
  // metrics. Benchmark (opponent) seats leave it undefined so metrics reflect ONLY the bot under test.
  readonly label?: BotDifficulty
}

export interface EvalIntegrity {
  readonly conserved: boolean
  readonly defects: number
  readonly fallbacks: number
  readonly negativeStacks: number
  readonly fractionalStacks: number
  readonly stuckHands: number // hands whose action budget tripped (nonterminating defect)
  readonly canonicalMismatches: number // engine cross-check defects
}

export interface EvalSessionResult {
  readonly handsPlayed: number
  readonly conserved: boolean
  readonly injected: number
  readonly showdowns: number
  readonly sidePotHands: number
  readonly allInHands: number
  readonly integrity: EvalIntegrity
  // Net bb/100 for the UNDER-TEST seats (those carrying a label), pooled.
  readonly underTestBbPer100: number
  readonly benchmarkBbPer100: number
  readonly metrics: readonly PolicyMetrics[]
}

// Derive a per-hand deal seed exactly as sim.ts does (kept in sync — deterministic, integer).
function deriveHandSeed(seed: number, hand: number): number {
  let h = (seed ^ Math.imul(hand + 1, 0x9e3779b1)) >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0
  return h >>> 0
}

// Run ONE seeded session with arbitrary per-seat policies. Mirrors runBotSimulation's session loop
// (carry stacks, rotate button, tracked auto-rebuy so the full hand count runs; TRUE P&L is rebuy-
// independent) but seats explicit policies instead of difficulty-keyed ones.
export function runEvalSession(
  seats: readonly SeatPolicy[],
  opts: { startingStack: number; bigBlind: number; hands: number; rebuy?: boolean },
  seed: number,
  sharedMetrics?: PolicyMetricsAccumulator,
): EvalSessionResult {
  if (seats.length < 2 || seats.length > 6) throw new Error('eval: a table needs 2..6 seats')
  const rng = makeRng(seed)
  const rebuy = opts.rebuy ?? true
  const smallBlind = Math.floor(opts.bigBlind / 2)

  const state = seats.map((s) => ({
    seatIndex: s.seatIndex,
    policy: s.policy,
    label: s.label,
    stack: opts.startingStack,
    pnl: 0,
  }))
  const labelBySeat = new Map<number, BotDifficulty>()
  for (const s of state) if (s.label) labelBySeat.set(s.seatIndex, s.label)

  const metrics = sharedMetrics ?? createPolicyMetrics()
  let handsPlayed = 0
  let injected = 0
  let conserved = true
  let showdowns = 0
  let sidePotHands = 0
  let allInHands = 0
  let defects = 0
  let fallbacks = 0
  let negativeStacks = 0
  let fractionalStacks = 0
  let stuckHands = 0
  let canonicalMismatches = 0
  let button: number | null = null

  for (let hand = 1; hand <= opts.hands; hand++) {
    if (rebuy) {
      for (const s of state) {
        if (s.stack < opts.bigBlind) {
          injected += opts.startingStack - s.stack
          s.stack = opts.startingStack
        }
      }
    }
    const funded = state.filter((s) => s.stack > 0)
    if (funded.length < 2) break

    const ring: RingSeat[] = state.map((s) => ({ seatIndex: s.seatIndex, eligible: s.stack > 0 }))
    button = nextButton(ring, button)

    const cfg: BotHandConfig = {
      seed: deriveHandSeed(seed, hand),
      bigBlind: opts.bigBlind,
      smallBlind,
      buttonSeat: button,
      seats: funded.map((s) => ({ seatIndex: s.seatIndex, stack: s.stack, policy: s.policy })),
    }
    const outcome = playBotHand(cfg, rng)
    handsPlayed += 1
    fallbacks += outcome.fallbacks

    recordHand(metrics, {
      history: outcome.history,
      seatDifficulty: labelBySeat,
      stackDeltas: outcome.stackDeltas,
      wentToShowdown: outcome.wentToShowdown,
      smallBlind,
      bigBlind: opts.bigBlind,
    })

    if (outcome.wentToShowdown) showdowns += 1
    if (outcome.sidePotCount > 0) sidePotHands += 1
    if (outcome.actionLog.some((a) => a.action.type === 'all_in')) allInHands += 1
    for (const d of outcome.defects) {
      defects += 1
      if (d.kind === 'nonterminating') stuckHands += 1
      if (d.kind === 'engine_crosscheck' || d.kind === 'crosscheck_threw') canonicalMismatches += 1
    }

    let deltaSum = 0
    for (const s of state) {
      const delta = outcome.stackDeltas.get(s.seatIndex) ?? 0
      s.stack += delta
      s.pnl += delta
      deltaSum += delta
    }
    if (deltaSum !== 0) conserved = false
  }

  for (const s of state) {
    if (s.stack < 0) negativeStacks += 1
    if (!Number.isInteger(s.stack)) fractionalStacks += 1
  }

  const bb = opts.bigBlind > 0 ? opts.bigBlind : 1
  const underTestNet = state.filter((s) => s.label).reduce((sum, s) => sum + s.pnl, 0)
  const benchNet = state.filter((s) => !s.label).reduce((sum, s) => sum + s.pnl, 0)
  const per100 = (net: number) => (handsPlayed > 0 ? (net / bb / handsPlayed) * 100 : 0)

  return {
    handsPlayed,
    conserved,
    injected,
    showdowns,
    sidePotHands,
    allInHands,
    integrity: {
      conserved,
      defects,
      fallbacks,
      negativeStacks,
      fractionalStacks,
      stuckHands,
      canonicalMismatches,
    },
    underTestBbPer100: per100(underTestNet),
    benchmarkBbPer100: per100(benchNet),
    metrics: finalizePolicyMetrics(metrics),
  }
}

// ── Cross-seed statistics (winrate uncertainty) ──────────────────────────────────────────────────

export interface WinrateStats {
  readonly seeds: number
  readonly mean: number
  readonly sd: number
  readonly sem: number
  readonly ci95Lo: number
  readonly ci95Hi: number
  readonly beatsZero: boolean // CI entirely above 0 ⇒ statistically beats the benchmark
}

// Two-sided 95% t critical value by degrees of freedom (small-sample honest). Falls back to the
// normal 1.96 for large df. Covers the holdout k (16 seeds ⇒ df 15).
function tCrit95(df: number): number {
  const table: Record<number, number> = {
    1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365, 8: 2.306,
    9: 2.262, 10: 2.228, 11: 2.201, 12: 2.179, 13: 2.16, 14: 2.145, 15: 2.131, 16: 2.12,
    18: 2.101, 20: 2.086, 24: 2.064, 30: 2.042, 40: 2.021, 60: 2.0,
  }
  if (df <= 0) return 0
  if (table[df]) return table[df]
  if (df > 60) return 1.96
  // nearest lower key
  const keys = Object.keys(table).map(Number).filter((k) => k <= df)
  return table[Math.max(...keys)] ?? 1.96
}

export function winrateStats(perSeed: readonly number[]): WinrateStats {
  const n = perSeed.length
  if (n === 0) return { seeds: 0, mean: 0, sd: 0, sem: 0, ci95Lo: 0, ci95Hi: 0, beatsZero: false }
  const mean = perSeed.reduce((s, x) => s + x, 0) / n
  const variance = n > 1 ? perSeed.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1) : 0
  const sd = Math.sqrt(variance)
  const sem = n > 1 ? sd / Math.sqrt(n) : 0
  const half = tCrit95(n - 1) * sem
  return {
    seeds: n,
    mean: round2(mean),
    sd: round2(sd),
    sem: round2(sem),
    ci95Lo: round2(mean - half),
    ci95Hi: round2(mean + half),
    beatsZero: mean - half > 0,
  }
}

function round2(x: number): number {
  return Math.round(x * 100) / 100
}

// ── The 27C-C evaluation matrix ──────────────────────────────────────────────────────────────────

export type EvalGroupName = 'calibration' | 'validation' | 'holdout'

export interface MatchupResult {
  readonly difficulty: BotDifficulty
  readonly benchmark: BenchmarkId
  readonly seatCount: number
  readonly stack: StackCategory
  readonly handsPerSeed: number
  readonly totalHands: number
  readonly winrate: WinrateStats // bb/100 of the bot under test (per-seed pooled), across seeds
  readonly integrity: EvalIntegrity
  readonly metrics: readonly PolicyMetrics[] // behavioural metrics of the bot under test (pooled)
}

export interface EvalMatrixOptions {
  readonly group: EvalGroupName
  readonly seedCount?: number
  readonly handsPerSeed?: number
  readonly bigBlind?: number
  readonly difficulties?: readonly Exclude<BotDifficulty, 'simulation'>[]
  readonly benchmarks?: readonly BenchmarkId[]
  // Table shapes to evaluate. Each entry seats one bot-under-test + (seatCount-1) benchmark copies.
  readonly tables?: readonly { readonly seatCount: number; readonly stack: StackCategory }[]
}

const DEFAULT_TABLES: readonly { seatCount: number; stack: StackCategory }[] = [
  { seatCount: 2, stack: 'standard' },
  { seatCount: 2, stack: 'short' },
  { seatCount: 2, stack: 'deep' },
  { seatCount: 6, stack: 'standard' },
]

// One difficulty vs one benchmark on one table shape, across the seed group. Seat 0 is the bot under
// test; the remaining seats are benchmark copies. Metrics + integrity are pooled across seeds; the
// winrate is per-seed (each seed is one independent session mean) so the CI reflects seed variance.
export function evaluateMatchup(
  difficulty: Exclude<BotDifficulty, 'simulation'>,
  benchmark: BenchmarkId,
  table: { seatCount: number; stack: StackCategory },
  seeds: readonly number[],
  handsPerSeed: number,
  bigBlind: number,
): MatchupResult {
  const startingStack = STACK_BB[table.stack] * bigBlind
  const seats: SeatPolicy[] = [{ seatIndex: 0, policy: policyFor(difficulty), label: difficulty }]
  for (let i = 1; i < table.seatCount; i++) {
    seats.push({ seatIndex: i, policy: benchmarkFor(benchmark) })
  }

  const perSeed: number[] = []
  const pooledMetrics = createPolicyMetrics()
  let totalHands = 0
  let conserved = true
  let defects = 0
  let fallbacks = 0
  let negativeStacks = 0
  let fractionalStacks = 0
  let stuckHands = 0
  let canonicalMismatches = 0

  for (const seed of seeds) {
    // One pass per seed: the shared accumulator pools the behavioural fingerprint across seeds while
    // the per-seed winrate feeds the cross-seed CI.
    const r = runEvalSession(seats, { startingStack, bigBlind, hands: handsPerSeed }, seed, pooledMetrics)
    perSeed.push(r.underTestBbPer100)
    totalHands += r.handsPlayed
    if (!r.integrity.conserved) conserved = false
    defects += r.integrity.defects
    fallbacks += r.integrity.fallbacks
    negativeStacks += r.integrity.negativeStacks
    fractionalStacks += r.integrity.fractionalStacks
    stuckHands += r.integrity.stuckHands
    canonicalMismatches += r.integrity.canonicalMismatches
  }

  return {
    difficulty,
    benchmark,
    seatCount: table.seatCount,
    stack: table.stack,
    handsPerSeed,
    totalHands,
    winrate: winrateStats(perSeed),
    integrity: {
      conserved,
      defects,
      fallbacks,
      negativeStacks,
      fractionalStacks,
      stuckHands,
      canonicalMismatches,
    },
    metrics: finalizePolicyMetrics(pooledMetrics),
  }
}

export interface EvalMatrixReport {
  readonly group: EvalGroupName
  readonly seedsUsed: readonly number[]
  readonly handsPerSeed: number
  readonly bigBlind: number
  readonly totalHands: number
  readonly matchups: readonly MatchupResult[]
  readonly integrity: EvalIntegrity // pooled across every matchup
}

export function runEvalMatrix(opts: EvalMatrixOptions): EvalMatrixReport {
  const group = SEED_GROUPS[opts.group]
  const seeds = group.slice(0, Math.max(1, Math.min(opts.seedCount ?? group.length, group.length)))
  const handsPerSeed = opts.handsPerSeed ?? 300
  const bigBlind = opts.bigBlind ?? 100
  const difficulties = opts.difficulties ?? (['easy', 'normal', 'hard'] as const)
  const benchmarks = opts.benchmarks ?? (['random', 'always_call', 'passive', 'aggressive', 'min_raise', 'tight', 'loose'] as const)
  const tables = opts.tables ?? DEFAULT_TABLES

  const matchups: MatchupResult[] = []
  let totalHands = 0
  const pooled: EvalIntegrity = {
    conserved: true, defects: 0, fallbacks: 0, negativeStacks: 0, fractionalStacks: 0, stuckHands: 0, canonicalMismatches: 0,
  }
  const pool = { ...pooled }

  for (const table of tables) {
    for (const difficulty of difficulties) {
      for (const benchmark of benchmarks) {
        const m = evaluateMatchup(difficulty, benchmark, table, seeds, handsPerSeed, bigBlind)
        matchups.push(m)
        totalHands += m.totalHands
        if (!m.integrity.conserved) pool.conserved = false
        pool.defects += m.integrity.defects
        pool.fallbacks += m.integrity.fallbacks
        pool.negativeStacks += m.integrity.negativeStacks
        pool.fractionalStacks += m.integrity.fractionalStacks
        pool.stuckHands += m.integrity.stuckHands
        pool.canonicalMismatches += m.integrity.canonicalMismatches
      }
    }
  }

  return {
    group: opts.group,
    seedsUsed: seeds,
    handsPerSeed,
    bigBlind,
    totalHands,
    matchups,
    integrity: pool,
  }
}
