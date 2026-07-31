import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

// Structural / security guarantees for the Prompt 11 realtime + knockout dependency-path reset that
// can't be pure-function unit tests but MUST hold. Run from web/ (npm test).
const ROOT = process.cwd()
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8')

const ACTIONS = 'app/admin/giai-dau/[id]/noi-dung/actions.ts'
const MIGRATION = 'supabase/migration_tournament_reset_path.sql'
const HOOK = 'components/tournaments/useTournamentRealtime.ts'
const BANNER = 'components/tournaments/admin/AdminRealtimeBanner.tsx'
const PUBLIC_DETAIL = 'components/tournaments/public/TournamentDetail.tsx'
const DIALOG = 'components/tournaments/admin/ImpactPreviewDialog.tsx'

// ── Server authorization ordering ───────────────────────────────────────────────────────────────
test('preview/reset actions guard with may() BEFORE createAdminClient()', () => {
  const src = read(ACTIONS)
  for (const fn of ['previewAffectedKnockoutPath', 'resetAffectedKnockoutPath']) {
    const start = src.indexOf(`export async function ${fn}`)
    assert.ok(start >= 0, `${fn} must exist`)
    const body = src.slice(start, start + 1400)
    const adminIdx = body.indexOf('may(')
    const svcIdx = body.indexOf('createAdminClient(')
    assert.ok(adminIdx >= 0, `${fn} must call may()`)
    assert.ok(svcIdx >= 0, `${fn} must call createAdminClient`)
    assert.ok(adminIdx < svcIdx, `${fn} must guard before service-role client`)
  }
})

// ── The typed confirmation is enforced server-side, not just in the UI ────────────────────────────
test('resetAffectedKnockoutPath requires the exact RESET confirmation on the server', () => {
  const src = read(ACTIONS)
  const start = src.indexOf('export async function resetAffectedKnockoutPath')
  const body = src.slice(start, start + 1600)
  assert.ok(/confirmation !== 'RESET'/.test(body), 'server must reject any confirmation other than RESET')
})

// ── The server reconstructs the dependency graph from DB truth; it never trusts a client impact list ─
test('reset reconstructs the graph via analyzeKnockoutCorrection and takes no client impact/affected list', () => {
  const src = read(ACTIONS)
  assert.ok(src.includes("from '@/lib/tournaments/domain/knockout-impact'"), 'must import the pure impact engine')
  assert.ok(src.includes('analyzeKnockoutCorrection('), 'must re-derive the impact server-side')
  const start = src.indexOf('export async function resetAffectedKnockoutPath')
  const sig = src.slice(start, src.indexOf(')', start) + 1)
  // The reset action's parameters must NOT accept a client-supplied impact / affected / resetIds list.
  assert.ok(!/\b(impact|affected|resetIds|clearSlots|patches)\b\s*:/.test(sig), 'reset must not take a client impact list')
})

// ── The reset goes through the atomic service-role RPC ────────────────────────────────────────────
test('reset applies via the tournament_reset_knockout_path RPC', () => {
  const src = read(ACTIONS)
  assert.ok(src.includes("admin.rpc('tournament_reset_knockout_path'"), 'must call the reset RPC')
})

// ── Full audit chain is written ───────────────────────────────────────────────────────────────────
test('reset writes the full audit chain', () => {
  const src = read(ACTIONS)
  for (const a of [
    'knockout_dependency_reset',
    'knockout_result_corrected',
    'downstream_results_cleared',
    'podium_invalidated',
    'event_reopened',
    'event_completed',
    'podium_recalculated',
  ]) {
    assert.ok(src.includes(`'${a}'`), `audit action ${a} must be written`)
  }
})

// ── Migration: RPCs are service-role only ─────────────────────────────────────────────────────────
test('reset RPC revokes anon/authenticated and grants only service_role', () => {
  const sql = read(MIGRATION)
  assert.ok(/REVOKE ALL ON FUNCTION public\.tournament_reset_knockout_path[\s\S]*FROM PUBLIC, anon, authenticated/.test(sql), 'must REVOKE from anon/authenticated')
  assert.ok(/GRANT EXECUTE ON FUNCTION public\.tournament_reset_knockout_path[\s\S]*TO service_role/.test(sql), 'must GRANT only to service_role')
  assert.ok(sql.includes('SECURITY DEFINER'), 'must be SECURITY DEFINER')
  assert.ok(sql.includes('search_path = public, pg_temp'), 'must pin search_path')
})

// ── Realtime publishes ONLY the six non-secret tables — never the audit log ───────────────────────
test('realtime migration publishes the six public tables and NOT the audit log', () => {
  const sql = read(MIGRATION)
  for (const tbl of [
    'tournaments',
    'tournament_events',
    'tournament_matches',
    'tournament_match_games',
    'tournament_qualification_overrides',
    'tournament_podium',
  ]) {
    assert.ok(sql.includes(`'${tbl}'`), `${tbl} must be published`)
  }
  // The audit log must never appear in the published-tables array (a comment may still reference it).
  const arrayBlock = sql.slice(sql.indexOf('FOREACH t IN ARRAY ARRAY['), sql.indexOf('] LOOP'))
  assert.ok(!arrayBlock.includes('tournament_audit_log'), 'the audit log must NEVER be published to realtime')
})

// ── The realtime controller cleans up (no duplicate channels) + coalesces + gated polling ─────────
test('useTournamentRealtime removes its channel on cleanup, debounces, and gates polling', () => {
  const src = read(HOOK)
  assert.ok(src.includes('removeChannel('), 'must remove the channel on cleanup')
  assert.ok(src.includes('setTimeout') && /debounceMs/.test(src), 'must debounce/coalesce signals')
  assert.ok(src.includes('visibilityState') , 'polling must be gated on tab visibility')
  assert.ok(/disconnected|reconnecting/.test(src), 'polling must only run while disconnected/reconnecting')
})

// ── Public realtime subscribes only to allowed tables (never the audit log) ───────────────────────
test('public realtime never subscribes to the audit log', () => {
  const src = read(PUBLIC_DETAIL)
  assert.ok(src.includes('useTournamentRealtime'), 'public detail must use the shared controller')
  assert.ok(!src.includes('tournament_audit_log'), 'public detail must not subscribe to the audit log')
})

// ── Admin banner never auto-overwrites: it surfaces a reload affordance instead ───────────────────
test('admin realtime banner offers a manual reload rather than auto-refreshing', () => {
  const src = read(BANNER)
  assert.ok(src.includes('router.refresh()'), 'reload must be admin-initiated')
  assert.ok(src.includes('data_changed'), 'must surface a data-changed notice')
})

// ── The reset confirmation dialog is not a bare browser confirm() ─────────────────────────────────
test('impact dialog requires typing RESET and is not a browser confirm()', () => {
  const src = read(DIALOG)
  assert.ok(src.includes("const CONFIRM_WORD = 'RESET'"), 'must require the exact word RESET')
  assert.ok(src.includes('confirmText === CONFIRM_WORD'), 'confirm must be gated on the typed word')
  assert.ok(!src.includes('window.confirm'), 'must not use a browser confirm()')
  assert.ok(src.includes('aria-modal="true"'), 'must be an accessible modal dialog')
})
