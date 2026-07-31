// Run with: node --test lib/tournaments/domain/outcome.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deriveMatchOutcome } from './outcome.ts'
import { isTournamentDomainError, type TournamentErrorCode } from './errors.ts'
import type { GameScore, MatchInput } from './types.ts'

const match = (games: GameScore[], over: Partial<MatchInput> = {}): MatchInput => ({
  competitorAId: 'a', competitorBId: 'b', status: 'completed', games, ...over,
})

function expectCode(fn: () => unknown, code: TournamentErrorCode) {
  try { fn(); assert.fail(`expected ${code}`) }
  catch (e) { assert.ok(isTournamentDomainError(e) && e.code === code, `got ${(e as Error).message}`) }
}

test('outcome: winner from games won; points are set totals', () => {
  const o = deriveMatchOutcome(match([
    { gameNumber: 1, scoreA: 21, scoreB: 15 },
    { gameNumber: 2, scoreA: 18, scoreB: 21 },
    { gameNumber: 3, scoreA: 21, scoreB: 17 },
  ]))
  assert.equal(o.winnerId, 'a')
  assert.equal(o.loserId, 'b')
  assert.equal(o.gamesWonA, 2)
  assert.equal(o.gamesWonB, 1)
  assert.equal(o.pointsForA, 60)
  assert.equal(o.pointsForB, 53)
})

test('outcome: single-game match supported', () => {
  const o = deriveMatchOutcome(match([{ gameNumber: 1, scoreA: 15, scoreB: 21 }]))
  assert.equal(o.winnerId, 'b')
})

test('outcome: completed with no games → MISSING_SCORE', () => {
  expectCode(() => deriveMatchOutcome(match([])), 'MISSING_SCORE')
})

test('outcome: missing competitor → MISSING_SCORE', () => {
  expectCode(() => deriveMatchOutcome(match([{ gameNumber: 1, scoreA: 21, scoreB: 10 }], { competitorBId: null })), 'MISSING_SCORE')
})

test('outcome: tied game → TIED_GAME_SCORE', () => {
  expectCode(() => deriveMatchOutcome(match([{ gameNumber: 1, scoreA: 20, scoreB: 20 }])), 'TIED_GAME_SCORE')
})

test('outcome: equal games won → INDECISIVE_MATCH', () => {
  expectCode(() => deriveMatchOutcome(match([
    { gameNumber: 1, scoreA: 21, scoreB: 10 },
    { gameNumber: 2, scoreA: 10, scoreB: 21 },
  ])), 'INDECISIVE_MATCH')
})

test('outcome: recorded winner disagreeing with scores → WINNER_MISMATCH', () => {
  expectCode(() => deriveMatchOutcome(match([{ gameNumber: 1, scoreA: 21, scoreB: 10 }], { winnerId: 'b' })), 'WINNER_MISMATCH')
})

test('outcome: negative score rejected', () => {
  expectCode(() => deriveMatchOutcome(match([{ gameNumber: 1, scoreA: -1, scoreB: 10 }])), 'MISSING_SCORE')
})

test('outcome: self-match rejected', () => {
  expectCode(() => deriveMatchOutcome(match([{ gameNumber: 1, scoreA: 21, scoreB: 10 }], { competitorBId: 'a' })), 'SELF_MATCH')
})
