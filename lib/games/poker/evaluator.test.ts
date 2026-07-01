// Framework-free tests for the poker hand evaluator.
// Run with:  node --test lib/games/poker/evaluator.test.ts
//
// Maps to HAND-RANK-001, HAND-TIE-001, HAND-EXACT-TIE-001, HAND-STRAIGHT-WHEEL/WRAP-001,
// HAND-SF/QUADS/FH/FLUSH/STRAIGHT/TRIPS/TWOPAIR/PAIR/HIGH-001, HAND-USE-001, HAND-INV-001/002/003.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  HandCategory,
  evaluateFive,
  evaluateBest,
  evaluateHand,
  compareHandValues,
  describeHand,
} from './evaluator.ts'
import type { Card } from './types.ts'

const C = (s: string) => s as Card
const five = (s: string) => s.trim().split(/\s+/).map(C)

function cat(cards: string): HandCategory {
  return evaluateFive(five(cards)).category
}

// ── HAND-RANK-001: every category recognised ────────────────────────────────────────
test('HAND-HIGH-001 high card', () => {
  assert.equal(cat('Ah Kd 9s 7c 4h'), HandCategory.HighCard)
})
test('HAND-PAIR-001 one pair', () => {
  assert.equal(cat('Ah Ad 9s 7c 4h'), HandCategory.Pair)
})
test('HAND-TWOPAIR-001 two pair', () => {
  assert.equal(cat('Ah Ad 9s 9c 4h'), HandCategory.TwoPair)
})
test('HAND-TRIPS-001 three of a kind', () => {
  assert.equal(cat('Ah Ad As 7c 4h'), HandCategory.ThreeOfAKind)
})
test('HAND-STRAIGHT-001 straight', () => {
  assert.equal(cat('5h 6d 7s 8c 9h'), HandCategory.Straight)
})
test('HAND-FLUSH-001 flush', () => {
  assert.equal(cat('Ah Kh 9h 7h 4h'), HandCategory.Flush)
})
test('HAND-FH-001 full house', () => {
  assert.equal(cat('Ah Ad As 7c 7h'), HandCategory.FullHouse)
})
test('HAND-QUADS-001 four of a kind', () => {
  assert.equal(cat('Ah Ad As Ac 7h'), HandCategory.FourOfAKind)
})
test('HAND-SF-001 straight flush', () => {
  assert.equal(cat('5h 6h 7h 8h 9h'), HandCategory.StraightFlush)
})

// Category ordering is strict, strongest → weakest (HAND-RANK-001).
test('HAND-RANK-001 category ladder is strictly ordered', () => {
  const ladder = [
    'Ah Kd 9s 7c 4h', // high
    'Ah Ad 9s 7c 4h', // pair
    'Ah Ad 9s 9c 4h', // two pair
    'Ah Ad As 7c 4h', // trips
    '5h 6d 7s 8c 9h', // straight
    'Ah Kh 9h 7h 4h', // flush
    'Ah Ad As 7c 7h', // full house
    'Ah Ad As Ac 7h', // quads
    '5h 6h 7h 8h 9h', // straight flush
  ].map((h) => evaluateFive(five(h)))
  for (let i = 1; i < ladder.length; i++) {
    assert.equal(compareHandValues(ladder[i], ladder[i - 1]), 1, `rung ${i} beats ${i - 1}`)
  }
})

// ── Straights: wheel, broadway, wraparound ──────────────────────────────────────────
test('HAND-STRAIGHT-WHEEL-001 wheel A-2-3-4-5 is a straight, top card 5', () => {
  const wheel = evaluateFive(five('Ah 2d 3s 4c 5h'))
  assert.equal(wheel.category, HandCategory.Straight)
  assert.deepEqual(wheel.tiebreakers, [5]) // top is the 5, not the Ace
  // the wheel is the LOWEST straight: 6-high straight beats it.
  const sixHigh = evaluateFive(five('2h 3d 4s 5c 6h'))
  assert.equal(compareHandValues(sixHigh, wheel), 1)
})

test('HAND-STRAIGHT-BROADWAY-001 Broadway is the highest straight', () => {
  const broadway = evaluateFive(five('Th Jd Qs Kc Ah'))
  const kingHigh = evaluateFive(five('9h Td Js Qc Kh'))
  assert.equal(broadway.category, HandCategory.Straight)
  assert.equal(compareHandValues(broadway, kingHigh), 1)
})

test('HAND-STRAIGHT-WRAP-001 wraparound Q-K-A-2-3 is NOT a straight', () => {
  const wrap = evaluateFive(five('Qh Kd Ah 2c 3s'))
  assert.equal(wrap.category, HandCategory.HighCard) // ace-high, no straight
  assert.notEqual(wrap.category, HandCategory.Straight)
})

