// Run with: node --test lib/tournaments/rules/handicap-scoring.test.ts
//
// The OFFICIAL FJP OLYMPIAD 2026 gender handicap (Prompt 15D-1B). Verifies the pure layers end to
// end: starting-score computation (difference-based), the scoring evaluator applying it as a per-game
// head start, the typed blockers (missing / invalid composition, final < starting), and the v1(pending)
// vs v2(configured) preset behaviour. DB persistence is covered by supabase/tournament_fjp_handicap_tests.sql.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { calculateStartingScore } from './handicap.ts'
import { evaluateMatchScoreWithSnapshot, type MatchStageDescriptor } from './scoring.ts'
import { buildFjpOlympiad2026Preset, buildFjpOlympiad2026PresetV2, getRulePreset } from './presets.ts'
import { toPublicEventRuleSummary } from './persistence.ts'
import type { CompetitorComposition, RuleSet } from './types.ts'

// ── Compositions ────────────────────────────────────────────────────────────────────────────────
const MM: CompetitorComposition = { kind: 'pair', maleCount: 2, femaleCount: 0 } // 0 women
const MF: CompetitorComposition = { kind: 'pair', maleCount: 1, femaleCount: 1 } // 1 woman
const FF: CompetitorComposition = { kind: 'pair', maleCount: 0, femaleCount: 2 } // 2 women

// The official v2 rule sets (configured handicap: 2 points per surplus woman).
const V2 = buildFjpOlympiad2026PresetV2()
const beginnerRules = V2.variants.find((v) => v.category === 'beginner')!.rules
const standardRules = V2.variants.find((v) => v.category === 'standard')!.rules
const H = beginnerRules.handicap // { enabled, mode: female_count_difference, points_per_difference: 2, ... }

const GROUP: MatchStageDescriptor = { stage: 'group', bracket: null, status: 'ready' }
const CHAMP: MatchStageDescriptor = { stage: 'knockout', bracket: 'championship', status: 'ready' }
const games = (...pairs: [number, number][]) => pairs.map(([scoreA, scoreB]) => ({ scoreA, scoreB }))

function start(a: CompetitorComposition | null, b: CompetitorComposition | null) {
  return calculateStartingScore({ handicap: H, competitorA: a, competitorB: b })
}

// ── 1–9. Difference-based starting scores (the head start each pair opens on) ─────────────────────
test('1 · MM vs FF → 0–4', () => {
  const r = start(MM, FF)
  assert.ok(r.ok)
  assert.equal(r.value.startingScoreA, 0)
  assert.equal(r.value.startingScoreB, 4)
})

test('2 · FF vs MM → 4–0', () => {
  const r = start(FF, MM)
  assert.ok(r.ok && r.value.startingScoreA === 4 && r.value.startingScoreB === 0)
})

test('3 · MM vs MF → 0–2', () => {
  const r = start(MM, MF)
  assert.ok(r.ok && r.value.startingScoreA === 0 && r.value.startingScoreB === 2)
})

test('4 · MF vs MM → 2–0', () => {
  const r = start(MF, MM)
  assert.ok(r.ok && r.value.startingScoreA === 2 && r.value.startingScoreB === 0)
})

test('5 · MF vs FF → 0–2', () => {
  const r = start(MF, FF)
  assert.ok(r.ok && r.value.startingScoreA === 0 && r.value.startingScoreB === 2)
})

test('6 · FF vs MF → 2–0', () => {
  const r = start(FF, MF)
  assert.ok(r.ok && r.value.startingScoreA === 2 && r.value.startingScoreB === 0)
})

test('7 · MM vs MM → 0–0', () => {
  const r = start(MM, MM)
  assert.ok(r.ok && r.value.startingScoreA === 0 && r.value.startingScoreB === 0)
})

test('8 · MF vs MF → 0–0', () => {
  const r = start(MF, MF)
  assert.ok(r.ok && r.value.startingScoreA === 0 && r.value.startingScoreB === 0)
})

test('9 · FF vs FF → 0–0', () => {
  const r = start(FF, FF)
  assert.ok(r.ok && r.value.startingScoreA === 0 && r.value.startingScoreB === 0)
})

// ── 10. A missing composition blocks scoring (typed, never a 0–0 fallback) ────────────────────────
test('10 · a missing composition is blocked (competitor_composition_required)', () => {
  const r = evaluateMatchScoreWithSnapshot({
    rules: beginnerRules, stage: GROUP, games: games([15, 6]),
    competitorA: FF, competitorB: null,
  })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.code, 'competitor_composition_required')
})

