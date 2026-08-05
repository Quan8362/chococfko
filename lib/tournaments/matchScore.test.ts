import { test } from 'node:test'
import assert from 'node:assert/strict'

import { matchScoreDisplay, type MatchScoreInput } from './matchScore.ts'

// The management schedule + knockout results must show the REAL per-game scores, never the
// winner=1 / loser=0 sets tally that used to render as a fake "1–0" beside the team names.

const base: MatchScoreInput = {
  status: 'completed',
  winnerId: 'a',
  competitorAId: 'a',
  competitorBId: 'b',
  games: [],
}

test('single game shows the real point score (never 1–0)', () => {
  const v = matchScoreDisplay({ ...base, games: [{ scoreA: 21, scoreB: 15 }] })
  assert.equal(v.compactScore, '21–15')
  assert.equal(v.hasRealScores, true)
})

test('two games join with a middle dot, side-A first', () => {
  const v = matchScoreDisplay({
    ...base,
    games: [
      { scoreA: 21, scoreB: 11 },
      { scoreA: 21, scoreB: 12 },
    ],
  })
  assert.equal(v.compactScore, '21–11 · 21–12')
  assert.equal(v.ariaScores, '21–11, 21–12')
})

test('three games render in stored order (not reordered by winner)', () => {
  const v = matchScoreDisplay({
    ...base,
    winnerId: 'a',
    games: [
      { scoreA: 21, scoreB: 15 },
      { scoreA: 15, scoreB: 21 },
      { scoreA: 21, scoreB: 18 },
    ],
  })
  assert.equal(v.compactScore, '21–15 · 15–21 · 21–18')
})

test('scores are never flipped when side B wins', () => {
  // B is the winner but the games stay oriented A-first: 15–21 · 12–21.
  const v = matchScoreDisplay({
    ...base,
    winnerId: 'b',
    games: [
      { scoreA: 15, scoreB: 21 },
      { scoreA: 12, scoreB: 21 },
    ],
  })
  assert.equal(v.compactScore, '15–21 · 12–21')
  assert.equal(v.isWinnerA, false)
  assert.equal(v.isWinnerB, true)
})

test('winner flags echo the authoritative winnerId only', () => {
  const a = matchScoreDisplay({ ...base, winnerId: 'a', games: [{ scoreA: 21, scoreB: 10 }] })
  assert.equal(a.isWinnerA, true)
  assert.equal(a.isWinnerB, false)
})

test('a not-yet-played match has no real score (no fake 0–0)', () => {
  const v = matchScoreDisplay({ ...base, status: 'ready', winnerId: null, games: [] })
  assert.equal(v.hasRealScores, false)
  assert.equal(v.compactScore, '')
  assert.equal(v.isWinnerA, false)
})

test('completed but missing per-game data falls back (no fabricated 1–0)', () => {
  const v = matchScoreDisplay({ ...base, games: [] })
  assert.equal(v.hasRealScores, false)
  assert.equal(v.compactScore, '')
  // Winner is still echoed from winnerId, not derived from any score.
  assert.equal(v.isWinnerA, true)
})

test('a BYE carries no score and no winner highlight', () => {
  const v = matchScoreDisplay({ ...base, status: 'bye', winnerId: 'a', competitorBId: null, games: [] })
  assert.equal(v.hasRealScores, false)
  assert.equal(v.compactScore, '')
  assert.equal(v.isWinnerA, false, 'a BYE is not a completed match → no highlight')
})
