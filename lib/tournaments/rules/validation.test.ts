// Run with: node --test lib/tournaments/rules/validation.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  validateCompetitorComposition,
  validateEventRuleSnapshot,
  validateTieBreakOrder,
  validateTournamentRules,
} from './validation.ts'
import { applyRulePreset, createEventRuleSnapshot } from './snapshot.ts'
import { buildFjpOlympiad2026Preset } from './presets.ts'
import type { RuleValidationCode } from './errors.ts'
import type { RuleSet } from './types.ts'

function codes(issues: readonly { code: RuleValidationCode }[]): RuleValidationCode[] {
  return issues.map((i) => i.code)
}

// (14) Duplicate tie-break token blocked.
test('duplicate tie-break token is rejected', () => {
  const out = validateTieBreakOrder(['table_points', 'point_difference', 'table_points'], 'tb')
  assert.ok(codes(out).includes('TIE_BREAK_DUPLICATE'))
})
test('unknown tie-break token is rejected', () => {
  // @ts-expect-error deliberately invalid token
  const out = validateTieBreakOrder(['table_points', 'alphabetical'], 'tb')
  assert.ok(codes(out).includes('TIE_BREAK_UNKNOWN_TOKEN'))
})
test('empty tie-break order is rejected', () => {
  const out = validateTieBreakOrder([], 'tb')
  assert.ok(codes(out).includes('TIE_BREAK_EMPTY'))
})

// (18) Invalid competitor composition blocked.
test('composition totals must match the kind', () => {
  const bad = validateCompetitorComposition({ kind: 'single', maleCount: 1, femaleCount: 1 })
  assert.equal(bad.ok, false)
  assert.ok(!bad.ok && codes(bad.issues).includes('COMPOSITION_TOTAL_INVALID'))
})
test('composition counts must be non-negative integers', () => {
  const bad = validateCompetitorComposition({ kind: 'pair', maleCount: -1, femaleCount: 3 })
  assert.equal(bad.ok, false)
  assert.ok(!bad.ok && codes(bad.issues).includes('COMPOSITION_COUNT_INVALID'))
})
test('valid compositions pass', () => {
  assert.equal(validateCompetitorComposition({ kind: 'pair', maleCount: 1, femaleCount: 1 }).ok, true)
  assert.equal(validateCompetitorComposition({ kind: 'team', maleCount: 3, femaleCount: 2 }).ok, true)
})

test('match rule sanity: max_games must be >= games_to_win, cap >= points_to_win', () => {
  const rules: RuleSet = {
    group: {
      match: { games_to_win: 2, max_games: 1, points_to_win: 21, win_by: 2, points_cap: 15, allow_tied_game: false },
      win_table_points: 1, loss_table_points: 0, tie_break_order: ['table_points'],
    },
    knockout: { match: { games_to_win: 1, max_games: 1, points_to_win: 21, win_by: 2, points_cap: 31, allow_tied_game: false } },
    handicap: { enabled: false, mode: 'starting_score', entries: [], requires_configuration: false },
  }
  const out = validateTournamentRules(rules)
  assert.equal(out.ok, false)
  assert.ok(!out.ok && codes(out.issues).includes('MAX_GAMES_TOO_LOW'))
  assert.ok(!out.ok && codes(out.issues).includes('POINTS_CAP_TOO_LOW'))
})

test('win must be worth strictly more than a loss', () => {
  const rules: RuleSet = {
    group: {
      match: { games_to_win: 1, max_games: 1, points_to_win: 21, win_by: 1, points_cap: null, allow_tied_game: false },
      win_table_points: 0, loss_table_points: 0, tie_break_order: ['table_points'],
    },
    knockout: { match: { games_to_win: 1, max_games: 1, points_to_win: 21, win_by: 2, points_cap: 31, allow_tied_game: false } },
    handicap: { enabled: false, mode: 'starting_score', entries: [], requires_configuration: false },
  }
  const out = validateTournamentRules(rules)
  assert.ok(!out.ok && codes(out.issues).includes('WIN_LOSS_POINTS_ORDER'))
})

// FJP preset validates cleanly (pending handicap is allowed, not malformed).
test('every FJP variant validates as a rule set', () => {
  const preset = buildFjpOlympiad2026Preset()
  for (const v of preset.variants) {
    assert.equal(validateTournamentRules(v.rules).ok, true, `variant ${v.category} should validate`)
  }
})

test('applied FJP snapshot validates; unknown category is rejected', () => {
  const preset = buildFjpOlympiad2026Preset()
  const snap = applyRulePreset({ preset, category: 'beginner' })
  assert.equal(validateEventRuleSnapshot(snap).ok, true)

  // A snapshot claiming the FJP preset but a bogus category must be flagged.
  const bogus = createEventRuleSnapshot({
    rules: preset.variants[0].rules,
    source: 'preset',
    presetKey: preset.key,
    presetVersion: preset.version,
    category: 'wildcard',
  })
  const out = validateEventRuleSnapshot(bogus)
  assert.equal(out.ok, false)
  assert.ok(!out.ok && codes(out.issues).includes('CATEGORY_UNKNOWN'))
})

test('preset source with an unknown key/version is rejected', () => {
  const preset = buildFjpOlympiad2026Preset()
  const snap = createEventRuleSnapshot({
    rules: preset.variants[0].rules,
    source: 'preset',
    presetKey: 'does_not_exist',
    presetVersion: 1,
    category: 'beginner',
  })
  const out = validateEventRuleSnapshot(snap)
  assert.ok(!out.ok && codes(out.issues).includes('PRESET_KEY_INVALID'))
})
