import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  classifyRuleChange,
  deriveRuleChangeGuard,
  summarizeRuleChangeImpact,
  computeRuleChangeImpactToken,
  applicableRegenerateModes,
  type RuleChangeImpactInput,
} from './change.ts'
import type { RuleSet } from './types.ts'

function baseRules(): RuleSet {
  return {
    group: {
      match: { games_to_win: 1, max_games: 1, points_to_win: 21, win_by: 1, points_cap: null, allow_tied_game: false },
      win_table_points: 1,
      loss_table_points: 0,
      tie_break_order: ['table_points', 'point_difference', 'points_for'],
    },
    knockout: {
      match: { games_to_win: 1, max_games: 1, points_to_win: 21, win_by: 2, points_cap: 31, allow_tied_game: false },
    },
    handicap: { enabled: false, mode: 'female_count_difference', entries: [], requires_configuration: false },
  }
}

function baseImpactInput(over: Partial<RuleChangeImpactInput> = {}): RuleChangeImpactInput {
  return {
    eventVersion: 3,
    eventStatus: 'group_stage',
    eventFormat: 'round_robin',
    snapshotVersion: 2,
    snapshotId: 'snap-1',
    groupMatchCount: 6,
    knockoutChampionshipMatchCount: 0,
    knockoutConsolationMatchCount: 0,
    scoredGameCount: 4,
    completedMatchCount: 2,
    standingsGroupCount: 1,
    qualificationOverrideCount: 0,
    podiumRowCount: 0,
    matchVersions: [{ id: 'm2', version: 1 }, { id: 'm1', version: 5 }],
    generationKeys: ['g:1'],
    proposedRules: baseRules(),
    ...over,
  }
}

// ── classifyRuleChange ────────────────────────────────────────────────────────────────────────
test('identical rules classify as no change', () => {
  const c = classifyRuleChange(baseRules(), baseRules())
  assert.equal(c.changed, false)
  assert.equal(c.severity, 'none')
  assert.deepEqual(c.changedPaths, [])
})

test('points_to_win change is scoring-only', () => {
  const after = baseRules()
  const c = classifyRuleChange(baseRules(), { ...after, group: { ...after.group, match: { ...after.group.match, points_to_win: 15 } } })
  assert.equal(c.changed, true)
  assert.equal(c.affectsMatchScoring, true)
  assert.equal(c.affectsQualification, false)
  assert.equal(c.severity, 'scoring')
})

test('handicap change is scoring-only', () => {
  const after = baseRules()
  const c = classifyRuleChange(baseRules(), { ...after, handicap: { ...after.handicap, enabled: true, points_per_difference: 2 } })
  assert.equal(c.affectsMatchScoring, true)
  assert.equal(c.severity, 'scoring')
})

test('tie-break order change is structural (qualification)', () => {
  const after = baseRules()
  const c = classifyRuleChange(baseRules(), {
    ...after,
    group: { ...after.group, tie_break_order: ['point_difference', 'table_points', 'points_for'] },
  })
  assert.equal(c.affectsQualification, true)
  assert.equal(c.severity, 'structural')
})

test('table-points change is structural (standings + qualification)', () => {
  const after = baseRules()
  const c = classifyRuleChange(baseRules(), { ...after, group: { ...after.group, win_table_points: 3 } })
  assert.equal(c.affectsStandings, true)
  assert.equal(c.affectsQualification, true)
  assert.equal(c.severity, 'structural')
})

// ── deriveRuleChangeGuard ─────────────────────────────────────────────────────────────────────
test('no-match state → direct update, no reset', () => {
  const c = classifyRuleChange(baseRules(), { ...baseRules(), group: { ...baseRules().group, match: { ...baseRules().group.match, points_to_win: 15 } } })
  const g = deriveRuleChangeGuard({ matchCount: 0, completedMatchCount: 0 }, c)
  assert.equal(g.mode, 'direct')
  assert.equal(g.requiresDestructiveConfirmation, false)
})

