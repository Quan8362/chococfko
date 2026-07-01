// ── Poker ALPHA dashboard — read-side data loader (service role; server-only) ──────────
//
// Plain async loaders (NOT 'use server') imported by the admin-gated Alpha page. They read
// the authoritative poker_* tables directly for a QA-focused snapshot: tester allowlist,
// live/session throughput, integrity (exit-blocker) signals from ops_events, and the
// in-game bug-report stream. NEVER returns hole cards / decks / seeds. Everything degrades
// safely: a missing bug-reports table (migration not applied yet) yields an empty report
// set with `bugReportsAvailable = false` rather than throwing.

import { createAdminClient } from '@/lib/supabase/admin'
import { parseAlphaTesters, resolvePokerFlags, POKER_ALPHA_TESTERS_ENV, type PokerFlags } from '@/lib/games/poker/flags'
import { deviceClassFromViewport } from '@/lib/games/poker/bugReport'

export interface AlphaFlagsView {
  alpha: boolean
  enabled: boolean
  createTable: boolean
  publicLobby: boolean
  privateTable: boolean
  spectator: boolean
  blockNewJoins: boolean
}

export interface AlphaSessionMetrics {
  activeTables: number
  openTables: number
  seatedPlayers: number
  totalHands: number
  completedHands: number
  cancelledHands: number
  sidePotHands: number
  allInHands: number
  timeoutActions: number
}

// Integrity / exit-blocker signals sourced from ops_events (last 7 days).
export interface AlphaIntegritySignals {
  coinConservationFailures: number
  settlementFailures: number
  sequenceGaps: number
  duplicateActions: number
  frozenHands: number
  reconnectFailures: number
  rlsDenials: number
  failedActions: number
  available: boolean
}

export interface AlphaBugRow {
  id: string
  severity: string
  status: string
  description: string
  tableId: string | null
  handId: string | null
  street: string | null
  phase: string | null
  deviceClass: string | null
  browser: string | null
  os: string | null
  errorCode: string | null
  createdAt: string
}

export interface AlphaBugAnalytics {
  available: boolean
  total: number
  open: number
  bySeverity: Record<string, number>
  byStatus: Record<string, number>
  byDeviceClass: Record<string, number>
  byBrowser: Record<string, number>
  byPhase: Record<string, number>
  recentOpen: AlphaBugRow[]
}

export interface AlphaDashboard {
  testers: string[]
  flags: AlphaFlagsView
  session: AlphaSessionMetrics
  integrity: AlphaIntegritySignals
  bugs: AlphaBugAnalytics
}

function inc(map: Record<string, number>, key: string | null | undefined) {
  const k = key && key.trim() ? key : '(none)'
  map[k] = (map[k] ?? 0) + 1
}

function flagsView(f: PokerFlags): AlphaFlagsView {
  return {
    alpha: f.alpha, enabled: f.enabled, createTable: f.createTable,
    publicLobby: f.publicLobby, privateTable: f.privateTable,
    spectator: f.spectator, blockNewJoins: f.blockNewJoins,
  }
}

async function loadSession(admin: ReturnType<typeof createAdminClient>): Promise<AlphaSessionMetrics> {
  const [{ data: tables }, { data: seats }, { data: hands }, { count: timeoutCount }] = await Promise.all([
    admin.from('poker_tables').select('id, status').limit(1000),
    admin.from('poker_seats').select('user_id').not('user_id', 'is', null).limit(5000),
    admin.from('poker_hands').select('id, phase, pots').limit(20000),
    admin.from('poker_actions').select('id', { count: 'exact', head: true }).in('type', ['timeout_fold', 'timeout_check']),
  ])

  const activeTables = (tables ?? []).filter((t) => t.status !== 'closed').length
  const openTables = (tables ?? []).filter((t) => t.status === 'open').length
  const seatedPlayers = (seats ?? []).length

  let completedHands = 0, cancelledHands = 0, sidePotHands = 0
  for (const h of hands ?? []) {
    if (h.phase === 'COMPLETED') completedHands++
    if (h.phase === 'CANCELLED') cancelledHands++
    const sides = (h.pots as { sides?: unknown[] } | null)?.sides
    if (Array.isArray(sides) && sides.length > 0) sidePotHands++
  }

  // All-in hands = distinct hands with at least one all_in action.
  const { data: allInRows } = await admin.from('poker_actions').select('hand_id').eq('type', 'all_in').limit(20000)
  const allInHands = new Set((allInRows ?? []).map((r) => r.hand_id as string)).size

  return {
    activeTables,
    openTables,
    seatedPlayers,
    totalHands: (hands ?? []).length,
    completedHands,
    cancelledHands,
    sidePotHands,
    allInHands,
    timeoutActions: timeoutCount ?? 0,
  }
}

