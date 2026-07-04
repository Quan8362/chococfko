// ── Poker BOT 27D INDEPENDENT evaluation harness (pure, seeded) — EVALUATION ONLY ─────────
//
// PURE module — no React, no Supabase, no clock, no I/O. Deterministic given its seeds. NOT exported
// from index.ts and enables NOTHING. It is the Prompt 27D *independent* re-evaluation of the FROZEN
// calibrated bots (strategyConfig `bot-strategy-2026-07-v1`), built SEPARATELY from the 27C-C harness
// so its conclusions do not merely echo the calibration tooling:
//
//   • a FRESH, independent seed group (disjoint from calibration/validation/holdout) — so 27D never
//     reuses a number the bots were tuned or previously judged on;
//   • FOUR EXTRA probing benchmark archetypes (over-aggressive / over-passive / tight-blind /
//     loose-limp) beyond the seven fixed benchmarks, to widen the exploitability surface;
//   • one generic matchup runner that seats the bot-under-test + copies of an opponent through the
//     SAME authoritative `runEvalSession` primitive the 27C harness uses (which itself cross-checks
//     every hand against the scripted engine and asserts coin conservation).
//
// 🔴 FAIRNESS: every opponent here is a `BotPolicy` and so, like the real bots, sees ONLY a
// `BotObservation` (its own cards + public facts). None can read hidden state; all run through
// `decideSafely` inside the runner, which re-validates legality. Deck randomness (per-hand shuffle
// seed, derived inside the runner) is NEVER exposed to a policy — policy rng is the session rng.

import type { BotObservation } from './observation.ts'
import type { BotPolicy, BotDifficulty } from './policy.ts'
import type { LegalAction } from '../betting.ts'
import { estimateEquity, preflopStrength } from './equity.ts'
import { derivePublicContext } from './context.ts'
import { policyFor, policyWithPersonality } from './policies.ts'
import { benchmarkFor, BENCHMARK_IDS, type BenchmarkId } from './benchmarks.ts'
import { runEvalSession, winrateStats, type SeatPolicy, type WinrateStats, type EvalIntegrity } from './evaluate.ts'
import { createPolicyMetrics, finalizePolicyMetrics, type PolicyMetrics } from './metrics.ts'
import { SEED_GROUPS, STACK_BB, type StackCategory } from './seeds.ts'

// ── Fresh, independent seed group ─────────────────────────────────────────────────────────
//
// Reproduced with the SAME pure integer hash as seeds.ts (replicated here so seeds.ts — a frozen
// calibration artifact — is not touched), but from a DISTINCT base so the expansion cannot collide
// with calibration / validation / holdout. `assertIndependentSeedsFresh` proves the disjointness.

function expandSeeds(base: number, count: number): number[] {
  const out: number[] = []
  let h = base >>> 0
  for (let i = 0; i < count; i++) {
    h = (h ^ (h << 13)) >>> 0
    h = (h ^ (h >>> 17)) >>> 0
    h = (h ^ (h << 5)) >>> 0
    out.push(h >>> 0)
  }
  return out
}

// "27D independent" tag — distinct from CALIBRATION_BASE / VALIDATION_BASE / HOLDOUT_BASE in seeds.ts.
const INDEPENDENT_BASE = 0x27d_1_de_00 >>> 0

// 24 fresh seeds — bounded but meaningful, and never used by any prior phase.
export const INDEPENDENT_SEEDS: readonly number[] = expandSeeds(INDEPENDENT_BASE, 24)

// Prove the 27D seeds are disjoint from ALL existing groups. Returns the overlapping seeds (empty ⇒
// fresh). An independent evaluation MUST not reuse a tuned/judged seed.
export function overlappingWithExistingGroups(seeds: readonly number[] = INDEPENDENT_SEEDS): number[] {
  const existing = new Set<number>([
    ...SEED_GROUPS.calibration,
    ...SEED_GROUPS.validation,
    ...SEED_GROUPS.holdout,
  ])
  return Array.from(new Set(seeds)).filter((s) => existing.has(s))
}

export function assertIndependentSeedsFresh(seeds: readonly number[] = INDEPENDENT_SEEDS): void {
  if (new Set(seeds).size !== seeds.length) throw new Error('27D independent seeds: internal duplicate')
  const dup = overlappingWithExistingGroups(seeds)
  if (dup.length > 0) throw new Error(`27D independent seeds overlap an existing group on ${dup.length} seed(s)`)
}