test('generated-but-unscored → reset (schedule_only), no destructive confirm', () => {
  const c = classifyRuleChange(baseRules(), { ...baseRules(), group: { ...baseRules().group, match: { ...baseRules().group.match, points_to_win: 15 } } })
  const g = deriveRuleChangeGuard({ matchCount: 6, completedMatchCount: 0 }, c)
  assert.equal(g.mode, 'reset')
  assert.equal(g.requiredResetScope, 'schedule_only')
  assert.equal(g.requiresDestructiveConfirmation, false)
})

test('scores exist → destructive, requires confirmation + full reset', () => {
  const c = classifyRuleChange(baseRules(), { ...baseRules(), group: { ...baseRules().group, match: { ...baseRules().group.match, points_to_win: 15 } } })
  const g = deriveRuleChangeGuard({ matchCount: 6, completedMatchCount: 2 }, c)
  assert.equal(g.mode, 'destructive')
  assert.equal(g.requiredResetScope, 'all_results_and_downstream')
  assert.equal(g.requiresDestructiveConfirmation, true)
})

test('no computational change → no_change even with scores present', () => {
  const g = deriveRuleChangeGuard({ matchCount: 6, completedMatchCount: 2 }, classifyRuleChange(baseRules(), baseRules()))
  assert.equal(g.mode, 'no_change')
  assert.equal(g.requiredResetScope, 'none')
})

// ── summarizeRuleChangeImpact ─────────────────────────────────────────────────────────────────
test('schedule_only summary does not count results as wiped', () => {
  const s = summarizeRuleChangeImpact(baseImpactInput(), 'schedule_only')
  assert.equal(s.resetsResults, false)
  assert.equal(s.scoredGames, 0)
  assert.equal(s.completedMatches, 0)
  assert.equal(s.groupMatches, 6)
})

test('destructive summary counts results + downstream as wiped', () => {
  const s = summarizeRuleChangeImpact(baseImpactInput({ podiumRowCount: 3, qualificationOverrideCount: 2 }), 'all_results_and_downstream')
  assert.equal(s.resetsResults, true)
  assert.equal(s.scoredGames, 4)
  assert.equal(s.completedMatches, 2)
  assert.equal(s.podiumRows, 3)
  assert.equal(s.qualificationOverrides, 2)
})

test('knockout format cannot auto-regenerate; group_knockout only round_robin', () => {
  assert.equal(summarizeRuleChangeImpact(baseImpactInput({ eventFormat: 'knockout' }), 'schedule_only').canAutoRegenerate, false)
  assert.deepEqual(applicableRegenerateModes('group_knockout'), ['none', 'round_robin'])
  assert.deepEqual(applicableRegenerateModes('round_robin'), ['none', 'round_robin'])
})

// ── computeRuleChangeImpactToken ──────────────────────────────────────────────────────────────
test('token is deterministic and order-independent for matchVersions', () => {
  const a = computeRuleChangeImpactToken(baseImpactInput())
  const b = computeRuleChangeImpactToken(baseImpactInput({ matchVersions: [{ id: 'm1', version: 5 }, { id: 'm2', version: 1 }] }))
  assert.equal(a, b)
  assert.match(a, /^rci_[0-9a-f]{8}_2$/)
})

test('token changes when a match version changes (a score edit)', () => {
  const a = computeRuleChangeImpactToken(baseImpactInput())
  const b = computeRuleChangeImpactToken(baseImpactInput({ matchVersions: [{ id: 'm1', version: 6 }, { id: 'm2', version: 1 }] }))
  assert.notEqual(a, b)
})

test('token changes when the proposed rules change', () => {
  const a = computeRuleChangeImpactToken(baseImpactInput())
  const b = computeRuleChangeImpactToken(baseImpactInput({ proposedRules: { ...baseRules(), group: { ...baseRules().group, win_table_points: 9 } } }))
  assert.notEqual(a, b)
})

test('token changes when the snapshot or event version changes', () => {
  const base = computeRuleChangeImpactToken(baseImpactInput())
  assert.notEqual(base, computeRuleChangeImpactToken(baseImpactInput({ snapshotVersion: 99 })))
  assert.notEqual(base, computeRuleChangeImpactToken(baseImpactInput({ eventVersion: 99 })))
})
