import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateMatchScores } from './score-input.ts'

const A = 'aaaaaaaa-0000-0000-0000-000000000001'
const B = 'bbbbbbbb-0000-0000-0000-000000000002'

test('a single valid game yields a decisive winner', () => {
  const r = validateMatchScores({ competitorAId: A, competitorBId: B, games: [{ scoreA: 21, scoreB: 15 }] })
  assert.ok(r.ok)
  assert.equal(r.winnerId, A)
  assert.equal(r.winnerSide, 'A')
  assert.equal(r.gamesWonA, 1)
  assert.equal(r.gamesWonB, 0)
  assert.equal(r.pointsForA, 21)
  assert.equal(r.pointsForB, 15)
})

test('multiple games: winner is who won more games, points are TOTALED (not games won)', () => {
  const r = validateMatchScores({
    competitorAId: A,
    competitorBId: B,
    games: [
      { scoreA: 21, scoreB: 15 },
      { scoreA: 18, scoreB: 21 },
      { scoreA: 21, scoreB: 17 },
    ],
  })
  assert.ok(r.ok)
  assert.equal(r.winnerId, A)
  assert.equal(r.gamesWonA, 2)
  assert.equal(r.gamesWonB, 1)
  assert.equal(r.pointsForA, 21 + 18 + 21) // 60
  assert.equal(r.pointsForB, 15 + 21 + 17) // 53
  assert.deepEqual(
    r.games.map((g) => g.gameNumber),
    [1, 2, 3],
  )
})

test('empty game list is rejected with MISSING_SCORE', () => {
  const r = validateMatchScores({ competitorAId: A, competitorBId: B, games: [] })
  assert.ok(!r.ok)
  assert.equal(r.error.code, 'MISSING_SCORE')
})

test('a tied game is rejected with TIED_GAME_SCORE', () => {
  const r = validateMatchScores({ competitorAId: A, competitorBId: B, games: [{ scoreA: 20, scoreB: 20 }] })
  assert.ok(!r.ok)
  assert.equal(r.error.code, 'TIED_GAME_SCORE')
})

test('equal games won (no decisive winner) is rejected with INDECISIVE_MATCH', () => {
  const r = validateMatchScores({
    competitorAId: A,
    competitorBId: B,
    games: [
      { scoreA: 21, scoreB: 10 },
      { scoreA: 10, scoreB: 21 },
    ],
  })
  assert.ok(!r.ok)
  assert.equal(r.error.code, 'INDECISIVE_MATCH')
})

test('negative and non-integer scores are rejected with INVALID_SCORE + the game number', () => {
  const neg = validateMatchScores({ competitorAId: A, competitorBId: B, games: [{ scoreA: 21, scoreB: -1 }] })
  assert.ok(!neg.ok)
  assert.equal(neg.error.code, 'INVALID_SCORE')
  assert.equal((neg.error as { gameNumber: number }).gameNumber, 1)

  const frac = validateMatchScores({
    competitorAId: A,
    competitorBId: B,
    games: [
      { scoreA: 21, scoreB: 10 },
      { scoreA: 21.5, scoreB: 10 },
    ],
  })
  assert.ok(!frac.ok)
  assert.equal(frac.error.code, 'INVALID_SCORE')
  assert.equal((frac.error as { gameNumber: number }).gameNumber, 2)
})

test('A === B is rejected with SELF_MATCH (no scores of one competitor against itself)', () => {
  const r = validateMatchScores({ competitorAId: A, competitorBId: A, games: [{ scoreA: 21, scoreB: 10 }] })
  assert.ok(!r.ok)
  assert.equal(r.error.code, 'SELF_MATCH')
})

test('no 21-point / margin-of-2 rule is imposed (any decisive integer score is accepted)', () => {
  const r = validateMatchScores({ competitorAId: A, competitorBId: B, games: [{ scoreA: 3, scoreB: 2 }] })
  assert.ok(r.ok)
  assert.equal(r.winnerId, A)
})