// ── Extra probing benchmark archetypes (fairness-clean, own cards + public only) ────────────
//
// These EXTEND the seven fixed benchmarks (benchmarks.ts) with four more exploitable extremes named
// in the 27D matrix. Each is a pure `BotPolicy`; a bot that is genuinely non-exploitable should beat
// every one of them without being counter-exploited (no benchmark should print a profit against it).

function legalOfType<T extends LegalAction['type']>(
  obs: BotObservation,
  type: T,
): Extract<LegalAction, { type: T }> | undefined {
  return obs.legal.find((a) => a.type === type) as Extract<LegalAction, { type: T }> | undefined
}

const check = (): ReturnType<BotPolicy> => ({ action: { type: 'check' }, note: 'indie-bench' })
const call = (): ReturnType<BotPolicy> => ({ action: { type: 'call' }, note: 'indie-bench' })
const fold = (): ReturnType<BotPolicy> => ({ action: { type: 'fold' }, note: 'indie-bench' })
const jam = (): ReturnType<BotPolicy> => ({ action: { type: 'all_in' }, note: 'indie-bench' })

function ownStrength(obs: BotObservation, rng: () => number): number {
  if (obs.street === 'PREFLOP') return preflopStrength(obs.holeCards)
  try {
    const opps = Math.max(1, obs.opponentsInHand)
    return estimateEquity(obs.holeCards, obs.board, opps, 60, rng, { earlyStop: true }).equity
  } catch {
    return 0.5
  }
}

// Am I in a blind seat (SB or BB) this hand? PUBLIC — derived from the button/seat relationship via
// the same fairness-clean classifier the real bots use (context.ts), never from hidden state.
function isBlindSeat(obs: BotObservation): boolean {
  const ctx = derivePublicContext(obs)
  return ctx.isBigBlind || ctx.isSmallBlind
}

// ── over-aggressive (pure spew maniac): jams at every legal opportunity ───────────────────────────
// Stronger than `aggressive` — whenever a raise/bet is legal it goes ALL-IN (max), else calls, never
// folds voluntarily. The maximal "over-all-in / spew" axis: a bot must call it down with value and
// must NOT try to out-bluff it. If a bot ever loses to this, it is spewing back.
export const overAggressiveBenchmark: BotPolicy = (obs) => {
  if (legalOfType(obs, 'raise') || legalOfType(obs, 'bet')) {
    if (legalOfType(obs, 'all_in')) return jam()
    const r = legalOfType(obs, 'raise')
    if (r) return { action: { type: 'raise', to: r.max }, note: 'indie-bench' }
    const b = legalOfType(obs, 'bet')
    if (b) return { action: { type: 'bet', to: b.max }, note: 'indie-bench' }
  }
  if (legalOfType(obs, 'all_in') && !legalOfType(obs, 'check')) return jam()
  if (legalOfType(obs, 'call')) return call()
  if (legalOfType(obs, 'check')) return check()
  return fold()
}

// ── over-passive (max fit-or-fold): checks when free, folds to ANY bet ────────────────────────────
// Even weaker than `passive` — never puts a chip in facing a bet (folds to a single chip). The
// "over-fold" extreme: a bot should relentlessly steal from it (bet small, take the pot) and pay off
// nothing. A bot that under-bets this is leaving money on the table (soft leak, not a loss).
export const overPassiveBenchmark: BotPolicy = (obs) => {
  if (legalOfType(obs, 'check')) return check()
  return fold()
}

// ── tight-blind (over-folds its blinds): defends blinds only with premiums ────────────────────────
// In a blind seat facing a bet/raise it folds unless its own-hand strength is very high; elsewhere it
// plays a normal-ish call-station line. The blind-steal target: a bot must widen its steals/attacks
// against it and profit from the excess blind folds.
export const tightBlindBenchmark: BotPolicy = (obs, rng) => {
  if (legalOfType(obs, 'check')) return check()
  const callable = legalOfType(obs, 'call')
  if (!callable) return fold()
  if (isBlindSeat(obs) && obs.street === 'PREFLOP') {
    // Over-fold the blinds: only continue with a premium.
    return preflopStrength(obs.holeCards) >= 0.62 ? call() : fold()
  }
  // Outside the blinds: a loose-ish calling line (so the leak is specifically the blinds).
  const pot = Math.max(1, obs.potTotal)
  return ownStrength(obs, rng) >= 0.3 || obs.toCall <= pot * 0.5 ? call() : fold()
}

