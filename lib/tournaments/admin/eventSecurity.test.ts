import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

// Structural / security guarantees for the EVENT + COMPETITOR admin actions (Prompt 05) that
// can't be a pure-function unit test but still MUST hold. Run from the web/ git root (npm test).
const ROOT = process.cwd()
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8')

const ACTIONS = 'app/admin/giai-dau/[id]/noi-dung/actions.ts'
const QUERIES = 'lib/tournaments/admin/queries.ts'
const CLIENT_FILES = [
  'components/tournaments/admin/EventForm.tsx',
  'components/tournaments/admin/EventList.tsx',
  'components/tournaments/admin/CompetitorManager.tsx',
]
const EVENT_ACTIONS = [
  'createTournamentEvent',
  'updateTournamentEvent',
  'deleteTournamentEvent',
  'reorderTournamentEvents',
]
const COMPETITOR_ACTIONS = [
  'createCompetitor',
  'updateCompetitor',
  'deleteCompetitor',
  'reorderCompetitors',
  'bulkCreateCompetitors',
]

test('actions.ts is a server module and defines every event + competitor action', () => {
  const src = read(ACTIONS)
  assert.match(src, /^'use server'/)
  for (const name of [...EVENT_ACTIONS, ...COMPETITOR_ACTIONS]) {
    assert.ok(src.includes(`export async function ${name}`), `missing action: ${name}`)
  }
})

test('every exported mutation checks admin BEFORE touching the service-role client', () => {
  const src = read(ACTIONS)
  const firstCheck = src.indexOf('checkTournamentPermission')
  const firstAdminClient = src.indexOf('createAdminClient(')
  assert.ok(firstCheck > -1 && firstAdminClient > -1)
  assert.ok(firstCheck < firstAdminClient, 'a permission guard must precede createAdminClient()')

  // Per-action: a scoped permission guard (may()) must appear near the top of each action body.
  for (const name of [...EVENT_ACTIONS, ...COMPETITOR_ACTIONS]) {
    const fnStart = src.indexOf(`export async function ${name}`)
    assert.ok(fnStart > -1, `function ${name} not found`)
    const body = src.slice(fnStart, fnStart + 300)
    assert.ok(body.includes('may('), `${name} must guard with a scoped permission via may()`)
    assert.ok(body.includes("error: 'forbidden'"), `${name} must reject non-admins with forbidden`)
  }
})

test('new events are ALWAYS created with status setup, never a client-chosen status', () => {
  const src = read(ACTIONS)
  const fn = src.slice(src.indexOf('function createTournamentEvent'))
  assert.ok(/status:\s*'setup'/.test(fn), 'createTournamentEvent must hardcode status: setup')
  // The insert must not read status/version off the client-supplied values object.
  assert.ok(!/status:\s*values\./.test(fn), 'must not take status from client values')
})

// Slice one action body out of the source: from its declaration up to the next declaration.
function actionBody(src: string, name: string): string {
  const start = src.indexOf(`function ${name}`)
  assert.ok(start > -1, `function ${name} not found`)
  const after = src.indexOf('\nexport async function ', start + 1)
  return src.slice(start, after === -1 ? undefined : after)
}

test('event mutations verify the event belongs to the tournament (anti-IDOR)', () => {
  const src = read(ACTIONS)
  // loadEvent proves ownership; update/delete additionally guard the WHERE clause on tournament_id.
  assert.ok(src.includes('data.tournament_id !== tournamentId'), 'loadEvent must verify ownership')
  for (const name of ['updateTournamentEvent', 'deleteTournamentEvent']) {
    const fn = actionBody(src, name)
    assert.ok(fn.includes('loadEvent('), `${name} must load+verify the event`)
    assert.ok(fn.includes(".eq('tournament_id', tournamentId)"), `${name} must scope the write to the tournament`)
  }
})

test('event update/delete use optimistic concurrency on the version column', () => {
  const src = read(ACTIONS)
  for (const name of ['updateTournamentEvent', 'deleteTournamentEvent']) {
    const fn = actionBody(src, name)
    assert.ok(fn.includes('ev.version !== expectedVersion'), `${name} must compare version`)
    assert.ok(fn.includes(".eq('version', expectedVersion)"), `${name} must guard the write on version`)
  }
})

test('event with matches blocks format/structural change and delete', () => {
  const src = read(ACTIONS)
  const upd = src.slice(src.indexOf('function updateTournamentEvent'), src.indexOf('function deleteTournamentEvent'))
  assert.ok(upd.includes("'event_has_results'"), 'update must block completed-match events')
  assert.ok(upd.includes("'event_needs_reset'"), 'update must block matches-present events')
  const del = src.slice(src.indexOf('function deleteTournamentEvent'), src.indexOf('function reorderTournamentEvents'))
  assert.ok(del.includes("completedMatchCount > 0") && del.includes("'event_has_results'"))
  assert.ok(del.includes("matchCount > 0") && del.includes("'event_needs_reset'"))
})

test('competitor mutations verify competitor belongs to event+tournament (anti-IDOR)', () => {
  const src = read(ACTIONS)
  for (const name of ['updateCompetitor', 'deleteCompetitor']) {
    const fn = actionBody(src, name)
    assert.ok(fn.includes('loadEvent('), `${name} must verify event↔tournament`)
    assert.ok(fn.includes('existing.event_id !== eventId'), `${name} must verify competitor↔event`)
  }
})

test('deleting a competitor with results / references is blocked', () => {
  const src = read(ACTIONS)
  const fn = src.slice(src.indexOf('function deleteCompetitor'), src.indexOf('function reorderCompetitors'))
  assert.ok(fn.includes("'competitor_has_results'"), 'must block deleting a competitor with completed matches')
  assert.ok(fn.includes("'competitor_needs_reset'"), 'must block deleting a referenced competitor')
  assert.ok(fn.includes('tournament_group_memberships'), 'must also consider group placement')
})

test('bulk add is all-or-nothing with duplicate + limit guards', () => {
  const src = read(ACTIONS)
  const fn = src.slice(src.indexOf('function bulkCreateCompetitors'))
  assert.ok(fn.includes('parseBulkCompetitors'), 'must use the shared pure parser')
  assert.ok(fn.includes("'bulk_too_many'"), 'must enforce a line limit')
  assert.ok(fn.includes("'bulk_duplicate_input'"), 'must detect in-input duplicates')
  assert.ok(fn.includes("'bulk_duplicate_existing'"), 'must detect existing-roster duplicates')
  // Single array insert → no partial-write state.
  assert.ok(/\.insert\(rows\)/.test(fn), 'must insert the whole batch in one call')
})

test('every event/competitor action writes an audit log entry', () => {
  const src = read(ACTIONS)
  const expected = [
    'event_created',
    'event_updated',
    'event_deleted',
    'events_reordered',
    'competitor_created',
    'competitor_updated',
    'competitor_deleted',
    'competitors_bulk_created',
    'competitors_reordered',
  ]
  for (const action of expected) {
    assert.ok(src.includes(`action: '${action}'`), `missing audit action: ${action}`)
  }
})

test('event queries are server-only and use single embedded-count reads (no N+1)', () => {
  const src = read(QUERIES)
  assert.ok(src.includes("import 'server-only'"), 'queries.ts must be server-only')
  assert.ok(src.includes('tournament_competitors(count)'), 'event list must embed competitor count')
  assert.ok(src.includes('listEventsForAdmin') && src.includes('getEventForAdmin'))
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
