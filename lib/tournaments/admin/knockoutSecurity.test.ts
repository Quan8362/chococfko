import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

// Structural / security guarantees for the KNOCKOUT seed / bracket / result admin actions + RPCs
// (Prompt 08) that can't be pure-function unit tests but still MUST hold. Run from web/ (npm test).
const ROOT = process.cwd()
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8')

const ACTIONS = 'app/admin/giai-dau/[id]/noi-dung/actions.ts'
const MIGRATION = 'supabase/migration_tournament_knockout_bracket.sql'
const CLIENT_FILES = [
  'components/tournaments/admin/SeedEditor.tsx',
  'components/tournaments/admin/KnockoutPreviewPanel.tsx',
  'components/tournaments/admin/BracketView.tsx',
  'components/tournaments/admin/KnockoutResultsPanel.tsx',
  'components/tournaments/admin/KnockoutScoreEditor.tsx',
  'components/tournaments/admin/PodiumPanel.tsx',
  'components/tournaments/admin/KnockoutWorkspace.tsx',
]
const KNOCKOUT_ACTIONS = [
  'saveKnockoutSeeds',
  'clearKnockoutSeeds',
  'generateKnockoutBracket',
  'resetKnockoutBracket',
  'saveKnockoutMatchResult',
  'clearKnockoutMatchResult',
]

function actionBody(src: string, name: string): string {
  const start = src.indexOf(`export async function ${name}`)
  assert.ok(start > -1, `function ${name} not found`)
  const after = src.indexOf('\nexport async function ', start + 1)
  return src.slice(start, after === -1 ? undefined : after)
}

test('every knockout action checks admin BEFORE the service-role client and rejects non-admins', () => {
  const src = read(ACTIONS)
  for (const name of KNOCKOUT_ACTIONS) {
    const body = actionBody(src, name).slice(0, 420)
    assert.ok(body.includes('may('), `${name} must guard with a scoped permission via may()`)
    assert.ok(body.includes("error: 'forbidden'"), `${name} must reject non-admins with forbidden`)
  }
})

test('knockout actions verify event↔tournament (anti-IDOR) and reject non-knockout events', () => {
  const src = read(ACTIONS)
  for (const name of KNOCKOUT_ACTIONS) {
    const fn = actionBody(src, name)
    assert.ok(fn.includes('loadEvent('), `${name} must load+verify the event`)
    assert.ok(fn.includes("ev.format !== 'knockout'"), `${name} must reject non-knockout events`)
  }
})

test('seed order is materialized by array index — the client slot value is never trusted', () => {
  const fn = actionBody(read(ACTIONS), 'saveKnockoutSeeds')
  assert.ok(fn.includes('validateSeedPayload('), 'save must validate the permutation against DB truth')
  assert.ok(/\.map\(\(id, i\) => \(\{ slot_index: i/.test(fn), 'slot_index must come from the array index')
})

test('result save derives the winner with the pure engine and progresses via progressKnockout', () => {
  const fn = actionBody(read(ACTIONS), 'saveKnockoutMatchResult')
  assert.ok(fn.includes('resolveMatchScore('), 'save must derive the winner via the rule-aware runtime (resolveMatchScore)')
  assert.ok(fn.includes('scored.winnerId'), 'save must pass the engine-derived winner to the RPC')
  assert.ok(fn.includes('progressKnockout('), 'save must compute downstream slots via progressKnockout')
  assert.ok(fn.includes('calculatePodium(') || fn.includes('computeKnockoutPodium('), 'save must compute the podium via calculatePodium')
  // No hand-rolled winner logic (e.g. comparing game tallies) in the action.
  assert.ok(!/gamesWon\w*\s*[<>]=?/.test(fn), 'action must not re-derive the winner from game tallies')
})

test('generate builds the bracket with the pure engine and re-validates readiness from DB truth', () => {
  const fn = actionBody(read(ACTIONS), 'generateKnockoutBracket')
  assert.ok(fn.includes('buildKnockoutBracketFromSeeds('), 'generate must use the pure bracket builder')
  assert.ok(fn.includes('buildKnockoutMatchRows('), 'generate must materialize rows with the pure engine')
  assert.ok(fn.includes('evaluateSeedReadiness('), 'generate must re-check readiness from DB truth')
})

test('reset requires an explicit confirm flag', () => {
  const fn = actionBody(read(ACTIONS), 'resetKnockoutBracket')
  assert.ok(fn.includes('confirm !== true'), 'reset must require confirm === true')
})

test('knockout mutations go through the transactional RPCs with a version guard', () => {
  const src = read(ACTIONS)
  for (const rpc of [
    'tournament_save_knockout_seeds',
    'tournament_clear_knockout_seeds',
    'tournament_generate_knockout',
    'tournament_reset_knockout',
    'tournament_save_knockout_result',
    'tournament_clear_knockout_result',
  ]) {
    assert.ok(src.includes(`admin.rpc('${rpc}'`), `missing RPC call: ${rpc}`)
  }
  assert.ok(src.includes('p_expected_match_version: expectedMatchVersion'), 'result RPCs forward the match version')
  assert.ok(src.includes('p_expected_version: expectedVersion'), 'seed/bracket RPCs forward the event version')
})

test('every knockout audit action is written', () => {
  const src = read(ACTIONS)
  for (const action of [
    'knockout_seeds_updated',
    'knockout_bracket_generated',
    'knockout_bracket_reset',
    'knockout_result_created',
    'knockout_result_updated',
    'knockout_result_cleared',
    'knockout_progressed',
    'podium_calculated',
    'event_completed',
  ]) {
    assert.ok(src.includes(`'${action}'`), `missing audit action: ${action}`)
  }
})

test('the migration RPCs are SECURITY DEFINER and executable by service_role ONLY', () => {
  const src = read(MIGRATION)
  const definers = src.match(/SECURITY DEFINER/g) ?? []
  assert.ok(definers.length >= 6, 'all six RPCs must be SECURITY DEFINER')
  assert.ok(src.includes('FROM PUBLIC, anon, authenticated'), 'must REVOKE EXECUTE from PUBLIC, anon, authenticated')
  assert.ok(src.includes('TO service_role'), 'must GRANT EXECUTE to service_role')
  assert.ok(!/TO anon/.test(src), 'must never GRANT to anon')
})

test('RPCs guard concurrency + downstream results + reset-on-results', () => {
  const src = read(MIGRATION)
  assert.ok(src.includes('FOR UPDATE'), 'RPCs must take a row lock')
  assert.ok(src.includes("'version_conflict'"), 'RPCs must return version_conflict on a stale token')
  assert.ok(src.includes("'downstream_has_results'"), 'result RPCs must refuse to change a completed downstream')
  assert.ok(src.includes("'event_has_results'"), 'reset must refuse once results exist')
  assert.ok(src.includes("'already_generated'"), 'generate must be idempotent')
})

test('BYE is never a 0–0 score — the bye row carries a winner, not games', () => {
  const src = read(MIGRATION)
  // The generate RPC inserts a winner for bye rows; it never fabricates a match_games 0–0 row.
  assert.ok(src.includes('winner_competitor_id'), 'generate must set the bye winner on the match')
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