// ── loose-limp (permanent limper): enters almost every pot passively, folds to real pressure ──────
// Preflop: limps/calls with a very wide range (never raises). Postflop: calls one small bet but
// surrenders to sustained pressure. The "plays too many hands / limps everything" axis — a bot must
// ISO-raise it preflop and value-bet it relentlessly postflop.
export const looseLimpBenchmark: BotPolicy = (obs, rng) => {
  if (obs.street === 'PREFLOP') {
    if (legalOfType(obs, 'check')) return check() // free look in the BB — take it
    const callable = legalOfType(obs, 'call')
    if (callable) {
      // Limp/call very wide but not literally everything (fold the pure trash to a raise).
      return preflopStrength(obs.holeCards) >= 0.14 ? call() : fold()
    }
    return fold()
  }
  if (legalOfType(obs, 'check')) return check()
  const callable = legalOfType(obs, 'call')
  if (callable) {
    const pot = Math.max(1, obs.potTotal)
    const strong = ownStrength(obs, rng)
    // Call a cheap bet with anything; need a real hand to call a big one (folds to pressure).
    if (obs.toCall <= pot * 0.4) return call()
    return strong >= 0.45 ? call() : fold()
  }
  return fold()
}

export type IndieBenchmarkId = 'over_aggressive' | 'over_passive' | 'tight_blind' | 'loose_limp'

export const INDIE_BENCHMARK_IDS: readonly IndieBenchmarkId[] = [
  'over_aggressive',
  'over_passive',
  'tight_blind',
  'loose_limp',
]

export const INDIE_BENCHMARKS: Readonly<Record<IndieBenchmarkId, BotPolicy>> = {
  over_aggressive: overAggressiveBenchmark,
  over_passive: overPassiveBenchmark,
  tight_blind: tightBlindBenchmark,
  loose_limp: looseLimpBenchmark,
}

// Every opponent id the 27D matrix can seat: the 7 fixed benchmarks + the 4 extra probes.
export type OpponentId = BenchmarkId | IndieBenchmarkId

export const ALL_OPPONENT_IDS: readonly OpponentId[] = [...BENCHMARK_IDS, ...INDIE_BENCHMARK_IDS]

export function opponentPolicyFor(id: OpponentId): BotPolicy {
  return (INDIE_BENCHMARK_IDS as readonly string[]).includes(id)
    ? INDIE_BENCHMARKS[id as IndieBenchmarkId]
    : benchmarkFor(id as BenchmarkId)
}

// ── Table shapes ────────────────────────────────────────────────────────────────────────────
export interface TableShape {
  readonly label: string
  readonly seatCount: number
  readonly stack: StackCategory
}

export const INDIE_TABLES: Readonly<Record<string, TableShape>> = {
  'hu-standard': { label: 'hu-standard', seatCount: 2, stack: 'standard' },
  'hu-short': { label: 'hu-short', seatCount: 2, stack: 'short' },
  'hu-deep': { label: 'hu-deep', seatCount: 2, stack: 'deep' },
  '3max-standard': { label: '3max-standard', seatCount: 3, stack: 'standard' },
  '6max-standard': { label: '6max-standard', seatCount: 6, stack: 'standard' },
  '6max-short': { label: '6max-short', seatCount: 6, stack: 'short' },
}

type SkillDifficulty = Exclude<BotDifficulty, 'simulation'>
const SKILLS: readonly SkillDifficulty[] = ['easy', 'normal', 'hard']

// Pool integrity results (all boolean-clean when the whole run is clean).
function emptyIntegrity(): EvalIntegrity {
  return { conserved: true, defects: 0, fallbacks: 0, negativeStacks: 0, fractionalStacks: 0, stuckHands: 0, canonicalMismatches: 0 }
}
function mergeIntegrity(into: { conserved: boolean; defects: number; fallbacks: number; negativeStacks: number; fractionalStacks: number; stuckHands: number; canonicalMismatches: number }, add: EvalIntegrity): void {
  if (!add.conserved) into.conserved = false
  into.defects += add.defects
  into.fallbacks += add.fallbacks
  into.negativeStacks += add.negativeStacks
  into.fractionalStacks += add.fractionalStacks
  into.stuckHands += add.stuckHands
  into.canonicalMismatches += add.canonicalMismatches
}

