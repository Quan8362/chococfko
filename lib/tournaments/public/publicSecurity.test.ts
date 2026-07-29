import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

// Structural / security guarantees for the PUBLIC (Guest) tournament read layer + pages (Prompt 10)
// that can't be pure-function unit tests but still MUST hold. Run from web/ (npm test).
const ROOT = process.cwd()
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8')

const QUERIES = 'lib/tournaments/public/queries.ts'
const LIST_PAGE = 'app/giai-dau/page.tsx'
const DETAIL_PAGE = 'app/giai-dau/[slug]/page.tsx'
const CLIENT_FILES = [
  'components/tournaments/public/TournamentDetail.tsx',
  'components/tournaments/public/PublicOverview.tsx',
  'components/tournaments/public/PublicCompetitors.tsx',
  'components/tournaments/public/PublicSchedule.tsx',
  'components/tournaments/public/PublicStandings.tsx',
  'components/tournaments/public/PublicPodium.tsx',
  'components/tournaments/public/EmptyState.tsx',
  'components/tournaments/public/ShareButton.tsx',
  'components/tournaments/public/StatusPill.tsx',
]

// #5 — the public read layer NEVER uses the service-role admin client (it must run as anon + RLS).
test('public queries use the anon public client and never the service-role admin client', () => {
  const src = read(QUERIES)
  assert.ok(src.includes('createPublicClient'), 'must use createPublicClient (anon, RLS-subject)')
  assert.ok(!src.includes('createAdminClient'), 'must NOT import/use the service-role admin client')
  assert.ok(!src.includes('SUPABASE_SERVICE_ROLE_KEY'), 'must not reference the service-role key')
})

// #7 — the audit log is never read by the public layer or shipped to the browser.
test('public layer never reads the audit log', () => {
  for (const f of [QUERIES, LIST_PAGE, DETAIL_PAGE, ...CLIENT_FILES.filter((f) => fs.existsSync(path.resolve(ROOT, f)))]) {
    const src = read(f)
    assert.ok(!src.includes('tournament_audit_log'), `${f} must not touch tournament_audit_log`)
  }
})

// #6 — cross-tournament access is blocked: an event is only surfaced if it belongs to the public
// tournament resolved from the slug, and the URL id is never trusted directly.
test('getPublicEventWorkspace enforces event↔tournament ownership (anti-IDOR)', () => {
  const src = read(QUERIES)
  const start = src.indexOf('export async function getPublicEventWorkspace')
  assert.ok(start > -1, 'getPublicEventWorkspace exists')
  const body = src.slice(start)
  assert.ok(body.includes('event.tournament_id !== tournamentId'), 'must reject events from another tournament')
})

// #1/#2/#3 — reads are constrained to published/completed at the query layer too (defence in depth
// on top of RLS), so drafts/archived never leak.
test('public queries constrain tournament reads to published/completed', () => {
  const src = read(QUERIES)
  assert.ok(src.includes("['published', 'completed']"), 'must whitelist published/completed statuses')
  // list, slug and workspace resolution all apply the status filter.
  const inCount = (src.match(/\.in\('status', PUBLIC_STATUSES\)/g) ?? []).length
  assert.ok(inCount >= 3, `expected the status filter on list + slug + workspace (got ${inCount})`)
})

// Reuse mandate: the read layer composes the SAME pure domain functions (no re-implemented algorithm).
test('public workspace reuses the shared pure domain composition', () => {
  const src = read(QUERIES)
  assert.ok(src.includes('evaluateGroupStage'), 'standings/qualification via evaluateGroupStage')
  assert.ok(src.includes('buildBracketRounds'), 'bracket structure via the shared buildBracketRounds helper')
})

// The read layer is server-only (never bundled into a client component).
test('public queries are server-only', () => {
  const src = read(QUERIES)
  assert.ok(src.trimStart().startsWith("import 'server-only'"), "must start with import 'server-only'")
})

// #4 — Guests (anon OR logged-in non-admin) get the same read model: the public layer does not gate
// on admin/auth at all (no checkIsAdmin), it relies purely on RLS.
test('public layer does not branch on admin/auth', () => {
  const src = read(QUERIES)
  assert.ok(!src.includes('checkIsAdmin'), 'public read must not depend on admin checks')
})

// Detail page returns a 404 for a missing/draft slug without confirming existence.
test('detail page 404s on a missing/non-public slug', () => {
  const src = read(DETAIL_PAGE)
  assert.ok(src.includes('notFound()'), 'must call notFound() when the tournament is not public')
  assert.ok(src.includes('index: false'), 'missing tournament metadata must be noindex')
})
