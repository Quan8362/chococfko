import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyDifficulty, nextTargetDifficulty, pickByDifficulty } from './difficulty.ts'

test('classifyDifficulty marks blank/meaning-to as hard', () => {
  assert.equal(classifyDifficulty({ qType: 'grammar_blank' }), 'hard')
  assert.equal(classifyDifficulty({ qType: 'vocab_meaning_to_ja' }), 'hard')
  assert.equal(classifyDifficulty({ qType: 'vocab_reading' }), 'normal')
  assert.equal(classifyDifficulty({ qType: 'vocab_ja_to_meaning' }), 'normal')
  assert.equal(classifyDifficulty({ qType: 'vocab_ja_to_meaning', readingLength: 6 }), 'hard')
})

test('nextTargetDifficulty climbs on streak, eases on misses', () => {
  assert.equal(nextTargetDifficulty({ current: 'normal', consecutiveCorrect: 0, consecutiveWrong: 0 }), 'normal')
  assert.equal(nextTargetDifficulty({ current: 'normal', consecutiveCorrect: 3, consecutiveWrong: 0 }), 'hard')
  assert.equal(nextTargetDifficulty({ current: 'hard', consecutiveCorrect: 0, consecutiveWrong: 2 }), 'normal')
  assert.equal(nextTargetDifficulty({ current: 'normal', consecutiveCorrect: 0, consecutiveWrong: 2 }), 'easy')
})

test('pickByDifficulty prefers fresh ids and closest bucket', () => {
  const cands = [
    { difficulty: 'easy' as const, sourceId: 'a' },
    { difficulty: 'hard' as const, sourceId: 'b' },
    { difficulty: 'normal' as const, sourceId: 'c' },
  ]
  const picked = pickByDifficulty(cands, 'hard', new Set())
  assert.equal(picked?.sourceId, 'b')

  // avoid recently used 'b' → next closest to hard is normal 'c'
  const avoid = pickByDifficulty(cands, 'hard', new Set(['b']))
  assert.equal(avoid?.sourceId, 'c')

  assert.equal(pickByDifficulty([], 'hard', new Set()), null)
})
