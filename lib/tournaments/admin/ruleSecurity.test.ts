import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

// Structural / security guarantees for the RULE ENGINE admin surface (Prompt 15C-1) that cannot be
// pure-function unit tests but MUST hold, PLUS a few pure-domain guarantees the UI relies on. Run
// from web/ (npm test). Mirrors scoringSecurity.test.ts.
import { buildFjpOlympiad2026Preset } from '../rules/presets.ts'
import { applyRulePreset, createEventRuleSnapshot } from '../rules/snapshot.ts'
import { validateTournamentRules, validateEventRuleSnapshot } from '../rules/validation.ts'
import { buildRuleSetFromEditorFields } from '../rules/editor.ts'

const ROOT = process.cwd()
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8')

const SERVICE = 'lib/tournaments/admin/ruleService.ts'
const ACTIONS = 'app/admin/giai-dau/[id]/noi-dung/rule-actions.ts'
const WORKSPACE = 'components/tournaments/admin/RuleWorkspace.tsx'
const TIE_EDITOR = 'components/tournaments/admin/TieBreakOrderEditor.tsx'

const MUTATIONS = [
  'applyRulePresetToEvent',
  'createCustomEventRuleSnapshot',
  'updateEventRuleSnapshot',
  // Prompt 15C-2 lifecycle mutations.
  'resetEventRuleSnapshotToPreset',
  'deleteEventRuleSnapshot',
]
const ALL_ACTIONS = [...MUTATIONS, 'acknowledgeRuleWarning']

function actionBody(src: string, name: string): string {
  const start = src.indexOf(`export async function ${name}`)
  assert.ok(start > -1, `function ${name} not found`)
  const after = src.indexOf('\nexport ', start + 1)
  return src.slice(start, after === -1 ? undefined : after)
}

// ── Structural: server service discipline ─────────────────────────────────────────────────────
test('every rule action checks rules.manage BEFORE creating the service-role client', () => {
  const src = read(SERVICE)
  for (const name of ALL_ACTIONS) {
    const body = actionBody(src, name)
    const gate = body.indexOf('requireRulesManage(')
    assert.ok(gate > -1, `${name} must gate with requireRulesManage()`)
    const admin = body.indexOf('createAdminClient(')
    if (admin > -1) {
      assert.ok(gate < admin, `${name} must gate BEFORE createAdminClient()`)
    }
  }
})

test('requireRulesManage names the concrete rules.manage permission and maps both denial codes', () => {
  const src = read(SERVICE)
  assert.ok(src.includes("checkTournamentPermission(tournamentId, 'rules.manage')"), 'must check rules.manage')
  assert.ok(src.includes("'not_authenticated'") && src.includes("'forbidden'"), 'must map both denial codes')
})

test('every rule action verifies the event belongs to the tournament (anti-IDOR)', () => {
  const src = read(SERVICE)
  for (const name of ALL_ACTIONS) {
    assert.ok(actionBody(src, name).includes('loadRuleEvent('), `${name} must load+verify the event`)
  }
  // loadRuleEvent proves ownership and never reads the event NAME (no name-based inference anywhere).
  const loader = src.slice(src.indexOf('async function loadRuleEvent'))
  assert.ok(loader.includes('row.tournament_id !== tournamentId'), 'loadRuleEvent must reject cross-tournament events')
  assert.ok(!/select\('[^']*\bname\b/.test(loader), 'loadRuleEvent must not select the event name')
})

test('the conservative safety guard runs on every snapshot-mutating action', () => {
  const src = read(SERVICE)
  for (const name of MUTATIONS) {
    const body = actionBody(src, name)
    assert.ok(body.includes('evaluateRuleMutationGuard('), `${name} must apply the safety guard`)
    assert.ok(body.includes('guard.code'), `${name} must return the guard's typed code`)
  }
})

test('update uses optimistic concurrency and returns version_conflict on a stale write', () => {
  const body = actionBody(read(SERVICE), 'updateEventRuleSnapshot')
  assert.ok(body.includes("current.version !== input.expectedVersion"), 'must pre-check expectedVersion')
  assert.ok(body.includes(".eq('version', input.expectedVersion)"), 'update WHERE must pin the version (atomic)')
  assert.ok(body.includes("error: 'version_conflict'"), 'must return version_conflict')
  assert.ok(!body.includes('merge'), 'must not auto-merge two edits')
})

test('apply loads the STORED preset from the DB — never a client-supplied payload', () => {
  const body = actionBody(read(SERVICE), 'applyRulePresetToEvent')
  assert.ok(body.includes("from('tournament_rule_presets')"), 'must load the preset from the DB')
  assert.ok(body.includes("error: 'preset_not_found'"), 'must reject a missing/inactive preset')
  assert.ok(body.includes('applyRulePreset('), 'must build the snapshot via the pure engine')
})

