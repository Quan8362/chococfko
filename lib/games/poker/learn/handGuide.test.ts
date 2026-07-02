import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  HAND_RANKING_GUIDE,
  KICKER_EXAMPLE,
  WHEEL_EXAMPLE,
  BOARD_PLAYS_EXAMPLE,
  EXACT_TIE_EXAMPLE,
} from './handGuide.ts'
import { evaluateFive, evaluateHand, compareHandValues, describeHand, HandCategory } from '../evaluator.ts'

test('every ranking example evaluates to the category it claims', () => {
  for (const ex of HAND_RANKING_GUIDE) {
    assert.equal(ex.cards.length, 5, `${ex.key} has five cards`)
    const v = evaluateFive(ex.cards)
    assert.equal(v.category, ex.category, `${ex.key} evaluates to its stated category`)
  }
})

test('the guide is ordered strongest → weakest (matches the evaluator’s total order)', () => {
  for (let i = 1; i < HAND_RANKING_GUIDE.length; i++) {
    const stronger = evaluateFive(HAND_RANKING_GUIDE[i - 1].cards)
    const weaker = evaluateFive(HAND_RANKING_GUIDE[i].cards)
    assert.equal(compareHandValues(stronger, weaker), 1, `${HAND_RANKING_GUIDE[i - 1].key} > ${HAND_RANKING_GUIDE[i].key}`)
  }
})

test('kicker example: same pair, the higher side card wins', () => {
  const a = evaluateFive(KICKER_EXAMPLE.a)
  const b = evaluateFive(KICKER_EXAMPLE.b)
  assert.equal(a.category, HandCategory.Pair)
  assert.equal(b.category, HandCategory.Pair)
  assert.equal(compareHandValues(a, b), 1)
  assert.equal(describeHand(a).tiebreakerRanks[1], 'K') // deciding kicker
})

test('wheel example: A-2-3-4-5 is a straight to the five', () => {
  const v = evaluateFive(WHEEL_EXAMPLE.cards)
  assert.equal(v.category, HandCategory.Straight)
  assert.equal(describeHand(v).tiebreakerRanks[0], '5') // ace plays low
})

test('board plays: neither hole card improves the community hand → exact tie', () => {
  const a = evaluateHand(BOARD_PLAYS_EXAMPLE.holeA, BOARD_PLAYS_EXAMPLE.board)
  const b = evaluateHand(BOARD_PLAYS_EXAMPLE.holeB, BOARD_PLAYS_EXAMPLE.board)
  assert.equal(compareHandValues(a, b), 0)
  // the winning five all come from the board
  const boardSet = new Set(BOARD_PLAYS_EXAMPLE.board)
  assert.ok(a.bestFive.every((c) => boardSet.has(c)))
})

test('exact tie: identical ranks across suits compare equal', () => {
  const a = evaluateFive(EXACT_TIE_EXAMPLE.a)
  const b = evaluateFive(EXACT_TIE_EXAMPLE.b)
  assert.equal(compareHandValues(a, b), 0)
})
