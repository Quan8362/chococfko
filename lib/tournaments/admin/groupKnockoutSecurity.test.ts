import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

// Structural / security guarantees for the GROUP + KNOCKOUT (Prompt 09) admin actions + RPCs that
// can't be pure-function unit tests but still MUST hold. Run from web/ (npm test).
const ROOT = process.cwd()
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8')

const ACTIONS = 'app/admin/giai-dau/[id]/noi-dung/actions.ts'
const MIGRATION = 'supabase/migration_tournament_group_knockout.sql'
const CLIENT_FILES = [
  'components/tournaments/admin/GroupKnockoutSeedEditor.tsx',
  'components/tournaments/admin/GroupKnockoutBranchPanel.tsx',
]
const GK_ACTIONS = [
  'saveGroupKnockoutSeeds',
  'clearGroupKnockoutSeeds',
  'generateGroupKnockoutBrackets',
  'resetGroupKnockoutBrackets',
  'saveGroupKnockoutMatchResult',
  'clearGroupKnockoutMatchResult',
]

function actionBody(src: string, name: string): string {
  const start = src.indexOf(`export async function ${name}`)
  assert.ok(start > -1, `function ${name} not found`)
  const after = src.indexOf('\nexport async function ', start + 1)
  return src.slice(start, after === -1 ? undefined : after)
}

test('every group_knockout action checks admin BEFORE the service-role client and rejects non-admins', () => {
  const src = read(ACTIONS)
  for (const name of GK_ACTIONS) {
    const body = actionBody(src, name).slice(0, 480)
    assert.ok(body.includes('may('), `${name} must guard with a scoped permission via may()`)
    assert.ok(body.includes("error: 'forbidden'"), `${name} must reject non-admins with forbidden`)
  }
})

test('group_knockout actions verify event↔tournament (anti-IDOR) and reject non-group_knockout events', () => {
  const src = read(ACTIONS)
  for (const name of GK_ACTIONS) {
    const fn = actionBody(src, name)
    assert.ok(fn.includes('loadEvent('), `${name} must load+verify the event`)
    assert.ok(fn.includes("ev.format !== 'group_knockout'"), `${name} must reject non-group_knockout events`)
  }
})

test('seeding requires knockout_ready and validates each branch is a permutation of current tokens', () => {
  const fn = actionBody(read(ACTIONS), 'saveGroupKnockoutSeeds')
  assert.ok(fn.includes("status !== 'knockout_ready'"), 'save must require the group stage settled')
  assert.ok(fn.includes('validateBranchSeedPayload('), 'save must validate each branch permutation')
  assert.ok(fn.includes("error: 'qualification_changed'"), 'stale tokens must return qualification_changed')
  // slot_index comes from the seeded array index, never a client slot value.
  assert.ok(fn.includes('slot_index: i'), 'slot_index must come from the array index')
})

test('generate recomputes standings, resolves tokens, builds BOTH branches with the pure engine', () => {
  const fn = actionBody(read(ACTIONS), 'generateGroupKnockoutBrackets')
  assert.ok(fn.includes("status !== 'knockout_ready'"), 'generate must re-check knockout_ready from DB truth')
  assert.ok(fn.includes('resolveBranchSeeds('), 'generate must resolve tokens → competitors from current standings')
  assert.ok(fn.includes('buildKnockoutBracketFromSeeds('), 'generate must use the pure bracket builder')
  assert.ok(fn.includes('buildKnockoutMatchRows('), 'generate must materialize rows with the pure engine')
  assert.ok(fn.includes('evaluateBranchSeedReadiness('), 'generate must re-check per-branch readiness')
  // consolation only when it is enabled (count > 0)
  assert.ok(fn.includes('consolationEnabled'), 'consolation branch is gated on the qualifier count')
})

test('branch result derives the winner via the pure engine and progresses within the branch', () => {
  const fn = actionBody(read(ACTIONS), 'saveGroupKnockoutMatchResult')
  assert.ok(fn.includes('resolveMatchScore('), 'save must derive the winner via the rule-aware runtime (resolveMatchScore)')
  assert.ok(fn.includes('progressKnockout('), 'save must compute downstream slots via progressKnockout')
  assert.ok(fn.includes('computeBracketPodium('), 'save must compute the branch podium via calculatePodium')
  assert.ok(fn.includes('p_bracket: bracket'), 'save must pass the match branch to the RPC')
  // the winner is never re-derived from game tallies in the action
  assert.ok(!/gamesWon\w*\s*[<>]=?/.test(fn), 'action must not re-derive the winner from game tallies')
})

