// ─────────────────────────────────────────────────────────────────────────────
// Poker BOT simulation CLI. Run with Node's native TS (Node 20+):
//
//   node lib/games/poker/bot/cli.ts list
//   node lib/games/poker/bot/cli.ts run  --profile six_sim --seed 42
//   node lib/games/poker/bot/cli.ts run  --seats 6 --hands 5000 --bb 100 --stack 20000 --mix simulation --seed 7
//   node lib/games/poker/bot/cli.ts soak --profile six_sim --seeds 1,2,3,4,5
//
// (package.json exposes: npm run poker:bots:list / :run / :soak)
//
// PURPOSE: a deterministic engine fuzzer + coin-conservation checker. It plays many full hands
// with bot policies and reports any invariant violations (see docs/poker/bots/simulation.md).
// NOT a statistical proof — it surfaces bugs, it does not certify their absence.
// ─────────────────────────────────────────────────────────────────────────────
import { performance } from 'node:perf_hooks'
import { runBotSimulation, BOT_SIM_PROFILES, type BotSimConfig, type BotSimReport } from './sim.ts'
import { BOT_DIFFICULTIES, decideSafely, type BotDifficulty } from './policy.ts'
import { policyFor } from './policies.ts'
import { runBaseline, type SeedGroupName } from './baseline.ts'
import { runEvalMatrix, type EvalMatrixReport } from './evaluate.ts'
import { BENCHMARK_IDS, type BenchmarkId } from './benchmarks.ts'
import {
  runIndependent,
  ALL_OPPONENT_IDS,
  INDIE_TABLES,
  INDEPENDENT_SEEDS,
  type IndependentReport,
  type OpponentId,
  type TableShape,
} from './independent.ts'
import { STRATEGY_VERSION } from './strategyConfig.ts'
import { SEED_GROUPS, type StackCategory } from './seeds.ts'
import { seededShuffle, deal } from '../deck.ts'
import {
  createRound,
  makePlayer,
  legalActions,
  amountToCall,
  minRaiseTo,
  maxRaiseTo,
  type BettingPlayer,
} from '../betting.ts'
import { makeRng } from '../../tlmn/ai/seededRandom.ts'
import { buildObservation, type BotObservation, type ObservedSeat } from './observation.ts'
import type { Street } from '../types.ts'

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      out[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true'
    }
  }
  return out
}

function configFromArgs(args: Record<string, string>): BotSimConfig {
  if (args.profile) {
    const p = BOT_SIM_PROFILES[args.profile]
    if (!p) {
      console.error(`Unknown profile "${args.profile}". Try: ${Object.keys(BOT_SIM_PROFILES).join(', ')}`)
      process.exit(1)
    }
    return { ...p, ...(args.hands ? { hands: Number(args.hands) } : {}) }
  }
  const mixArg = args.mix ?? 'simulation'
  const seatCount = Number(args.seats ?? '6')
  let difficulties: BotSimConfig['difficulties']
  if (mixArg.includes(',')) {
    difficulties = mixArg.split(',').map((s) => s.trim()) as BotDifficulty[]
  } else {
    if (!BOT_DIFFICULTIES.includes(mixArg as BotDifficulty)) {
      console.error(`Unknown difficulty "${mixArg}". Try: ${BOT_DIFFICULTIES.join(', ')}`)
      process.exit(1)
    }
    difficulties = mixArg as BotDifficulty
  }
  return {
    seatCount,
    startingStack: Number(args.stack ?? '20000'),
    bigBlind: Number(args.bb ?? '100'),
    hands: Number(args.hands ?? '2000'),
    difficulties,
  }
}

