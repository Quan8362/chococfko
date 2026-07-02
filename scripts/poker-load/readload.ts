// ── Poker READ + REALTIME load driver (runnable against a throwaway Supabase branch) ────
//
// Scope: this driver exercises the part of the stack that the capacity model flags as the real
// ceiling — Supabase Realtime channel fan-out + authenticated READ RPS (lobby / snapshot /
// history) under RLS — WITHOUT calling the service-role authoritative RPCs and WITHOUT
// fabricating game state. It:
//   • signs in as the provisioned throwaway test users (email/password on the branch),
//   • opens one realtime channel per simulated seated client (poker_hands/seats/tables filters,
//     exactly like app/games/poker/usePokerRealtime.ts),
//   • drives lobby-list + table-snapshot + hand-history READS at the profile's cadence,
//   • honours the STOP SWITCH, cost guardrails, and the never-prod safety gate,
//   • records latency samples and prints a summary (+ BENCH_JSON line).
//
// The GAMEPLAY WRITE path (join → legal actions → settlement → cash-out) is driven separately by
// the Playwright harness (e2e/poker/multiplayer.spec.ts) which goes through the real Next server
// actions; see load-test-plan.md for how the two combine. This split keeps every command on its
// real, validated path (no direct mutation of authoritative state).
//
// Run (branch only):
//   POKER_LOAD_SUPABASE_URL=https://<ref>.supabase.co \
//   POKER_LOAD_ANON_KEY=<branch anon> \
//   POKER_LOAD_PROFILE=baseline \
//   node scripts/poker-load/readload.ts

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  resolveProfile,
  resolveTarget,
  assertSafeTarget,
  assertWithinGuardrails,
  armStopSwitch,
  shouldStop,
  clientCount,
} from './config.ts'

interface Sample {
  op: string
  ms: number
  ok: boolean
}

const samples: Sample[] = []
function record(op: string, ms: number, ok: boolean): void {
  samples.push({ op, ms, ok })
}
const now = () => Number(process.hrtime.bigint()) / 1e6
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const jitter = (min: number, max: number) => min + Math.random() * (max - min)

function makeClient(url: string, key: string): SupabaseClient {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: true },
    realtime: { params: { eventsPerSecond: 20 } },
  })
}

async function timed(op: string, fn: () => PromiseLike<unknown>): Promise<void> {
  const a = now()
  let ok = true
  try {
    const res = (await fn()) as { error?: unknown } | null
    ok = !res || !res.error
  } catch {
    ok = false
  }
  record(op, now() - a, ok)
}

