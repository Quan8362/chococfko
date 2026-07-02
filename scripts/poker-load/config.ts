// ── Poker LOAD-TEST configuration: profiles + cost guardrails + STOP SWITCH ─────────────
//
// Shared, dependency-free spine for every load driver in this directory. It encodes the
// controlled-testing rules from the phase brief so no driver can silently:
//   • hammer PRODUCTION (refuses unless an explicit throwaway branch is targeted),
//   • exceed a cost/scale ceiling (hard caps on tables / players / duration / RPS),
//   • ignore the operator's stop signal (file-based kill switch + SIGINT).
//
// PURE + Node-stdlib only (no Supabase, no Playwright) so it can be imported by any tool and
// unit-reasoned about. Reads config from env; never contains secrets.

import fs from 'node:fs'
import path from 'node:path'

// ── Load profiles (the phase brief's 8 shapes) ──────────────────────────────────────────
export type ProfileName =
  | 'baseline'
  | 'moderate'
  | 'target'
  | 'burst'
  | 'settlement'
  | 'reconnect'
  | 'lobby'
  | 'history'

export interface LoadProfile {
  readonly name: ProfileName
  readonly description: string
  readonly tables: number
  readonly playersPerTable: number // seated
  readonly spectatorsPerTable: number
  readonly lobbyViewers: number // clients only browsing/filtering the lobby
  readonly historyBrowsers: number // clients paging hand history while games run
  readonly handsPerTable: number // how many hands each table should complete (0 = run for durationSec)
  readonly durationSec: number
  readonly actionThinkMsMin: number // human-like delay between a client's legal actions
  readonly actionThinkMsMax: number
  readonly reconnectFraction: number // 0..1 of clients that drop+resubscribe mid-session
}

export const PROFILES: Record<ProfileName, LoadProfile> = {
  baseline: {
    name: 'baseline', description: '10 tables / 60 players — smoke the pipeline end to end',
    tables: 10, playersPerTable: 6, spectatorsPerTable: 0, lobbyViewers: 5, historyBrowsers: 0,
    handsPerTable: 20, durationSec: 300, actionThinkMsMin: 400, actionThinkMsMax: 1500, reconnectFraction: 0,
  },
  moderate: {
    name: 'moderate', description: '30 tables / 180 players — first scaling data point',
    tables: 30, playersPerTable: 6, spectatorsPerTable: 1, lobbyViewers: 20, historyBrowsers: 5,
    handsPerTable: 30, durationSec: 600, actionThinkMsMin: 400, actionThinkMsMax: 1500, reconnectFraction: 0.05,
  },
  target: {
    name: 'target', description: '100 tables / 600 players — initial launch target',
    tables: 100, playersPerTable: 6, spectatorsPerTable: 2, lobbyViewers: 100, historyBrowsers: 30,
    handsPerTable: 30, durationSec: 900, actionThinkMsMin: 500, actionThinkMsMax: 2000, reconnectFraction: 0.05,
  },
  burst: {
    name: 'burst', description: 'rapid lobby join + many tables starting simultaneously',
    tables: 100, playersPerTable: 6, spectatorsPerTable: 0, lobbyViewers: 200, historyBrowsers: 0,
    handsPerTable: 3, durationSec: 120, actionThinkMsMin: 100, actionThinkMsMax: 400, reconnectFraction: 0,
  },
  settlement: {
    name: 'settlement', description: 'many all-in hands settling in a short interval',
    tables: 100, playersPerTable: 6, spectatorsPerTable: 0, lobbyViewers: 0, historyBrowsers: 0,
    handsPerTable: 10, durationSec: 180, actionThinkMsMin: 50, actionThinkMsMax: 150, reconnectFraction: 0,
  },
  reconnect: {
    name: 'reconnect', description: 'reconnect storm — many clients resubscribe + request snapshots',
    tables: 60, playersPerTable: 6, spectatorsPerTable: 2, lobbyViewers: 0, historyBrowsers: 0,
    handsPerTable: 0, durationSec: 300, actionThinkMsMin: 400, actionThinkMsMax: 1500, reconnectFraction: 0.6,
  },
  lobby: {
    name: 'lobby', description: 'frequent lobby viewers + filtering while tables churn',
    tables: 100, playersPerTable: 4, spectatorsPerTable: 0, lobbyViewers: 500, historyBrowsers: 0,
    handsPerTable: 0, durationSec: 300, actionThinkMsMin: 300, actionThinkMsMax: 1000, reconnectFraction: 0,
  },
  history: {
    name: 'history', description: 'players browsing hand history while games continue',
    tables: 50, playersPerTable: 6, spectatorsPerTable: 0, lobbyViewers: 0, historyBrowsers: 300,
    handsPerTable: 20, durationSec: 300, actionThinkMsMin: 400, actionThinkMsMax: 1500, reconnectFraction: 0,
  },
}

// ── Hard guardrails (cost + safety ceilings) ────────────────────────────────────────────
// A driver must call assertWithinGuardrails(profile) before doing ANY work.
export interface Guardrails {
  readonly maxTables: number
  readonly maxSeatedPlayers: number
  readonly maxClients: number // seated + spectators + lobby + history
  readonly maxDurationSec: number
  readonly maxActionsPerSec: number // global command rate ceiling (protects the DB/functions)
}

