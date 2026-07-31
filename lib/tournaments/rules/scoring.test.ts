import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  resolveMatchScoringRules,
  evaluateMatchScoreWithSnapshot,
  type MatchStageDescriptor,
} from './scoring.ts'
import type { MatchRules, RuleSet } from './types.ts'

// ── Rule-set builders mirroring the FJP Olympiad 2026 preset shapes ─────────────────────────────
function match(over: Partial<MatchRules> = {}): MatchRules {
  return {
    games_to_win: 1,
    max_games: 1,
    points_to_win: 15,
    win_by: 1,
    points_cap: null,
    allow_tied_game: false,
    ...over,
  }
}

// Handicap DISABLED by default so the scoring-logic tests exercise the game rules (an enabled but
// unconfigured handicap fails closed BEFORE any game is judged — see the dedicated handicap tests).
function ruleSet(opts: {
  group?: Partial<MatchRules>
  knockout?: Partial<MatchRules>
  handicap?: RuleSet['handicap']
  winTablePoints?: number
  lossTablePoints?: number
} = {}): RuleSet {
  return {
    group: {
      match: match({ points_to_win: 15, win_by: 1, ...opts.group }),
      win_table_points: opts.winTablePoints ?? 1,
      loss_table_points: opts.lossTablePoints ?? 0,
      tie_break_order: ['table_points', 'point_difference', 'points_for'],
    },
    knockout: {
      match: match({ points_to_win: 21, win_by: 2, points_cap: 31, ...opts.knockout }),
    },
    handicap: opts.handicap ?? { enabled: false, mode: 'starting_score', entries: [], requires_configuration: false },
  }
}

const GROUP: MatchStageDescriptor = { stage: 'group', bracket: null, status: 'ready' }
const CHAMP: MatchStageDescriptor = { stage: 'knockout', bracket: 'championship', status: 'ready' }
const CONSO: MatchStageDescriptor = { stage: 'knockout', bracket: 'consolation', status: 'ready' }

const games = (...pairs: [number, number][]) => pairs.map(([scoreA, scoreB]) => ({ scoreA, scoreB }))

// ── 1. Beginner group 15–14 is valid ────────────────────────────────────────────────────────────
test('1 · beginner group 15–14 is a valid win for A', () => {
  const r = evaluateMatchScoreWithSnapshot({ rules: ruleSet(), stage: GROUP, games: games([15, 14]) })
  assert.ok(r.ok)
  assert.equal(r.winner, 'A')
  assert.equal(r.stage, 'group')
})

// ── 2. Beginner group 14–14 is not a completed game ──────────────────────────────────────────────
test('2 · beginner group 14–14 is rejected (draw not allowed, not decided)', () => {
  const r = evaluateMatchScoreWithSnapshot({ rules: ruleSet(), stage: GROUP, games: games([14, 14]) })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.code, 'game_tied_not_allowed')
})

// ── 3. Standard group 21–20 valid at win-by 1 ────────────────────────────────────────────────────
test('3 · standard group 21–20 is valid when win_by is 1', () => {
  const r = evaluateMatchScoreWithSnapshot({
    rules: ruleSet({ group: { points_to_win: 21, win_by: 1 } }),
    stage: GROUP,
    games: games([21, 20]),
  })
  assert.ok(r.ok)
  assert.equal(r.winner, 'A')
})

// ── 4. Knockout 21–20 blocked at win-by 2 ────────────────────────────────────────────────────────
test('4 · knockout 21–20 is blocked when win_by is 2', () => {
  const r = evaluateMatchScoreWithSnapshot({ rules: ruleSet(), stage: CHAMP, games: games([21, 20]) })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.code, 'score_margin_invalid')
})

// ── 5. Knockout 22–20 valid ──────────────────────────────────────────────────────────────────────
test('5 · knockout 22–20 is a valid deuce win', () => {
  const r = evaluateMatchScoreWithSnapshot({ rules: ruleSet(), stage: CHAMP, games: games([22, 20]) })
  assert.ok(r.ok)
  assert.equal(r.winner, 'A')
})

// ── 6. Cap 31 ends the game with the engine's cap semantics ──────────────────────────────────────
test('6 · knockout 31–30 ends at the cap', () => {
  const r = evaluateMatchScoreWithSnapshot({ rules: ruleSet(), stage: CHAMP, games: games([31, 30]) })
  assert.ok(r.ok)
  assert.equal(r.winner, 'A')
})

// ── 7. Score above the cap is blocked ────────────────────────────────────────────────────────────
test('7 · knockout 32–30 exceeds the cap', () => {
  const r = evaluateMatchScoreWithSnapshot({ rules: ruleSet(), stage: CHAMP, games: games([32, 30]) })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.code, 'score_above_cap')
})

