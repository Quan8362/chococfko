import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evaluateAchievements, JP60_ACHIEVEMENT_CODES, type AchievementContext } from './achievements.ts'

const ctx = (over: Partial<AchievementContext> = {}): AchievementContext => ({
  totalGames: 0,
  totalQuestions: 0,
  bestScoreEver: 0,
  bestComboEver: 0,
  streakCurrent: 0,
  vocabCorrect: 0,
  kanjiCorrect: 0,
  grammarCorrect: 0,
  sessionLevel: 'MIXED',
  sessionPerfect: false,
  dailyWinnerFinalized: false,
  friendChallengeCreated: false,
  friendChallengeWon: false,
  ...over,
})

test('first game unlocks first_game only', () => {
  const r = evaluateAchievements(ctx({ totalGames: 1 }))
  assert.deepEqual(r, ['first_game'])
})

test('thresholds unlock cumulatively', () => {
  const r = evaluateAchievements(
    ctx({ totalGames: 5, bestComboEver: 12, bestScoreEver: 2500, totalQuestions: 1500 })
  )
  assert.ok(r.includes('combo_5'))
  assert.ok(r.includes('combo_10'))
  assert.ok(r.includes('score_1000'))
  assert.ok(r.includes('score_2000'))
  assert.ok(r.includes('questions_100'))
  assert.ok(r.includes('questions_1000'))
})

test('level achievement keys off the session level played', () => {
  assert.ok(evaluateAchievements(ctx({ totalGames: 1, sessionLevel: 'N3' })).includes('level_n3'))
  assert.ok(!evaluateAchievements(ctx({ totalGames: 1, sessionLevel: 'MIXED' })).some((c) => c.startsWith('level_')))
})

test('daily_winner only when server marks it finalized', () => {
  assert.ok(!evaluateAchievements(ctx({ totalGames: 1 })).includes('daily_winner'))
  assert.ok(evaluateAchievements(ctx({ totalGames: 1, dailyWinnerFinalized: true })).includes('daily_winner'))
})

test('every produced code exists in the definition list', () => {
  const r = evaluateAchievements(
    ctx({
      totalGames: 9,
      sessionPerfect: true,
      bestComboEver: 10,
      bestScoreEver: 2000,
      sessionLevel: 'N1',
      streakCurrent: 30,
      totalQuestions: 1000,
      vocabCorrect: 200,
      kanjiCorrect: 100,
      grammarCorrect: 100,
      dailyWinnerFinalized: true,
      friendChallengeCreated: true,
      friendChallengeWon: true,
    })
  )
  for (const code of r) assert.ok(JP60_ACHIEVEMENT_CODES.includes(code), `unknown code ${code}`)
})
