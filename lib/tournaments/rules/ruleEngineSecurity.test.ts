import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

// Structural / security guarantees for the rule-engine PERSISTENCE layer (Prompt 15A-2) that cannot
// be pure-function unit tests but still MUST hold. Run from web/ (npm test).
const ROOT = process.cwd()
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8')

const ADMIN_QUERIES = 'lib/tournaments/admin/ruleQueries.ts'
const PUBLIC_SUMMARY = 'lib/tournaments/public/ruleSummary.ts'
const MIGRATION = 'supabase/migration_tournament_rule_engine.sql'
const SEED = 'supabase/seed_tournament_rule_presets.sql'

// The public summary read never uses the service-role client — it runs as anon + RLS/RPC only.
test('public rule summary uses the anon public client, never the service-role admin client', () => {
  const src = read(PUBLIC_SUMMARY)
  assert.ok(src.includes('createPublicClient'), 'must use createPublicClient (anon)')
  assert.ok(!src.includes('createAdminClient'), 'must NOT use the service-role admin client')
  assert.ok(!src.includes('SUPABASE_SERVICE_ROLE_KEY'), 'must not reference the service-role key')
  // It reads through the safe RPC, not the base snapshot table.
  assert.ok(src.includes('tournament_public_event_rule_summary'), 'must read via the safe summary RPC')
  assert.ok(!src.includes("from('tournament_event_rule_snapshots')"), 'must not read the snapshot base table')
})

// Both repository modules are server-only (never bundled into a Client Component).
test('rule repository modules are server-only', () => {
  for (const f of [ADMIN_QUERIES, PUBLIC_SUMMARY]) {
    assert.ok(read(f).trimStart().startsWith("import 'server-only'"), `${f} must start with import 'server-only'`)
  }
})

// The admin read layer uses the service-role client (it needs to see drafts) and is the ONLY rule
// module allowed to. Guard the contract that mutations still require checkIsAdmin upstream — there
// are no write/mutation calls in the read-only helper module yet (Prompt 15B owns those).
test('admin rule queries use the service-role client and contain no write mutations yet', () => {
  const src = read(ADMIN_QUERIES)
  assert.ok(src.includes('createAdminClient'), 'admin reads use the service-role client')
  // No mutations in this read-only helper (Prompt 15B adds guarded server actions).
  assert.ok(!/\.insert\(|\.update\(|\.upsert\(|\.delete\(/.test(src), 'no mutations in the read-only admin helper')
})

// A Client Component must never import the admin rule module (would leak the service-role client).
test('no client component imports the admin rule module', () => {
  const dirs = ['components', 'app']
  const offenders: string[] = []
  const walk = (dir: string) => {
    const abs = path.resolve(ROOT, dir)
    if (!fs.existsSync(abs)) return
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const rel = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(rel)
      else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
        const src = read(rel)
        const isClient = src.includes("'use client'") || src.includes('"use client"')
        if (isClient && src.includes('tournaments/admin/ruleQueries')) offenders.push(rel)
      }
    }
  }
  dirs.forEach(walk)
  assert.deepEqual(offenders, [], `client components must not import the admin rule module: ${offenders.join(', ')}`)
})

// The migration keeps both base tables admin/service-role only: no public SELECT policy, RLS enabled,
// anon/authenticated grants revoked. Public access is the safe RPC only.
test('migration keeps rule tables admin-only with a safe public RPC', () => {
  const sql = read(MIGRATION)
  assert.ok(sql.includes('ENABLE ROW LEVEL SECURITY'), 'RLS enabled')
  assert.ok(!/public_select ON public\.tournament_rule_presets/.test(sql), 'no public SELECT policy on presets')
  assert.ok(!/public_select ON public\.tournament_event_rule_snapshots/.test(sql), 'no public SELECT policy on snapshots')
  assert.ok(sql.includes('REVOKE ALL ON public.tournament_rule_presets'), 'presets revoked from anon/authenticated')
  assert.ok(sql.includes('REVOKE ALL ON public.tournament_event_rule_snapshots'), 'snapshots revoked from anon/authenticated')
  assert.ok(sql.includes('SECURITY DEFINER'), 'safe RPC is SECURITY DEFINER')
  assert.ok(sql.includes('search_path = public, pg_temp'), 'safe RPC pins search_path')
  // Snapshot independence: no foreign key from a snapshot to the presets table.
  assert.ok(!/REFERENCES public\.tournament_rule_presets/.test(sql), 'snapshot must not FK the presets table')
})

// The FJP seed matches the domain preset (values, not default, requires configuration, empty handicap
// entries). This is the DB↔domain parity guard for the FJP numbers.
test('FJP seed matches the domain preset and ships the handicap blocker', () => {
  const seed = read(SEED)
  assert.ok(seed.includes("'fjp_olympiad_2026'"), 'seeds the FJP key')
  assert.ok(/false,\s*--\s*never the global default/.test(seed), 'is_default=false')
  assert.ok(/true,\s*--\s*handicap numbers still pending/.test(seed), 'requires_configuration=true')
  assert.ok(seed.includes('ON CONFLICT (preset_key, version) DO UPDATE'), 'seed is idempotent')
  // Both category variants present with the confirmed group targets (15 beginner, 21 standard).
  assert.ok(seed.includes('"category": "beginner"'), 'beginner variant')
  assert.ok(seed.includes('"category": "standard"'), 'standard variant')
  assert.ok(seed.includes('"points_to_win": 15'), 'beginner group touch-15')
  assert.ok(seed.includes('"points_cap": 31'), 'knockout deuce cap 31')
  // Handicap must be enabled-but-empty (no invented entries).
  assert.ok(seed.includes('"entries": []'), 'handicap entries empty until configured')
  assert.ok(seed.includes('"requires_configuration": true'), 'handicap flagged pending in payload')
})

// No tournament/event NAME (or year) branching anywhere in the rule engine + repository layer.
test('rule engine + repository never branch on a tournament/event name or year', () => {
  const files = [
    'lib/tournaments/rules/persistence.ts',
    ADMIN_QUERIES,
    PUBLIC_SUMMARY,
  ]
  for (const f of files) {
    const src = read(f)
    assert.ok(!/Olympiad|olympiad/.test(src.replace(/\/\/.*$/gm, '')), `${f} must not branch on the FJP name in code`)
    assert.ok(!/=== '2026'|== 2026/.test(src), `${f} must not branch on a year`)
  }
})