// ── Matchup: one skill bot (seat 0) vs copies of one opponent, across the seed group ──────────────
export interface IndieMatchup {
  readonly difficulty: SkillDifficulty
  readonly opponent: OpponentId
  readonly table: string
  readonly seatCount: number
  readonly stack: StackCategory
  readonly handsPerSeed: number
  readonly totalHands: number
  readonly winrate: WinrateStats // bb/100 of the bot under test, per-seed pooled, cross-seed 95% CI
  readonly opponentBbPer100: number // the opponent's per-100 (sign check: a beaten benchmark is < 0)
  readonly integrity: EvalIntegrity
  readonly metrics: readonly PolicyMetrics[] // behavioural fingerprint of the bot under test
}

export function runMatchup(
  difficulty: SkillDifficulty,
  opponent: OpponentId,
  table: TableShape,
  seeds: readonly number[],
  handsPerSeed: number,
  bigBlind: number,
): IndieMatchup {
  const startingStack = STACK_BB[table.stack] * bigBlind
  const oppPolicy = opponentPolicyFor(opponent)
  const seats: SeatPolicy[] = [{ seatIndex: 0, policy: policyFor(difficulty), label: difficulty }]
  for (let i = 1; i < table.seatCount; i++) seats.push({ seatIndex: i, policy: oppPolicy })

  const pooledMetrics = createPolicyMetrics()
  const perSeed: number[] = []
  const oppPerSeed: number[] = []
  const integrity = emptyIntegrity()
  let totalHands = 0

  for (const seed of seeds) {
    const r = runEvalSession(seats, { startingStack, bigBlind, hands: handsPerSeed }, seed, pooledMetrics)
    perSeed.push(r.underTestBbPer100)
    oppPerSeed.push(r.benchmarkBbPer100)
    totalHands += r.handsPlayed
    mergeIntegrity(integrity, r.integrity)
  }

  return {
    difficulty,
    opponent,
    table: table.label,
    seatCount: table.seatCount,
    stack: table.stack,
    handsPerSeed,
    totalHands,
    winrate: winrateStats(perSeed),
    opponentBbPer100: winrateStats(oppPerSeed).mean,
    integrity,
    metrics: finalizePolicyMetrics(pooledMetrics),
  }
}

// ── Self-play difficulty ladder (behavioural fingerprint on fresh seeds) ──────────────────────────
export interface SelfPlayRow {
  readonly difficulty: SkillDifficulty
  readonly table: string
  readonly seatCount: number
  readonly stack: StackCategory
  readonly totalHands: number
  readonly integrity: EvalIntegrity
  readonly metrics: PolicyMetrics // the (single) pooled fingerprint for this difficulty
}

export function runSelfPlay(
  difficulty: SkillDifficulty,
  table: TableShape,
  seeds: readonly number[],
  handsPerSeed: number,
  bigBlind: number,
): SelfPlayRow {
  const startingStack = STACK_BB[table.stack] * bigBlind
  const policy = policyFor(difficulty)
  const seats: SeatPolicy[] = Array.from({ length: table.seatCount }, (_, i) => ({
    seatIndex: i,
    policy,
    label: difficulty,
  }))
  const pooled = createPolicyMetrics()
  const integrity = emptyIntegrity()
  let totalHands = 0
  for (const seed of seeds) {
    const r = runEvalSession(seats, { startingStack, bigBlind, hands: handsPerSeed }, seed, pooled)
    totalHands += r.handsPlayed
    mergeIntegrity(integrity, r.integrity)
  }
  const m = finalizePolicyMetrics(pooled).find((x) => x.difficulty === difficulty)!
  return { difficulty, table: table.label, seatCount: table.seatCount, stack: table.stack, totalHands, integrity, metrics: m }
}

