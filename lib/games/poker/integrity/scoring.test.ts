import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  combineSignals,
  scoreSubjects,
  recomputeScore,
  bandFor,
  riskCaseDedupKey,
  isActionableAdvisory,
  RISK_SCORE_VERSION,
  RISK_WEIGHTS_VERSION,
  SIGNAL_WEIGHTS,
} from './scoring.ts'
import type { RiskSignal } from './signals.ts'

function sig(over: Partial<RiskSignal> & Pick<RiskSignal, 'code'>): RiskSignal {
  return {
    category: 'gameplay', severity: 1, confidence: 1, relatedUserIds: ['a', 'b'],
    relatedHandIds: [], windowHands: 10, reasons: [], evidence: {}, ...over,
  } as RiskSignal
}

test('bandFor thresholds', () => {
  assert.equal(bandFor(0), 'none')
  assert.equal(bandFor(25), 'low')
  assert.equal(bandFor(50), 'medium')
  assert.equal(bandFor(80), 'high')
})

test('combineSignals stamps versions and is deterministic', () => {
  const signals = [sig({ code: 'GP_CHIP_DUMP', severity: 0.8, confidence: 0.7 })]
  const a = combineSignals(['a', 'b'], signals)
  const b = recomputeScore(['b', 'a'], signals) // order-independent subject
  assert.equal(a.scoreVersion, RISK_SCORE_VERSION)
  assert.equal(a.weightsVersion, RISK_WEIGHTS_VERSION)
  assert.deepEqual(a.subjectUserIds, ['a', 'b'])
  assert.equal(a.score, b.score)
  assert.equal(a.confidence, b.confidence)
})

test('independent corroborating signals raise the score above any single one', () => {
  const one = combineSignals(['a', 'b'], [sig({ code: 'GP_SOFT_PLAY', severity: 0.7, confidence: 0.7 })])
  const many = combineSignals(['a', 'b'], [
    sig({ code: 'GP_SOFT_PLAY', severity: 0.7, confidence: 0.7 }),
    sig({ code: 'REL_ONE_WAY_VALUE_FLOW', severity: 0.7, confidence: 0.7, category: 'relationship' }),
    sig({ code: 'GP_CHIP_DUMP', severity: 0.7, confidence: 0.7 }),
  ])
  assert.ok(many.score > one.score)
  assert.equal(many.categories.length >= 2, true)
})

test('a shared identifier ALONE never reaches an actionable band', () => {
  const s = combineSignals(['a', 'b'], [
    sig({ code: 'AS_SHARED_IDENTIFIER', category: 'account_session', severity: 0.35, confidence: 0.25 }),
  ])
  assert.equal(s.band === 'high', false)
  assert.equal(isActionableAdvisory(s), false)
  // ...but it CORROBORATES: same identifier + a behavioural signal scores higher than the
  // behavioural signal alone.
  const behaviourOnly = combineSignals(['a', 'b'], [
    sig({ code: 'GP_SOFT_PLAY', severity: 0.6, confidence: 0.6 }),
  ])
  const combined = combineSignals(['a', 'b'], [
    sig({ code: 'GP_SOFT_PLAY', severity: 0.6, confidence: 0.6 }),
    sig({ code: 'AS_SHARED_IDENTIFIER', category: 'account_session', severity: 0.35, confidence: 0.25 }),
  ])
  assert.ok(combined.score >= behaviourOnly.score)
})

test('low confidence keeps a strong-looking signal below the action gate', () => {
  const s = combineSignals(['a', 'b'], [sig({ code: 'GP_CHIP_DUMP', severity: 1, confidence: 0.1 })])
  assert.ok(s.confidence < 0.5)
  assert.equal(isActionableAdvisory(s), false, 'never actionable on low confidence alone')
})

test('scoreSubjects groups by subject and sorts desc', () => {
  const scores = scoreSubjects([
    sig({ code: 'GP_CHIP_DUMP', relatedUserIds: ['a', 'b'], severity: 0.9, confidence: 0.8 }),
    sig({ code: 'GP_BOT_TIMING', relatedUserIds: ['z'], severity: 0.3, confidence: 0.3 }),
  ])
  assert.equal(scores.length, 2)
  assert.deepEqual(scores[0].subjectUserIds, ['a', 'b'])
  assert.ok(scores[0].score >= scores[1].score)
})

test('contributing signals are listed and sorted by contribution', () => {
  const s = combineSignals(['a', 'b'], [
    sig({ code: 'AS_SHARED_IDENTIFIER', category: 'account_session', severity: 0.3, confidence: 0.25 }),
    sig({ code: 'GP_CHIP_DUMP', severity: 0.9, confidence: 0.9 }),
  ])
  assert.equal(s.contributingSignals[0].code, 'GP_CHIP_DUMP')
  assert.ok(s.contributingSignals[0].contribution >= s.contributingSignals[1].contribution)
})

test('dedup key is version-scoped and order-independent', () => {
  assert.equal(riskCaseDedupKey(['b', 'a']), riskCaseDedupKey(['a', 'b']))
  assert.ok(riskCaseDedupKey(['a', 'b']).startsWith(RISK_WEIGHTS_VERSION))
})

test('every signal code has a weight in [0,1]', () => {
  for (const [code, w] of Object.entries(SIGNAL_WEIGHTS)) {
    assert.ok(w >= 0 && w <= 1, `${code} weight out of range`)
  }
})
