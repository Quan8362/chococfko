// ─────────────────────────────────────────────────────────────────────────────
// Evaluation + fitness.
//
// evaluateCandidate runs the candidate against a FIELD of opponent policies over a
// seed set, ROTATING the candidate through every seat so seat-order bias cancels.
// It aggregates win rate (overall + by seat + by opponent field), finishing
// position, illegal moves, decision-time mean/median/p95/p99/max, move-type
// distribution, one-card-block rate, forced-win conversion, and decision-quality
// audits. With collectPerGame it also returns per-game records so two policies run
// over the SAME deals+seats can be compared with paired statistics (see stats.ts).
// fitness() folds these into one scalar with hard penalties for illegal moves.
// ─────────────────────────────────────────────────────────────────────────────
import { type Rules } from '../engine.ts'
import { runGame, type SimPolicy } from './simulator.ts'

export interface PerGameRecord {
  seed: string
  candSeat: number
  fieldKey: string
  won: boolean
  finishPos: number          // 0 = won
  remainingOnLoss: number    // cards left when not first (0 if won)
}

export interface EvalMetrics {
  games: number
  winRate: number
  firstPlaceRate: number     // for đếm-lá == winRate (single winner); kept explicit
  winRateBySeat: Record<number, number>
  winRateVsField: Record<string, number>
  avgFinishPosition: number
  avgRemainingOnLoss: number
  illegalMoveCount: number
  missedImmediateWinRate: number
  avoidableLossRate: number
  forcedWinConversionRate: number   // of games with an immediate-win opportunity, fraction won
  oneCardBlockRate: number          // of lead-turns vs a 1-card opp, fraction led a "hard" combo
  moveTypeDistribution: Record<string, number> // aggregate counts of the candidate's own plays
  passRate: number                  // candidate passes / candidate decisions
  chopCount: number                 // candidate bomb-cuts (chặt)
  decisionTimeMeanMs: number
  decisionTimeMedianMs: number
  decisionTimeP95Ms: number
  decisionTimeP99Ms: number
  decisionTimeMaxMs: number
  perGame?: PerGameRecord[]
}

export interface EvalOptions {
  candidate: SimPolicy
  field: SimPolicy[]          // opponent policies (cycled to fill the other seats)
  seeds: string[]
  playerCount?: number        // default 4
  ruleConfig?: Partial<Rules>
  collectPerGame?: boolean     // record per-game outcomes for paired statistics
}

function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]
}

