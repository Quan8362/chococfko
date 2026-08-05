import { test } from 'node:test'
import assert from 'node:assert/strict'

import { formatGameScores } from './format.ts'
import { knockoutScoreView, type KnockoutScoreInput } from './bracketScore.ts'

// The public knockout bracket must present the REAL stored result, not the winner=1 / loser=0 sets
// tally that used to render as a fake "1–0" scoreline. These lock the presentation decisions.

const base: KnockoutScoreInput = {
  status: 'completed',
  winnerId: 'a',
  competitorAId: 'a',
  competitorBId: 'b',
  games: [],
  gamesWonA: 0,
  gamesWonB: 0,
}

// ── formatGameScores ────────────────────────────────────────────────────────────────────────
test('formatGameScores joins two games with points en-dash and a middle dot', () => {
  assert.equal(
    formatGameScores([
      { scoreA: 21, scoreB: 15 },
      { scoreA: 18, scoreB: 21 },
    ]),
    '21–15 · 18–21',
  )
})

test('formatGameScores renders all three games of a best-of-three exactly', () => {
  assert.equal(
    formatGameScores([
      { scoreA: 21, scoreB: 15 },
      { scoreA: 15, scoreB: 21 },
      { scoreA: 21, scoreB: 18 },
    ]),
    '21–15 · 15–21 · 21–18',
  )
})

test('formatGameScores returns empty string for no games (no fabricated 0–0)', () => {
  assert.equal(formatGameScores([]), '')
})

// ── knockoutScoreView ───────────────────────────────────────────────────────────────────────
test('two-game (best-of-2) shows sets on each side and the real per-game detail', () => {
  const v = knockoutScoreView({
    ...base,
    games: [
      { scoreA: 21, scoreB: 15 },
      { scoreA: 21, scoreB: 12 },
    ],
    gamesWonA: 2,
    gamesWonB: 0,
  })
  assert.equal(v.scoreA, '2')
  assert.equal(v.scoreB, '0')
  assert.equal(v.detail, '21–15 · 21–12')
  assert.equal(v.isWinnerA, true)
  assert.equal(v.isWinnerB, false)
})

test('three-game (best-of-3) shows the 2–1 sets and all three games', () => {
  const v = knockoutScoreView({
    ...base,
    games: [
      { scoreA: 21, scoreB: 15 },
      { scoreA: 15, scoreB: 21 },
      { scoreA: 21, scoreB: 18 },
    ],
    gamesWonA: 2,
    gamesWonB: 1,
  })
  assert.equal(v.scoreA, '2')
  assert.equal(v.scoreB, '1')
  assert.equal(v.detail, '21–15 · 15–21 · 21–18')
})

test('single game shows the real point score, never the 1–0 sets fallback', () => {
  const v = knockoutScoreView({
    ...base,
    games: [{ scoreA: 21, scoreB: 15 }],
    gamesWonA: 1,
    gamesWonB: 0,
  })
  // The real points, not "1" and "0".
  assert.equal(v.scoreA, '21')
  assert.equal(v.scoreB, '15')
  assert.equal(v.detail, '') // a single game needs no separate detail line
  assert.equal(v.isWinnerA, true)
})

test('a not-yet-played match shows no score at all (no fake 0–0)', () => {
  const v = knockoutScoreView({ ...base, status: 'ready', winnerId: null, games: [] })
  assert.equal(v.scoreA, null)
  assert.equal(v.scoreB, null)
  assert.equal(v.detail, '')
  assert.equal(v.isWinnerA, false)
  assert.equal(v.isWinnerB, false)
})

test('a BYE shows no score and no winner highlight (never a 1–0)', () => {
  const v = knockoutScoreView({
    ...base,
    status: 'bye',
    winnerId: 'a',
    competitorBId: null,
    games: [],
  })
  assert.equal(v.scoreA, null)
  assert.equal(v.scoreB, null)
  assert.equal(v.isWinnerA, false, 'BYE is not a completed match → no highlight')
})

test('completed but with no per-game data falls back to no score (fail-safe, not 0–0)', () => {
  const v = knockoutScoreView({ ...base, games: [], gamesWonA: 0, gamesWonB: 0 })
  assert.equal(v.scoreA, null)
  assert.equal(v.scoreB, null)
  assert.equal(v.detail, '')
  // Winner is still echoed from the authoritative winnerId (not derived from any score).
  assert.equal(v.isWinnerA, true)
})