async function loadIntegrity(admin: ReturnType<typeof createAdminClient>): Promise<AlphaIntegritySignals> {
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
  try {
    const { data, error } = await admin
      .from('poker_ops_events')
      .select('kind')
      .gte('created_at', since)
      .limit(50000)
    if (error) throw error
    const c: Record<string, number> = {}
    for (const r of data ?? []) inc(c, r.kind as string)
    return {
      coinConservationFailures: c['coin_conservation_failure'] ?? 0,
      settlementFailures: c['settlement_failure'] ?? 0,
      sequenceGaps: c['sequence_gap'] ?? 0,
      duplicateActions: c['duplicate_action'] ?? 0,
      frozenHands: c['frozen_hand'] ?? 0,
      reconnectFailures: c['reconnect_failure'] ?? 0,
      rlsDenials: c['rls_denial'] ?? 0,
      failedActions: c['failed_action'] ?? 0,
      available: true,
    }
  } catch {
    return {
      coinConservationFailures: 0, settlementFailures: 0, sequenceGaps: 0,
      duplicateActions: 0, frozenHands: 0, reconnectFailures: 0, rlsDenials: 0,
      failedActions: 0, available: false,
    }
  }
}

async function loadBugs(admin: ReturnType<typeof createAdminClient>): Promise<AlphaBugAnalytics> {
  const empty: AlphaBugAnalytics = {
    available: false, total: 0, open: 0, bySeverity: {}, byStatus: {},
    byDeviceClass: {}, byBrowser: {}, byPhase: {}, recentOpen: [],
  }
  try {
    const { data, error } = await admin
      .from('poker_bug_reports')
      .select('id, severity, status, description, table_id, hand_id, street, phase, device_class, viewport, browser, os, error_code, created_at')
      .order('created_at', { ascending: false })
      .limit(2000)
    if (error) throw error
    const rows = data ?? []
    const bySeverity: Record<string, number> = {}
    const byStatus: Record<string, number> = {}
    const byDeviceClass: Record<string, number> = {}
    const byBrowser: Record<string, number> = {}
    const byPhase: Record<string, number> = {}
    const recentOpen: AlphaBugRow[] = []
    let open = 0
    for (const r of rows) {
      inc(bySeverity, r.severity as string)
      inc(byStatus, r.status as string)
      inc(byDeviceClass, (r.device_class as string) ?? deviceClassFromViewport(r.viewport as string))
      inc(byBrowser, r.browser as string)
      inc(byPhase, r.phase as string)
      const isOpen = r.status === 'open' || r.status === 'triaged' || r.status === 'in_progress'
      if (isOpen) open++
      if (isOpen && recentOpen.length < 25) {
        recentOpen.push({
          id: r.id as string,
          severity: r.severity as string,
          status: r.status as string,
          description: (r.description as string ?? '').slice(0, 160),
          tableId: (r.table_id as string) ?? null,
          handId: (r.hand_id as string) ?? null,
          street: (r.street as string) ?? null,
          phase: (r.phase as string) ?? null,
          deviceClass: (r.device_class as string) ?? null,
          browser: (r.browser as string) ?? null,
          os: (r.os as string) ?? null,
          errorCode: (r.error_code as string) ?? null,
          createdAt: r.created_at as string,
        })
      }
    }
    return { available: true, total: rows.length, open, bySeverity, byStatus, byDeviceClass, byBrowser, byPhase, recentOpen }
  } catch {
    return empty
  }
}

export async function loadAlphaDashboard(): Promise<AlphaDashboard> {
  const admin = createAdminClient()
  const testers = parseAlphaTesters(process.env[POKER_ALPHA_TESTERS_ENV])
  const flags = resolvePokerFlags(process.env)
  const [session, integrity, bugs] = await Promise.all([
    loadSession(admin),
    loadIntegrity(admin),
    loadBugs(admin),
  ])
  return { testers, flags: flagsView(flags), session, integrity, bugs }
}
