import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeXp, xpToReachLevel, levelForXp, JP60_XP } from './xp.ts'
import type { SessionTotals } from './scoring.ts'

const totals = (correct: number, accuracy: number): SessionTotals => ({
  score: 0, total: correct, correct, wrong: 0, skipped: 0, accuracy, bestCombo: correct, avgCorrectMs: 0,
})

test('computeXp awards nothing for a zero-correct session (anti-farm)', () => {
  const x = computeXp({
    totals: totals(0, 0),
    isFirstDailyToday: true,
    isPersonalRecord: true,
    streakMilestoneHit: true,
    achievementsUnlocked: 3,
  })
  assert.equal(x.total, 0)
})

test('computeXp sums correct + accuracy + completion + bonuses', () => {
  const x = computeXp({
    totals: totals(5, 100),
    isFirstDailyToday: true,
    isPersonalRecord: true,
    streakMilestoneHit: false,
    achievementsUnlocked: 2,
  })
  assert.equal(x.correct, 5 * JP60_XP.perCorrect)
  assert.equal(x.accuracy, JP60_XP.accuracyMax) // 100% → full bonus
  assert.equal(x.completion, JP60_XP.completion)
  assert.equal(x.firstDaily, JP60_XP.firstDailyOfDay)
  assert.equal(x.record, JP60_XP.personalRecord)
  assert.equal(x.achievements, 2 * JP60_XP.achievementUnlock)
  assert.equal(
    x.total,
    x.correct + x.accuracy + x.completion + x.firstDaily + x.record + x.achievements
  )
})

test('xpToReachLevel matches documented curve', () => {
  assert.equal(xpToReachLevel(1), 0)
  assert.equal(xpToReachLevel(2), 100)
  assert.equal(xpToReachLevel(3), 300)
  assert.equal(xpToReachLevel(4), 600)
  assert.equal(xpToReachLevel(5), 1000)
})

test('levelForXp inverts the curve and reports progress', () => {
  assert.equal(levelForXp(0).level, 1)
  assert.equal(levelForXp(99).level, 1)
  assert.equal(levelForXp(100).level, 2)
  assert.equal(levelForXp(299).level, 2)
  assert.equal(levelForXp(300).level, 3)

  const p = levelForXp(200) // level 2, span 100..300
  assert.equal(p.level, 2)
  assert.equal(p.xpIntoLevel, 100)
  assert.equal(p.xpForNextLevel, 200)
  assert.equal(p.xpToNextLevel, 100)
  assert.equal(p.progress, 0.5)
})
