// ─────────────────────────────────────────────────────────────────────────────
// Training / simulation / evaluation CLI.  Run with Node's native TS:
//
//   node lib/games/tlmn/sim/cli.ts scenarios [--difficulty expert]
//   node lib/games/tlmn/sim/cli.ts sim       --candidate aiHard --games 200 --seed 42
//   node lib/games/tlmn/sim/cli.ts eval      --candidate aiExpert --baseline currentProduction --games 400
//   node lib/games/tlmn/sim/cli.ts train     --games 150 --valid 300 --gens 16 --pop 40 --seed 20260629
//   node lib/games/tlmn/sim/cli.ts holdout   --candidate aiExpert --baselines currentProduction,expertV1 --seeds 2500
//   node lib/games/tlmn/sim/cli.ts stress    --games 4000 --seed 1
//   node lib/games/tlmn/sim/cli.ts replay    [--difficulty expert]
//   node lib/games/tlmn/sim/cli.ts timing    --games 200
//   node lib/games/tlmn/sim/cli.ts distribution --seeds 400
//   node lib/games/tlmn/sim/cli.ts cycle     --train 150 --valid 400 --holdout 2500 --gens 16 --pop 40 --seed 20260629
//   node lib/games/tlmn/sim/cli.ts smoke
//
// (package.json exposes npm run tlmn:sim / tlmn:eval / tlmn:train / tlmn:scenarios.)
// Reports are written to lib/games/tlmn/sim/reports/<runId>.json.
// ─────────────────────────────────────────────────────────────────────────────
import { makePolicy, type SimulationPolicyName } from './policies.ts'
import { runSelfPlay } from './selfPlay.ts'
import { evaluateCandidate, fitness, type EvalMetrics } from './evaluation.ts'
import { pairedWinRateDiff } from './stats.ts'
import { optimizeWeights } from './optimizer.ts'
import { runScenarios, type DecideFn } from './scenarios.ts'
import { runGame, type SimPolicy } from './simulator.ts'
import { runAllReplays } from './replays.ts'
import { makeRng } from '../ai/seededRandom.ts'
import { chooseAiMove, policyViewFromRound } from '../ai/index.ts'
import { seedRange, trainingSeeds, validationSeeds, holdoutSeeds } from './seeds.ts'
import { POLICY_BASELINE, POLICY_EXPERT, type BotStrategyWeights } from '../ai/weights.ts'
import { writeReport, runId, sourceCommit, seedSetMetadata, type TrainingReport } from './report.ts'

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) { out[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true' }
  }
  return out
}

const DEFAULT_FIELD: SimulationPolicyName[] = ['lowestLegal', 'greedyCardReduction', 'defensive', 'combinationPreserver']
const DIVERSE_FIELD: SimulationPolicyName[] = [
  'lowestLegal', 'greedyCardReduction', 'defensive', 'combinationPreserver',
  'aggressiveControl', 'bombConserver', 'bombAggressor', 'singleCardBlocker',
  'highCardConserver', 'endgameSpecialist', 'currentProduction', 'expertV1',
]

function fieldFrom(arg: string | undefined, fallback = DEFAULT_FIELD): SimulationPolicyName[] {
  if (!arg || arg === 'true') return fallback
  return arg.split(',').map(s => s.trim()) as SimulationPolicyName[]
}