function printReport(r: BotSimReport): void {
  console.log(`\n── bot sim  (seed=${r.seed}, ${r.seatCount}-max, ${r.handsPlayed}/${r.handsRequested} hands) ──`)
  console.log(`  initial table supply    ${r.totalChips}`)
  console.log(`  injected (rebuys)       ${r.injectedChips}`)
  console.log(`  coin conservation       ${r.conserved ? 'OK ✅' : 'VIOLATED ❌'}`)
  console.log(`  terminated early        ${r.terminatedEarly ? 'yes (too few funded seats)' : 'no'}`)
  console.log(`  showdowns               ${r.showdowns}`)
  console.log(`  hands with all-in       ${r.allInHands}`)
  console.log(`  hands with side pots    ${r.sidePotHands}`)
  console.log(`  safe fallbacks          ${r.fallbacks}`)
  console.log(`  defects                 ${r.defects.length}`)
  if (r.defects.length > 0) {
    const byKind = new Map<string, number>()
    for (const d of r.defects) byKind.set(d.kind, (byKind.get(d.kind) ?? 0) + 1)
    for (const [k, n] of Array.from(byKind)) console.log(`      ${k.padEnd(20)} ${n}`)
    console.log(`      first: hand ${r.defects[0].hand} — ${r.defects[0].detail}`)
  }
  console.log('  net by difficulty:')
  for (const d of r.byDifficulty) {
    console.log(`      ${d.difficulty.padEnd(11)} seats=${d.seats}  net=${d.netChips}  (${d.netBbPer100.toFixed(2)} bb/100)`)
  }
}

// ── Decision-time bench (CLI-only; perf_hooks is allowed here, never in a pure module) ────────
//
// Builds a spread of realistic, fairness-clean observations (varied seat counts + streets) and
// times `decideSafely` — the EXACT safety-wrapped path production uses. Reports latency percentiles
// per difficulty in microseconds. This isolates the equity-Monte-Carlo cost that dominates `hard`.

const BENCH_STREETS: readonly Street[] = ['PREFLOP', 'FLOP', 'TURN', 'RIVER']

function boardLen(street: Street): number {
  return street === 'PREFLOP' ? 0 : street === 'FLOP' ? 3 : street === 'TURN' ? 4 : 5
}

