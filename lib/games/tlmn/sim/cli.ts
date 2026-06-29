// ─────────────────────────────────────────────────────────────────────────────
// Training / simulation CLI.  Run with Node's native TS:
//
//   node lib/games/tlmn/sim/cli.ts scenarios
//   node lib/games/tlmn/sim/cli.ts sim   --candidate aiHard --games 200 --seed 42
//   node lib/games/tlmn/sim/cli.ts eval  --candidate aiExpert --baseline currentProduction --games 400
//   node lib/games/tlmn/sim/cli.ts train --games 60 --gens 6 --pop 12 --seed 7
//
// (package.json exposes npm run tlmn:sim / tlmn:eval / tlmn:train / tlmn:scenarios.)
// ─────────────────────────────────────────────────────────────────────────────
import { makePolicy, type SimulationPolicyName } from './policies.ts'
import { runSelfPlay } from './selfPlay.ts'
import { evaluateCandidate, fitness, type EvalMetrics } from './evaluation.ts'
import { optimizeWeights } from './optimizer.ts'
import { runScenarios } from './scenarios.ts'
import { makeRng } from '../ai/seededRandom.ts'
import { seedRange, trainingSeeds, validationSeeds, holdoutSeeds } from './seeds.ts'
import { POLICY_BASELINE, type BotStrategyWeights } from '../ai/weights.ts'

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) { out[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true' }
  }
  return out
}

const DEFAULT_FIELD: SimulationPolicyName[] = ['lowestLegal', 'greedyCardReduction', 'defensive', 'combinationPreserver']

function fieldFrom(arg: string | undefined): SimulationPolicyName[] {
  if (!arg || arg === 'true') return DEFAULT_FIELD
  return arg.split(',').map(s => s.trim()) as SimulationPolicyName[]
}

function printMetrics(label: string, m: EvalMetrics): void {
  console.log(`\n== ${label} ==`)
  console.log(`games               ${m.games}`)
  console.log(`winRate             ${(m.winRate * 100).toFixed(2)}%`)
  console.log(`winRate by seat     ${Object.entries(m.winRateBySeat).map(([s, w]) => `${s}:${(w * 100).toFixed(1)}%`).join('  ')}`)
  console.log(`winRate vs field    ${Object.entries(m.winRateVsField).map(([k, w]) => `${k}=${(w * 100).toFixed(1)}%`).join('  ')}`)
  console.log(`avgFinishPos        ${m.avgFinishPosition.toFixed(3)} (0=win)`)
  console.log(`avgRemainOnLoss     ${m.avgRemainingOnLoss.toFixed(2)}`)
  console.log(`missedImmediateWin  ${(m.missedImmediateWinRate * 100).toFixed(2)}%`)
  console.log(`avoidableLossRate   ${(m.avoidableLossRate * 100).toFixed(2)}%`)
  console.log(`illegalMoves        ${m.illegalMoveCount}`)
  console.log(`decisionTime mean   ${m.decisionTimeMeanMs.toFixed(3)} ms   p95 ${m.decisionTimeP95Ms.toFixed(3)} ms`)
  console.log(`fitness             ${fitness(m).toFixed(2)}`)
}

function cmdScenarios(args: Record<string, string>): void {
  const difficulty = (args.difficulty ?? 'expert') as 'easy' | 'normal' | 'hard' | 'expert'
  const policy = makePolicy('candidateTrained', { difficulty })
  const rng = makeRng('scenarios')
  const results = runScenarios((state, seat) => policy.decide(state, seat, rng, []))
  let pass = 0
  for (const r of results) { console.log(`${r.pass ? 'PASS' : 'FAIL'}  [${r.category}] ${r.name}  -> ${r.detail}`); if (r.pass) pass++ }
  console.log(`\n${pass}/${results.length} scenarios passed (difficulty=${difficulty})`)
  if (pass !== results.length) process.exitCode = 1
}

