// Static guards for the authoritative-move security migration. The runtime
// behaviour (12 gameplay/security/concurrency scenarios) was verified directly
// against Postgres in a rolled-back transaction; these tests pin the migration
// file so the security posture and rule parity can't silently regress.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const sql = readFileSync(join(here, '../../supabase/migration_caro_secure_moves.sql'), 'utf8')

test('depends on state_version (ordered after realtime_sync)', () => {
  assert.match(sql, /state_version is missing/i)
  assert.match(sql, /information_schema\.columns/i)
})

test('RPC is SECURITY DEFINER with a locked, schema-qualified search_path', () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.caro_make_move\(/i)
  assert.match(sql, /SECURITY DEFINER/i)
  assert.match(sql, /SET search_path = public, pg_temp/i)
  assert.match(sql, /auth\.uid\(\)/)            // schema-qualified
  assert.match(sql, /public\.caro_rooms/)        // schema-qualified
  assert.doesNotMatch(sql, /EXECUTE\s+format|EXECUTE\s+'/i) // no dynamic SQL
})

test('RPC locks the row and is atomic', () => {
  assert.match(sql, /FOR UPDATE/i)
  assert.match(sql, /RETURNING \* INTO/i)
})

test('returns the full set of stable error codes (no raw DB errors)', () => {
  for (const code of [
    'not_authenticated', 'room_not_found', 'not_a_player', 'game_not_playing',
    'not_your_turn', 'stale_state', 'cell_out_of_range', 'cell_occupied',
  ]) {
    assert.match(sql, new RegExp(`'${code}'`), `missing error code ${code}`)
  }
})

test('reproduces the existing win/draw rules', () => {
  assert.match(sql, /ARRAY\[0,\s*1,\s*1,\s*1\]/)   // dr: H, V, diag, anti-diag
  assert.match(sql, /ARRAY\[1,\s*0,\s*1,\s*-1\]/)  // dc
  assert.match(sql, /array_length\(v_line,\s*1\)\s*>=\s*5/) // five OR MORE
  assert.match(sql, /'draw'/)                       // draw branch
  assert.match(sql, /15/)                           // 15x15
  assert.match(sql, /:=\s*225/)                     // 225 cells
})

test('locks down direct writes but preserves SELECT and RLS', () => {
  assert.match(sql, /REVOKE INSERT,\s*UPDATE,\s*DELETE ON public\.caro_rooms FROM anon,\s*authenticated/i)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.caro_make_move\(uuid,\s*integer,\s*bigint\) TO authenticated/i)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.caro_make_move.*FROM PUBLIC/i)
  // Must not weaken SELECT or disable RLS.
  assert.doesNotMatch(sql, /DROP POLICY[^\n]*caro_rooms_select/i)
  assert.doesNotMatch(sql, /DISABLE ROW LEVEL SECURITY/i)
})

test('ships a documented rollback', () => {
  assert.match(sql, /Rollback/i)
  assert.match(sql, /DROP FUNCTION IF EXISTS public\.caro_make_move/i)
})