// ── 8. A tie is blocked ──────────────────────────────────────────────────────────────────────────
test('8 · a drawn game is blocked when the rules forbid it', () => {
  const r = evaluateMatchScoreWithSnapshot({ rules: ruleSet(), stage: GROUP, games: games([15, 15]) })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.code, 'game_tied_not_allowed')
})

// ── 9. A best-of-3 (games_to_win 2) resolves correctly ───────────────────────────────────────────
test('9 · best-of-3 knockout resolves 2–1 to A', () => {
  const rules = ruleSet({ knockout: { games_to_win: 2, max_games: 3, points_to_win: 21, win_by: 2, points_cap: 31 } })
  const r = evaluateMatchScoreWithSnapshot({ rules, stage: CHAMP, games: games([22, 20], [18, 21], [21, 19]) })
  assert.ok(r.ok)
  assert.equal(r.winner, 'A')
  assert.equal(r.gamesWonA, 2)
  assert.equal(r.gamesWonB, 1)
})

// ── 10. An extra game after the match is decided is blocked ──────────────────────────────────────
test('10 · a game recorded after the match is decided is blocked', () => {
  const rules = ruleSet({ knockout: { games_to_win: 2, max_games: 3, points_to_win: 21, win_by: 2, points_cap: 31 } })
  const r = evaluateMatchScoreWithSnapshot({ rules, stage: CHAMP, games: games([21, 10], [21, 10], [10, 21]) })
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.equal(r.code, 'match_already_decided')
    assert.equal(r.gameNumber, 3)
  }
})

// ── 10b. More games than max_games is blocked ────────────────────────────────────────────────────
test('10b · more games than max_games is blocked', () => {
  const r = evaluateMatchScoreWithSnapshot({ rules: ruleSet(), stage: GROUP, games: games([15, 3], [15, 4]) })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.code, 'too_many_games')
})

// ── 11–14. Stage resolution ──────────────────────────────────────────────────────────────────────
test('11 · a group match resolves to the group rules', () => {
  const res = resolveMatchScoringRules(GROUP, ruleSet({ group: { points_to_win: 15 } }))
  assert.ok(res.ok)
  assert.equal(res.stage, 'group')
  assert.equal(res.match.points_to_win, 15)
})

test('12 · a championship match resolves to the knockout rules', () => {
  const res = resolveMatchScoringRules(CHAMP, ruleSet())
  assert.ok(res.ok)
  assert.equal(res.stage, 'knockout')
  assert.equal(res.match.points_to_win, 21)
})

test('13 · a consolation match resolves to the knockout rules', () => {
  const res = resolveMatchScoringRules(CONSO, ruleSet())
  assert.ok(res.ok)
  assert.equal(res.stage, 'knockout')
})

test('14 · a BYE is never scoreable', () => {
  const res = resolveMatchScoringRules({ stage: 'group', bracket: null, status: 'bye' }, ruleSet())
  assert.equal(res.ok, false)
  if (!res.ok) assert.equal(res.error, 'bye_not_scoreable')
  const ev = evaluateMatchScoreWithSnapshot({ rules: ruleSet(), stage: { stage: 'knockout', bracket: 'championship', status: 'bye' }, games: games([21, 10]) })
  assert.equal(ev.ok, false)
  if (!ev.ok) assert.equal(ev.code, 'bye_not_scoreable')
})

test('14b · an unknown stage is a typed error, never a silent fallback', () => {
  const res = resolveMatchScoringRules({ stage: 'mystery', bracket: null, status: 'ready' }, ruleSet())
  assert.equal(res.ok, false)
  if (!res.ok) assert.equal(res.error, 'match_stage_unsupported')
})

// ── 15. The winner is always derived from the scores — no client winner can be injected ──────────
test('15 · the winner is derived from the scores (no winner input exists)', () => {
  const rBWins = evaluateMatchScoreWithSnapshot({ rules: ruleSet(), stage: GROUP, games: games([10, 15]) })
  assert.ok(rBWins.ok)
  assert.equal(rBWins.winner, 'B') // scores decide it; the caller cannot pass a winner at all
})

// ── 19. An enabled-but-unconfigured handicap fails closed ────────────────────────────────────────
test('19 · an enabled but unconfigured handicap blocks scoring', () => {
  const rules = ruleSet({ handicap: { enabled: true, mode: 'starting_score', entries: [], requires_configuration: true } })
  const r = evaluateMatchScoreWithSnapshot({ rules, stage: GROUP, games: games([15, 10]) })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.code, 'handicap_not_configured')
})

// ── 20. A disabled handicap scores normally ──────────────────────────────────────────────────────
test('20 · a disabled handicap allows scoring', () => {
  const rules = ruleSet({ handicap: { enabled: false, mode: 'starting_score', entries: [], requires_configuration: false } })
  const r = evaluateMatchScoreWithSnapshot({ rules, stage: GROUP, games: games([15, 10]) })
  assert.ok(r.ok)
  assert.equal(r.winner, 'A')
})
