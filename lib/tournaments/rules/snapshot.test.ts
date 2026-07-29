// Run with: node --test lib/tournaments/rules/snapshot.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  applyRulePreset,
  createEventRuleSnapshot,
  overrideSnapshotRules,
  requiresConfiguration,
  serializeRuleSnapshot,
} from './snapshot.ts'
import { buildFjpOlympiad2026Preset } from './presets.ts'
import { isRuleEngineError } from './errors.ts'
import type { EventRuleSnapshot, RuleSet } from './types.ts'

const HERE = dirname(fileURLToPath(import.meta.url))

// (3) Applying a preset deep-copies its rules into a fresh snapshot.
test('applyRulePreset produces a deep, independent snapshot', () => {
  const preset = buildFjpOlympiad2026Preset()
  const snap = applyRulePreset({ preset, category: 'beginner' })

  assert.equal(snap.metadata.source, 'preset')
  assert.equal(snap.metadata.preset_key, preset.key)
  assert.equal(snap.metadata.preset_version, preset.version)
  assert.equal(snap.metadata.snapshot_version, 1)
  assert.equal(snap.category, 'beginner')
  assert.equal(snap.rules.group.match.points_to_win, 15)

  // Deep copy, not a shared reference.
  assert.notEqual(snap.rules, preset.variants[0].rules)
  assert.notEqual(snap.rules.group, preset.variants[0].rules.group)
})

test('applyRulePreset throws typed error for an unknown category', () => {
  const preset = buildFjpOlympiad2026Preset()
  try {
    applyRulePreset({ preset, category: 'nope' })
    assert.fail('expected throw')
  } catch (e) {
    assert.ok(isRuleEngineError(e) && e.code === 'UNKNOWN_CATEGORY')
  }
})

// (4) Editing the preset AFTER snapshotting cannot change the snapshot.
test('mutating the source preset does not change an existing snapshot', () => {
  const preset = buildFjpOlympiad2026Preset()
  const snap = applyRulePreset({ preset, category: 'beginner' })
  const before = serializeRuleSnapshot(snap)

  // Mutate the (unfrozen) preset object.
  ;(preset.variants[0].rules.group.match as { points_to_win: number }).points_to_win = 99

  assert.equal(snap.rules.group.match.points_to_win, 15)
  assert.equal(serializeRuleSnapshot(snap), before)
})

// (5) Overriding a snapshot cannot mutate the preset or the original snapshot. (20) No mutation.
test('overrideSnapshotRules returns a new snapshot and leaves preset + original untouched', () => {
  const preset = buildFjpOlympiad2026Preset()
  const snap = applyRulePreset({ preset, category: 'standard' })
  const originalSerialized = serializeRuleSnapshot(snap)

  const overridden = overrideSnapshotRules(snap, { group: { match: { points_to_win: 25 } } })

  // New snapshot reflects the override; version bumped; provenance preserved.
  assert.equal(overridden.rules.group.match.points_to_win, 25)
  assert.equal(overridden.metadata.snapshot_version, 2)
  assert.equal(overridden.metadata.preset_key, preset.key)
  assert.equal(overridden.category, 'standard')

  // Original snapshot and the preset are unchanged.
  assert.equal(snap.rules.group.match.points_to_win, 21)
  assert.equal(serializeRuleSnapshot(snap), originalSerialized)
  assert.equal(preset.variants.find((v) => v.category === 'standard')!.rules.group.match.points_to_win, 21)
})

test('snapshot is frozen at runtime', () => {
  const snap = applyRulePreset({ preset: buildFjpOlympiad2026Preset(), category: 'beginner' })
  assert.ok(Object.isFrozen(snap))
  assert.ok(Object.isFrozen(snap.rules.group.match))
})

// (6) Serialization is deterministic (canonical, key-order independent).
test('serialization is deterministic across independent builds', () => {
  const a = applyRulePreset({ preset: buildFjpOlympiad2026Preset(), category: 'beginner' })
  const b = applyRulePreset({ preset: buildFjpOlympiad2026Preset(), category: 'beginner' })
  assert.equal(serializeRuleSnapshot(a), serializeRuleSnapshot(b))
})

test('serialization ignores object key insertion order', () => {
  const rules: RuleSet = {
    group: {
      match: { games_to_win: 1, max_games: 1, points_to_win: 21, win_by: 1, points_cap: null, allow_tied_game: false },
      win_table_points: 1, loss_table_points: 0, tie_break_order: ['table_points', 'point_difference'],
    },
    knockout: { match: { games_to_win: 1, max_games: 1, points_to_win: 21, win_by: 2, points_cap: 31, allow_tied_game: false } },
    handicap: { enabled: false, mode: 'starting_score', entries: [], requires_configuration: false },
  }
  const s1 = createEventRuleSnapshot({ rules, source: 'custom' })
  // Same content, but assemble the top-level object with keys in a different order.
  const reordered: EventRuleSnapshot = {
    rules: s1.rules,
    category: s1.category,
    metadata: s1.metadata,
  } as EventRuleSnapshot
  assert.equal(serializeRuleSnapshot(s1), serializeRuleSnapshot(reordered))
})

test('requires_configuration propagates from a pending handicap', () => {
  const fjp = applyRulePreset({ preset: buildFjpOlympiad2026Preset(), category: 'beginner' })
  assert.equal(fjp.metadata.requires_configuration, true)

  const custom = createEventRuleSnapshot({
    rules: {
      group: {
        match: { games_to_win: 1, max_games: 1, points_to_win: 21, win_by: 1, points_cap: null, allow_tied_game: false },
        win_table_points: 1, loss_table_points: 0, tie_break_order: ['table_points'],
      },
      knockout: { match: { games_to_win: 1, max_games: 1, points_to_win: 21, win_by: 2, points_cap: 31, allow_tied_game: false } },
      handicap: { enabled: false, mode: 'starting_score', entries: [], requires_configuration: false },
    },
    source: 'custom',
  })
  assert.equal(custom.metadata.requires_configuration, false)
  assert.equal(requiresConfiguration(custom.rules), false)
})

// (19) The ENGINE modules never branch on a tournament/event name, a year, or a category literal.
// Preset DATA (presets.ts) legitimately holds the FJP name/key; the engine logic must not. Comments
// are stripped first — this asserts on CODE, not documentation.
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
    .replace(/(^|[^:])\/\/.*$/gm, '$1') // line comments (leave e.g. https:// alone)
}
test('engine modules contain no name/year/category branching', () => {
  const engineFiles = readdirSync(HERE).filter(
    (f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'presets.ts' && f !== 'index.ts',
  )
  const forbidden = [/fjp/i, /olympiad/i, /2026/, /'beginner'/, /"beginner"/, /'standard'/, /"standard"/, /tournamentName/, /eventName/]
  for (const file of engineFiles) {
    const code = stripComments(readFileSync(join(HERE, file), 'utf8'))
    for (const pat of forbidden) {
      assert.ok(!pat.test(code), `${file} must not reference ${pat} in code (name/year/category branching)`)
    }
  }
})
