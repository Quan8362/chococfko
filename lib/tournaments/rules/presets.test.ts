// Run with: node --test lib/tournaments/rules/presets.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  FJP_EVENT_CATEGORIES,
  FJP_OLYMPIAD_2026_KEY,
  FJP_OLYMPIAD_2026_VERSION,
  buildFjpOlympiad2026Preset,
  getRulePreset,
  listRulePresets,
} from './presets.ts'

// (1) FJP preset carries the expected key/version.
test('FJP preset has key fjp_olympiad_2026 and version 1', () => {
  const p = buildFjpOlympiad2026Preset()
  assert.equal(p.key, 'fjp_olympiad_2026')
  assert.equal(p.key, FJP_OLYMPIAD_2026_KEY)
  assert.equal(p.version, 1)
  assert.equal(p.version, FJP_OLYMPIAD_2026_VERSION)
})

// (2) FJP preset is NOT the global default.
test('FJP preset is explicitly not a default', () => {
  const p = buildFjpOlympiad2026Preset()
  assert.equal(p.isDefault, false)
})

test('FJP preset exposes exactly the beginner and standard variants', () => {
  const p = buildFjpOlympiad2026Preset()
  assert.deepEqual(p.variants.map((v) => v.category).sort(), ['beginner', 'standard'])
  assert.deepEqual([...FJP_EVENT_CATEGORIES].sort(), ['beginner', 'standard'])
})

// The confirmed FJP numbers are represented faithfully.
test('FJP beginner group touches 15, standard group touches 21, knockout 21/by-2/cap-31', () => {
  const p = buildFjpOlympiad2026Preset()
  const beginner = p.variants.find((v) => v.category === 'beginner')!
  const standard = p.variants.find((v) => v.category === 'standard')!

  assert.equal(beginner.rules.group.match.points_to_win, 15)
  assert.equal(beginner.rules.group.match.win_by, 1)
  assert.equal(standard.rules.group.match.points_to_win, 21)

  for (const v of [beginner, standard]) {
    assert.equal(v.rules.knockout.match.points_to_win, 21)
    assert.equal(v.rules.knockout.match.win_by, 2)
    assert.equal(v.rules.knockout.match.points_cap, 31)
    // Standings: win 1 / loss 0.
    assert.equal(v.rules.group.win_table_points, 1)
    assert.equal(v.rules.group.loss_table_points, 0)
    // Handicap is intended but pending organizer confirmation.
    assert.equal(v.rules.handicap.enabled, true)
    assert.equal(v.rules.handicap.requires_configuration, true)
    assert.equal(v.rules.handicap.entries.length, 0)
  }
})

test('registry resolves FJP by (key, version) and misses cleanly', () => {
  const p = getRulePreset(FJP_OLYMPIAD_2026_KEY, FJP_OLYMPIAD_2026_VERSION)
  assert.ok(p)
  assert.equal(p!.key, FJP_OLYMPIAD_2026_KEY)
  assert.equal(getRulePreset(FJP_OLYMPIAD_2026_KEY, 999), null)
  assert.equal(getRulePreset('unknown', 1), null)
})

test('registry hands out independent objects (never a shared template)', () => {
  const a = getRulePreset(FJP_OLYMPIAD_2026_KEY, FJP_OLYMPIAD_2026_VERSION)!
  const b = getRulePreset(FJP_OLYMPIAD_2026_KEY, FJP_OLYMPIAD_2026_VERSION)!
  assert.notEqual(a, b)
  assert.notEqual(a.variants[0].rules, b.variants[0].rules)
})

test('listRulePresets includes FJP', () => {
  const list = listRulePresets()
  assert.ok(list.some((p) => p.key === FJP_OLYMPIAD_2026_KEY && p.version === FJP_OLYMPIAD_2026_VERSION))
})
