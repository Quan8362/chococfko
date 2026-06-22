// Centralised, server-tested scoring for Japanese 60-Second Challenge.
// PURE module — the single source of truth for points, combo, accuracy and
// leaderboard ordering. Never duplicate this logic in components.

import type { Jp60Difficulty } from './constants.ts'

export const JP60_BASE_SCORE = 100

export const JP60_DIFFICULTY_BONUS: Record<Jp60Difficulty, number> = {
  easy: 0,
  normal: 20,
  hard: 40,
}

// Max speed bonus, awarded for an instant answer and decaying linearly to 0 at
// SPEED_WINDOW_MS. Slow-but-correct answers still score base + difficulty.
export const JP60_MAX_SPEED_BONUS = 50
export const JP60_SPEED_WINDOW_MS = 8000

export const JP60_COMBO_STEP = 0.1
export const JP60_COMBO_MAX = 2.0

// Combo multiplier for the Nth consecutive correct answer (1-indexed).
// 1 → 1.0x, 2 → 1.1x … capped at 2.0x.
export function comboMultiplier(consecutiveCorrect: number): number {
  if (consecutiveCorrect <= 1) return 1.0
  const mult = 1.0 + (consecutiveCorrect - 1) * JP60_COMBO_STEP
  return Math.min(JP60_COMBO_MAX, Math.round(mult * 10) / 10)
}

// Linear speed bonus from response time (ms). Clamped to [0, MAX].
export function speedBonus(responseMs: number): number {
  if (!Number.isFinite(responseMs) || responseMs <= 0) return JP60_MAX_SPEED_BONUS
  if (responseMs >= JP60_SPEED_WINDOW_MS) return 0
  const frac = 1 - responseMs / JP60_SPEED_WINDOW_MS
  return Math.round(JP60_MAX_SPEED_BONUS * frac)
}

export type ScoredAnswer = {
  isCorrect: boolean
  difficulty: Jp60Difficulty
  responseMs: number
  // consecutiveCorrect AFTER applying this answer (0 if wrong/skipped).
  comboAfter: number
}

// Points earned for a single answer. Wrong/skipped → 0 (combo reset handled by caller).
export function answerScore(a: ScoredAnswer): number {
  if (!a.isCorrect) return 0
  const base = JP60_BASE_SCORE + JP60_DIFFICULTY_BONUS[a.difficulty] + speedBonus(a.responseMs)
  const mult = comboMultiplier(a.comboAfter)
  return Math.round(base * mult)
}

export type AnswerRecord = {
  isCorrect: boolean
  difficulty: Jp60Difficulty
  responseMs: number
  // null = skipped / timed out
  selected: string | null
}

export type SessionTotals = {
  score: number
  total: number
  correct: number
  wrong: number
  skipped: number
  accuracy: number // 0..100 integer
  bestCombo: number
  avgCorrectMs: number // average response time over CORRECT answers (0 if none)
}

// Recomputes every total from the ordered answer list. This is the authoritative
// server calculation — the client-reported score is never trusted.
export function computeTotals(answers: readonly AnswerRecord[]): SessionTotals {
  let score = 0
  let correct = 0
  let wrong = 0
  let skipped = 0
  let combo = 0
  let bestCombo = 0
  let correctMsSum = 0

  for (const a of answers) {
    if (a.selected == null) {
      skipped += 1
      combo = 0
      continue
    }
    if (a.isCorrect) {
      combo += 1
      bestCombo = Math.max(bestCombo, combo)
      correct += 1
      correctMsSum += Math.max(0, a.responseMs)
      score += answerScore({ isCorrect: true, difficulty: a.difficulty, responseMs: a.responseMs, comboAfter: combo })
    } else {
      wrong += 1
      combo = 0
    }
  }

  const total = answers.length
  // Accuracy is over ANSWERED questions (skips don't punish accuracy, only score).
  const answered = correct + wrong
  const accuracy = answered === 0 ? 0 : Math.round((correct / answered) * 100)
  const avgCorrectMs = correct === 0 ? 0 : Math.round(correctMsSum / correct)

  return {
    score: Math.max(0, score),
    total,
    correct,
    wrong,
    skipped,
    accuracy,
    bestCombo,
    avgCorrectMs,
  }
}

// Leaderboard ordering — returns negative if `a` ranks ABOVE `b`.
// Tie-breakers: score ↓, accuracy ↓, avg correct response time ↑, completion time ↑.
export type RankRow = {
  score: number
  accuracy: number
  avgCorrectMs: number
  completedAtMs: number
}
export function compareRank(a: RankRow, b: RankRow): number {
  if (a.score !== b.score) return b.score - a.score
  if (a.accuracy !== b.accuracy) return b.accuracy - a.accuracy
  if (a.avgCorrectMs !== b.avgCorrectMs) return a.avgCorrectMs - b.avgCorrectMs
  return a.completedAtMs - b.completedAtMs
}
