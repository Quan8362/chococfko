// ─────────────────────────────────────────────────────────────────────────────
// Evaluation + fitness.
//
// evaluateCandidate runs the candidate against a FIELD of opponent policies over a
// seed set, ROTATING the candidate through every seat so seat-order bias cancels.
// It aggregates win rate (overall + by seat + by opponent field), finishing
// position, illegal moves, decision-time mean/p95, and decision-quality audits.
// fitness() folds these into one scalar with hard penalties for illegal moves.
// ─────────────────────────────────────────────────────────────────────────────
import { type Rules } from '../engine.ts'
import { runGame, type SimPolicy } from './simulator.ts'

export interface EvalMetrics {
  games: number
  winRate: number
  winRateBySeat: Record<number, number>
  winRateVsField: Record<string, number>
  avgFinishPosition: number
  avgRemainingOnLoss: number
  illegalMoveCount: number
  missedImmediateWinRate: number
  avoidableLossRate: number
  decisionTimeMeanMs: number
  decisionTimeP95Ms: number
}

export interface EvalOptions {
  candidate: SimPolicy
  field: SimPolicy[]          // opponent policies (cycled to fill the other seats)
  seeds: string[]
  playerCount?: number        // default 4
  ruleConfig?: Partial<Rules>
}

function p95(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = values.slice().sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(0.95 * sorted.length))]
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
  const decisionTimes: number[] = []
  const winsBySeat: Record<number, number> = {}
  const gamesBySeat: Record<number, number> = {}
  const winsVsField: Record<string, number> = {}
  const gamesVsField: Record<string, number> = {}

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
      finishPosSum += pos >= 0 ? pos : playerCount - 1
      const won = res.winnerSeat === candSeat
      if (won) { wins++; winsBySeat[candSeat] = (winsBySeat[candSeat] ?? 0) + 1; winsVsField[fieldKey] = (winsVsField[fieldKey] ?? 0) + 1 }
      else { lossCount++; remainingOnLossSum += res.finalCardCounts[candSeat] ?? 0 }

      if (res.audit) {
        immediateWinsAvailable += res.audit.immediateWinsAvailable
        immediateWinsTaken += res.audit.immediateWinsTaken
        if (!won && res.audit.riskySingleLeadsUnderThreat > 0) riskyLeadLosses++
      }
    }
  }

  const winRateBySeat: Record<number, number> = {}
  for (const s of Object.keys(gamesBySeat).map(Number)) winRateBySeat[s] = (winsBySeat[s] ?? 0) / gamesBySeat[s]
  const winRateVsField: Record<string, number> = {}
  for (const k of Object.keys(gamesVsField)) winRateVsField[k] = (winsVsField[k] ?? 0) / gamesVsField[k]

  return {
    games,
    winRate: games ? wins / games : 0,
    winRateBySeat,
    winRateVsField,
    avgFinishPosition: games ? finishPosSum / games : 0,
    avgRemainingOnLoss: lossCount ? remainingOnLossSum / lossCount : 0,
    illegalMoveCount: illegal,
    missedImmediateWinRate: immediateWinsAvailable ? (immediateWinsAvailable - immediateWinsTaken) / immediateWinsAvailable : 0,
    avoidableLossRate: lossCount ? riskyLeadLosses / lossCount : 0,
    decisionTimeMeanMs: decisionTimes.length ? decisionTimes.reduce((a, b) => a + b, 0) / decisionTimes.length : 0,
    decisionTimeP95Ms: p95(decisionTimes),
  }
}

// ── Fitness ────────────────────────────────────────────────────────────────────
export const FITNESS = {
  WIN: 100,
  FIRST_PLACE: 30,
  MISSED_WIN_PENALTY: 50,
  AVOIDABLE_LOSS_PENALTY: 40,
  ILLEGAL_DISQUALIFY: 100000,
  TIMEOUT_PENALTY: 20,
  TIMEOUT_BUDGET_MS: 60, // p95 decision budget; over this is penalised
}

export function fitness(m: EvalMetrics): number {
  if (m.illegalMoveCount > 0) return -FITNESS.ILLEGAL_DISQUALIFY * m.illegalMoveCount
  const firstPlaceRate = m.winRate // đếm-lá has a single winner → first place == win
  const timeoutOver = Math.max(0, m.decisionTimeP95Ms - FITNESS.TIMEOUT_BUDGET_MS) / FITNESS.TIMEOUT_BUDGET_MS
  return (
    m.winRate * FITNESS.WIN +
    firstPlaceRate * FITNESS.FIRST_PLACE -
    m.missedImmediateWinRate * FITNESS.MISSED_WIN_PENALTY -
    m.avoidableLossRate * FITNESS.AVOIDABLE_LOSS_PENALTY -
    timeoutOver * FITNESS.TIMEOUT_PENALTY
  )
}