// One simulated client: subscribe to a table channel + poll snapshot/history reads.
async function runClient(
  client: SupabaseClient,
  tableId: string,
  role: 'seated' | 'spectator' | 'lobby' | 'history',
  deadline: number,
  think: [number, number],
): Promise<void> {
  let channel: ReturnType<SupabaseClient['channel']> | null = null
  if (role === 'seated' || role === 'spectator') {
    channel = client
      .channel(`poker:${tableId}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poker_hands', filter: `table_id=eq.${tableId}` }, () => {})
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poker_seats', filter: `table_id=eq.${tableId}` }, () => {})
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'poker_tables', filter: `id=eq.${tableId}` }, () => {})
    channel.subscribe()
  }

  while (now() < deadline && !shouldStop()) {
    if (role === 'lobby') {
      await timed('lobby', () =>
        client.from('poker_tables').select('id,status,small_blind,big_blind,capacity,created_at').neq('status', 'closed').order('created_at', { ascending: false }).limit(100),
      )
    } else if (role === 'history') {
      await timed('hand_history', () =>
        client.from('poker_hands').select('id,hand_no,completed_at').eq('table_id', tableId).eq('phase', 'COMPLETED').order('hand_no', { ascending: false }).limit(25),
      )
    } else {
      // seated/spectator: read the public table snapshot (seats + latest hand), like fetchTableState
      await timed('snapshot', () => client.from('poker_seats').select('seat_index,user_id,stack,last_action').eq('table_id', tableId).order('seat_index'))
    }
    await sleep(jitter(think[0], think[1]))
  }

  if (channel) await client.removeChannel(channel)
}

function pct(arr: number[], q: number): number {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]
}

function report(): void {
  const ops = Array.from(new Set(samples.map((s) => s.op)))
  console.log('\n── read/realtime load results ──')
  console.log('op'.padEnd(14) + 'n'.padStart(8) + 'err'.padStart(6) + 'p50'.padStart(9) + 'p95'.padStart(9) + 'p99'.padStart(9))
  const json: Record<string, unknown> = {}
  for (const op of ops) {
    const rows = samples.filter((s) => s.op === op)
    const lat = rows.filter((r) => r.ok).map((r) => r.ms)
    const errs = rows.filter((r) => !r.ok).length
    console.log(
      op.padEnd(14) +
        String(rows.length).padStart(8) +
        String(errs).padStart(6) +
        pct(lat, 0.5).toFixed(1).padStart(9) +
        pct(lat, 0.95).toFixed(1).padStart(9) +
        pct(lat, 0.99).toFixed(1).padStart(9),
    )
    json[op] = { n: rows.length, err: errs, p50: +pct(lat, 0.5).toFixed(1), p95: +pct(lat, 0.95).toFixed(1), p99: +pct(lat, 0.99).toFixed(1) }
  }
  console.log('\nBENCH_JSON=' + JSON.stringify(json))
}

async function main(): Promise<void> {
  const profile = resolveProfile()
  const target = resolveTarget()
  assertSafeTarget(target)
  assertWithinGuardrails(profile)
  armStopSwitch()

  const anon = process.env.POKER_LOAD_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  if (!target.supabaseUrl || !anon) throw new Error('missing POKER_LOAD_SUPABASE_URL / POKER_LOAD_ANON_KEY')

  // Discover existing OPEN tables on the branch to attach load to (seeded beforehand by the
  // Playwright harness or a seed script). This driver READS only — it never creates tables.
  const probe = makeClient(target.supabaseUrl, anon)
  const { data: tables, error } = await probe
    .from('poker_tables')
    .select('id')
    .eq('status', 'open')
    .limit(profile.tables)
  if (error) throw new Error(`cannot list tables on target: ${error.message}`)
  const tableIds = (tables ?? []).map((t) => t.id)
  if (tableIds.length === 0) throw new Error('no open tables on target branch — seed tables first (see README)')

  console.log(`\nread/realtime load — profile "${profile.name}"  target=${target.supabaseUrl.replace(/https?:\/\//, '')}`)
  console.log(`tables=${tableIds.length}  clients≈${clientCount(profile)}  duration=${profile.durationSec}s`)

  const deadline = now() + profile.durationSec * 1000
  const think: [number, number] = [profile.actionThinkMsMin, profile.actionThinkMsMax]
  const jobs: Promise<void>[] = []

  // One shared anon client is enough for read-only load; realtime channels are per simulated
  // client. (A full auth-per-user variant is documented in the README for RLS-accurate runs.)
  const rt = makeClient(target.supabaseUrl, anon)

  for (const tid of tableIds) {
    for (let s = 0; s < profile.playersPerTable; s++) jobs.push(runClient(rt, tid, 'seated', deadline, think))
    for (let s = 0; s < profile.spectatorsPerTable; s++) jobs.push(runClient(rt, tid, 'spectator', deadline, think))
  }
  for (let i = 0; i < profile.lobbyViewers; i++) jobs.push(runClient(probe, tableIds[i % tableIds.length], 'lobby', deadline, think))
  for (let i = 0; i < profile.historyBrowsers; i++) jobs.push(runClient(probe, tableIds[i % tableIds.length], 'history', deadline, think))

  await Promise.all(jobs)
  report()
  await rt.removeAllChannels()
  process.exit(0)
}

main().catch((e) => {
  console.error('[readload] fatal:', (e as Error).message)
  process.exit(1)
})