// ── Straight flush extremes (HAND-SF-001) ───────────────────────────────────────────
test('HAND-SF-001 royal beats steel wheel; steel wheel is the lowest straight flush', () => {
  const royal = evaluateFive(five('Th Jh Qh Kh Ah'))
  const steelWheel = evaluateFive(five('Ah 2h 3h 4h 5h'))
  assert.equal(royal.category, HandCategory.StraightFlush)
  assert.equal(steelWheel.category, HandCategory.StraightFlush)
  assert.deepEqual(steelWheel.tiebreakers, [5])
  assert.equal(compareHandValues(royal, steelWheel), 1)
})

// ── Kickers (HAND-TIE-001) ──────────────────────────────────────────────────────────
test('HAND-PAIR-001 pair kicker decides', () => {
  const a = evaluateFive(five('Ah Ad Ks 7c 4h')) // K kicker
  const b = evaluateFive(five('Ah Ad Qs 7c 4h')) // Q kicker
  assert.equal(compareHandValues(a, b), 1)
})

test('HAND-TWOPAIR-001 two-pair kicker decides when pairs equal', () => {
  const a = evaluateFive(five('Ah Ad 9s 9c Kh'))
  const b = evaluateFive(five('Ah Ad 9s 9c Qh'))
  assert.equal(compareHandValues(a, b), 1)
  // higher of the two pairs dominates the lower pair
  const higherPairs = evaluateFive(five('Kh Kd 2s 2c 9h'))
  const lowerPairs = evaluateFive(five('Qh Qd Js Jc 9h'))
  assert.equal(compareHandValues(higherPairs, lowerPairs), 1)
})

test('HAND-TRIPS-001 trips compared by trip rank then two kickers', () => {
  const a = evaluateFive(five('9h 9d 9s Ac 4h'))
  const b = evaluateFive(five('9h 9d 9s Kc Qh'))
  assert.equal(compareHandValues(a, b), 1) // A kicker > K
})

test('HAND-FLUSH-001 flush compared by all five ranks descending', () => {
  const a = evaluateFive(five('Ah Kh 9h 7h 4h'))
  const b = evaluateFive(five('Ah Kh 9h 7h 3h'))
  assert.equal(compareHandValues(a, b), 1) // 4 > 3 on the last card
})

test('HAND-FH-001 full house compared by trips then pair', () => {
  const a = evaluateFive(five('Kh Kd Ks 2c 2h')) // KKK22
  const b = evaluateFive(five('Qh Qd Qs Ac Ah')) // QQQAA
  assert.equal(compareHandValues(a, b), 1) // trips rank dominates the pair rank
})

// ── Exact tie & suit irrelevance (HAND-EXACT-TIE-001 / CARD-SUIT-001) ────────────────
test('HAND-EXACT-TIE-001 identical ranks across suits are an exact tie (compare === 0)', () => {
  const a = evaluateFive(five('Ah Kh 9h 7h 4h')) // heart flush A K 9 7 4
  const b = evaluateFive(five('As Ks 9s 7s 4s')) // spade flush, SAME ranks
  assert.equal(compareHandValues(a, b), 0) // suit never breaks a tie
  assert.equal(a.score, b.score)
})

// ── Board plays & best-of-seven (HAND-USE-001 / HAND-INV-003) ────────────────────────
test('HAND-USE-001 best-of-seven picks the strongest five', () => {
  // Hole 2c 3d, board gives a king-high flush in hearts — board plays.
  const v = evaluateBest(five('2c 3d Ah Kh Qh 7h 4h'))
  assert.equal(v.category, HandCategory.Flush)
  assert.equal(v.bestFive.length, 5)
  assert.ok(!v.bestFive.includes('2c' as Card))
})

test('HAND-INV-003 board plays → all contenders tie on a flush board', () => {
  const board = five('Ah Kh Qh Jh 9h') // a made flush on the board
  const p1 = evaluateHand(['2c', '3d'] as [Card, Card], board)
  const p2 = evaluateHand(['4s', '5c'] as [Card, Card], board)
  assert.equal(p1.category, HandCategory.Flush)
  assert.equal(compareHandValues(p1, p2), 0) // both play the board → exact tie
})

// ── HAND-INV-001: evaluation independent of input order ──────────────────────────────
test('HAND-INV-001 evaluation is independent of card order', () => {
  const a = evaluateFive(five('Ah Ad As 7c 7h'))
  const b = evaluateFive(five('7h Ah 7c As Ad'))
  assert.equal(a.score, b.score)
  assert.equal(compareHandValues(a, b), 0)
})

test('describeHand exposes a stable machine label and tiebreak ranks', () => {
  const v = evaluateFive(five('Ah Ad 9s 9c Kh'))
  const meta = describeHand(v)
  assert.equal(meta.label, 'two_pair')
  assert.deepEqual(meta.tiebreakerRanks, ['A', '9', 'K'])
})

test('evaluateFive rejects wrong card counts and duplicates', () => {
  assert.throws(() => evaluateFive(five('Ah Kh Qh')), /needs 5 cards/)
  assert.throws(() => evaluateFive(['Ah', 'Ah', 'Kd', 'Qs', '2c'] as Card[]), /duplicate/)
  assert.throws(() => evaluateBest(five('Ah Kh Qh Jh')), /5\.\.7/)
})
