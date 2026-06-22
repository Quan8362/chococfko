// XP awards + player-level curve for Japanese 60-Second Challenge. PURE module.

import type { SessionTotals } from './scoring.ts'

// ── XP awards ──────────────────────────────────────────────────────────────
export const JP60_XP = {
  perCorrect: 10,
  // accuracy bonus = round(accuracy/100 * accuracyMax), only when >=1 correct
  accuracyMax: 30,
  completion: 15,
  firstDailyOfDay: 40,
  personalRecord: 25,
  streakMilestone: 50,
  achievementUnlock: 20,
  // Anti-farm: a session with no correct answers earns no completion/XP at all.
} as const

export type XpContext = {
  totals: SessionTotals
  isFirstDailyToday: boolean
  isPersonalRecord: boolean
  streakMilestoneHit: boolean
  achievementsUnlocked: number
}

export type XpBreakdown = {
  correct: number
  accuracy: number
  completion: number
  firstDaily: number
  record: number
  streak: number
  achievements: number
  total: number
}

export function computeXp(ctx: XpContext): XpBreakdown {
  const { totals } = ctx
  // Empty / zero-correct sessions earn nothing — prevents farming via fail-spam.
  if (totals.correct <= 0) {
    return { correct: 0, accuracy: 0, completion: 0, firstDaily: 0, record: 0, streak: 0, achievements: 0, total: 0 }
  }
  const correct = totals.correct * JP60_XP.perCorrect
  const accuracy = Math.round((totals.accuracy / 100) * JP60_XP.accuracyMax)
  const completion = JP60_XP.completion
  const firstDaily = ctx.isFirstDailyToday ? JP60_XP.firstDailyOfDay : 0
  const record = ctx.isPersonalRecord ? JP60_XP.personalRecord : 0
  const streak = ctx.streakMilestoneHit ? JP60_XP.streakMilestone : 0
  const achievements = Math.max(0, ctx.achievementsUnlocked) * JP60_XP.achievementUnlock
  const total = correct + accuracy + completion + firstDaily + record + streak + achievements
  return { correct, accuracy, completion, firstDaily, record, streak, achievements, total }
}

// ── Player level curve ───────────────────────────────────────────────────────
// Cumulative XP to REACH level L (L>=1): xpToReach(L) = 50 * (L-1) * L.
// → L1:0  L2:100  L3:300  L4:600  L5:1000 … gentle quadratic, documented & tested.
export function xpToReachLevel(level: number): number {
  const L = Math.max(1, Math.floor(level))
  return 50 * (L - 1) * L
}

export type LevelProgress = {
  level: number
  xpIntoLevel: number
  xpForNextLevel: number // total span of the current level
  xpToNextLevel: number // remaining
  progress: number // 0..1
}

export function levelForXp(totalXp: number): LevelProgress {
  const xp = Math.max(0, Math.floor(totalXp || 0))
  let level = 1
  while (xpToReachLevel(level + 1) <= xp) level += 1
  const floorXp = xpToReachLevel(level)
  const ceilXp = xpToReachLevel(level + 1)
  const span = ceilXp - floorXp
  const into = xp - floorXp
  return {
    level,
    xpIntoLevel: into,
    xpForNextLevel: span,
    xpToNextLevel: Math.max(0, ceilXp - xp),
    progress: span === 0 ? 0 : into / span,
  }
}