// Defaults sized a little above the "target" profile so target runs, but a fat-fingered
// 10× profile is rejected. Override via env for a sanctioned bigger run.
export const GUARDRAILS: Guardrails = {
  maxTables: numEnv('POKER_LOAD_MAX_TABLES', 120),
  maxSeatedPlayers: numEnv('POKER_LOAD_MAX_PLAYERS', 720),
  maxClients: numEnv('POKER_LOAD_MAX_CLIENTS', 1500),
  maxDurationSec: numEnv('POKER_LOAD_MAX_DURATION_SEC', 1800),
  maxActionsPerSec: numEnv('POKER_LOAD_MAX_RPS', 400),
}

export function clientCount(p: LoadProfile): number {
  return p.tables * (p.playersPerTable + p.spectatorsPerTable) + p.lobbyViewers + p.historyBrowsers
}

export function assertWithinGuardrails(p: LoadProfile, g: Guardrails = GUARDRAILS): void {
  const seated = p.tables * p.playersPerTable
  const clients = clientCount(p)
  const problems: string[] = []
  if (p.tables > g.maxTables) problems.push(`tables ${p.tables} > max ${g.maxTables}`)
  if (seated > g.maxSeatedPlayers) problems.push(`seated ${seated} > max ${g.maxSeatedPlayers}`)
  if (clients > g.maxClients) problems.push(`clients ${clients} > max ${g.maxClients}`)
  if (p.durationSec > g.maxDurationSec) problems.push(`duration ${p.durationSec}s > max ${g.maxDurationSec}s`)
  if (problems.length) {
    throw new Error(
      `LOAD GUARDRAIL: profile "${p.name}" exceeds ceilings:\n  - ${problems.join('\n  - ')}\n` +
        `Raise the ceiling deliberately via POKER_LOAD_MAX_* env if this is sanctioned.`,
    )
  }
}

// ── Target safety: NEVER production unless deliberately overridden ───────────────────────
// Mirrors e2e/poker/_env.ts: a load run is only allowed against a throwaway branch
// (POKER_LOAD_SUPABASE_URL set) unless POKER_LOAD_ALLOW_PROD=1 is explicitly passed.
export interface Target {
  readonly supabaseUrl: string
  readonly baseUrl: string
  readonly isBranchTarget: boolean
  readonly allowProd: boolean
}

export function resolveTarget(): Target {
  const supabaseUrl = process.env.POKER_LOAD_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const baseUrl = process.env.POKER_LOAD_BASE_URL || 'http://localhost:3000'
  const isBranchTarget = !!process.env.POKER_LOAD_SUPABASE_URL
  const allowProd = process.env.POKER_LOAD_ALLOW_PROD === '1'
  return { supabaseUrl, baseUrl, isBranchTarget, allowProd }
}

export function assertSafeTarget(t: Target = resolveTarget()): void {
  if (!t.isBranchTarget && !t.allowProd) {
    throw new Error(
      'LOAD SAFETY: refusing to run — no throwaway branch targeted.\n' +
        'Set POKER_LOAD_SUPABASE_URL (+ anon/service keys) to a Supabase preview branch, or set\n' +
        'POKER_LOAD_ALLOW_PROD=1 ONLY if you truly intend a controlled run against the prod DB.',
    )
  }
  if (/kjfnqbzfhymhfodmgyow/.test(t.supabaseUrl) && !t.allowProd) {
    // The known production project ref — refuse by default even if mislabelled as a branch.
    throw new Error('LOAD SAFETY: target looks like PRODUCTION; refusing without POKER_LOAD_ALLOW_PROD=1.')
  }
}

// ── STOP SWITCH — file-based kill + SIGINT, polled by every driver loop ──────────────────
// Create the file (default scripts/poker-load/.STOP) to make all running drivers wind down
// gracefully (finish the in-flight hand, unsubscribe, report) at the next poll.
const STOP_FILE = process.env.POKER_LOAD_STOP_FILE || path.resolve(process.cwd(), 'scripts', 'poker-load', '.STOP')
let sigintStopped = false

export function armStopSwitch(): void {
  process.on('SIGINT', () => {
    sigintStopped = true
    // eslint-disable-next-line no-console
    console.error('\n[stop-switch] SIGINT received — winding down after in-flight work…')
  })
}

export function shouldStop(): boolean {
  if (sigintStopped) return true
  try {
    return fs.existsSync(STOP_FILE)
  } catch {
    return false
  }
}

export function clearStopSwitch(): void {
  sigintStopped = false
  try {
    if (fs.existsSync(STOP_FILE)) fs.rmSync(STOP_FILE)
  } catch {
    /* best effort */
  }
}

// ── small helpers ────────────────────────────────────────────────────────────────────────
function numEnv(key: string, dflt: number): number {
  const v = Number(process.env[key])
  return Number.isFinite(v) && v > 0 ? v : dflt
}

export function resolveProfile(name = process.env.POKER_LOAD_PROFILE || 'baseline'): LoadProfile {
  const p = PROFILES[name as ProfileName]
  if (!p) {
    throw new Error(`unknown load profile "${name}"; choose one of: ${Object.keys(PROFILES).join(', ')}`)
  }
  return p
}