// ── 11. An invalid composition (pair not totalling 2) is blocked ──────────────────────────────────
test('11 · an invalid pair composition is blocked (competitor_composition_invalid)', () => {
  const bad: CompetitorComposition = { kind: 'pair', maleCount: 2, femaleCount: 1 } // total 3
  const r = evaluateMatchScoreWithSnapshot({
    rules: beginnerRules, stage: GROUP, games: games([15, 6]),
    competitorA: bad, competitorB: MM,
  })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.code, 'competitor_composition_invalid')
})

// ── 12. There is NO client starting-score input — the head start is derived from compositions ─────
test('12 · a client-forged starting score is impossible; head start is from composition only', () => {
  // The evaluator takes only {scoreA,scoreB} games — no starting-score channel. Different game scores
  // with the SAME compositions always yield the SAME server-computed head start.
  const a = evaluateMatchScoreWithSnapshot({ rules: beginnerRules, stage: GROUP, games: games([15, 6]), competitorA: FF, competitorB: MM })
  const b = evaluateMatchScoreWithSnapshot({ rules: beginnerRules, stage: GROUP, games: games([15, 9]), competitorA: FF, competitorB: MM })
  assert.ok(a.ok && b.ok)
  assert.equal(a.handicap.startingScoreA, 4)
  assert.equal(b.handicap.startingScoreA, 4)
})

// ── 13. A final score below the starting score is blocked ─────────────────────────────────────────
test('13 · a final score below the starting score is blocked (score_below_starting_score)', () => {
  // FF vs MM ⇒ A opens on 4. A final of 3 is below its head start.
  const r = evaluateMatchScoreWithSnapshot({
    rules: beginnerRules, stage: GROUP, games: games([3, 15]),
    competitorA: FF, competitorB: MM,
  })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.code, 'score_below_starting_score')
})

// ── 14. Beginner group (touch-15) applies the handicap and still judges the final scoreboard ─────
test('14 · beginner 15-point group scores with the handicap applied', () => {
  const r = evaluateMatchScoreWithSnapshot({
    rules: beginnerRules, stage: GROUP, games: games([15, 6]),
    competitorA: FF, competitorB: MM,
  })
  assert.ok(r.ok)
  assert.equal(r.winner, 'A')
  assert.equal(r.handicap.startingScoreA, 4)
  assert.equal(r.rules.points_to_win, 15)
})

// ── 15. Standard group (touch-21) applies the handicap ────────────────────────────────────────────
test('15 · standard 21-point group scores with the handicap applied', () => {
  const r = evaluateMatchScoreWithSnapshot({
    rules: standardRules, stage: GROUP, games: games([21, 12]),
    competitorA: MF, competitorB: MM, // difference +1 ⇒ A opens on 2
  })
  assert.ok(r.ok)
  assert.equal(r.winner, 'A')
  assert.equal(r.handicap.startingScoreA, 2)
  assert.equal(r.rules.points_to_win, 21)
})

// ── 16. Knockout (touch-21, win-by-2, cap-31) applies the handicap ────────────────────────────────
test('16 · knockout win-by-2 / cap-31 scores with the handicap applied', () => {
  const ok = evaluateMatchScoreWithSnapshot({
    rules: standardRules, stage: CHAMP, games: games([21, 15]),
    competitorA: FF, competitorB: MM,
  })
  assert.ok(ok.ok)
  assert.equal(ok.winner, 'A')
  assert.equal(ok.handicap.startingScoreA, 4)
  assert.equal(ok.rules.points_cap, 31)

  // A 21–20 is still blocked at win-by 2, handicap or not (rule applies to the final scoreboard).
  const bad = evaluateMatchScoreWithSnapshot({
    rules: standardRules, stage: CHAMP, games: games([21, 20]),
    competitorA: FF, competitorB: MM,
  })
  assert.equal(bad.ok, false)
  if (!bad.ok) assert.equal(bad.code, 'score_margin_invalid')
})

// ── 17. The starting score the runtime persists is the server-computed head start ─────────────────
test('17 · the evaluation carries the starting score for persistence', () => {
  const r = evaluateMatchScoreWithSnapshot({
    rules: beginnerRules, stage: GROUP, games: games([15, 6]),
    competitorA: FF, competitorB: MM,
  })
  assert.ok(r.ok)
  assert.deepEqual(
    { a: r.handicap.startingScoreA, b: r.handicap.startingScoreB, mode: r.handicap.mode },
    { a: 4, b: 0, mode: 'female_count_difference' },
  )
})