function benchObservation(seed: number, seatCount: number, seatIndex: number, street: Street): BotObservation {
  const shuffled = seededShuffle(seed)
  const dealt = deal(shuffled, seatCount)
  const fullBoard = [...dealt.flop, dealt.turn, dealt.river]
  const players: BettingPlayer[] = Array.from({ length: seatCount }, (_, i) =>
    makePlayer({ seatIndex: i, stack: 10000, committedThisStreet: i === 1 ? 100 : 0 }),
  )
  const round = createRound({ street, bigBlind: 100, players })
  const seats: ObservedSeat[] = players.map((p) => ({
    seatIndex: p.seatIndex,
    stack: p.stack,
    committedThisStreet: p.committedThisStreet,
    committedTotal: p.committedTotal,
    status: p.status,
    inHand: true,
  }))
  return buildObservation({
    seatIndex,
    holeCards: dealt.holeBySeat[seatIndex],
    fullBoard: fullBoard.slice(0, boardLen(street)),
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
}

interface TimingStat {
  readonly difficulty: BotDifficulty
  readonly decisions: number
  readonly meanUs: number
  readonly p50Us: number
  readonly p95Us: number
  readonly maxUs: number
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[idx]
}

function benchDifficulty(difficulty: BotDifficulty, decisionsTarget: number): TimingStat {
  const policy = policyFor(difficulty)
  const rng = makeRng(`bench:${difficulty}`)
  const durations: number[] = []
  let seed = 1
  outer: for (;;) {
    for (const street of BENCH_STREETS) {
      for (let seatCount = 2; seatCount <= 6; seatCount++) {
        const obs = benchObservation(seed, seatCount, seatCount - 1, street)
        const t0 = performance.now()
        decideSafely(policy, obs, rng)
        const t1 = performance.now()
        durations.push((t1 - t0) * 1000) // ms → µs
        if (durations.length >= decisionsTarget) break outer
      }
    }
    seed += 1
  }
  durations.sort((a, b) => a - b)
  const mean = durations.reduce((s, d) => s + d, 0) / durations.length
  return {
    difficulty,
    decisions: durations.length,
    meanUs: Math.round(mean),
    p50Us: Math.round(percentile(durations, 50)),
    p95Us: Math.round(percentile(durations, 95)),
    maxUs: Math.round(percentile(durations, 100)),
  }
}

function runBench(decisionsTarget: number): TimingStat[] {
  return BOT_DIFFICULTIES.map((d) => benchDifficulty(d, decisionsTarget))
}

function printTiming(stats: readonly TimingStat[]): void {
  console.log('\n── decision-time bench (µs per decision, decideSafely path) ──')
  console.log('  difficulty   decisions     mean      p50      p95      max')
  for (const s of stats) {
    console.log(
      `  ${s.difficulty.padEnd(11)}  ${String(s.decisions).padStart(8)}  ${String(s.meanUs).padStart(7)}  ${String(s.p50Us).padStart(7)}  ${String(s.p95Us).padStart(7)}  ${String(s.maxUs).padStart(7)}`,
    )
  }
}

function printBaseline(r: ReturnType<typeof runBaseline>, timing: readonly TimingStat[]): void {
  console.log(`\n══ BOT BASELINE (group=${r.group}, seeds=${r.seedsUsed.length}, ${r.handsPerRun} hands/run, ${r.runs} runs, ${r.totalHands} hands) ══`)
  console.log('\n  integrity:')
  console.log(`    coin conservation   ${r.integrity.conserved ? 'OK ✅' : 'VIOLATED ❌'}`)
  console.log(`    defects             ${r.integrity.totalDefects}`)
  console.log(`    fallbacks           ${r.integrity.totalFallbacks}`)
  console.log(`    negative stacks     ${r.integrity.negativeStacks}`)
  console.log(`    fractional stacks   ${r.integrity.fractionalStacks}`)
  console.log('\n  per-difficulty behaviour (across all environments):')
  console.log('    difficulty   hands   VPIP%   PFR%  3bet%  AI%   SD%  SDwin%  topAct')
  for (const m of r.perDifficulty) {
    console.log(
      `    ${m.difficulty.padEnd(11)} ${String(m.handsDealtIn).padStart(6)}  ${m.vpipPct.toFixed(1).padStart(5)}  ${m.pfrPct.toFixed(1).padStart(5)}  ${m.threeBetPct.toFixed(1).padStart(5)}  ${m.allInHandPct.toFixed(1).padStart(4)}  ${m.showdownPct.toFixed(1).padStart(4)}  ${m.showdownWinPct.toFixed(1).padStart(5)}  ${m.topActionShare.toFixed(2)}`,
    )
  }
  printTiming(timing)
}

function main(): void {
  const [cmd, ...rest] = process.argv.slice(2)
  const args = parseArgs(rest)

  if (!cmd || cmd === 'list') {
    console.log('Bot simulation profiles:')
    for (const [k, v] of Object.entries(BOT_SIM_PROFILES)) {
      const mix = typeof v.difficulties === 'string' ? v.difficulties : v.difficulties.join('/')
      console.log(`  ${k.padEnd(14)} ${v.seatCount}-max  ${v.hands} hands  bb=${v.bigBlind}  stack=${v.startingStack}  [${mix}]`)
    }
    console.log('\nUsage: node lib/games/poker/bot/cli.ts run --profile <name> --seed <n> [--json]')
    console.log('   or: node lib/games/poker/bot/cli.ts run --seats 6 --hands 5000 --mix normal,normal,easy,easy,hard,simulation --seed 7')
    console.log('   or: node lib/games/poker/bot/cli.ts baseline --group calibration --seeds 4 --hands 200 [--json]')
    console.log('   or: node lib/games/poker/bot/cli.ts bench --decisions 3000 [--json]')
    return
  }

  if (cmd === 'run') {
    const config = configFromArgs(args)
    const seedRaw = args.seed ?? '1'
    const seed = /^\d+$/.test(seedRaw) ? Number(seedRaw) : seedRaw
    const r = runBotSimulation(config, seed)
    if (args.json) { console.log(JSON.stringify(r, null, 2)); return }
    printReport(r)
    process.exit(r.conserved && r.defects.length === 0 ? 0 : 1)
  }

  if (cmd === 'soak') {
    const config = configFromArgs(args)
    const seeds = (args.seeds ?? '1,2,3,4,5').split(',').map((x) => x.trim())
    console.log(`\nSoak across ${seeds.length} seeds  (${config.seatCount}-max, ${config.hands} hands each):`)
    console.log('  seed        conserved   defects   showdowns   sidePots   allIn')
    let anyBad = false
    for (const sd of seeds) {
      const seed = /^\d+$/.test(sd) ? Number(sd) : sd
      const r = runBotSimulation(config, seed)
      if (!r.conserved || r.defects.length > 0) anyBad = true
      console.log(
        `  ${sd.padEnd(10)}  ${(r.conserved ? 'OK' : 'BAD').padEnd(9)}   ${String(r.defects.length).padStart(6)}   ${String(r.showdowns).padStart(8)}   ${String(r.sidePotHands).padStart(7)}   ${String(r.allInHands).padStart(5)}`,
      )
    }
    process.exit(anyBad ? 1 : 0)
  }

  if (cmd === 'bench') {
    const decisions = Number(args.decisions ?? '2000')
    const timing = runBench(decisions)
    if (args.json) { console.log(JSON.stringify(timing, null, 2)); return }
    printTiming(timing)
    return
  }

  if (cmd === 'baseline') {
    const group = (args.group ?? 'calibration') as SeedGroupName
    if (!(group in SEED_GROUPS)) {
      console.error(`Unknown seed group "${group}". Try: calibration | validation | holdout`)
      process.exit(1)
    }
    if (group === 'holdout' && args['confirm-holdout-final'] !== 'true') {
      // Guardrail: the holdout set is reserved for the FINAL 27C-C gate. Refuse casual use — the
      // 27C-C validation must pass --confirm-holdout-final to open it (exactly once, frozen config).
      console.error('Refusing to run the HOLDOUT group without --confirm-holdout-final (reserved for the 27C-C gate).')
      process.exit(1)
    }
    const report = runBaseline({
      group,
      seedCount: Number(args.seeds ?? '4'),
      handsPerRun: Number(args.hands ?? '200'),
      bigBlind: Number(args.bb ?? '100'),
      includeMixed: args.mixed !== 'false',
    })
    const timing = args.timing === 'false' ? [] : runBench(Number(args.decisions ?? '2000'))
    if (args.json) { console.log(JSON.stringify({ ...report, timing }, null, 2)); return }
    printBaseline(report, timing)
    process.exit(report.integrity.conserved && report.integrity.totalDefects === 0 ? 0 : 1)
  }

  if (cmd === 'validate') {
    // The FINAL 27C-C gate: measure the FROZEN calibrated bots vs the FIXED benchmark opponents on
    // the reserved HOLDOUT seeds. Must be explicitly confirmed; refuses to open holdout otherwise.
    const group = (args.group ?? 'holdout') as SeedGroupName
    if (!(group in SEED_GROUPS)) {
      console.error(`Unknown seed group "${group}". Try: calibration | validation | holdout`)
      process.exit(1)
    }
    if (group === 'holdout' && args['confirm-holdout-final'] !== 'true') {
      console.error('Refusing to open HOLDOUT without --confirm-holdout-final (the 27C-C gate opens it exactly once, frozen).')
      process.exit(1)
    }
    const tableArg = args.tables ?? 'hu-standard,hu-short,hu-deep,6max-standard'
    const tables = tableArg.split(',').map((t) => t.trim()).map((label) => {
      const spec = VALIDATE_TABLES[label]
      if (!spec) {
        console.error(`Unknown table "${label}". Try: ${Object.keys(VALIDATE_TABLES).join(', ')}`)
        process.exit(1)
      }
      return spec
    })
    const benchArg = args.benchmarks
    const benchmarks = (benchArg ? benchArg.split(',').map((b) => b.trim()) : BENCHMARK_IDS) as BenchmarkId[]
    const report = runEvalMatrix({
      group,
      seedCount: args.seeds ? Number(args.seeds) : undefined,
      handsPerSeed: Number(args.hands ?? '200'),
      bigBlind: Number(args.bb ?? '100'),
      benchmarks,
      tables,
    })
    if (args.json) { console.log(JSON.stringify(report, null, 2)); return }
    printValidate(report)
    const clean = report.integrity.conserved && report.integrity.defects === 0 &&
      report.integrity.stuckHands === 0 && report.integrity.canonicalMismatches === 0 &&
      report.integrity.negativeStacks === 0 && report.integrity.fractionalStacks === 0
    process.exit(clean ? 0 : 1)
  }

  if (cmd === 'independent') {
    // Prompt 27D INDEPENDENT re-evaluation of the FROZEN calibrated bots on a FRESH seed group,
    // extended benchmark archetypes, and a full player-count × stack matrix. Evaluation-only; enables
    // nothing. Frozen strategy version is stamped into the report for provenance.
    const opponentArg = args.opponents
    const opponents = (opponentArg ? opponentArg.split(',').map((s) => s.trim()) : ALL_OPPONENT_IDS) as OpponentId[]
    const pickTables = (raw: string | undefined, fallback: readonly string[]): TableShape[] =>
      (raw ? raw.split(',').map((s) => s.trim()) : fallback).map((label) => {
        const spec = INDIE_TABLES[label]
        if (!spec) {
          console.error(`Unknown table "${label}". Try: ${Object.keys(INDIE_TABLES).join(', ')}`)
          process.exit(1)
        }
        return spec
      })
    const report = runIndependent({
      strategyVersion: STRATEGY_VERSION,
      seeds: INDEPENDENT_SEEDS.slice(0, args.seeds ? Number(args.seeds) : undefined),
      bigBlind: Number(args.bb ?? '100'),
      opponents,
      matchupTables: args.tables ? pickTables(args.tables, []) : undefined,
      matchupSeedCount: args['matchup-seeds'] ? Number(args['matchup-seeds']) : undefined,
      handsPerSeed: args.hands ? Number(args.hands) : undefined,
      selfPlayHands: args['selfplay-hands'] ? Number(args['selfplay-hands']) : undefined,
      mixedHands: args['mixed-hands'] ? Number(args['mixed-hands']) : undefined,
      // Live progress to STDERR so `--json` stdout stays a clean single document. `--quiet` mutes it.
      onProgress: args.quiet === 'true' ? undefined : (msg: string) => console.error(msg),
    })
    if (args.json) { console.log(JSON.stringify(report, null, 2)); return }
    printIndependent(report)
    const g = report.integrity
    const clean = g.conserved && g.defects === 0 && g.stuckHands === 0 &&
      g.canonicalMismatches === 0 && g.negativeStacks === 0 && g.fractionalStacks === 0
    process.exit(clean ? 0 : 1)
  }

  console.error(`Unknown command "${cmd}". Try: list | run | soak | baseline | bench | validate | independent`)
  process.exit(1)
}

function printIndependent(r: IndependentReport): void {
  console.log(`\n══ 27D INDEPENDENT EVALUATION (strategy=${r.strategyVersion}, seeds=${r.seedsUsed.length}, fresh=${r.seedsFresh ? 'YES' : 'NO'}, ${r.totalHands} hands) ══`)
  console.log('\n  pooled integrity (entire run):')
  console.log(`    coin conservation     ${r.integrity.conserved ? 'OK ✅' : 'VIOLATED ❌'}`)
  console.log(`    defects               ${r.integrity.defects}`)
  console.log(`    canonical mismatches  ${r.integrity.canonicalMismatches}`)
  console.log(`    stuck hands           ${r.integrity.stuckHands}`)
  console.log(`    fallbacks             ${r.integrity.fallbacks}`)
  console.log(`    negative stacks       ${r.integrity.negativeStacks}`)
  console.log(`    fractional stacks     ${r.integrity.fractionalStacks}`)

  console.log('\n  self-play difficulty ladder (behavioural fingerprint on fresh seeds):')
  console.log('    table            diff    hands   VPIP%   PFR%  3bet%  AI%   SD%  SDwin%  topAct')
  for (const s of r.selfPlay) {
    const m = s.metrics
    console.log(
      `    ${s.table.padEnd(14)} ${m.difficulty.padEnd(6)} ${String(m.handsDealtIn).padStart(6)}  ${m.vpipPct.toFixed(1).padStart(5)}  ${m.pfrPct.toFixed(1).padStart(5)}  ${m.threeBetPct.toFixed(1).padStart(5)}  ${m.allInHandPct.toFixed(1).padStart(4)}  ${m.showdownPct.toFixed(1).padStart(4)}  ${m.showdownWinPct.toFixed(1).padStart(5)}  ${m.topActionShare.toFixed(2)}`,
    )
  }

  console.log('\n  winrate vs fixed benchmarks (bb/100 of bot under test, 95% CI; oppBB = benchmark net):')
  console.log('    table          diff    opponent          mean    CI95lo   CI95hi  beats0   oppBB')
  for (const m of r.matchups) {
    const w = m.winrate
    console.log(
      `    ${m.table.padEnd(14)} ${m.difficulty.padEnd(6)} ${m.opponent.padEnd(15)} ${String(w.mean).padStart(8)} ${String(w.ci95Lo).padStart(8)} ${String(w.ci95Hi).padStart(8)}   ${(w.beatsZero ? 'yes' : 'no').padEnd(3)}  ${String(m.opponentBbPer100).padStart(7)}`,
    )
  }

  console.log('\n  mixed-field soak (heterogeneous 6-max — integrity + coverage):')
  console.log('    table            hands   showdowns  sidePots   allIn   conserved  defects')
  for (const s of r.mixedSoak) {
    console.log(
      `    ${s.table.padEnd(14)} ${String(s.totalHands).padStart(6)}  ${String(s.showdowns).padStart(9)}  ${String(s.sidePotHands).padStart(8)}  ${String(s.allInHands).padStart(6)}  ${(s.integrity.conserved ? 'OK' : 'BAD').padEnd(9)}  ${String(s.integrity.defects).padStart(7)}`,
    )
  }
}

// Named table shapes the 27C-C validate matrix seats (bot-under-test + benchmark copies).
const VALIDATE_TABLES: Readonly<Record<string, { seatCount: number; stack: StackCategory }>> = {
  'hu-standard': { seatCount: 2, stack: 'standard' },
  'hu-short': { seatCount: 2, stack: 'short' },
  'hu-deep': { seatCount: 2, stack: 'deep' },
  '3max-standard': { seatCount: 3, stack: 'standard' },
  '6max-standard': { seatCount: 6, stack: 'standard' },
  '6max-short': { seatCount: 6, stack: 'short' },
}

function printValidate(r: EvalMatrixReport): void {
  console.log(`\n══ 27C-C VALIDATION (group=${r.group}, seeds=${r.seedsUsed.length}, ${r.handsPerSeed} hands/seed, ${r.totalHands} hands) ══`)
  console.log('\n  integrity (pooled across every matchup):')
  console.log(`    coin conservation     ${r.integrity.conserved ? 'OK ✅' : 'VIOLATED ❌'}`)
  console.log(`    defects               ${r.integrity.defects}`)
  console.log(`    canonical mismatches  ${r.integrity.canonicalMismatches}`)
  console.log(`    stuck hands           ${r.integrity.stuckHands}`)
  console.log(`    fallbacks             ${r.integrity.fallbacks}`)
  console.log(`    negative stacks       ${r.integrity.negativeStacks}`)
  console.log(`    fractional stacks     ${r.integrity.fractionalStacks}`)
  console.log('\n  winrate (bb/100 of the bot under test, 95% CI across seeds):')
  console.log('    table            bot      benchmark      mean     CI95lo    CI95hi   beats0')
  for (const m of r.matchups) {
    const tbl = `${m.seatCount}p-${m.stack}`
    const w = m.winrate
    console.log(
      `    ${tbl.padEnd(14)} ${m.difficulty.padEnd(7)} ${m.benchmark.padEnd(12)} ${String(w.mean).padStart(8)} ${String(w.ci95Lo).padStart(9)} ${String(w.ci95Hi).padStart(9)}   ${w.beatsZero ? 'yes' : 'no'}`,
    )
  }
}

main()