test('the handicap warning gate blocks an unacknowledged requires_configuration snapshot', () => {
  const src = read(SERVICE)
  for (const name of ['applyRulePresetToEvent', 'updateEventRuleSnapshot']) {
    const body = actionBody(src, name)
    assert.ok(body.includes('requires_configuration') && body.includes('acknowledgeWarning'), `${name} must gate on the warning`)
    assert.ok(body.includes("error: 'warning_not_acknowledged'"), `${name} must return warning_not_acknowledged`)
  }
})

test('the service never fabricates handicap entries', () => {
  const src = read(SERVICE)
  assert.ok(!/entries:\s*\[\s*\{/.test(src), 'service must not construct handicap entries')
})

test('all six audit actions are written', () => {
  const src = read(SERVICE)
  for (const action of [
    'event_rule_preset_applied',
    'event_rule_snapshot_created',
    'event_rule_snapshot_updated',
    'event_rule_warning_acknowledged',
    // Prompt 15C-2 lifecycle audit actions.
    'event_rule_snapshot_reset',
    'event_rule_snapshot_deleted',
  ]) {
    assert.ok(src.includes(`'${action}'`), `must write the ${action} audit entry`)
  }
  // Audit detail objects carry only ids / provenance / changed paths — never a raw token/cookie key.
  const details = src.match(/detail:\s*\{[\s\S]*?\}/g) ?? []
  for (const d of details) {
    assert.ok(!/\b(token|cookie|session|password)\b/i.test(d), `audit detail must not carry a secret: ${d.slice(0, 40)}`)
  }
})

// ── Structural: reset-to-preset re-copies the ORIGINAL version (Prompt 15C-2 §6) ───────────────
test('reset re-copies the snapshot’s ORIGINAL preset version, never the latest', () => {
  const body = actionBody(read(SERVICE), 'resetEventRuleSnapshotToPreset')
  // It looks up the preset by the CURRENT snapshot's recorded provenance, not by newest version.
  assert.ok(body.includes(".eq('preset_key', current.preset_key)"), 'must pin the recorded preset key')
  assert.ok(body.includes(".eq('version', current.preset_version)"), 'must pin the recorded preset version')
  assert.ok(!/order\('version'/.test(body), 'must not fall back to the newest preset version')
  // A custom snapshot has no preset to reset to; a missing original version is a hard block.
  assert.ok(body.includes("error: 'not_preset_sourced'"), 'must reject a custom snapshot')
  assert.ok(body.includes("error: 'preset_version_gone'"), 'must block when the original version is gone')
  // Optimistic concurrency is preserved on the write.
  assert.ok(body.includes(".eq('version', input.expectedVersion)"), 'reset write must pin the version')
})

// ── Structural: delete is setup-only + default fallback (Prompt 15C-2 §7) ──────────────────────
test('delete is guarded, version-pinned, and never touches the preset registry', () => {
  const body = actionBody(read(SERVICE), 'deleteEventRuleSnapshot')
  assert.ok(body.includes('evaluateRuleMutationGuard('), 'delete must apply the safety guard (setup-only)')
  assert.ok(body.includes('.delete()'), 'delete must remove the snapshot row')
  assert.ok(body.includes(".eq('version', input.expectedVersion)"), 'delete must pin the version (concurrency)')
  assert.ok(!body.includes("from('tournament_rule_presets')"), 'delete must never touch the preset registry')
})

// ── Structural: the 'use server' wrappers add no bypass ───────────────────────────────────────
test('rule-actions is a use-server module that only delegates to the service', () => {
  const src = read(ACTIONS)
  assert.ok(src.trimStart().startsWith("'use server'"), 'must be a use-server module')
  for (const fn of [
    'applyRulePresetToEvent',
    'createCustomEventRuleSnapshot',
    'updateEventRuleSnapshot',
    'acknowledgeRuleWarning',
    'resetEventRuleSnapshotToPreset',
    'deleteEventRuleSnapshot',
  ]) {
    assert.ok(src.includes(fn), `must delegate to ${fn}`)
  }
  assert.ok(!src.includes('createAdminClient'), 'wrappers must not touch the service-role client directly')
})

// ── Structural: the client never imports server-only / service-role code as a value ───────────
test('RuleWorkspace (client) never imports the service-role client', () => {
  const src = read(WORKSPACE)
  assert.ok(src.includes("'use client'"), 'RuleWorkspace is a client component')
  assert.ok(!src.includes('@/lib/supabase/admin'), 'client must not import the admin client')
  assert.ok(!src.includes("import 'server-only'"), 'client must not import server-only')
  // It must not reference the server-only rule modules at all — DTOs come from the pure rules pkg.
  assert.ok(!src.includes('tournaments/admin/ruleService'), 'client must not import the rule service')
  assert.ok(!src.includes('tournaments/admin/ruleQueries'), 'client must not import the admin rule queries')
  // The actions are the 'use server' wrappers (safe RPC boundary), and DTOs are the pure rules pkg.
  assert.ok(src.includes("from '@/app/admin/giai-dau/[id]/noi-dung/rule-actions'"), 'uses the use-server actions')
  // The 15C-2 lifecycle actions are invoked through the same safe wrapper boundary.
  assert.ok(src.includes('resetRuleSnapshotToPresetAction'), 'wires the reset action')
  assert.ok(src.includes('deleteRuleSnapshotAction'), 'wires the delete action')
})

test('the tie-break editor never silently drops an unsupported token', () => {
  const src = read(TIE_EDITOR)
  assert.ok(src.includes('unsupportedTieBreakTokens('), 'must classify manual tokens')
  assert.ok(src.includes('tie_token_manual'), 'must render a visible manual warning')
})

// ── Pure domain guarantees the UI relies on ───────────────────────────────────────────────────
test('applying FJP Beginner vs Standard yields the confirmed, category-specific group target', () => {
  const preset = buildFjpOlympiad2026Preset()
  const beginner = applyRulePreset({ preset, category: 'beginner' })
  const standard = applyRulePreset({ preset, category: 'standard' })
  assert.equal(beginner.rules.group.match.points_to_win, 15)
  assert.equal(standard.rules.group.match.points_to_win, 21)
  // Knockout is identical across categories (touch-21, win-by-2, cap 31).
  for (const s of [beginner, standard]) {
    assert.equal(s.rules.knockout.match.points_to_win, 21)
    assert.equal(s.rules.knockout.match.win_by, 2)
    assert.equal(s.rules.knockout.match.points_cap, 31)
  }
})

test('a preset snapshot is a deep copy — mutating the preset afterwards cannot change it', () => {
  const preset = buildFjpOlympiad2026Preset()
  const snap = applyRulePreset({ preset, category: 'standard' })
  // Mutate the source preset's variant in place.
  ;(preset.variants[1].rules.group.match as { points_to_win: number }).points_to_win = 99
  assert.equal(snap.rules.group.match.points_to_win, 21, 'snapshot must be independent of the preset')
})

test('applying FJP never fabricates handicap numbers (pending, entry-less)', () => {
  const snap = applyRulePreset({ preset: buildFjpOlympiad2026Preset(), category: 'beginner' })
  assert.equal(snap.rules.handicap.enabled, true)
  assert.equal(snap.rules.handicap.entries.length, 0)
  assert.equal(snap.rules.handicap.requires_configuration, true)
  assert.equal(snap.metadata.requires_configuration, true)
})

test('a custom snapshot carries no preset provenance', () => {
  const rules = buildRuleSetFromEditorFields({
    group: {
      games_to_win: 1, max_games: 1, points_to_win: 21, win_by: 1, points_cap: null, allow_tied_game: false,
      win_table_points: 1, loss_table_points: 0, tie_break_order: ['table_points', 'point_difference'],
    },
    knockout: { games_to_win: 1, max_games: 1, points_to_win: 21, win_by: 2, points_cap: 31, allow_tied_game: false },
    handicap: { enabled: false },
  })
  const snap = createEventRuleSnapshot({ rules, source: 'custom' })
  assert.equal(snap.metadata.source, 'custom')
  assert.equal(snap.metadata.preset_key, null)
  assert.equal(snap.metadata.preset_version, null)
  assert.equal(validateEventRuleSnapshot(snap).ok, true)
})

test('an invalid rule payload is rejected by the shared validator', () => {
  const rules = buildRuleSetFromEditorFields({
    group: {
      games_to_win: 1, max_games: 1, points_to_win: 0 /* invalid */, win_by: 1, points_cap: null, allow_tied_game: false,
      win_table_points: 1, loss_table_points: 0, tie_break_order: ['table_points'],
    },
    knockout: { games_to_win: 1, max_games: 1, points_to_win: 21, win_by: 2, points_cap: 31, allow_tied_game: false },
    handicap: { enabled: false },
  })
  const result = validateTournamentRules(rules)
  assert.equal(result.ok, false)
  if (!result.ok) assert.ok(result.issues.some((i) => i.code === 'POINTS_TO_WIN_TOO_LOW'))
})
