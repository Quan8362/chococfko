import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  buildRuleSetFromEditorFields,
  ruleSetToEditorFields,
  unsupportedTieBreakTokens,
  isAutoTieBreakToken,
  evaluateRuleMutationGuard,
  type RuleEditorFields,
} from './editor.ts'
import { validateTournamentRules } from './validation.ts'
import { buildFjpOlympiad2026Preset } from './presets.ts'
import { applyRulePreset } from './snapshot.ts'
import type { RuleSet } from './types.ts'

function baseFields(): RuleEditorFields {
  return {
    group: {
      games_to_win: 1,
      max_games: 1,
      points_to_win: 21,
      win_by: 1,
      points_cap: null,
      allow_tied_game: false,
      win_table_points: 1,
      loss_table_points: 0,
      tie_break_order: ['table_points', 'point_difference', 'points_for'],
    },
    knockout: { games_to_win: 1, max_games: 1, points_to_win: 21, win_by: 2, points_cap: 31, allow_tied_game: false },
    handicap: { enabled: false },
  }
}

test('buildRuleSetFromEditorFields produces a valid custom rule set', () => {
  const rules = buildRuleSetFromEditorFields(baseFields())
  const result = validateTournamentRules(rules)
  assert.equal(result.ok, true)
  assert.equal(rules.group.match.points_to_win, 21)
  assert.equal(rules.knockout.match.points_cap, 31)
  assert.equal(rules.handicap.enabled, false)
  assert.equal(rules.handicap.requires_configuration, false)
})

test('an enabled handicap with no base ships as requires_configuration (never fabricates entries)', () => {
  const f = { ...baseFields(), handicap: { enabled: true } }
  const rules = buildRuleSetFromEditorFields(f)
  assert.equal(rules.handicap.enabled, true)
  assert.equal(rules.handicap.entries.length, 0)
  assert.equal(rules.handicap.requires_configuration, true)
})

test('editing preserves the base handicap mode/entries the form does not expose', () => {
  const base: RuleSet = {
    ...buildRuleSetFromEditorFields(baseFields()),
    handicap: {
      enabled: true,
      mode: 'point_adjustment',
      entries: [{ kind: 'pair', maleCount: 1, femaleCount: 1, value: 3 }],
      requires_configuration: false,
    },
  }
  const rules = buildRuleSetFromEditorFields({ ...baseFields(), handicap: { enabled: true } }, base)
  assert.equal(rules.handicap.mode, 'point_adjustment')
  assert.equal(rules.handicap.entries.length, 1)
  // Deep-copied — no shared reference with the base entries.
  assert.notEqual(rules.handicap.entries, base.handicap.entries)
})

test('buildRuleSetFromEditorFields shares no reference with the base rules', () => {
  const base = buildRuleSetFromEditorFields(baseFields())
  const rules = buildRuleSetFromEditorFields(baseFields(), base)
  assert.notEqual(rules.group.tie_break_order, base.group.tie_break_order)
  assert.notEqual(rules.group, base.group)
})

test('ruleSetToEditorFields round-trips the form-owned fields', () => {
  const rules = buildRuleSetFromEditorFields(baseFields())
  const fields = ruleSetToEditorFields(rules)
  assert.deepEqual(fields.group.tie_break_order, ['table_points', 'point_difference', 'points_for'])
  assert.equal(fields.knockout.points_to_win, 21)
  assert.equal(fields.handicap.enabled, false)
})

test('the FJP preset round-trips through the editor fields unchanged (structural)', () => {
  const snap = applyRulePreset({ preset: buildFjpOlympiad2026Preset(), category: 'beginner' })
  const rebuilt = buildRuleSetFromEditorFields(ruleSetToEditorFields(snap.rules), snap.rules)
  assert.equal(rebuilt.group.match.points_to_win, 15)
  assert.equal(rebuilt.knockout.match.points_to_win, 21)
  assert.equal(rebuilt.knockout.match.win_by, 2)
  assert.equal(rebuilt.knockout.match.points_cap, 31)
})

test('duplicate tie-break tokens are rejected by validation', () => {
  const f = {
    ...baseFields(),
    group: { ...baseFields().group, tie_break_order: ['table_points', 'table_points'] as const },
  }
  const result = validateTournamentRules(buildRuleSetFromEditorFields(f))
  assert.equal(result.ok, false)
  if (!result.ok) assert.ok(result.issues.some((i) => i.code === 'TIE_BREAK_DUPLICATE'))
})

test('unsupportedTieBreakTokens flags the manual tokens but not the auto ones', () => {
  assert.deepEqual(
    unsupportedTieBreakTokens(['table_points', 'organizer_decision', 'head_to_head', 'point_difference']),
    ['organizer_decision', 'head_to_head'],
  )
  assert.equal(isAutoTieBreakToken('points_for'), true)
  assert.equal(isAutoTieBreakToken('random_draw'), false)
})

test('safety guard: completed matches lock rule edits', () => {
  assert.deepEqual(evaluateRuleMutationGuard({ matchCount: 6, completedMatchCount: 2 }), {
    ok: false,
    code: 'event_rules_locked',
  })
})

test('safety guard: generated-but-unscored matches require a schedule reset', () => {
  assert.deepEqual(evaluateRuleMutationGuard({ matchCount: 6, completedMatchCount: 0 }), {
    ok: false,
    code: 'event_requires_schedule_reset',
  })
})

test('safety guard: an event with no matches is freely editable', () => {
  assert.deepEqual(evaluateRuleMutationGuard({ matchCount: 0, completedMatchCount: 0 }), { ok: true })
})
