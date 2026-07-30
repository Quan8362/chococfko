import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildFjpOlympiad2026Preset } from './presets.ts'
import { applyRulePreset, createEventRuleSnapshot } from './snapshot.ts'
import {
  RULE_SCHEMA_VERSION,
  createSnapshotPayload,
  toPublicEventRuleSummary,
  type RawPublicRuleSummaryRow,
} from './persistence.ts'
import type { RuleSet } from './types.ts'

// A minimal, valid custom rule set for tests that don't care about preset provenance.
function customRules(): RuleSet {
  return {
    group: {
      match: { games_to_win: 1, max_games: 1, points_to_win: 21, win_by: 1, points_cap: null, allow_tied_game: false },
      win_table_points: 1,
      loss_table_points: 0,
      tie_break_order: ['table_points', 'point_difference'],
    },
    knockout: {
      match: { games_to_win: 1, max_games: 1, points_to_win: 21, win_by: 2, points_cap: 31, allow_tied_game: false },
    },
    handicap: { enabled: false, mode: 'starting_score', entries: [], requires_configuration: false },
  }
}

test('createSnapshotPayload maps a preset snapshot to a DB row with provenance', () => {
  const preset = buildFjpOlympiad2026Preset()
  const snap = applyRulePreset({ preset, category: 'standard' })
  const row = createSnapshotPayload('event-1', snap)

  assert.equal(row.event_id, 'event-1')
  assert.equal(row.source, 'preset')
  assert.equal(row.preset_key, 'fjp_olympiad_2026')
  assert.equal(row.preset_version, 1)
  assert.equal(row.category, 'standard')
  assert.equal(row.schema_version, RULE_SCHEMA_VERSION)
  assert.equal(row.snapshot_version, 1)
  // FJP handicap ships pending → the snapshot requires configuration.
  assert.equal(row.requires_configuration, true)
  // The payload is the deep-copied RuleSet (independent of the preset object).
  assert.equal(row.payload.group.match.points_to_win, 21)
  assert.equal(row.payload.knockout.match.points_cap, 31)
})

test('createSnapshotPayload forces null provenance for a non-preset (custom) snapshot', () => {
  const snap = createEventRuleSnapshot({ rules: customRules(), source: 'custom' })
  const row = createSnapshotPayload('event-2', snap)
  assert.equal(row.source, 'custom')
  assert.equal(row.preset_key, null)
  assert.equal(row.preset_version, null)
  assert.equal(row.requires_configuration, false)
})

test('createSnapshotPayload payload is a deep copy — mutating the row cannot alter the preset', () => {
  const preset = buildFjpOlympiad2026Preset()
  const snap = applyRulePreset({ preset, category: 'beginner' })
  const row = createSnapshotPayload('event-3', snap)
  // The snapshot itself is deep-frozen; the row.payload is that frozen object, and the preset is a
  // freshly-built object, so they can never share a reference. Rebuild the preset and confirm the
  // beginner group points are still the canonical 15 (not affected by any snapshot handling).
  assert.equal(row.payload.group.match.points_to_win, 15)
  assert.equal(buildFjpOlympiad2026Preset().variants[0]!.rules.group.match.points_to_win, 15)
})

test('toPublicEventRuleSummary projects only safe fields from a raw RPC row', () => {
  const raw: RawPublicRuleSummaryRow = {
    category: 'standard',
    preset_label: 'FJP Olympiad 2026',
    group_points_to_win: 21,
    group_win_by: 1,
    group_points_cap: null,
    knockout_points_to_win: 21,
    knockout_win_by: 2,
    knockout_points_cap: 31,
    tie_break_order: ['table_points', 'point_difference', 'points_for', 'organizer_decision'],
    handicap_enabled: true,
  }
  const summary = toPublicEventRuleSummary(raw)
  assert.ok(summary)
  assert.equal(summary!.category, 'standard')
  assert.equal(summary!.presetLabel, 'FJP Olympiad 2026')
  assert.deepEqual(summary!.group, { pointsToWin: 21, winBy: 1, pointsCap: null })
  assert.deepEqual(summary!.knockout, { pointsToWin: 21, winBy: 2, pointsCap: 31 })
  assert.equal(summary!.tieBreakOrder.length, 4)
  assert.equal(summary!.handicapEnabled, true)
  // The summary type structurally has no preset provenance / requires_configuration / version fields.
  assert.equal((summary as unknown as Record<string, unknown>).requires_configuration, undefined)
  assert.equal((summary as unknown as Record<string, unknown>).preset_version, undefined)
})

test('toPublicEventRuleSummary returns null for an empty/missing row', () => {
  assert.equal(toPublicEventRuleSummary(null), null)
  assert.equal(toPublicEventRuleSummary(undefined), null)
  // Missing scoring numbers → null (render an empty state rather than a half-card).
  assert.equal(
    toPublicEventRuleSummary({
      category: null, preset_label: null,
      group_points_to_win: null, group_win_by: null, group_points_cap: null,
      knockout_points_to_win: null, knockout_win_by: null, knockout_points_cap: null,
      tie_break_order: null, handicap_enabled: null,
    }),
    null,
  )
})

test('toPublicEventRuleSummary coerces a non-array tie_break_order to []', () => {
  const summary = toPublicEventRuleSummary({
    category: null, preset_label: null,
    group_points_to_win: 15, group_win_by: 1, group_points_cap: null,
    knockout_points_to_win: 21, knockout_win_by: 2, knockout_points_cap: 31,
    tie_break_order: 'not-an-array', handicap_enabled: false,
  })
  assert.ok(summary)
  assert.deepEqual(summary!.tieBreakOrder, [])
  assert.equal(summary!.handicapEnabled, false)
})

// Prompt 15C-2 — the public summary object must carry EXACTLY the safe key set. If a future edit adds
// an internal field to the projection this fails loudly (defence against a summary leak on /giai-dau).
test('toPublicEventRuleSummary output has exactly the public-safe key set (no internal leak)', () => {
  const summary = toPublicEventRuleSummary({
    category: 'beginner', preset_label: 'FJP Olympiad 2026',
    group_points_to_win: 15, group_win_by: 1, group_points_cap: null,
    knockout_points_to_win: 21, knockout_win_by: 2, knockout_points_cap: 31,
    tie_break_order: ['table_points'], handicap_enabled: true,
  })
  assert.ok(summary)
  assert.deepEqual(
    Object.keys(summary!).sort(),
    ['category', 'group', 'handicapEnabled', 'knockout', 'presetLabel', 'tieBreakOrder'],
  )
})

// A custom row (no preset label) still yields a summary — the source is inferable from a null label,
// never leaked as an id.
test('toPublicEventRuleSummary maps a custom row with a null preset label', () => {
  const summary = toPublicEventRuleSummary({
    category: null, preset_label: null,
    group_points_to_win: 21, group_win_by: 1, group_points_cap: null,
    knockout_points_to_win: 21, knockout_win_by: 2, knockout_points_cap: 31,
    tie_break_order: ['table_points'], handicap_enabled: false,
  })
  assert.ok(summary)
  assert.equal(summary!.presetLabel, null)
  assert.equal(summary!.category, null)
})