function topMoveTypes(d: Record<string, number>): string {
  const total = Object.values(d).reduce((a, b) => a + b, 0) || 1
  return Object.entries(d).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${((v / total) * 100).toFixed(1)}%`).join(' ')
}

function printMetrics(label: string, m: EvalMetrics): void {
  console.log(`\n== ${label} ==`)
  console.log(`games               ${m.games}`)
  console.log(`winRate             ${(m.winRate * 100).toFixed(2)}%`)
  console.log(`winRate by seat     ${Object.entries(m.winRateBySeat).map(([s, w]) => `${s}:${(w * 100).toFixed(1)}%`).join('  ')}`)
  console.log(`winRate vs field    ${Object.entries(m.winRateVsField).map(([k, w]) => `${k}=${(w * 100).toFixed(1)}%`).join('  ')}`)
  console.log(`avgFinishPos        ${m.avgFinishPosition.toFixed(3)} (0=win)`)
  console.log(`avgRemainOnLoss     ${m.avgRemainingOnLoss.toFixed(2)}`)
  console.log(`forcedWinConvert    ${(m.forcedWinConversionRate * 100).toFixed(2)}%`)
  console.log(`oneCardBlockRate    ${(m.oneCardBlockRate * 100).toFixed(2)}%`)
  console.log(`missedImmediateWin  ${(m.missedImmediateWinRate * 100).toFixed(2)}%`)
  console.log(`avoidableLossRate   ${(m.avoidableLossRate * 100).toFixed(2)}%`)
  console.log(`moveTypes           ${topMoveTypes(m.moveTypeDistribution)}  pass:${(m.passRate * 100).toFixed(1)}% chops:${m.chopCount}`)
  console.log(`illegalMoves        ${m.illegalMoveCount}`)
  console.log(`decisionTime ms     mean ${m.decisionTimeMeanMs.toFixed(3)} median ${m.decisionTimeMedianMs.toFixed(3)} p95 ${m.decisionTimeP95Ms.toFixed(3)} p99 ${m.decisionTimeP99Ms.toFixed(3)} max ${m.decisionTimeMaxMs.toFixed(3)}`)
  console.log(`fitness             ${fitness(m).toFixed(2)}`)
}

// ── Scenario helpers ─────────────────────────────────────────────────────────
function scenarioSummary(policy: SimPolicy): { passed: number; total: number; failures: string[] } {
  const rng = makeRng('scenarios')
  const decide: DecideFn = (state, seat) => policy.decide(state, seat, rng, [])
  const results = runScenarios(decide)
  const failures = results.filter(r => !r.pass).map(r => `[${r.category}] ${r.name} -> ${r.detail}`)
  return { passed: results.length - failures.length, total: results.length, failures }
}

// ── Existing commands ────────────────────────────────────────────────────────
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
  const field = fieldFrom(args.field, DIVERSE_FIELD).map(n => makePolicy(n))
  const trainN = Number(args.games ?? 150)
  const validN = Number(args.valid ?? 300)
  const result = optimizeWeights({
    field,
    trainSeeds: trainingSeeds(trainN),
    validationSeeds: validationSeeds(validN),
    populationSize: Number(args.pop ?? 40),
    generations: Number(args.gens ?? 16),
    seed: args.seed ?? 'train',
    warmStarts: [POLICY_EXPERT.weights],
  })
  console.log('Generations:')
  for (const h of result.history) console.log(`  gen ${h.generation}: best ${h.bestFitness.toFixed(2)}  mean ${h.meanFitness.toFixed(2)}`)
  console.log(`\nBest train fitness ${result.bestTrainFitness.toFixed(2)}   validation fitness ${result.bestValidationFitness.toFixed(2)}`)
  console.log('\nBest weights:')
  console.log(JSON.stringify(result.best, null, 2))

  const holdout = holdoutSeeds(Number(args.holdout ?? 400))
  const trained = makePolicy('candidateTrained', { difficulty: 'hard', weights: result.best as BotStrategyWeights })
  const baseline = makePolicy('currentProduction')
  const cand = evaluateCandidate({ candidate: trained, field, seeds: holdout })
  const base = evaluateCandidate({ candidate: baseline, field, seeds: holdout })
  printMetrics('HOLDOUT trained', cand)
  printMetrics('HOLDOUT baseline (currentProduction)', base)
  console.log(`\nΔ winRate: ${((cand.winRate - base.winRate) * 100).toFixed(2)} pts  (baseline policy version ${POLICY_BASELINE.version})`)
}

// ── New: holdout with paired statistics ──────────────────────────────────────
function evalForPairing(candidate: SimPolicy, field: SimPolicy[], seeds: string[]): EvalMetrics {
  return evaluateCandidate({ candidate, field, seeds, collectPerGame: true })
}

function cmdHoldout(args: Record<string, string>): TrainingReport {
  const candName = (args.candidate ?? 'aiExpert') as SimulationPolicyName
  const candWeights = args.candidateWeights ? JSON.parse(args.candidateWeights) as BotStrategyWeights : undefined
  const candidate = makePolicy(candName, { difficulty: 'expert', weights: candWeights })
  const baselineNames = fieldFrom(args.baselines, ['currentProduction', 'expertV1'] as SimulationPolicyName[])
  const field = fieldFrom(args.field, DIVERSE_FIELD).map(n => makePolicy(n))
  const n = Number(args.seeds ?? 2500)
  const bootstrap = Number(args.bootstrap ?? 5000)
  const seeds = holdoutSeeds(n)

  console.log(`HOLDOUT: ${candName} vs baselines [${baselineNames.join(', ')}] over ${n} seeds ×4 seats = ${n * 4} games each, field=[${field.map(f => f.name).join(', ')}]`)
  const cand = evalForPairing(candidate, field, seeds)
  printMetrics(`candidate ${candName}`, cand)

  const holdoutEvals = [{ label: candName, metrics: { ...cand, perGame: undefined } }]
  const paired: TrainingReport['paired'] = []
  for (const bn of baselineNames) {
    const baseline = makePolicy(bn, { difficulty: bn.startsWith('ai') || bn === 'expertV1' ? 'expert' : undefined })
    const base = evalForPairing(baseline, field, seeds)
    printMetrics(`baseline ${bn}`, base)
    const pr = pairedWinRateDiff(cand.perGame!, base.perGame!, { bootstrap, seed: `pair-${bn}` })
    console.log(`\n── PAIRED vs ${bn} (same deals+seats, n=${pr.pairs}) ──`)
    console.log(`cand ${(pr.candWinRate * 100).toFixed(2)}%  base ${(pr.baseWinRate * 100).toFixed(2)}%  Δ ${(pr.diff * 100).toFixed(2)} pts`)
    console.log(`bootstrap 95% CI [${(pr.bootstrapLow * 100).toFixed(2)}, ${(pr.bootstrapHigh * 100).toFixed(2)}] pts   normal 95% CI [${(pr.normalLow * 100).toFixed(2)}, ${(pr.normalHigh * 100).toFixed(2)}] pts`)
    console.log(`discordant: cand-only wins ${pr.discordantCandWins}, base-only wins ${pr.discordantBaseWins}   SIGNIFICANT(lower>0): ${pr.significant}`)
    holdoutEvals.push({ label: bn, metrics: { ...base, perGame: undefined } })
    paired.push({ label: bn, result: pr })
  }

  const report: TrainingReport = {
    runId: runId('holdout'), createdAt: new Date().toISOString(), sourceCommit: sourceCommit(),
    configuration: { command: 'holdout', candidate: candName, baselines: baselineNames, seeds: n, bootstrap, field: field.map(f => f.name) },
    seedSets: seedSetMetadata(0, 0, n), opponentField: field.map(f => f.name),
    candidateVersion: candName, candidateWeights: candWeights ?? null,
    holdout: holdoutEvals, paired,
    scenarios: scenarioSummaryReport(candidate),
    promotedPolicy: null, rejectionReasons: [],
  }
  const path = writeReport(report)
  console.log(`\nReport written: ${path}`)
  return report
}

function scenarioSummaryReport(policy: SimPolicy): TrainingReport['scenarios'] {
  const s = scenarioSummary(policy)
  return { total: s.total, passed: s.passed, failures: s.failures }
}

// ── New: randomized legality stress test ─────────────────────────────────────
function cmdStress(args: Record<string, string>): void {
  const games = Number(args.games ?? 4000)
  const base = Number(args.seed ?? 1)
  const pool: SimulationPolicyName[] = [
    'randomLegal', 'lowestLegal', 'greedyCardReduction', 'combinationPreserver', 'defensive',
    'currentProduction', 'aggressiveControl', 'bombConserver', 'bombAggressor', 'singleCardBlocker',
    'highCardConserver', 'endgameSpecialist', 'aiNormal', 'aiHard', 'aiExpert', 'expertV1',
  ]
  let illegal = 0
  let truncated = 0
  let noWinner = 0
  const rng = makeRng(`stress-${base}`)
  for (let i = 0; i < games; i++) {
    const policies: SimPolicy[] = Array.from({ length: 4 }, () => makePolicy(pool[(rng() * pool.length) | 0], { difficulty: 'expert' }))
    const res = runGame({ seed: `stress-${base}-${i}`, policies, auditSeat: (rng() * 4) | 0 })
    illegal += res.illegalMoveCount
    if (res.turns >= 600) truncated++
    if (res.winnerSeat === null) noWinner++
    // Multi-card truncation guard: every played combo must be a valid combo of its length.
  }
  console.log(`STRESS: ${games} random 4-policy games (mixed expert/heuristics)`)
  console.log(`illegalMoves        ${illegal}`)
  console.log(`truncated games     ${truncated}`)
  console.log(`games without winner ${noWinner}`)
  console.log(illegal === 0 && truncated === 0 && noWinner === 0 ? 'RESULT: PASS — zero illegal moves, every game terminates with a winner.' : 'RESULT: FAIL — investigate.')
  if (illegal || truncated || noWinner) process.exitCode = 1
}

// ── New: production-integration replays ──────────────────────────────────────
function cmdReplay(args: Record<string, string>): void {
  const difficulty = (args.difficulty ?? 'expert') as 'expert' | 'hard'
  const weights = args.weights ? JSON.parse(args.weights) as BotStrategyWeights : undefined
  const results = runAllReplays({ difficulty, weights })
  for (const r of results) {
    console.log(`\n■ ${r.name}  (expect: ${r.expect})`)
    console.log(`  publicState: seat ${r.publicState.mySeat}  table ${r.publicState.table ?? '(leading)'}  opponents ${r.publicState.opponents.map(o => `s${o.seat}:${o.cardsLeft}${o.actsNext ? '*' : ''}${o.passed ? '(passed)' : ''}`).join(' ')}`)
    console.log(`  botHand: ${r.botHand.join(' ')}`)
    console.log(`  legalCandidates(${r.legalCandidates.length}): ${r.legalCandidates.slice(0, 12).join(' ')}${r.legalCandidates.length > 12 ? ' …' : ''}`)
    console.log(`  selected: ${r.selectedMove}  type=${r.moveType ?? '-'}  usedSearch=${r.usedSearch}`)
    console.log(`  explanation: ${r.scoreExplanation}`)
    console.log(`  submittedCardIds: [${r.submittedCardIds.join(', ')}]`)
    console.log(`  validatorResult: ${r.validatorResult}   resultingHandSize: ${r.resultingHandSize}   roundEnded: ${r.roundEnded}`)
  }
  const allLegal = results.every(r => r.validatorResult === 'ok')
  console.log(`\n${results.length} replays  validator-legal: ${allLegal}`)
  if (!allLegal) process.exitCode = 1
}

// ── New: timing probe (search usage + p99/max under real play) ───────────────
function cmdTiming(args: Record<string, string>): void {
  const games = Number(args.games ?? 200)
  const seeds = holdoutSeeds(games)
  const times: number[] = []
  let searchUses = 0
  let decisions = 0
  const recording: SimPolicy = {
    name: 'aiExpertTimed',
    decide: (state, seat, _rng, seen) => {
      const view = policyViewFromRound(state, seat, seen)
      const t0 = performance.now()
      const ai = chooseAiMove(view, { difficulty: 'expert' })
      times.push(performance.now() - t0)
      decisions++
      if (ai.usedSearch) searchUses++
      return ai.move
    },
  }
  const field = DIVERSE_FIELD.slice(0, 4).map(n => makePolicy(n))
  evaluateCandidate({ candidate: recording, field, seeds })
  times.sort((a, b) => a - b)
  const pct = (q: number) => times[Math.min(times.length - 1, Math.floor(q * times.length))]
  const mean = times.reduce((a, b) => a + b, 0) / times.length
  console.log(`TIMING: expert AI over ${decisions} real decisions (${games} seeds ×4 seats)`)
  console.log(`mean   ${mean.toFixed(3)} ms`)
  console.log(`median ${pct(0.5).toFixed(3)} ms`)
  console.log(`p95    ${pct(0.95).toFixed(3)} ms`)
  console.log(`p99    ${pct(0.99).toFixed(3)} ms`)
  console.log(`max    ${times[times.length - 1].toFixed(3)} ms`)
  console.log(`searchUsageRate ${((searchUses / decisions) * 100).toFixed(2)}%  (${searchUses} of ${decisions})`)
}

// ── New: move-type distribution comparison ───────────────────────────────────
function cmdDistribution(args: Record<string, string>): void {
  const seeds = holdoutSeeds(Number(args.seeds ?? 400))
  const field = DIVERSE_FIELD.slice(0, 4).map(n => makePolicy(n))
  for (const name of ['currentProduction', 'expertV1', 'aiExpert'] as SimulationPolicyName[]) {
    const m = evaluateCandidate({ candidate: makePolicy(name, { difficulty: 'expert' }), field, seeds })
    console.log(`\n${name}: win ${(m.winRate * 100).toFixed(1)}%  moveTypes ${topMoveTypes(m.moveTypeDistribution)}  pass ${(m.passRate * 100).toFixed(1)}%  chops ${m.chopCount}`)
  }
}

// ── New: full rigorous cycle ─────────────────────────────────────────────────
function cmdCycle(args: Record<string, string>): void {
  const trainN = Number(args.train ?? 150)
  const validN = Number(args.valid ?? 400)
  const holdoutN = Number(args.holdout ?? 2500)
  const pop = Number(args.pop ?? 40)
  const gens = Number(args.gens ?? 16)
  const seed = args.seed ?? '20260629'
  const bootstrap = Number(args.bootstrap ?? 5000)
  const trainField = fieldFrom(args.field, DIVERSE_FIELD).map(n => makePolicy(n))
  const holdField = DIVERSE_FIELD.slice(0, 4).map(n => makePolicy(n))

  console.log(`\n===== TLMN RIGOROUS TRAINING CYCLE =====`)
  console.log(`train=${trainN}×4 valid=${validN}×4 holdout=${holdoutN}×4 pop=${pop} gens=${gens} seed=${seed}`)
  console.log(`train field: ${trainField.map(f => f.name).join(', ')}`)

  // STAGE A+B — optimize (screen on train seeds, rank survivors on validation).
  const t0 = Date.now()
  const opt = optimizeWeights({
    field: trainField, trainSeeds: trainingSeeds(trainN), validationSeeds: validationSeeds(validN),
    populationSize: pop, generations: gens, seed,
    warmStarts: [POLICY_EXPERT.weights], // never regress below current production
    // Constrained optimization: keep the gate's safety behaviour during the search.
    minOneCardBlock: Number(args.minBlock ?? 0.77),
    scenarioPenalty: 30,
  })
  console.log(`\nStage A/B optimize done in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  for (const h of opt.history) console.log(`  gen ${h.generation}: best ${h.bestFitness.toFixed(2)}  mean ${h.meanFitness.toFixed(2)}`)
  console.log(`finalists (validation fitness): ${opt.finalists.slice(0, 5).map(f => f.validationFitness.toFixed(2)).join(', ')}`)

  // STAGE C — large UNSEEN holdout. Candidate = best finalist evaluated at expert
  // (production difficulty). Compare vs legacy + expert-v1 with paired CIs.
  const holdSeeds = holdoutSeeds(holdoutN)
  const candWeights = opt.best
  const candidate = makePolicy('candidateTrained', { difficulty: 'expert', weights: candWeights })
  console.log(`\nStage C holdout: ${holdoutN}×4 = ${holdoutN * 4} games per policy at difficulty=expert`)
  const cand = evalForPairing(candidate, holdField, holdSeeds)
  printMetrics('CANDIDATE (trained, expert)', cand)

  const baselines: Array<{ name: SimulationPolicyName; label: string }> = [
    { name: 'currentProduction', label: 'legacy (currentProduction)' },
    { name: 'expertV1', label: 'expert-2026-06-v1' },
  ]
  const holdoutEvals: TrainingReport['holdout'] = [{ label: 'candidate', metrics: { ...cand, perGame: undefined } }]
  const paired: TrainingReport['paired'] = []
  for (const b of baselines) {
    const base = evalForPairing(makePolicy(b.name, { difficulty: 'expert' }), holdField, holdSeeds)
    printMetrics(`BASELINE ${b.label}`, base)
    const pr = pairedWinRateDiff(cand.perGame!, base.perGame!, { bootstrap, seed: `pair-${b.name}` })
    console.log(`\n── PAIRED candidate vs ${b.label} (n=${pr.pairs}) ──`)
    console.log(`cand ${(pr.candWinRate * 100).toFixed(2)}%  base ${(pr.baseWinRate * 100).toFixed(2)}%  Δ ${(pr.diff * 100).toFixed(2)} pts`)
    console.log(`bootstrap 95% CI [${(pr.bootstrapLow * 100).toFixed(2)}, ${(pr.bootstrapHigh * 100).toFixed(2)}]  normal [${(pr.normalLow * 100).toFixed(2)}, ${(pr.normalHigh * 100).toFixed(2)}]`)
    console.log(`SIGNIFICANT(lower>0): ${pr.significant}`)
    holdoutEvals.push({ label: b.label, metrics: { ...base, perGame: undefined } })
    paired.push({ label: b.label, result: pr })
  }

  // Scenarios + replays for the candidate (gate inputs).
  const scen = scenarioSummary(candidate)
  console.log(`\nScenarios (candidate): ${scen.passed}/${scen.total} passed`)
  for (const f of scen.failures) console.log(`  FAIL ${f}`)
  const replays = runAllReplays({ difficulty: 'expert', weights: candWeights })
  const replaysLegal = replays.every(r => r.validatorResult === 'ok')
  console.log(`Replays (candidate): ${replays.filter(r => r.validatorResult === 'ok').length}/${replays.length} validator-legal`)

  // ── Promotion gate ──────────────────────────────────────────────────────────
  const legacy = paired.find(p => p.label.startsWith('legacy'))!.result
  const v1 = paired.find(p => p.label.startsWith('expert-2026'))!.result
  const v1Base = holdoutEvals.find(e => e.label.startsWith('expert-2026'))!.metrics
  const reasons: string[] = []
  if (cand.illegalMoveCount > 0) reasons.push(`candidate produced ${cand.illegalMoveCount} illegal moves`)
  for (const e of holdoutEvals) if (e.metrics.illegalMoveCount > 0) reasons.push(`${e.label} illegal moves ${e.metrics.illegalMoveCount}`)
  if (scen.passed !== scen.total) reasons.push(`scenarios failing: ${scen.failures.length}`)
  if (!replaysLegal) reasons.push('replay validator failure')
  if (!(cand.winRate > legacy.baseWinRate)) reasons.push(`win rate not above legacy (${(cand.winRate * 100).toFixed(2)}% vs ${(legacy.baseWinRate * 100).toFixed(2)}%)`)
  if (!(cand.winRate > v1.baseWinRate)) reasons.push(`win rate not above expert-v1 (${(cand.winRate * 100).toFixed(2)}% vs ${(v1.baseWinRate * 100).toFixed(2)}%)`)
  if (!(v1.significant && legacy.significant)) reasons.push('paired 95% CI lower bound not > 0 vs both baselines')
  if (cand.oneCardBlockRate < v1Base.oneCardBlockRate - 0.03) reasons.push(`one-card block regressed (${(cand.oneCardBlockRate * 100).toFixed(1)}% vs v1 ${(v1Base.oneCardBlockRate * 100).toFixed(1)}%)`)
  if (cand.forcedWinConversionRate < v1Base.forcedWinConversionRate - 0.03) reasons.push(`forced-win conversion regressed (${(cand.forcedWinConversionRate * 100).toFixed(1)}% vs v1 ${(v1Base.forcedWinConversionRate * 100).toFixed(1)}%)`)
  if (cand.decisionTimeP99Ms > 250) reasons.push(`p99 decision time ${cand.decisionTimeP99Ms.toFixed(1)}ms over budget`)

  const promote = reasons.length === 0
  console.log(`\n===== PROMOTION GATE: ${promote ? 'PASS — candidate may be promoted to expert-2026-06-v2' : 'FAIL — retain expert-2026-06-v1'} =====`)
  for (const r of reasons) console.log(`  ✗ ${r}`)

  const report: TrainingReport = {
    runId: runId('cycle'), createdAt: new Date().toISOString(), sourceCommit: sourceCommit(),
    configuration: { command: 'cycle', trainN, validN, holdoutN, pop, gens, seed, bootstrap, trainField: trainField.map(f => f.name), holdField: holdField.map(f => f.name) },
    seedSets: seedSetMetadata(trainN, validN, holdoutN), opponentField: holdField.map(f => f.name),
    candidateVersion: promote ? 'expert-2026-06-v2 (proposed)' : 'candidate (rejected)',
    candidateWeights: candWeights,
    trainHistory: opt.history,
    validation: opt.finalists.slice(0, 5).map((f, i) => ({ label: `finalist-${i}`, metrics: { games: 0, winRate: 0, firstPlaceRate: 0, winRateBySeat: {}, winRateVsField: {}, avgFinishPosition: 0, avgRemainingOnLoss: 0, illegalMoveCount: 0, missedImmediateWinRate: 0, avoidableLossRate: 0, forcedWinConversionRate: 0, oneCardBlockRate: 0, moveTypeDistribution: {}, passRate: 0, chopCount: 0, decisionTimeMeanMs: 0, decisionTimeMedianMs: 0, decisionTimeP95Ms: 0, decisionTimeP99Ms: 0, decisionTimeMaxMs: 0 } as EvalMetrics })),
    holdout: holdoutEvals,
    paired,
    scenarios: { total: scen.total, passed: scen.passed, failures: scen.failures },
    timing: { meanMs: cand.decisionTimeMeanMs, medianMs: cand.decisionTimeMedianMs, p95Ms: cand.decisionTimeP95Ms, p99Ms: cand.decisionTimeP99Ms, maxMs: cand.decisionTimeMaxMs },
    promotedPolicy: promote ? 'expert-2026-06-v2 (proposed — apply weights to ai/weights.ts)' : null,
    rejectionReasons: reasons,
  }
  // Store finalist validation fitness in configuration (the placeholder metrics above keep schema shape).
  report.configuration.finalistValidationFitness = opt.finalists.slice(0, 5).map(f => f.validationFitness)
  const path = writeReport(report)
  console.log(`\nReport written: ${path}`)
  console.log(`\nCandidate weights (for promotion if gate passes):\n${JSON.stringify(candWeights, null, 2)}`)
}