export function evaluateCandidate(opts: EvalOptions): EvalMetrics {
  const playerCount = opts.playerCount ?? 4
  let games = 0
  let wins = 0
  let finishPosSum = 0
  let remainingOnLossSum = 0
  let lossCount = 0
  let illegal = 0
  let immediateWinsAvailable = 0
  let immediateWinsTaken = 0
  let riskyLeadLosses = 0
  let gamesWithWinOpp = 0
  let winsWithWinOpp = 0
  let oneCardOpps = 0
  let oneCardHardBlocks = 0
  let candPasses = 0
  let candPlays = 0
  let chopCount = 0
  const moveTypeDistribution: Record<string, number> = {}
  const decisionTimes: number[] = []
  const winsBySeat: Record<number, number> = {}
  const gamesBySeat: Record<number, number> = {}
  const winsVsField: Record<string, number> = {}
  const gamesVsField: Record<string, number> = {}
  const perGame: PerGameRecord[] | undefined = opts.collectPerGame ? [] : undefined

  for (const seed of opts.seeds) {
    // Rotate the candidate through every seat for this deal (same cards, fair seating).
    for (let candSeat = 0; candSeat < playerCount; candSeat++) {
      const policies: SimPolicy[] = []
      let fieldIdx = 0
      const fieldNames: string[] = []
      for (let s = 0; s < playerCount; s++) {
        if (s === candSeat) policies.push(opts.candidate)
        else { const f = opts.field[fieldIdx % opts.field.length]; fieldIdx++; policies.push(f); fieldNames.push(f.name) }
      }
      const fieldKey = fieldNames.slice().sort().join('+')

      const res = runGame({ seed: `${seed}#${candSeat}`, policies, playerCount, ruleConfig: opts.ruleConfig, auditSeat: candSeat })
      games++
      gamesBySeat[candSeat] = (gamesBySeat[candSeat] ?? 0) + 1
      gamesVsField[fieldKey] = (gamesVsField[fieldKey] ?? 0) + 1
      illegal += res.illegalMoveCount
      for (const t of res.decisionTimeMs) decisionTimes.push(t)

      const pos = res.finishOrder.indexOf(candSeat)
      const finishPos = pos >= 0 ? pos : playerCount - 1
      finishPosSum += finishPos
      const won = res.winnerSeat === candSeat
      let remainingOnLoss = 0
      if (won) { wins++; winsBySeat[candSeat] = (winsBySeat[candSeat] ?? 0) + 1; winsVsField[fieldKey] = (winsVsField[fieldKey] ?? 0) + 1 }
      else { lossCount++; remainingOnLoss = res.finalCardCounts[candSeat] ?? 0; remainingOnLossSum += remainingOnLoss }

      if (res.audit) {
        immediateWinsAvailable += res.audit.immediateWinsAvailable
        immediateWinsTaken += res.audit.immediateWinsTaken
        if (!won && res.audit.riskySingleLeadsUnderThreat > 0) riskyLeadLosses++
        if (res.audit.hadImmediateWinOpportunity) { gamesWithWinOpp++; if (won) winsWithWinOpp++ }
        oneCardOpps += res.audit.oneCardLeadOpportunities
        oneCardHardBlocks += res.audit.oneCardLeadHardBlocks
        candPasses += res.audit.passCount
        chopCount += res.audit.chopCount
        for (const [k, v] of Object.entries(res.audit.moveTypeCounts)) {
          moveTypeDistribution[k] = (moveTypeDistribution[k] ?? 0) + v
          candPlays += v
        }
      }

      if (perGame) perGame.push({ seed: String(seed), candSeat, fieldKey, won, finishPos, remainingOnLoss })
    }
  }

  const winRateBySeat: Record<number, number> = {}
  for (const s of Object.keys(gamesBySeat).map(Number)) winRateBySeat[s] = (winsBySeat[s] ?? 0) / gamesBySeat[s]
  const winRateVsField: Record<string, number> = {}
  for (const k of Object.keys(gamesVsField)) winRateVsField[k] = (winsVsField[k] ?? 0) / gamesVsField[k]

  const sortedTimes = decisionTimes.slice().sort((a, b) => a - b)
  const winRate = games ? wins / games : 0

  return {
    games,
    winRate,
    firstPlaceRate: winRate,
    winRateBySeat,
    winRateVsField,
    avgFinishPosition: games ? finishPosSum / games : 0,
    avgRemainingOnLoss: lossCount ? remainingOnLossSum / lossCount : 0,
    illegalMoveCount: illegal,
    missedImmediateWinRate: immediateWinsAvailable ? (immediateWinsAvailable - immediateWinsTaken) / immediateWinsAvailable : 0,
    avoidableLossRate: lossCount ? riskyLeadLosses / lossCount : 0,
    forcedWinConversionRate: gamesWithWinOpp ? winsWithWinOpp / gamesWithWinOpp : 0,
    oneCardBlockRate: oneCardOpps ? oneCardHardBlocks / oneCardOpps : 0,
    moveTypeDistribution,
    passRate: (candPlays + candPasses) ? candPasses / (candPlays + candPasses) : 0,
    chopCount,
    decisionTimeMeanMs: decisionTimes.length ? decisionTimes.reduce((a, b) => a + b, 0) / decisionTimes.length : 0,
    decisionTimeMedianMs: percentile(sortedTimes, 0.5),
    decisionTimeP95Ms: percentile(sortedTimes, 0.95),
    decisionTimeP99Ms: percentile(sortedTimes, 0.99),
    decisionTimeMaxMs: sortedTimes.length ? sortedTimes[sortedTimes.length - 1] : 0,
    perGame,
  }
}

// ── Fitness ────────────────────────────────────────────────────────────────────
// Priority order (per the production spec):
//   1) zero illegal moves (hard disqualify)   2) reduce avoidable immediate losses
//   3) convert immediate / forced wins          4) maximise win rate
//   5) improve average finish position          6) reduce cards remaining on losses
//   7) stay within the decision-time budget.
export const FITNESS = {
  WIN: 100,
  FIRST_PLACE: 30,
  MISSED_WIN_PENALTY: 50,
  AVOIDABLE_LOSS_PENALTY: 60,
  FORCED_WIN_BONUS: 25,           // reward converting games where a win was reachable
  FINISH_POSITION_PENALTY: 12,    // per avg finishing place above 0 (lower is better)
  REMAIN_ON_LOSS_PENALTY: 1.2,    // per avg card stranded on a loss (loss-severity)
  ILLEGAL_DISQUALIFY: 100000,
  TIMEOUT_PENALTY: 20,
  TIMEOUT_BUDGET_MS: 60,          // p95 decision budget; over this is penalised
}

export function fitness(m: EvalMetrics): number {
  if (m.illegalMoveCount > 0) return -FITNESS.ILLEGAL_DISQUALIFY * m.illegalMoveCount
  const timeoutOver = Math.max(0, m.decisionTimeP95Ms - FITNESS.TIMEOUT_BUDGET_MS) / FITNESS.TIMEOUT_BUDGET_MS
  return (
    m.winRate * FITNESS.WIN +
    m.firstPlaceRate * FITNESS.FIRST_PLACE +
    m.forcedWinConversionRate * FITNESS.FORCED_WIN_BONUS -
    m.missedImmediateWinRate * FITNESS.MISSED_WIN_PENALTY -
    m.avoidableLossRate * FITNESS.AVOIDABLE_LOSS_PENALTY -
    m.avgFinishPosition * FITNESS.FINISH_POSITION_PENALTY -
    m.avgRemainingOnLoss * FITNESS.REMAIN_ON_LOSS_PENALTY -
    timeoutOver * FITNESS.TIMEOUT_PENALTY
  )
}
