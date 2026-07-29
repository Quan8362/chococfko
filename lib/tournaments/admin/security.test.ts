import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

// Structural / security guarantees that can't be a pure-function unit test but still MUST hold.
// Run from the web/ git root (npm test), so paths are resolved against process.cwd().
const ROOT = process.cwd()
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8')

const ACTIONS = 'app/admin/giai-dau/actions.ts'
const QUERIES = 'lib/tournaments/admin/queries.ts'
const VALIDATION = 'lib/tournaments/validation.ts'
const CLIENT_FILES = [
  'components/tournaments/admin/TournamentForm.tsx',
  'components/tournaments/admin/TournamentStatusActions.tsx',
  'components/tournaments/admin/ConfirmDialog.tsx',
]
const ADMIN_ACTION_NAMES = [
  'createTournament',
  'updateTournament',
  'publishTournament',
  'archiveTournament',
  'deleteDraftTournament',
]

test('actions.ts is a server module and defines every admin action', () => {
  const src = read(ACTIONS)
  assert.match(src, /^'use server'/)
  for (const name of ADMIN_ACTION_NAMES) {
    assert.ok(src.includes(`export async function ${name}`), `missing action: ${name}`)
  }
})

test('every mutation checks admin BEFORE touching the service-role client', () => {
  const src = read(ACTIONS)
  // Module-level: the first admin check must appear before the first service-role client use.
  const firstCheck = src.indexOf('checkIsAdmin')
  const firstAdminClient = src.indexOf('createAdminClient(')
  assert.ok(firstCheck > -1, 'checkIsAdmin not used')
  assert.ok(firstAdminClient > -1, 'createAdminClient not used')
  assert.ok(firstCheck < firstAdminClient, 'checkIsAdmin must precede createAdminClient()')

  // Per-action: the transitionStatus helper covers publish/archive; the other three guard inline.
  for (const name of ['createTournament', 'updateTournament', 'deleteDraftTournament', 'transitionStatus']) {
    const fnStart = src.indexOf(`function ${name}`)
    assert.ok(fnStart > -1, `function ${name} not found`)
    const body = src.slice(fnStart, fnStart + 400)
    assert.ok(body.includes('checkIsAdmin'), `${name} must call checkIsAdmin near the top`)
  }
})

test('deletion audit survives the ON DELETE CASCADE (tournament_id null, id kept in detail)', () => {
  const src = read(ACTIONS)
  const fn = src.slice(src.indexOf('function deleteDraftTournament'))
  assert.ok(fn.includes("action: 'tournament_deleted'"), 'must log tournament_deleted')
  assert.ok(fn.includes('tournamentId: null'), 'delete audit must set tournament_id null to survive cascade')
})

test('admin list uses a single embedded-count query (no N+1)', () => {
  const src = read(QUERIES)
  assert.ok(src.includes("import 'server-only'"), 'queries.ts must be server-only')
  assert.ok(src.includes('tournament_events(count)'), 'list must aggregate event count in one query')
  // Guard against a re-introduced per-row count fan-out.
  assert.ok(!/for\s*\([^)]*\)[^]*\.select\([^)]*count/.test(src), 'no per-row count loop allowed')
})

test('validation.ts is dependency-free and client-safe', () => {
  const src = read(VALIDATION)
  assert.ok(!src.includes("'server-only'"), 'validation must not be server-only')
  assert.ok(!src.includes('@/lib/supabase/admin'), 'validation must not import the service-role client')
  assert.ok(!src.includes('next/headers'), 'validation must not import next/headers')
})

test('service-role client never enters the client import graph', () => {
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
