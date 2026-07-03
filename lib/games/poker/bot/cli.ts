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
import { runBotSimulation, BOT_SIM_PROFILES, type BotSimConfig, type BotSimReport } from './sim.ts'
import { BOT_DIFFICULTIES, type BotDifficulty } from './policy.ts'

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

  console.error(`Unknown command "${cmd}". Try: list | run | soak`)
  process.exit(1)
}

main()
