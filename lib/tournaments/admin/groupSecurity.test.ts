import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

// Structural / security guarantees for the GROUP-STAGE admin actions + RPCs (Prompt 06) that
// can't be pure-function unit tests but still MUST hold. Run from the web/ git root (npm test).
const ROOT = process.cwd()
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8')

const ACTIONS = 'app/admin/giai-dau/[id]/noi-dung/actions.ts'
const MIGRATION = 'supabase/migration_tournament_group_assignment.sql'
const CLIENT_FILES = [
  'components/tournaments/admin/GroupAssignmentBoard.tsx',
  'components/tournaments/admin/EventWorkspace.tsx',
  'components/tournaments/admin/GroupScheduleView.tsx',
  'components/tournaments/admin/RoundRobinPreviewPanel.tsx',
]
const GROUP_ACTIONS = [
  'initializeTournamentGroups',
  'saveGroupAssignments',
  'generateGroupMatches',
  'regenerateGroupMatches',
]

function actionBody(src: string, name: string): string {
  const start = src.indexOf(`function ${name}`)
  assert.ok(start > -1, `function ${name} not found`)
  const after = src.indexOf('\nexport async function ', start + 1)
  return src.slice(start, after === -1 ? undefined : after)
}

test('every group action is defined and checks admin BEFORE the service-role client', () => {
  const src = read(ACTIONS)
  for (const name of GROUP_ACTIONS) {
    assert.ok(src.includes(`export async function ${name}`), `missing action: ${name}`)
    const body = src.slice(src.indexOf(`export async function ${name}`)).slice(0, 320)
    assert.ok(body.includes('checkIsAdmin'), `${name} must call checkIsAdmin near the top`)
    assert.ok(body.includes("error: 'forbidden'"), `${name} must reject non-admins with forbidden`)
  }
})

test('group actions verify the event belongs to the tournament (anti-IDOR) and are not knockout', () => {
  const src = read(ACTIONS)
  for (const name of GROUP_ACTIONS) {
    const fn = actionBody(src, name)
    assert.ok(fn.includes('loadEvent('), `${name} must load+verify the event`)
    assert.ok(fn.includes("ev.format === 'knockout'"), `${name} must reject knockout events`)
  }
})

test('save/generate/regenerate re-load ground truth from the DB (never trust the client preview)', () => {
  const src = read(ACTIONS)
  for (const name of ['saveGroupAssignments', 'generateGroupMatches', 'regenerateGroupMatches']) {
    const fn = actionBody(src, name)
    assert.ok(fn.includes('loadGroupState('), `${name} must reload memberships/competitors from the DB`)
  }
  // save validates the payload as a permutation of reloaded truth.
  assert.ok(actionBody(src, 'saveGroupAssignments').includes('validateAssignmentPayload'))
  // generate/regenerate build matches via the pure engine, not the client.
  assert.ok(actionBody(src, 'generateGroupMatches').includes('buildMatchRowsFromState'))
})

test('generate/save/regenerate go through the transactional RPCs with the version guard', () => {
  const src = read(ACTIONS)
  assert.ok(src.includes("admin.rpc('tournament_initialize_groups'"))
  assert.ok(src.includes("admin.rpc('tournament_save_group_assignments'"))
  assert.ok(src.includes("admin.rpc('tournament_generate_group_matches'"))
  assert.ok(src.includes("admin.rpc('tournament_regenerate_group_matches'"))
  // Every RPC call forwards the caller's expected version → concurrency guard.
  assert.ok(src.includes('p_expected_version: expectedVersion'))
})

test('every group action writes an audit log entry', () => {
  const src = read(ACTIONS)
  for (const action of [
    'groups_initialized',
    'group_assignments_updated',
    'group_matches_generated',
    'group_matches_regenerated',
  ]) {
    assert.ok(src.includes(`action: '${action}'`), `missing audit action: ${action}`)
  }
})

test('the migration RPCs are SECURITY DEFINER and executable by service_role ONLY', () => {
  const src = read(MIGRATION)
  const definers = src.match(/SECURITY DEFINER/g) ?? []
  assert.ok(definers.length >= 4, 'all four RPCs must be SECURITY DEFINER')
  // Supabase default-privileges hand anon/authenticated EXECUTE → must be revoked explicitly.
  assert.ok(
    src.includes('FROM PUBLIC, anon, authenticated'),
    'must REVOKE EXECUTE from PUBLIC, anon, authenticated',
  )
  assert.ok(src.includes('TO service_role'), 'must GRANT EXECUTE to service_role')
  assert.ok(!/TO anon/.test(src), 'must never GRANT to anon')
})

test('RPCs guard concurrency (row lock + version compare) before writing', () => {
  const src = read(MIGRATION)
  assert.ok(src.includes('FOR UPDATE'), 'RPCs must lock the event row')
  assert.ok(src.includes('v_version <> p_expected_version'), 'RPCs must compare the expected version')
  assert.ok(src.includes("'version_conflict'"), 'RPCs must return version_conflict on stale version')
})

test('client components never import the service-role client or server-only queries', () => {
  for (const rel of CLIENT_FILES) {
    const src = read(rel)
    assert.match(src, /^'use client'/, `${rel} must be a client component`)
    assert.ok(!src.includes('@/lib/supabase/admin'), `${rel} must not import the service-role client`)
    assert.ok(!src.includes('createAdminClient'), `${rel} must not reference createAdminClient`)
    assert.ok(
      !src.includes('lib/tournaments/admin/queries'),
      `${rel} must not import the server-only queries module`,
    )
  }
})