// ── 18. Re-entering the same result is deterministic (a correction keeps the same head start) ────
test('18 · re-evaluating the same match yields the same head start (stable audit)', () => {
  const inputs = { rules: standardRules, stage: CHAMP, games: games([21, 15]), competitorA: FF, competitorB: MM } as const
  const first = evaluateMatchScoreWithSnapshot(inputs)
  const second = evaluateMatchScoreWithSnapshot(inputs)
  assert.ok(first.ok && second.ok)
  assert.deepEqual(first.handicap, second.handicap)
})

// ── 19. FJP v1 (pending handicap) is still blocked ────────────────────────────────────────────────
test('19 · FJP v1 handicap is still blocked (handicap_not_configured)', () => {
  const v1 = buildFjpOlympiad2026Preset()
  const rules: RuleSet = v1.variants.find((v) => v.category === 'beginner')!.rules
  const r = evaluateMatchScoreWithSnapshot({ rules, stage: GROUP, games: games([15, 6]), competitorA: FF, competitorB: MM })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.code, 'handicap_not_configured')
})

// ── 20. FJP v2 scoring works once compositions are present ────────────────────────────────────────
test('20 · FJP v2 handicap scores when compositions are present', () => {
  const r = evaluateMatchScoreWithSnapshot({ rules: beginnerRules, stage: GROUP, games: games([15, 6]), competitorA: FF, competitorB: MM })
  assert.ok(r.ok)
})

// ── 21. A v1 snapshot does not silently become v2 ────────────────────────────────────────────────
test('21 · the v1 preset is unchanged (no silent upgrade to v2)', () => {
  const v1 = getRulePreset('fjp_olympiad_2026', 1)!
  const v2 = getRulePreset('fjp_olympiad_2026', 2)!
  const v1h = v1.variants[0]!.rules.handicap
  const v2h = v2.variants[0]!.rules.handicap
  assert.equal(v1h.requires_configuration, true)
  assert.equal(v1h.mode, 'starting_score')
  assert.equal(v2h.requires_configuration, false)
  assert.equal(v2h.mode, 'female_count_difference')
  assert.equal(v2h.points_per_difference, 2)
})

// ── 22. A legacy (disabled-handicap) event scores with no regression ──────────────────────────────
test('22 · a disabled handicap scores normally (no composition needed)', () => {
  const rules: RuleSet = {
    ...beginnerRules,
    handicap: { enabled: false, mode: 'starting_score', entries: [], requires_configuration: false },
  }
  const r = evaluateMatchScoreWithSnapshot({ rules, stage: GROUP, games: games([15, 10]) })
  assert.ok(r.ok)
  assert.equal(r.winner, 'A')
  assert.equal(r.handicap.startingScoreA, 0)
})

// ── 23. The winner is derived from the FINAL scoreboard score (not the raw margin over the start) ─
test('23 · the winner comes from the final scoreboard score', () => {
  // A opens on 4 (FF). B still wins on the final board 12–15.
  const r = evaluateMatchScoreWithSnapshot({
    rules: beginnerRules, stage: GROUP, games: games([12, 15]),
    competitorA: FF, competitorB: MM,
  })
  assert.ok(r.ok)
  assert.equal(r.winner, 'B')
})

// ── 24. Knockout progression path is unaffected (best-of-3 with handicap resolves) ───────────────
test('24 · a best-of-3 knockout with a handicap resolves to 2–1', () => {
  const bo3: RuleSet = {
    ...standardRules,
    knockout: { match: { games_to_win: 2, max_games: 3, points_to_win: 21, win_by: 2, points_cap: 31, allow_tied_game: false } },
  }
  const r = evaluateMatchScoreWithSnapshot({
    rules: bo3, stage: CHAMP, games: games([21, 15], [18, 21], [21, 19]),
    competitorA: FF, competitorB: MM,
  })
  assert.ok(r.ok)
  assert.equal(r.winner, 'A')
  assert.equal(r.gamesWonA, 2)
  assert.equal(r.gamesWonB, 1)
})

// ── 25. The public summary never leaks the internal handicap payload ──────────────────────────────
test('25 · public rule summary exposes only a handicapEnabled boolean', () => {
  const summary = toPublicEventRuleSummary({
    category: 'beginner',
    preset_label: 'FJP Olympiad 2026',
    group_points_to_win: 15, group_win_by: 1, group_points_cap: null,
    knockout_points_to_win: 21, knockout_win_by: 2, knockout_points_cap: 31,
    tie_break_order: ['table_points'],
    handicap_enabled: true,
  })
  assert.ok(summary)
  assert.equal(summary!.handicapEnabled, true)
  const keys = Object.keys(summary!)
  assert.ok(!keys.includes('mode'))
  assert.ok(!keys.includes('entries'))
  assert.ok(!keys.includes('points_per_difference'))
  assert.ok(!keys.includes('startingScore'))
})
