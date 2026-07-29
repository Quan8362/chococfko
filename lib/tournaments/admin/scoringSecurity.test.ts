import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

// Structural / security guarantees for the SCORING + qualification-override admin actions + RPCs
// (Prompt 07) that can't be pure-function unit tests but still MUST hold. Run from web/ (npm test).
const ROOT = process.cwd()
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8')

const ACTIONS = 'app/admin/giai-dau/[id]/noi-dung/actions.ts'
const MIGRATION = 'supabase/migration_tournament_scoring.sql'
const CLIENT_FILES = [
  'components/tournaments/admin/ScoreEditor.tsx',
  'components/tournaments/admin/MatchResultsPanel.tsx',
  'components/tournaments/admin/StandingsTable.tsx',
  'components/tournaments/admin/TieResolutionPanel.tsx',
]
const SCORE_ACTIONS = [
  'saveGroupMatchResult',
  'clearGroupMatchResult',
  'saveQualificationOverride',
  'deleteQualificationOverride',
]

function actionBody(src: string, name: string): string {
  const start = src.indexOf(`export async function ${name}`)
  assert.ok(start > -1, `function ${name} not found`)
  const after = src.indexOf('\nexport async function ', start + 1)
  return src.slice(start, after === -1 ? undefined : after)
}

test('every scoring action checks admin BEFORE the service-role client and rejects non-admins', () => {
  const src = read(ACTIONS)
  for (const name of SCORE_ACTIONS) {
    const body = actionBody(src, name).slice(0, 360)
    assert.ok(body.includes('may('), `${name} must guard with a scoped permission via may()`)
    assert.ok(body.includes("error: 'forbidden'"), `${name} must reject non-admins with forbidden`)
  }
})

test('scoring actions verify event↔tournament (anti-IDOR) and reject knockout events', () => {
  const src = read(ACTIONS)
  for (const name of SCORE_ACTIONS) {
    const fn = actionBody(src, name)
    assert.ok(fn.includes('loadEvent('), `${name} must load+verify the event`)
    assert.ok(fn.includes("ev.format === 'knockout'"), `${name} must reject knockout events`)
  }
})

test('match actions verify the match belongs to the event and is a group match', () => {
  const src = read(ACTIONS)
  for (const name of ['saveGroupMatchResult', 'clearGroupMatchResult']) {
    const fn = actionBody(src, name)
    assert.ok(fn.includes('match.event_id !== eventId'), `${name} must verify the match belongs to the event`)
    assert.ok(fn.includes("match.stage !== 'group'"), `${name} must reject non-group matches`)
  }
})

test('the winner is derived by the pure engine (never re-implemented in the action)', () => {
  const fn = actionBody(read(ACTIONS), 'saveGroupMatchResult')
  assert.ok(fn.includes('validateMatchScores('), 'save must derive the winner via validateMatchScores')
  assert.ok(fn.includes('scored.winnerId'), 'save must pass the engine-derived winner to the RPC')
  // No hand-rolled winner logic (e.g. counting games) in the action.
  assert.ok(!/gamesWon\w*\s*[<>]=?/.test(fn), 'action must not re-derive the winner from game tallies')
})

test('override save validates the tie with the pure engine (resolveTieOrder)', () => {
  const fn = actionBody(read(ACTIONS), 'saveQualificationOverride')
  assert.ok(fn.includes('resolveTieOrder('), 'override save must validate via resolveTieOrder')
  assert.ok(fn.includes('calculateStandings('), 'override save must check the tie against reloaded standings')
})

test('scoring/override mutations go through the transactional RPCs with a version guard', () => {
  const src = read(ACTIONS)
  assert.ok(src.includes("admin.rpc('tournament_save_match_result'"))
  assert.ok(src.includes("admin.rpc('tournament_clear_match_result'"))
  assert.ok(src.includes("admin.rpc('tournament_save_qualification_override'"))
  assert.ok(src.includes("admin.rpc('tournament_delete_qualification_override'"))
  assert.ok(src.includes('p_expected_match_version: expectedMatchVersion'), 'match RPCs forward the match version')
  assert.ok(src.includes('p_expected_event_version: expectedEventVersion'), 'override RPCs forward the event version')
})

test('every scoring action writes an audit log entry', () => {
  const src = read(ACTIONS)
  for (const action of [
    'group_match_result_created',
    'group_match_result_updated',
    'group_match_result_cleared',
    'qualification_override_created',
    'qualification_override_deleted',
  ]) {
    assert.ok(src.includes(`'${action}'`), `missing audit action: ${action}`)
  }
})

test('the migration RPCs are SECURITY DEFINER and executable by service_role ONLY', () => {
  const src = read(MIGRATION)
  const definers = src.match(/SECURITY DEFINER/g) ?? []
  assert.ok(definers.length >= 4, 'all four RPCs must be SECURITY DEFINER')
  assert.ok(
    src.includes('FROM PUBLIC, anon, authenticated'),
    'must REVOKE EXECUTE from PUBLIC, anon, authenticated',
  )
  assert.ok(src.includes('TO service_role'), 'must GRANT EXECUTE to service_role')
  assert.ok(!/TO anon/.test(src), 'must never GRANT to anon')
})

test('RPCs guard concurrency (row lock + version compare) and block downstream knockout', () => {
  const src = read(MIGRATION)
  assert.ok(src.includes('FOR UPDATE'), 'RPCs must take a row lock')
  assert.ok(src.includes('<> p_expected_match_version') || src.includes('<> p_expected_event_version'))
  assert.ok(src.includes("'version_conflict'"), 'RPCs must return version_conflict on a stale token')
  assert.ok(src.includes("'has_knockout'"), 'RPCs must refuse once a knockout exists downstream')
})

test('a match-result save drops the stale qualification override in the same transaction', () => {
  const src = read(MIGRATION)
  assert.ok(
    src.includes('DELETE FROM public.tournament_qualification_overrides'),
    'save/clear must drop the group override atomically',
  )
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
