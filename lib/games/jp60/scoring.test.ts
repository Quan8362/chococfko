import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  comboMultiplier,
  speedBonus,
  answerScore,
  computeTotals,
  compareRank,
  JP60_COMBO_MAX,
  type AnswerRecord,
} from './scoring.ts'

test('comboMultiplier ramps 0.1 per consecutive answer, capped at 2.0', () => {
  assert.equal(comboMultiplier(0), 1.0)
  assert.equal(comboMultiplier(1), 1.0)
  assert.equal(comboMultiplier(2), 1.1)
  assert.equal(comboMultiplier(3), 1.2)
  assert.equal(comboMultiplier(11), JP60_COMBO_MAX)
  assert.equal(comboMultiplier(50), JP60_COMBO_MAX)
})

test('speedBonus is max for instant, 0 past the window, linear between', () => {
  assert.equal(speedBonus(0), 50)
  assert.equal(speedBonus(8000), 0)
  assert.equal(speedBonus(20000), 0)
  assert.equal(speedBonus(4000), 25)
})

test('answerScore: wrong=0, applies difficulty + speed + combo', () => {
  assert.equal(answerScore({ isCorrect: false, difficulty: 'hard', responseMs: 0, comboAfter: 5 }), 0)
  // correct, hard(+40), instant(+50), combo x1 = 190
  assert.equal(answerScore({ isCorrect: true, difficulty: 'hard', responseMs: 0, comboAfter: 1 }), 190)
  // base100 + normal20 + speed25(4s) = 145, combo 3rd = 1.2x → 174
  assert.equal(answerScore({ isCorrect: true, difficulty: 'normal', responseMs: 4000, comboAfter: 3 }), 174)
})

test('computeTotals recomputes score, accuracy, combo, skips authoritatively', () => {
  const answers: AnswerRecord[] = [
    { isCorrect: true, difficulty: 'easy', responseMs: 0, selected: 'A' }, // combo1
    { isCorrect: true, difficulty: 'easy', responseMs: 0, selected: 'B' }, // combo2
    { isCorrect: false, difficulty: 'easy', responseMs: 0, selected: 'C' }, // reset
    { isCorrect: false, difficulty: 'easy', responseMs: 0, selected: null }, // skip
    { isCorrect: true, difficulty: 'easy', responseMs: 0, selected: 'D' }, // combo1
  ]
  const t = computeTotals(answers)
  assert.equal(t.correct, 3)
  assert.equal(t.wrong, 1)
  assert.equal(t.skipped, 1)
  assert.equal(t.bestCombo, 2)
  assert.equal(t.total, 5)
  // accuracy over answered (4): 3/4 = 75
  assert.equal(t.accuracy, 75)
  assert.ok(t.score > 0)
})

test('computeTotals never returns negative score and handles empty', () => {
  const t = computeTotals([])
  assert.equal(t.score, 0)
  assert.equal(t.accuracy, 0)
  assert.equal(t.avgCorrectMs, 0)
})

test('compareRank applies score → accuracy → time → completion tiebreakers', () => {
  const base = { score: 100, accuracy: 90, avgCorrectMs: 2000, completedAtMs: 1000 }
  assert.ok(compareRank({ ...base, score: 200 }, base) < 0) // higher score wins
  assert.ok(compareRank({ ...base, accuracy: 95 }, base) < 0) // higher accuracy
  assert.ok(compareRank({ ...base, avgCorrectMs: 1000 }, base) < 0) // faster
  assert.ok(compareRank({ ...base, completedAtMs: 500 }, base) < 0) // earlier
  assert.equal(compareRank(base, { ...base }), 0)
})