function cmdSim(args: Record<string, string>): void {
  const candidate = makePolicy((args.candidate ?? 'aiHard') as SimulationPolicyName)
  const field = fieldFrom(args.field).map(n => makePolicy(n))
  const games = Number(args.games ?? 200)
  const base = Number(args.seed ?? 42)
  const seeds = seedRange('sim', base, games)
  const report = runSelfPlay({ candidate, field, seeds })
  printMetrics(`sim: ${candidate.name} vs [${report.fieldNames.join(', ')}]`, report)
  console.log(`legal: ${report.legal}`)
}

function cmdEval(args: Record<string, string>): void {
  const candidate = makePolicy((args.candidate ?? 'aiExpert') as SimulationPolicyName)
  const baseline = makePolicy((args.baseline ?? 'currentProduction') as SimulationPolicyName)
  const field = fieldFrom(args.field).map(n => makePolicy(n))
  const n = Number(args.games ?? 400)
  const seeds = holdoutSeeds(n)
  const cand = evaluateCandidate({ candidate, field, seeds })
  const base = evaluateCandidate({ candidate: baseline, field, seeds })
  printMetrics(`HOLDOUT candidate: ${candidate.name}`, cand)
  printMetrics(`HOLDOUT baseline:  ${baseline.name}`, base)
  console.log(`\nΔ winRate (candidate − baseline): ${((cand.winRate - base.winRate) * 100).toFixed(2)} pts`)
  console.log(cand.winRate > base.winRate && cand.illegalMoveCount === 0 ? 'RESULT: candidate BEATS baseline on holdout.' : 'RESULT: candidate does NOT beat baseline on holdout.')
}

function cmdTrain(args: Record<string, string>): void {
  const field = fieldFrom(args.field).map(n => makePolicy(n))
  const trainN = Number(args.games ?? 60)
  const validN = Number(args.valid ?? 60)
  const result = optimizeWeights({
    field,
    trainSeeds: trainingSeeds(trainN),
    validationSeeds: validationSeeds(validN),
    populationSize: Number(args.pop ?? 12),
    generations: Number(args.gens ?? 6),
    seed: args.seed ?? 'train',
  })
  console.log('Generations:')
  for (const h of result.history) console.log(`  gen ${h.generation}: best ${h.bestFitness.toFixed(2)}  mean ${h.meanFitness.toFixed(2)}`)
  console.log(`\nBest train fitness ${result.bestTrainFitness.toFixed(2)}   validation fitness ${result.bestValidationFitness.toFixed(2)}`)
  console.log('\nBest weights (paste into POLICY_EXPERT in ai/weights.ts to promote):')
  console.log(JSON.stringify(result.best, null, 2))

  // Holdout comparison: trained candidate vs baseline.
  const holdout = holdoutSeeds(Number(args.holdout ?? 200))
  const trained = makePolicy('candidateTrained', { difficulty: 'hard', weights: result.best as BotStrategyWeights })
  const baseline = makePolicy('currentProduction')
  const cand = evaluateCandidate({ candidate: trained, field, seeds: holdout })
  const base = evaluateCandidate({ candidate: baseline, field, seeds: holdout })
  printMetrics('HOLDOUT trained', cand)
  printMetrics('HOLDOUT baseline (currentProduction)', base)
  console.log(`\nΔ winRate: ${((cand.winRate - base.winRate) * 100).toFixed(2)} pts  (baseline policy version ${POLICY_BASELINE.version})`)
}

function main(): void {
  const [, , cmd, ...rest] = process.argv
  const args = parseArgs(rest)
  switch (cmd) {
    case 'scenarios': return cmdScenarios(args)
    case 'sim': return cmdSim(args)
    case 'eval': return cmdEval(args)
    case 'train': return cmdTrain(args)
    default:
      console.log('Usage: cli.ts <scenarios|sim|eval|train> [--flags]')
      process.exitCode = 1
  }
}

main()
