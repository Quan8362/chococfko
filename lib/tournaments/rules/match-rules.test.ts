// Run with: node --test lib/tournaments/rules/match-rules.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  compareByTieBreakToken,
  deriveGameWinnerByRules,
  validateGameScoreByRules,
  validateMatchScoresByRules,
} from './match-rules.ts'
import { isRuleEngineError } from './errors.ts'
import type { MatchRules, TieBreakStat } from './types.ts'

const groupTo = (points: number): MatchRules => ({
  games_to_win: 1, max_games: 1, points_to_win: points, win_by: 1, points_cap: null, allow_tied_game: false,
})
const knockout: MatchRules = {
  games_to_win: 1, max_games: 1, points_to_win: 21, win_by: 2, points_cap: 31, allow_tied_game: false,
}

// (7) Beginner group rule → touch 15.
test('beginner group: reaching 15 wins the game', () => {
  const r = validateGameScoreByRules(groupTo(15), { scoreA: 15, scoreB: 10 })
  assert.deepEqual(r, { ok: true, winner: 'A', tied: false })
})
test('beginner group: below 15 is not decided', () => {
  const r = validateGameScoreByRules(groupTo(15), { scoreA: 14, scoreB: 10 })
  assert.equal(r.ok, false)
  assert.equal(r.ok === false && r.code, 'TARGET_NOT_REACHED')
})

// (8) Standard group rule → touch 21.
test('standard group: reaching 21 wins the game (win_by 1)', () => {
  assert.deepEqual(validateGameScoreByRules(groupTo(21), { scoreA: 21, scoreB: 20 }), { ok: true, winner: 'A', tied: false })
  assert.equal(validateGameScoreByRules(groupTo(21), { scoreA: 20, scoreB: 18 }).ok, false)
})

// (9) Knockout → touch 21.
test('knockout: 21-15 wins', () => {
  assert.deepEqual(validateGameScoreByRules(knockout, { scoreA: 15, scoreB: 21 }), { ok: true, winner: 'B', tied: false })
})

// (10) Win-by-2.
test('knockout win-by-2: 21-20 is not enough, 22-20 wins', () => {
  const tooClose = validateGameScoreByRules(knockout, { scoreA: 21, scoreB: 20 })
  assert.equal(tooClose.ok === false && tooClose.code, 'WIN_BY_NOT_MET')
  assert.deepEqual(validateGameScoreByRules(knockout, { scoreA: 22, scoreB: 20 }), { ok: true, winner: 'A', tied: false })
  assert.deepEqual(validateGameScoreByRules(knockout, { scoreA: 23, scoreB: 21 }), { ok: true, winner: 'A', tied: false })
  // A deuce below the cap must end exactly on the win_by margin.
  const overshoot = validateGameScoreByRules(knockout, { scoreA: 24, scoreB: 21 })
  assert.equal(overshoot.ok === false && overshoot.code, 'INVALID_OVERSHOOT')
})

// (11) Cap 31.
test('knockout cap 31: 31-30 wins, 32-30 exceeds cap', () => {
  assert.deepEqual(validateGameScoreByRules(knockout, { scoreA: 31, scoreB: 30 }), { ok: true, winner: 'A', tied: false })
  const over = validateGameScoreByRules(knockout, { scoreA: 32, scoreB: 30 })
  assert.equal(over.ok === false && over.code, 'EXCEEDS_CAP')
})

// (12) Tied game blocked when not allowed.
test('tied game blocked when allow_tied_game is false', () => {
  const r = validateGameScoreByRules(groupTo(15), { scoreA: 15, scoreB: 15 })
  assert.equal(r.ok === false && r.code, 'TIED_NOT_ALLOWED')
})
test('tied game accepted when allow_tied_game is true', () => {
  const r = validateGameScoreByRules({ ...groupTo(15), allow_tied_game: true }, { scoreA: 15, scoreB: 15 })
  assert.deepEqual(r, { ok: true, winner: null, tied: true })
})

test('non-integer / negative score rejected', () => {
  assert.equal(validateGameScoreByRules(groupTo(21), { scoreA: 21.5, scoreB: 10 }).ok, false)
  assert.equal(validateGameScoreByRules(groupTo(21), { scoreA: -1, scoreB: 10 }).ok, false)
})

// deriveGameWinnerByRules throws on illegal score.
test('deriveGameWinnerByRules returns side and throws typed error on illegal', () => {
  assert.equal(deriveGameWinnerByRules(groupTo(21), { scoreA: 21, scoreB: 5 }), 'A')
  try {
    deriveGameWinnerByRules(knockout, { scoreA: 21, scoreB: 20 })
    assert.fail('expected throw')
  } catch (e) {
    assert.ok(isRuleEngineError(e) && e.code === 'INVALID_GAME_SCORE')
  }
})

// (13) Match short of games_to_win is blocked.
test('best-of-3 match not decided after a single game', () => {
  const bo3: MatchRules = { ...knockout, games_to_win: 2, max_games: 3 }
  const one = validateMatchScoresByRules(bo3, [{ scoreA: 21, scoreB: 10 }])
  assert.equal(one.ok, false)
  assert.equal(one.ok === false && one.error.kind, 'not_decided')
  const two = validateMatchScoresByRules(bo3, [{ scoreA: 21, scoreB: 10 }, { scoreA: 21, scoreB: 15 }])
  assert.equal(two.ok, true)
  assert.equal(two.ok === true && two.winner, 'A')
})

test('match rejects an illegal game and too many games', () => {
  const bad = validateMatchScoresByRules(knockout, [{ scoreA: 21, scoreB: 20 }])
  assert.equal(bad.ok === false && bad.error.kind, 'game')
  const bo3: MatchRules = { ...knockout, games_to_win: 2, max_games: 3 }
  const tooMany = validateMatchScoresByRules(bo3, [
    { scoreA: 21, scoreB: 10 }, { scoreA: 10, scoreB: 21 }, { scoreA: 21, scoreB: 10 }, { scoreA: 21, scoreB: 12 },
  ])
  assert.equal(tooMany.ok === false && tooMany.error.kind, 'too_many_games')
})

// (15) Unsupported tie-break returns a typed result (never silently ignored).
test('tie-break: auto tokens compare, manual tokens are typed-unsupported', () => {
  const a: TieBreakStat = { tablePoints: 3, pointDifference: 10, pointsFor: 40 }
  const b: TieBreakStat = { tablePoints: 3, pointDifference: 5, pointsFor: 30 }
  const pd = compareByTieBreakToken('point_difference', a, b)
  assert.deepEqual(pd, { supported: true, cmp: 5 })
  const org = compareByTieBreakToken('organizer_decision', a, b)
  assert.deepEqual(org, { supported: false, token: 'organizer_decision' })
  const h2h = compareByTieBreakToken('head_to_head', a, b)
  assert.deepEqual(h2h, { supported: false, token: 'head_to_head' })
})

// (20) Inputs are never mutated.
test('validation does not mutate a frozen rules object', () => {
  const rules = Object.freeze(groupTo(21))
  assert.doesNotThrow(() => validateGameScoreByRules(rules, { scoreA: 21, scoreB: 10 }))
})