// ── Mixed-field soak (every difficulty + a personality overlay + the simulation fuzzer) ───────────
// A heterogeneous 6-max table stresses layered side pots and mixed styles at once. Integrity only —
// winrate across mixed styles is not a clean strength signal.
export interface MixedSoakResult {
  readonly table: string
  readonly seatCount: number
  readonly stack: StackCategory
  readonly totalHands: number
  readonly showdowns: number
  readonly sidePotHands: number
  readonly allInHands: number
  readonly integrity: EvalIntegrity
}

export function runMixedSoak(
  table: TableShape,
  seeds: readonly number[],
  handsPerSeed: number,
  bigBlind: number,
): MixedSoakResult {
  const startingStack = STACK_BB[table.stack] * bigBlind
  // A believable heterogeneous field: easy, normal, hard, an aggressive-personality normal, a
  // tight-personality hard, and the random-legal simulation fuzzer (max engine stress).
  const roster: BotPolicy[] = [
    policyFor('easy'),
    policyFor('normal'),
    policyFor('hard'),
    policyWithPersonality('normal', 'aggressive'),
    policyWithPersonality('hard', 'tight'),
    policyFor('simulation'),
  ]
  const seats: SeatPolicy[] = Array.from({ length: table.seatCount }, (_, i) => ({
    seatIndex: i,
    policy: roster[i % roster.length],
    // Label every seat so the driver still records; difficulty attribution is coarse here (we only
    // read integrity from the soak), so use the base difficulty tag.
    label: (['easy', 'normal', 'hard', 'normal', 'hard', 'simulation'] as BotDifficulty[])[i % roster.length],
  }))
  const pooled = createPolicyMetrics()
  const integrity = emptyIntegrity()
  let totalHands = 0
  let showdowns = 0
  let sidePotHands = 0
  let allInHands = 0
  for (const seed of seeds) {
    const r = runEvalSession(seats, { startingStack, bigBlind, hands: handsPerSeed }, seed, pooled)
    totalHands += r.handsPlayed
    showdowns += r.showdowns
    sidePotHands += r.sidePotHands
    allInHands += r.allInHands
    mergeIntegrity(integrity, r.integrity)
  }
  return { table: table.label, seatCount: table.seatCount, stack: table.stack, totalHands, showdowns, sidePotHands, allInHands, integrity }
}

// ── Full 27D matrix ───────────────────────────────────────────────────────────────────────────
export interface IndependentReport {
  readonly strategyVersion: string
  readonly seedsUsed: readonly number[]
  readonly seedsFresh: boolean // proven disjoint from calibration/validation/holdout
  readonly bigBlind: number
  readonly totalHands: number
  readonly selfPlay: readonly SelfPlayRow[]
  readonly matchups: readonly IndieMatchup[]
  readonly mixedSoak: readonly MixedSoakResult[]
  readonly integrity: EvalIntegrity // pooled across the ENTIRE run
}

export interface IndependentOptions {
  readonly strategyVersion: string
  readonly seeds?: readonly number[]
  readonly bigBlind?: number
  readonly difficulties?: readonly SkillDifficulty[]
  readonly opponents?: readonly OpponentId[]
  readonly matchupTables?: readonly TableShape[]
  readonly selfPlayTables?: readonly TableShape[]
  readonly mixedTables?: readonly TableShape[]
  readonly handsPerSeed?: number // matchup hands/seed (multiway auto-scaled down)
  readonly selfPlayHands?: number
  readonly mixedHands?: number
  readonly matchupSeedCount?: number // cap seeds for the (larger) matchup matrix
  // Optional progress sink — called after each self-play row / matchup / mixed table completes, so a
  // long run is observable instead of blind. NEVER affects results (pure side-channel).
  readonly onProgress?: (msg: string) => void
}

const DEFAULT_MATCHUP_TABLES: readonly TableShape[] = [
  INDIE_TABLES['hu-standard'],
  INDIE_TABLES['hu-short'],
  INDIE_TABLES['hu-deep'],
  INDIE_TABLES['3max-standard'],
  INDIE_TABLES['6max-standard'],
  INDIE_TABLES['6max-short'],
]
const DEFAULT_SELFPLAY_TABLES: readonly TableShape[] = [
  INDIE_TABLES['hu-standard'],
  INDIE_TABLES['6max-standard'],
  INDIE_TABLES['6max-short'],
]
const DEFAULT_MIXED_TABLES: readonly TableShape[] = [
  INDIE_TABLES['6max-standard'],
  INDIE_TABLES['6max-short'],
]

