// Additive coverage for the pure engine — fills the §33 matrix gaps and the new
// helpers (explainBeat, calculateRemainingHandPenalties, instantWinStrength) without
// disturbing the existing engine.test.ts. Run: node --test lib/games/tlmn/*.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseHand, parseCombo, beats, explainBeat, calculateRemainingHandPenalties,
  instantWinStrength, checkInstantWin, DEFAULT_RULES,
  type Combo,
} from './engine.ts'

function combo(s: string): Combo {
  const c = parseCombo(parseHand(s))
  assert.ok(c, `expected a legal combo from "${s}"`)
  return c!
}

// ── Card order: full suit ladder ────────────────────────────────────────────────
test('suit ladder ♠<♣<♦<♥ at rank 3 and rank 2', () => {
  assert.equal(beats(combo('3C'), combo('3S')), true)
  assert.equal(beats(combo('3D'), combo('3C')), true)
  assert.equal(beats(combo('3H'), combo('3D')), true)
  assert.equal(beats(combo('2C'), combo('2S')), true)
  assert.equal(beats(combo('2D'), combo('2C')), true)
  assert.equal(beats(combo('2H'), combo('2D')), true)
  assert.equal(beats(combo('AH'), combo('2S')), false) // A♥ < 2♠ (rank dominates)
})

test('an equal card cannot beat itself', () => {
  assert.equal(beats(combo('5H'), combo('5H')), false)
  assert.equal(beats(combo('9S 9C'), combo('9S 9C')), false)
})

// ── Combination validity ─────────────────────────────────────────────────────────
test('two different ranks are not a pair; a triple+1 is nothing', () => {
  assert.equal(parseCombo(parseHand('4S 5S')), null)
  assert.equal(parseCombo(parseHand('7S 7C 7D 8S')), null)
})

test('straight: duplicate rank rejected, missing rank rejected', () => {
  assert.equal(parseCombo(parseHand('5S 5C 6D')), null)      // dup rank, not consecutive
  assert.equal(parseCombo(parseHand('5S 6C 8D')), null)      // gap (missing 7)
  assert.equal(parseCombo(parseHand('10S JC QD'))?.type, 'straight')
})

test('straights of different length cannot beat each other', () => {
  assert.equal(beats(combo('4S 5S 6S 7S'), combo('5C 6C 7C')), false) // longer ≠ stronger
  assert.equal(beats(combo('5C 6C 7C'), combo('4S 5S 6S 7S')), false)
})

test('consecutive pairs: 5 & 6 valid; nonconsecutive & pair-of-2 rejected; duplicate card rejected', () => {
  assert.equal(parseCombo(parseHand('3S 3C 4S 4C 5S 5C'))?.type, 'pairsRun')              // 3 pairs
  assert.equal(parseCombo(parseHand('3S 3C 4S 4C 5S 5C 6S 6C 7S 7C'))?.type, 'pairsRun')  // 5 pairs
  assert.equal(parseCombo(parseHand('3S 3C 4S 4C 5S 5C 6S 6C 7S 7C 8S 8C'))?.type, 'pairsRun') // 6
  assert.equal(parseCombo(parseHand('3S 3C 4S 4C 6S 6C')), null)                          // gap
  assert.equal(parseCombo(parseHand('KS KC AS AC 2S 2C')), null)                          // includes 2
  assert.equal(parseCombo(parseHand('3S 3S 4S 4C 5S 5C')), null)                          // duplicate 3♠
})

test('same-count pairs-runs compare by highest pair; different counts are not an ordinary follow', () => {
  assert.equal(beats(combo('4S 4C 5S 5C 6S 6C'), combo('3S 3C 4S 4D 5S 5D')), true)
  assert.equal(beats(combo('3S 3C 4S 4D 5S 5D'), combo('4S 4C 5S 5C 6S 6C')), false)
  // a 4-pairs-run is NOT an ordinary same-shape follow to a 3-pairs-run (only a chop)
  const fourRun = combo('3S 3C 4S 4C 5S 5C 6S 6C')
  const threeRun = combo('7S 7C 8S 8C 9S 9C')
  assert.equal(fourRun.type === threeRun.type && fourRun.count === threeRun.count, false)
})

// ── Chop matrix — explicit forbidden edges ────────────────────────────────────────
test('chop matrix forbidden edges (default profile)', () => {
  const R = DEFAULT_RULES
  // three pairs does NOT beat a pair of 2s
  assert.equal(beats(combo('3S 3C 4S 4C 5S 5C'), combo('2S 2C'), R), false)
  // four of a kind does NOT beat a pair of 2s (fourPairsRunCutsPairOf2s is the 4-run rule)
  assert.equal(beats(combo('7S 7C 7D 7H'), combo('2S 2C'), R), false)
  // four pairs does NOT beat a triple of 2s
  assert.equal(beats(combo('3S 3C 4S 4C 5S 5C 6S 6C'), combo('2S 2C 2D'), R), false)
  // a bomb cannot beat an ordinary high single (A)
  assert.equal(beats(combo('7S 7C 7D 7H'), combo('AH'), R), false)
  assert.equal(beats(combo('3S 3C 4S 4C 5S 5C'), combo('AH'), R), false)
})

