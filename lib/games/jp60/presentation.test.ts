import { test } from 'node:test'
import assert from 'node:assert/strict'
import { questionPresentation, questionSignature } from './presentation.ts'

test('every qType maps to a label + instruction key', () => {
  const types = [
    'vocab_ja_to_meaning', 'vocab_meaning_to_ja', 'vocab_reading',
    'kanji_to_meaning', 'kanji_meaning_to_char', 'kanji_reading',
    'grammar_pattern_to_meaning', 'grammar_meaning_to_pattern', 'grammar_blank',
  ]
  for (const qt of types) {
    const p = questionPresentation(qt)
    assert.ok(p.labelKey.startsWith('q_label_'), qt)
    assert.ok(p.instrKey.startsWith('q_instr_'), qt)
  }
})

test('unknown qType falls back safely', () => {
  const p = questionPresentation('???')
  assert.ok(p.labelKey && p.instrKey)
})

test('questionSignature is stable and structural (locale-independent)', () => {
  const a = questionSignature({ sourceType: 'kanji', sourceId: '42', qType: 'kanji_to_meaning' })
  const b = questionSignature({ sourceType: 'kanji', sourceId: '42', qType: 'kanji_to_meaning' })
  assert.equal(a, b)
})

test('questionSignature differs by source, type or item', () => {
  const base = { sourceType: 'kanji', sourceId: '42', qType: 'kanji_to_meaning' }
  assert.notEqual(questionSignature(base), questionSignature({ ...base, sourceId: '43' }))
  assert.notEqual(questionSignature(base), questionSignature({ ...base, qType: 'kanji_reading' }))
  assert.notEqual(questionSignature(base), questionSignature({ ...base, sourceType: 'vocabulary' }))
})