export function runIndependent(opts: IndependentOptions): IndependentReport {
  assertIndependentSeedsFresh(opts.seeds ?? INDEPENDENT_SEEDS)
  const seeds = opts.seeds ?? INDEPENDENT_SEEDS
  const bigBlind = opts.bigBlind ?? 100
  const difficulties = opts.difficulties ?? SKILLS
  const opponents = opts.opponents ?? ALL_OPPONENT_IDS
  const matchupTables = opts.matchupTables ?? DEFAULT_MATCHUP_TABLES
  const selfPlayTables = opts.selfPlayTables ?? DEFAULT_SELFPLAY_TABLES
  const mixedTables = opts.mixedTables ?? DEFAULT_MIXED_TABLES
  const handsPerSeed = opts.handsPerSeed ?? 220
  const selfPlayHands = opts.selfPlayHands ?? 200
  const mixedHands = opts.mixedHands ?? 250
  const matchupSeeds = opts.matchupSeedCount ? seeds.slice(0, opts.matchupSeedCount) : seeds
  const progress = opts.onProgress ?? (() => {})

  const pooled = emptyIntegrity()
  let totalHands = 0
  const matchupTotal = matchupTables.length * difficulties.length * opponents.length

  progress(`self-play: ${selfPlayTables.length} tables × ${difficulties.length} difficulties`)
  const selfPlay: SelfPlayRow[] = []
  for (const table of selfPlayTables) {
    for (const difficulty of difficulties) {
      const row = runSelfPlay(difficulty, table, seeds, selfPlayHands, bigBlind)
      selfPlay.push(row)
      totalHands += row.totalHands
      mergeIntegrity(pooled, row.integrity)
      progress(`  self-play ${table.label}/${difficulty}: ${row.totalHands} hands  [conserved=${row.integrity.conserved} defects=${row.integrity.defects}]`)
    }
  }

  progress(`matchups: ${matchupTotal} (${matchupTables.length} tables × ${difficulties.length} diff × ${opponents.length} opponents)`)
  const matchups: IndieMatchup[] = []
  let done = 0
  for (const table of matchupTables) {
    // Auto-scale hands down for multiway (more seats ⇒ more decisions per hand).
    const hands = table.seatCount <= 2 ? handsPerSeed : Math.max(90, Math.round(handsPerSeed * 0.75))
    for (const difficulty of difficulties) {
      for (const opponent of opponents) {
        const m = runMatchup(difficulty, opponent, table, matchupSeeds, hands, bigBlind)
        matchups.push(m)
        totalHands += m.totalHands
        mergeIntegrity(pooled, m.integrity)
        done += 1
        progress(`  [${done}/${matchupTotal}] ${table.label} ${difficulty} vs ${opponent}: mean=${m.winrate.mean} bb/100 CI[${m.winrate.ci95Lo},${m.winrate.ci95Hi}] beats0=${m.winrate.beatsZero} oppBB=${m.opponentBbPer100}`)
      }
    }
  }

  progress(`mixed soak: ${mixedTables.length} tables`)
  const mixedSoak: MixedSoakResult[] = []
  for (const table of mixedTables) {
    const r = runMixedSoak(table, seeds, mixedHands, bigBlind)
    mixedSoak.push(r)
    totalHands += r.totalHands
    mergeIntegrity(pooled, r.integrity)
    progress(`  mixed ${table.label}: ${r.totalHands} hands  showdowns=${r.showdowns} sidePots=${r.sidePotHands} allIn=${r.allInHands}  [conserved=${r.integrity.conserved} defects=${r.integrity.defects}]`)
  }
  progress(`DONE: ${totalHands} hands  [conserved=${pooled.conserved} defects=${pooled.defects} stuck=${pooled.stuckHands} mismatches=${pooled.canonicalMismatches}]`)

  return {
    strategyVersion: opts.strategyVersion,
    seedsUsed: seeds,
    seedsFresh: overlappingWithExistingGroups(seeds).length === 0,
    bigBlind,
    totalHands,
    selfPlay,
    matchups,
    mixedSoak,
    integrity: pooled,
  }
}
