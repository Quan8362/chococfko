import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  knockoutRoundLabel,
  identifyBracket,
  buildBracketRounds,
  type BracketMatchRef,
} from './bracket-view.ts'

// A 4-competitor bracket: r1 has 2 semifinals feeding r2 final; plus a third-place fed by the two
// semifinal losers.
function fourWithThird(): BracketMatchRef[] {
  return [
    { id: 'sf1', roundNumber: 1, sourceMatchAId: null, sourceMatchBId: null, sourceOutcomeA: null, sourceOutcomeB: null },
    { id: 'sf2', roundNumber: 1, sourceMatchAId: null, sourceMatchBId: null, sourceOutcomeA: null, sourceOutcomeB: null },
    { id: 'final', roundNumber: 2, sourceMatchAId: 'sf1', sourceMatchBId: 'sf2', sourceOutcomeA: 'winner', sourceOutcomeB: 'winner' },
    { id: 'third', roundNumber: 2, sourceMatchAId: 'sf1', sourceMatchBId: 'sf2', sourceOutcomeA: 'loser', sourceOutcomeB: 'loser' },
  ]
}

test('knockoutRoundLabel maps by match count', () => {
  assert.equal(knockoutRoundLabel(1, 3), 'final')
  assert.equal(knockoutRoundLabel(2, 2), 'semifinal')
  assert.equal(knockoutRoundLabel(4, 1), 'quarterfinal')
  assert.equal(knockoutRoundLabel(8, 1), 'round_of_16')
  assert.equal(knockoutRoundLabel(16, 1), 'round_1')
})

test('identifyBracket finds the two-loser-fed third place and the terminal final', () => {
  const { thirdPlaceId, finalId } = identifyBracket(fourWithThird())
  assert.equal(thirdPlaceId, 'third')
  assert.equal(finalId, 'final')
})

test('identifyBracket: no third-place match → thirdPlaceId null, final is terminal', () => {
  const rows: BracketMatchRef[] = [
    { id: 'sf1', roundNumber: 1, sourceMatchAId: null, sourceMatchBId: null, sourceOutcomeA: null, sourceOutcomeB: null },
    { id: 'sf2', roundNumber: 1, sourceMatchAId: null, sourceMatchBId: null, sourceOutcomeA: null, sourceOutcomeB: null },
    { id: 'final', roundNumber: 2, sourceMatchAId: 'sf1', sourceMatchBId: 'sf2', sourceOutcomeA: 'winner', sourceOutcomeB: 'winner' },
  ]
  const { thirdPlaceId, finalId } = identifyBracket(rows)
  assert.equal(thirdPlaceId, null)
  assert.equal(finalId, 'final')
})

test('buildBracketRounds groups rounds, labels them, and extracts third place', () => {
  const res = buildBracketRounds(fourWithThird(), (m, meta) => ({ id: m.id, ...meta }))
  assert.equal(res.rounds.length, 2)
  assert.equal(res.rounds[0].label, 'semifinal')
  assert.equal(res.rounds[0].matches.length, 2)
  assert.equal(res.rounds[1].label, 'final')
  assert.equal(res.rounds[1].matches.length, 1)
  assert.equal(res.rounds[1].matches[0].isFinal, true)
  // Third place is not in the rounds list, it is returned separately and flagged.
  assert.ok(res.thirdPlaceMatch)
  assert.equal(res.thirdPlaceMatch!.id, 'third')
  assert.equal(res.thirdPlaceMatch!.isThirdPlace, true)
  assert.equal(res.finalId, 'final')
  assert.equal(res.thirdPlaceId, 'third')
})

test('buildBracketRounds: empty input yields no rounds', () => {
  const res = buildBracketRounds([] as BracketMatchRef[], (m) => m)
  assert.equal(res.rounds.length, 0)
  assert.equal(res.thirdPlaceMatch, null)
  assert.equal(res.finalId, null)
})