test('chop matrix allowed edges (default profile)', () => {
  const R = DEFAULT_RULES
  assert.equal(beats(combo('3S 3C 4S 4C 5S 5C'), combo('2H'), R), true)        // 3 pairs cut single 2
  assert.equal(beats(combo('7S 7C 7D 7H'), combo('2H'), R), true)              // tứ quý cut single 2
  assert.equal(beats(combo('7S 7C 7D 7H'), combo('3S 3C 4S 4C 5S 5C'), R), true) // tứ quý cut 3-run
  assert.equal(beats(combo('3S 3C 4S 4C 5S 5C 6S 6C'), combo('2S 2C'), R), true) // 4-run cut đôi heo
  assert.equal(beats(combo('3S 3C 4S 4C 5S 5C 6S 6C'), combo('7S 7C 7D 7H'), R), true) // 4-run cut tứ quý
})

// ── explainBeat structured reasons ────────────────────────────────────────────────
test('explainBeat returns null when it beats, else the precise code', () => {
  assert.equal(explainBeat(combo('5H'), combo('5S')), null)                       // ♥>♠ → legal
  assert.equal(explainBeat(combo('4S'), combo('5S')), 'play_not_high_enough')
  assert.equal(explainBeat(combo('5S 5C'), combo('6H')), 'wrong_combo_type')      // pair vs single
  assert.equal(explainBeat(combo('4S 5S 6S 7S'), combo('5C 6C 7C')), 'wrong_combo_length')
  assert.equal(explainBeat(combo('7S 7C 7D 7H'), combo('AH')), 'invalid_chop')    // bomb can't cut A
})

// ── Instant win — exact detection & tie-break ─────────────────────────────────────
test('six pairs: a tứ quý contributes two pairs; no card double-counted', () => {
  // 3333 (=2 pairs) + 5,7,9,J pairs (=4) ⇒ 6 disjoint pairs, but only 5 distinct ranks,
  // and no 5 consecutive pair-ranks → must classify as sauDoi (not namDoiThong).
  const hand = parseHand('3S 3C 3D 3H 5S 5C 7S 7C 9S 9C JS JC AD')
  assert.equal(checkInstantWin(hand)?.type, 'sauDoi')
  // Without the tứ quý's second pair it would be only 5 pairs → no instant win.
  const five = parseHand('3S 3C 5S 5C 7S 7C 9S 9C JS JC AD KH')
  assert.equal(checkInstantWin(five), null)
})

test('dragon straight needs every rank 3..A; one missing → not a dragon', () => {
  const dragon = parseHand('3S 4S 5S 6S 7S 8S 9S 10S JS QS KS AS 2H')
  assert.equal(checkInstantWin(dragon, { instantWinOrder: ['sanhRong'], toiTrangEnabled: true })?.type, 'sanhRong')
  const missingQ = parseHand('3S 4S 5S 6S 7S 8S 9S 10S JS KS AS 2H 2S') // no Q
  assert.equal(checkInstantWin(missingQ, { instantWinOrder: ['sanhRong'], toiTrangEnabled: true }), null)
})

test('instantWinStrength is deterministic and ranks stronger consecutive-pairs higher', () => {
  const lo = parseHand('3S 3C 4S 4C 5S 5C 6S 6C 7S 7C') // up to 7
  const hi = parseHand('4S 4C 5S 5C 6S 6C 7S 7C 8S 8C') // up to 8
  assert.ok(instantWinStrength(hi, 'namDoiThong') > instantWinStrength(lo, 'namDoiThong'))
})

// ── Thối itemization (calculateRemainingHandPenalties) ────────────────────────────
test('thối: black vs red 2s reported separately', () => {
  const p = calculateRemainingHandPenalties(parseHand('2S 2C 2D 2H 5C'))
  // 2♠/2♣ are black; 2♦/2♥ red. (Four 2s here is also a tứ quý → fours has one entry.)
  assert.equal(p.blackTwos.length, 2)
  assert.equal(p.redTwos.length, 2)
})

test('thối: tứ quý and a 3-pairs-run detected; bomUnits matches', () => {
  const p = calculateRemainingHandPenalties(parseHand('7S 7C 7D 7H 9S 9C 10S 10C JS JC'))
  assert.equal(p.fours.length, 1)              // tứ quý 7
  assert.equal(p.pairRuns.length, 1)           // 9-10-J run
  assert.equal(p.pairRuns[0].length, 6)        // 3 pairs = 6 cards
  assert.equal(p.bomUnits, 2)
})

test('thối: a four-pairs run is one unit; no card reused across bộ', () => {
  const p = calculateRemainingHandPenalties(parseHand('3S 3C 4S 4C 5S 5C 6S 6C'))
  assert.equal(p.fours.length, 0)
  assert.equal(p.pairRuns.length, 1)
  assert.equal(p.pairRuns[0].length, 8)        // 4 pairs
  assert.equal(p.bomUnits, 1)
})

test('thối: a tứ quý rank is not also consumed by the pairs-run', () => {
  // 5555 + 6677 → the 5s form a tứ quý; the run is 6-7 only (2 pairs < 3) → no run
  const p = calculateRemainingHandPenalties(parseHand('5S 5C 5D 5H 6S 6C 7S 7C'))
  assert.equal(p.fours.length, 1)
  assert.equal(p.pairRuns.length, 0)
})