function cmdSmoke(): void {
  console.log('SMOKE TEST — tiny end-to-end sanity check')
  const field = DEFAULT_FIELD.map(n => makePolicy(n))
  const seeds = holdoutSeeds(20)
  const cand = evaluateCandidate({ candidate: makePolicy('aiExpert', { difficulty: 'expert' }), field, seeds, collectPerGame: true })
  const base = evaluateCandidate({ candidate: makePolicy('currentProduction'), field, seeds, collectPerGame: true })
  console.log(`expert win ${(cand.winRate * 100).toFixed(1)}%  legacy win ${(base.winRate * 100).toFixed(1)}%  illegal ${cand.illegalMoveCount}/${base.illegalMoveCount}`)
  const pr = pairedWinRateDiff(cand.perGame!, base.perGame!, { bootstrap: 1000 })
  console.log(`paired Δ ${(pr.diff * 100).toFixed(2)} pts  CI [${(pr.bootstrapLow * 100).toFixed(2)}, ${(pr.bootstrapHigh * 100).toFixed(2)}]`)
  const scen = scenarioSummary(makePolicy('aiExpert', { difficulty: 'expert' }))
  console.log(`scenarios ${scen.passed}/${scen.total}`)
  const replays = runAllReplays({ difficulty: 'expert' })
  console.log(`replays validator-legal ${replays.filter(r => r.validatorResult === 'ok').length}/${replays.length}`)
}

function main(): void {
  const [, , cmd, ...rest] = process.argv
  const args = parseArgs(rest)
  switch (cmd) {
    case 'scenarios': return cmdScenarios(args)
    case 'sim': return cmdSim(args)
    case 'eval': return cmdEval(args)
    case 'train': return cmdTrain(args)
    case 'holdout': { cmdHoldout(args); return }
    case 'stress': return cmdStress(args)
    case 'replay': return cmdReplay(args)
    case 'timing': return cmdTiming(args)
    case 'distribution': return cmdDistribution(args)
    case 'cycle': return cmdCycle(args)
    case 'smoke': return cmdSmoke()
    default:
      console.log('Usage: cli.ts <scenarios|sim|eval|train|holdout|stress|replay|timing|distribution|cycle|smoke> [--flags]')
      process.exitCode = 1
  }
}

main()