test('reset requires an explicit confirm flag', () => {
  const fn = actionBody(read(ACTIONS), 'resetGroupKnockoutBrackets')
  assert.ok(fn.includes('confirm !== true'), 'reset must require confirm === true')
})

test('group_knockout mutations go through the transactional RPCs with a version guard', () => {
  const src = read(ACTIONS)
  for (const rpc of [
    'tournament_save_group_knockout_seeds',
    'tournament_clear_group_knockout_seeds',
    'tournament_generate_group_knockout',
    'tournament_reset_group_knockout',
    'tournament_save_group_knockout_result',
    'tournament_clear_group_knockout_result',
  ]) {
    assert.ok(src.includes(`admin.rpc('${rpc}'`), `missing RPC call: ${rpc}`)
  }
  assert.ok(src.includes('p_expected_match_version: expectedMatchVersion'), 'result RPCs forward the match version')
  assert.ok(src.includes('p_expected_version: expectedVersion'), 'seed/bracket RPCs forward the event version')
})

test('every group_knockout audit action is written', () => {
  const src = read(ACTIONS)
  for (const action of [
    'group_knockout_seeds_updated',
    'group_knockout_generated',
    'group_knockout_reset',
    'championship_result_updated',
    'consolation_result_updated',
    'group_knockout_progressed',
    'branch_podium_calculated',
    'group_knockout_completed',
  ]) {
    assert.ok(src.includes(`'${action}'`), `missing audit action: ${action}`)
  }
})

test('the migration RPCs are SECURITY DEFINER and executable by service_role ONLY', () => {
  const src = read(MIGRATION)
  const definers = src.match(/SECURITY DEFINER/g) ?? []
  assert.ok(definers.length >= 6, 'all group_knockout RPCs must be SECURITY DEFINER')
  assert.ok(src.includes('FROM PUBLIC, anon, authenticated'), 'must REVOKE EXECUTE from PUBLIC, anon, authenticated')
  assert.ok(src.includes('TO service_role'), 'must GRANT EXECUTE to service_role')
  assert.ok(!/TO anon/.test(src), 'must never GRANT to anon')
})

test('RPCs guard concurrency + downstream results + reset-on-results + idempotent generate', () => {
  const src = read(MIGRATION)
  assert.ok(src.includes('FOR UPDATE'), 'RPCs must take a row lock')
  assert.ok(src.includes("'version_conflict'"), 'RPCs must return version_conflict on a stale token')
  assert.ok(src.includes("'downstream_has_results'"), 'result RPCs must refuse to change a completed downstream')
  assert.ok(src.includes("'event_has_results'"), 'reset must refuse once results exist')
  assert.ok(src.includes("'already_generated'"), 'generate must be idempotent')
})

test('both brackets are generated in ONE transaction and a losing branch never persists alone', () => {
  const src = read(MIGRATION)
  // generate inserts by each row's own bracket and wires sources within the event → both or neither.
  assert.ok(src.includes("(e->>'bracket')"), 'generate must persist each row under its own bracket')
  assert.ok(src.includes('tournament_gk_branch_complete'), 'completion is computed per branch in SQL')
  // consolation must never receive a championship loser (no double-elimination cross-branch write).
  assert.ok(src.includes('AND bracket = p_bracket'), 'result patches are scoped to the match branch')
})

test('client components never import the service-role client or server-only queries', () => {
  for (const rel of CLIENT_FILES) {
    const src = read(rel)
    assert.match(src, /^'use client'/, `${rel} must be a client component`)
    assert.ok(!src.includes('@/lib/supabase/admin'), `${rel} must not import the service-role client`)
    assert.ok(!src.includes('createAdminClient'), `${rel} must not reference createAdminClient`)
    assert.ok(!src.includes('lib/tournaments/admin/queries'), `${rel} must not import the server-only queries module`)
  }
})
