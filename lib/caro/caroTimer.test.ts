// Static guards for the server-authoritative timer + room-lifecycle work. The
// runtime behaviour (deadline init/advance, late-move rejection, timeout winner,
// idempotency, bulk sweep) was verified directly against Postgres in a rolled-back
// transaction; these tests pin the migration and the client/server wiring so the
// behaviour cannot silently regress.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p: string) => readFileSync(join(here, p), 'utf8')

const migration = read('../../supabase/migration_caro_timer.sql')
const joinMigration = read('../../supabase/migration_caro_join_rpc.sql')
const caroGame = read('../../app/games/caro/[roomCode]/CaroGame.tsx')
const roomPage = read('../../app/games/caro/[roomCode]/page.tsx')
const actions = read('../../app/games/caro/actions.ts')

test('migration: deadline columns + initial-deadline trigger', () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS turn_started_at timestamptz/i)
  assert.match(migration, /ADD COLUMN IF NOT EXISTS turn_deadline\s+timestamptz/i)
  assert.match(migration, /caro_set_initial_deadline/)
  assert.match(migration, /NEW\.status = 'playing' AND OLD\.status = 'waiting'/)
})

test('migration: ordered after its prerequisites', () => {
  assert.match(migration, /state_version missing/i)
  assert.match(migration, /caro_make_move.*missing/i)
})

test('migration: move RPC sets/clears deadline and rejects late moves', () => {
  assert.match(migration, /turn_deadline=CASE WHEN v_finished THEN NULL ELSE now\(\)\s*\+\s*interval '15 seconds' END/)
  assert.match(migration, /'turn_expired'/)
  // security model preserved
  assert.match(migration, /SECURITY DEFINER/)
  assert.match(migration, /SET search_path = public, pg_temp/)
})

test('migration: timeout resolvers exist, deadline-gated, idempotent, scoped grants', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.caro_resolve_timeout/)
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.caro_resolve_expired/)
  // current-turn owner loses
  assert.match(migration, /CASE WHEN .*current_turn ?= ?'X' THEN 'O' ELSE 'X' END/)
  // deadline must really have passed (+grace) — not browser-trusted
  assert.match(migration, /now\(\) <= v_room\.turn_deadline \+ interval '2 seconds'/)
  assert.match(migration, /'not_expired'/)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.caro_resolve_timeout\(uuid,bigint\) TO authenticated, service_role/)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.caro_resolve_expired\(int\) TO service_role/)
  assert.match(migration, /Rollback/i)
})

test('client: random auto-move is gone, replaced by authoritative timeout', () => {
  assert.doesNotMatch(caroGame, /Math\.random/)
  assert.doesNotMatch(caroGame, /doAutoMove/)
  assert.match(caroGame, /resolveTimeout/)
  // countdown derives from the server deadline, not a local 15s assumption
  assert.match(caroGame, /turn_deadline/)
})

test('client: connection states render via i18n (all five)', () => {
  for (const key of ['conn_connecting', 'conn_reconnecting', 'conn_degraded', 'conn_offline']) {
    assert.match(caroGame, new RegExp(`t\\('${key}'\\)`), `CaroGame missing ${key}`)
  }
  // moves blocked only when authoritative state can't be confirmed
  assert.match(caroGame, /canConfirmState/)
})

test('explicit join: room URL does not auto-join, in-room button does', () => {
  // GET/server-render path must not occupy Player O
  assert.doesNotMatch(roomPage, /player_o: user\.id/)
  assert.match(caroGame, /joinCaroRoom/)
  assert.match(caroGame, /t\('join_room_btn'\)/)
})

test('server: explicit join delegates to the atomic join RPC', () => {
  assert.match(actions, /export async function joinCaroRoom/)
  // join is funneled through the SECURITY DEFINER RPC (auth.uid()), called with
  // the user's JWT — not a service-role read-then-update — and returns the
  // joined room on success.
  assert.match(actions, /supabase\.rpc\('caro_join_room'/)
  assert.match(actions, /export type JoinResult/)
  // the fragile client-heartbeat 'stale' rejection is gone from the join path
  assert.doesNotMatch(actions, /error: 'stale'/)
  // lifecycle actions still present
  assert.match(actions, /export async function resolveTimeout/)
  assert.match(actions, /export async function resolveExpiredCaroGames/)
  assert.match(actions, /export async function cleanupStaleWaitingRooms/)
  // stale waiting cleanup must never touch started games or history
  assert.match(actions, /\.eq\('status', 'waiting'\)\s*\n\s*\.is\('player_o', null\)/)
})

test('join RPC migration: atomic, secure, host-guarded, stable errors', () => {
  assert.match(joinMigration, /CREATE OR REPLACE FUNCTION public\.caro_join_room/)
  assert.match(joinMigration, /SECURITY DEFINER/)
  assert.match(joinMigration, /SET search_path = public, pg_temp/)
  // identity from the caller's JWT, not a trusted argument
  assert.match(joinMigration, /v_uid := auth\.uid\(\)/)
  // row lock → concurrent joiners serialize on the row
  assert.match(joinMigration, /FOR UPDATE/)
  // host cannot take O; seat/lifecycle guards with stable codes
  assert.match(joinMigration, /'host_cannot_join'/)
  assert.match(joinMigration, /'room_full'/)
  assert.match(joinMigration, /'room_not_joinable'/)
  assert.match(joinMigration, /'room_not_found'/)
  assert.match(joinMigration, /'not_authenticated'/)
  // claims the seat and starts the game in one atomic write
  assert.match(joinMigration, /SET player_o = v_uid,\s*\n\s*status = 'playing'/)
  // only logged-in users may call it
  assert.match(joinMigration, /GRANT EXECUTE ON FUNCTION public\.caro_join_room\(uuid\) TO authenticated/)
})

test('i18n: all five locales carry the new caro keys', () => {
  const keys = [
    'conn_connecting', 'conn_reconnecting', 'conn_degraded', 'conn_offline',
    'join_room_btn', 'join_room_prompt', 'join_full', 'join_host', 'join_stale', 'join_error',
    'join_unavailable', 'join_not_found',
  ]
  for (const locale of ['vi', 'en', 'ja', 'ko', 'zh']) {
    const msgs = JSON.parse(read(`../../messages/${locale}.json`))
    const caro = msgs?.games?.caro ?? {}
    for (const k of keys) {
      assert.ok(typeof caro[k] === 'string' && caro[k].length > 0, `${locale}.json games.caro.${k} missing`)
    }
  }
})
