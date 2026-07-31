// Run with: node --test lib/tournaments/rules/handicap.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calculateStartingScore, compositionKey } from './handicap.ts'
import type { CompetitorComposition, HandicapRules } from './types.ts'

const pairMixed: CompetitorComposition = { kind: 'pair', maleCount: 1, femaleCount: 1 }
const pairMen: CompetitorComposition = { kind: 'pair', maleCount: 2, femaleCount: 0 }

// The composition diagnostics (femaleCount*, difference, mode, reason) the extended result always
// carries — spread into an expected `value` so these assertions stay focused on the scores.
const diag = (
  femaleCountA: number,
  femaleCountB: number,
  mode: HandicapRules['mode'],
  reason: 'disabled' | 'entry_match' | 'female_count_difference',
) => ({ femaleCountA, femaleCountB, difference: femaleCountA - femaleCountB, mode, reason })

// (16) Handicap disabled → 0 / 0.
test('handicap disabled returns 0 / 0', () => {
  const h: HandicapRules = { enabled: false, mode: 'starting_score', entries: [], requires_configuration: false }
  const r = calculateStartingScore({ handicap: h, competitorA: pairMixed, competitorB: pairMen })
  assert.equal(r.ok, true)
  assert.deepEqual(r.ok && r.value, {
    startingScoreA: 0, startingScoreB: 0, adjustmentA: 0, adjustmentB: 0,
    ...diag(1, 0, 'starting_score', 'disabled'),
  })
})

// (17) Handicap enabled but not configured → typed error (never a guessed number).
test('handicap enabled + requires_configuration returns typed error', () => {
  const h: HandicapRules = { enabled: true, mode: 'starting_score', entries: [], requires_configuration: true }
  const r = calculateStartingScore({ handicap: h, competitorA: pairMixed, competitorB: pairMen })
  assert.equal(r.ok, false)
  assert.equal(r.ok === false && r.error.code, 'HANDICAP_NOT_CONFIGURED')
})

test('handicap enabled but empty entries also fails closed', () => {
  const h: HandicapRules = { enabled: true, mode: 'starting_score', entries: [], requires_configuration: false }
  const r = calculateStartingScore({ handicap: h, competitorA: pairMixed, competitorB: pairMen })
  assert.equal(r.ok === false && r.error.code, 'HANDICAP_NOT_CONFIGURED')
})

test('configured handicap applies a starting score by composition', () => {
  const h: HandicapRules = {
    enabled: true,
    mode: 'starting_score',
    requires_configuration: false,
    entries: [
      { kind: 'pair', maleCount: 1, femaleCount: 1, value: 3 },
      { kind: 'pair', maleCount: 2, femaleCount: 0, value: 0 },
    ],
  }
  const r = calculateStartingScore({ handicap: h, competitorA: pairMixed, competitorB: pairMen })
  assert.equal(r.ok, true)
  assert.deepEqual(r.ok && r.value, {
    startingScoreA: 3, startingScoreB: 0, adjustmentA: 3, adjustmentB: 0,
    ...diag(1, 0, 'starting_score', 'entry_match'),
  })
})

test('configured handicap with no matching entry fails typed', () => {
  const h: HandicapRules = {
    enabled: true, mode: 'starting_score', requires_configuration: false,
    entries: [{ kind: 'pair', maleCount: 2, femaleCount: 0, value: 0 }],
  }
  const r = calculateStartingScore({ handicap: h, competitorA: pairMixed, competitorB: pairMen })
  assert.equal(r.ok === false && r.error.code, 'HANDICAP_NO_ENTRY')
})

test('point_adjustment mode keeps starting score at 0 and surfaces the adjustment', () => {
  const h: HandicapRules = {
    enabled: true, mode: 'point_adjustment', requires_configuration: false,
    entries: [{ kind: 'pair', maleCount: 1, femaleCount: 1, value: 2 }, { kind: 'pair', maleCount: 2, femaleCount: 0, value: 0 }],
  }
  const r = calculateStartingScore({ handicap: h, competitorA: pairMixed, competitorB: pairMen })
  assert.deepEqual(r.ok && r.value, {
    startingScoreA: 0, startingScoreB: 0, adjustmentA: 2, adjustmentB: 0,
    ...diag(1, 0, 'point_adjustment', 'entry_match'),
  })
})

test('compositionKey is stable and distinguishes gender mix', () => {
  assert.equal(compositionKey(pairMixed), 'pair:m1:f1')
  assert.notEqual(compositionKey(pairMixed), compositionKey(pairMen))
})
