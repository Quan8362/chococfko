// Verifies the Caro realtime-sync forward migration is idempotent and self-
// contained. Pure file inspection — run with the rest via `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const sql = readFileSync(join(here, '../../supabase/migration_caro_realtime_sync.sql'), 'utf8')

test('publication add is guarded by NOT EXISTS (idempotent)', () => {
  assert.match(sql, /pg_publication_tables/)
  assert.match(sql, /IF NOT EXISTS/i)
  assert.match(sql, /ALTER PUBLICATION supabase_realtime ADD TABLE public\.caro_rooms/i)
})

test('state_version column add is idempotent', () => {
  assert.match(sql, /ADD COLUMN IF NOT EXISTS state_version bigint/i)
})

test('state_version trigger is recreated idempotently', () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.caro_bump_state_version/i)
  assert.match(sql, /DROP TRIGGER IF EXISTS caro_rooms_state_version/i)
  assert.match(sql, /BEFORE UPDATE ON public\.caro_rooms/i)
})

test('migration stays in scope: no RLS / RPC / replica-identity changes', () => {
  assert.doesNotMatch(sql, /CREATE POLICY|DROP POLICY|ALTER POLICY/i)
  assert.doesNotMatch(sql, /REPLICA IDENTITY (FULL|USING|NOTHING)/i)
})
