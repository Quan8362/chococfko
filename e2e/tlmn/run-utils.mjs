// Run-scoped test-data isolation + teardown for the TLMN live write flow.
//
// Plain ESM JavaScript on purpose: it runs identically under Node (the workflow's
// always() cleanup step, any Node version) AND under Playwright/esbuild (the spec) —
// no TypeScript type-stripping involved, so there are no cross-module export quirks.
//
// A per-run manifest (.artifacts/run-manifest.json) records EXACTLY what this run
// created/used: the room id(s) and a pre-run snapshot of the two test users' wallet +
// stats. Teardown deletes only those rooms' rows + the test users' coin-ledger rows for
// those rooms, and restores the users' wallet/stats to the snapshot. It can never touch
// another run's data or any real user's data. Never logs secrets.
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ARTIFACT_DIR = path.resolve(HERE, '.artifacts')
const MANIFEST_PATH = path.join(ARTIFACT_DIR, 'run-manifest.json')

function loadEnvLocal() {
  for (const file of [path.resolve(HERE, '../../.env.local'), path.resolve(process.cwd(), '.env.local')]) {
    if (!fs.existsSync(file)) continue
    for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const eq = line.indexOf('='); if (eq < 0) continue
      const k = line.slice(0, eq).trim(); let v = line.slice(eq + 1).trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      if (!(k in process.env)) process.env[k] = v
    }
    return
  }
}
loadEnvLocal()

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
export const RUN_TAG = `AUTO_TLMN_${process.env.GITHUB_RUN_ID || `local-${Date.now()}`}_${process.env.GITHUB_RUN_ATTEMPT || '1'}`

export function admin() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error('SUPABASE service-role env missing')
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
}

export function readManifest() {
  try { return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')) } catch { /* none yet */ }
  return { runTag: RUN_TAG, roomIds: [], userIds: [], snapshots: [] }
}
export function writeManifest(m) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true })
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(m, null, 2))
}
export function recordRoom(roomId) {
  const m = readManifest()
  if (!m.roomIds.includes(roomId)) m.roomIds.push(roomId)
  writeManifest(m)
}

export async function snapshotUsers(sb, userIds) {
  const m = readManifest()
  m.userIds = Array.from(new Set([...m.userIds, ...userIds]))
  for (const uid of userIds) {
    const { data: w } = await sb.from('game_wallets').select('balance').eq('user_id', uid).maybeSingle()
    const { data: s } = await sb.from('game_player_stats').select('*').eq('user_id', uid).eq('game_key', 'tlmn').maybeSingle()
    m.snapshots = m.snapshots.filter(x => x.user_id !== uid)
    m.snapshots.push({ user_id: uid, wallet: w?.balance ?? null, stats: s ?? null })
  }
  writeManifest(m)
}

export async function teardownRun() {
  const steps = []
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return { ok: false, runTag: RUN_TAG, steps: ['SUPABASE service-role env missing — cannot clean up'] }
  const m = readManifest()
  const sb = admin()

  for (const roomId of m.roomIds) {
    const { data: games } = await sb.from('tlmn_games').select('id').eq('room_id', roomId)
    const gameIds = (games ?? []).map(g => g.id)
    if (gameIds.length) { await sb.from('tlmn_hands').delete().in('game_id', gameIds); steps.push(`deleted hands for ${gameIds.length} game(s) in ${roomId}`) }
    await sb.from('tlmn_games').delete().eq('room_id', roomId)
    await sb.from('tlmn_seats').delete().eq('room_id', roomId)
    await sb.from('tlmn_forfeits').delete().eq('room_id', roomId)
    await sb.from('round_settlements').delete().eq('game_code', roomId)
    await sb.from('tlmn_stat_records').delete().eq('room_id', roomId)
    if (m.userIds.length) await sb.from('coin_ledger').delete().eq('game_code', roomId).in('user_id', m.userIds)
    await sb.from('tlmn_rooms').delete().eq('id', roomId)
    steps.push(`cleaned room ${roomId}`)
  }

  for (const snap of m.snapshots) {
    if (snap.wallet == null) { await sb.from('game_wallets').delete().eq('user_id', snap.user_id); steps.push(`removed wallet created this run for ${snap.user_id}`) }
    else { await sb.from('game_wallets').update({ balance: snap.wallet }).eq('user_id', snap.user_id); steps.push(`restored wallet for ${snap.user_id}`) }
    if (snap.stats == null) { await sb.from('game_player_stats').delete().eq('user_id', snap.user_id).eq('game_key', 'tlmn'); steps.push(`removed stats created this run for ${snap.user_id}`) }
    else {
      const vals = { ...snap.stats }; delete vals.user_id; delete vals.game_key
      await sb.from('game_player_stats').update(vals).eq('user_id', snap.user_id).eq('game_key', 'tlmn')
      steps.push(`restored stats for ${snap.user_id}`)
    }
  }

  writeManifest({ runTag: RUN_TAG, roomIds: [], userIds: m.userIds, snapshots: [] })
  return { ok: true, runTag: RUN_TAG, steps }
}
