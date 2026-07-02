// ─────────────────────────────────────────────────────────────────────────────
// Poker ECONOMY simulation CLI. Run with Node's native TS (Node 20+):
//
//   node lib/games/poker/sim/cli.ts list
//   node lib/games/poker/sim/cli.ts run  --scenario baseline --seed 42
//   node lib/games/poker/sim/cli.ts run  --scenario abuse_farm --seed 7 --json
//   node lib/games/poker/sim/cli.ts sweep --scenario baseline --seeds 1,2,3,4,5
//
// (package.json exposes: npm run poker:economy:list / :run / :sweep)
//
// PLAY-MONEY MODELING TOOL — deterministic given a seed. Not a prediction. See
// docs/poker/economy/simulation-assumptions.md.
// ─────────────────────────────────────────────────────────────────────────────
import { runEconomySimulation, SCENARIOS, type SimulationResult } from './economySim.ts'
import { formatCoinsShort } from '../../../game/economy.ts'

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      out[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true'
    }
  }
  return out
}

function printSummary(r: SimulationResult): void {
  const s = r.summary
  console.log(`\n── ${r.scenario}  (seed=${r.seed}, config=${r.config}, ${r.days.length} days) ──`)
  console.log(`  final players           ${s.finalPlayers}`)
  console.log(`  final total supply      ${formatCoinsShort(s.finalTotalCoins)} (${s.finalTotalCoins})`)
  console.log(`  faucet coins minted     ${formatCoinsShort(s.totalFaucetCoins)} (${s.totalFaucetCoins})`)
  console.log(`  total inflation         ${s.inflationPctTotal.toFixed(1)}%  (avg ${s.avgDailyInflationPct.toFixed(3)}%/day)`)
  console.log(`  final Gini              ${s.finalGini.toFixed(3)}`)
  console.log(`  top 1% share            ${(s.finalTop1PctShare * 100).toFixed(1)}%`)
  console.log(`  total busts             ${s.totalBusts}`)
  console.log(`  recovery claims         ${s.totalRecoveryClaims}`)
  console.log(`  chips dumped (transfer) ${formatCoinsShort(s.dumpedChipsTotal)} (${s.dumpedChipsTotal})`)
}

function main(): void {
  const [cmd, ...rest] = process.argv.slice(2)
  const args = parseArgs(rest)

  if (!cmd || cmd === 'list') {
    console.log('Scenarios:')
    for (const [k, v] of Object.entries(SCENARIOS)) {
      console.log(`  ${k.padEnd(14)} ${v.days}d  init=${v.initialPlayers}  +${v.dailyNewPlayers}/day  dumpers=${(v.dumperShare * 100).toFixed(0)}%`)
    }
    console.log('\nUsage: node lib/games/poker/sim/cli.ts run --scenario <name> --seed <n> [--json]')
    return
  }

  if (cmd === 'run') {
    const name = args.scenario ?? 'baseline'
    const scenario = SCENARIOS[name]
    if (!scenario) { console.error(`Unknown scenario "${name}". Try: ${Object.keys(SCENARIOS).join(', ')}`); process.exit(1) }
    const seed = args.seed ?? '1'
    const r = runEconomySimulation(scenario, /^\d+$/.test(seed) ? Number(seed) : seed)
    if (args.json) { console.log(JSON.stringify(r, null, 2)); return }
    printSummary(r)
    return
  }

  if (cmd === 'sweep') {
    const name = args.scenario ?? 'baseline'
    const scenario = SCENARIOS[name]
    if (!scenario) { console.error(`Unknown scenario "${name}".`); process.exit(1) }
    const seeds = (args.seeds ?? '1,2,3,4,5').split(',').map((x) => x.trim())
    console.log(`\nSweep of ${name} across ${seeds.length} seeds:`)
    console.log('  seed        inflation%   finalGini   top1%    busts   recovery')
    for (const sd of seeds) {
      const r = runEconomySimulation(scenario, /^\d+$/.test(sd) ? Number(sd) : sd)
      const s = r.summary
      console.log(
        `  ${sd.padEnd(10)}  ${s.inflationPctTotal.toFixed(1).padStart(8)}   ${s.finalGini.toFixed(3).padStart(8)}   ${(s.finalTop1PctShare * 100).toFixed(1).padStart(5)}   ${String(s.totalBusts).padStart(6)}   ${String(s.totalRecoveryClaims).padStart(6)}`,
      )
    }
    return
  }

  console.error(`Unknown command "${cmd}". Try: list | run | sweep`)
  process.exit(1)
}

main()
