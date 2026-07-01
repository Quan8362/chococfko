// ── Poker ADMIN read-side data loaders (service role; server-only) ─────────────────────
//
// Service-role reads for the operational dashboards. NOT a 'use server' file — these are plain
// async functions imported by the (admin-gated) server components. They read the authoritative
// poker_* tables directly. They NEVER return live hole cards / decks / seeds; the only card
// values that surface are via the explicit, audited revealHoleCards action on a terminal hand.

import { createAdminClient } from '@/lib/supabase/admin'
import {
  reconstructReplay,
  computeCollusionSignals,
  type ReplayActionInput,
  type ReplayResult,
  type PairSignal,
} from '@/lib/games/poker/admin'

// ── Live table overview ─────────────────────────────────────────────────────────────────
export interface OverviewTable {
  id: string
  name: string
  status: string
  paused: boolean
  pausedReason: string | null
  smallBlind: number
  bigBlind: number
  capacity: number
  seatedPlayers: number
  connectedPlayers: number
  publicStack: number
  currentHandId: string | null
  handNo: number
  street: string | null
  phase: string | null
  stateVersion: number
  actionSeq: number
  currentActor: number | null
  turnDeadline: string | null
  potTotal: number
  openIncidents: number
  lastActivityAt: string | null
  updatedAt: string
}

export async function loadOverview(): Promise<OverviewTable[]> {
  const admin = createAdminClient()
  const { data: tables } = await admin
    .from('poker_tables')
    .select('id, name, status, paused, paused_reason, small_blind, big_blind, capacity, current_hand_id, state_version, last_activity_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(200)
  if (!tables?.length) return []

  const ids = tables.map((t) => t.id as string)
  const [{ data: seats }, { data: hands }, { data: incidents }] = await Promise.all([
    admin.from('poker_seats').select('table_id, user_id, status, stack, disconnected_at').in('table_id', ids),
    admin.from('poker_hands').select('id, table_id, hand_no, phase, street, turn_seat, turn_deadline, state_version, action_seq, pots').in('table_id', ids).order('hand_no', { ascending: false }),
    admin.from('poker_incident_cases').select('table_id, status').in('table_id', ids).in('status', ['OPEN', 'INVESTIGATING']),
  ])

  const handByTable = new Map<string, Record<string, unknown>>()
  for (const h of hands ?? []) { if (!handByTable.has(h.table_id as string)) handByTable.set(h.table_id as string, h) }

  return tables.map((t) => {
    const tableSeats = (seats ?? []).filter((s) => s.table_id === t.id)
    const occupied = tableSeats.filter((s) => ['sitting_in', 'sitting_out', 'busted', 'leaving', 'reserved'].includes(s.status as string))
    const h = (t.current_hand_id ? (hands ?? []).find((x) => x.id === t.current_hand_id) : null) ?? handByTable.get(t.id as string) ?? null
    const pots = (h?.pots as { main?: { amount?: number }; sides?: { amount?: number }[] }) ?? null
    const potTotal = pots ? (pots.main?.amount ?? 0) + (pots.sides ?? []).reduce((s, x) => s + (x.amount ?? 0), 0) : 0
    return {
      id: t.id as string,
      name: t.name as string,
      status: t.status as string,
      paused: !!t.paused,
      pausedReason: (t.paused_reason as string) ?? null,
      smallBlind: t.small_blind as number,
      bigBlind: t.big_blind as number,
      capacity: t.capacity as number,
      seatedPlayers: occupied.length,
      connectedPlayers: tableSeats.filter((s) => s.user_id != null && s.disconnected_at == null).length,
      publicStack: tableSeats.reduce((s, x) => s + (x.stack as number ?? 0), 0),
      currentHandId: (h?.id as string) ?? null,
      handNo: (h?.hand_no as number) ?? 0,
      street: (h?.street as string) ?? null,
      phase: (h?.phase as string) ?? null,
      stateVersion: (h?.state_version as number) ?? (t.state_version as number) ?? 0,
      actionSeq: (h?.action_seq as number) ?? 0,
      currentActor: (h?.turn_seat as number) ?? null,
      turnDeadline: (h?.turn_deadline as string) ?? null,
      potTotal,
      openIncidents: (incidents ?? []).filter((i) => i.table_id === t.id).length,
      lastActivityAt: (t.last_activity_at as string) ?? null,
      updatedAt: t.updated_at as string,
    }
  })
}

// ── Table detail ────────────────────────────────────────────────────────────────────────
export interface TableSeatRow {
  seatIndex: number
  userId: string | null
  displayName: string | null
  status: string
  stack: number
  pendingTopup: number
  committedThisStreet: number
  committedTotal: number
  lastAction: string | null
  allIn: boolean
  connected: boolean
}

export interface TableDetail {
  id: string
  name: string
  status: string
  paused: boolean
  pausedReason: string | null
  smallBlind: number
  bigBlind: number
  capacity: number
  stateVersion: number
  lastActivityAt: string | null
  seats: TableSeatRow[]
  currentHand: {
    id: string; handNo: number; phase: string; street: string | null; turnSeat: number | null;
    turnDeadline: string | null; actionSeq: number; stateVersion: number; potTotal: number;
  } | null
  recentHands: { id: string; handNo: number; phase: string; completedAt: string | null }[]
  incidents: IncidentRow[]
  audit: AuditRow[]
}

export interface AuditRow {
  id: string; action: string; actorEmail: string | null; reason: string;
  tableId: string | null; handId: string | null; targetUserId: string | null;
  incidentCaseId: string | null; detail: Record<string, unknown>; createdAt: string;
}

export interface IncidentRow {
  id: string; status: string; severity: string; category: string; title: string;
  tableId: string | null; handId: string | null; relatedUserIds: string[];
  openedAt: string; closedAt: string | null; resolution: string | null;
}

function mapAudit(r: Record<string, unknown>): AuditRow {
  return {
    id: r.id as string, action: r.action as string, actorEmail: (r.actor_email as string) ?? null,
    reason: r.reason as string, tableId: (r.table_id as string) ?? null, handId: (r.hand_id as string) ?? null,
    targetUserId: (r.target_user_id as string) ?? null, incidentCaseId: (r.incident_case_id as string) ?? null,
    detail: (r.detail as Record<string, unknown>) ?? {}, createdAt: r.created_at as string,
  }
}
function mapIncident(r: Record<string, unknown>): IncidentRow {
  return {
    id: r.id as string, status: r.status as string, severity: r.severity as string,
    category: r.category as string, title: r.title as string, tableId: (r.table_id as string) ?? null,
    handId: (r.hand_id as string) ?? null, relatedUserIds: (r.related_user_ids as string[]) ?? [],
    openedAt: r.opened_at as string, closedAt: (r.closed_at as string) ?? null,
    resolution: (r.resolution as string) ?? null,
  }
}

export async function loadTableDetail(tableId: string): Promise<TableDetail | null> {
  const admin = createAdminClient()
  const { data: t } = await admin.from('poker_tables')
    .select('id, name, status, paused, paused_reason, small_blind, big_blind, capacity, current_hand_id, state_version, last_activity_at')
    .eq('id', tableId).maybeSingle()
  if (!t) return null

  const [{ data: seats }, { data: hands }, { data: incidents }, { data: audit }] = await Promise.all([
    admin.from('poker_seats').select('seat_index, user_id, display_name, status, stack, pending_topup, committed_this_street, committed_total, last_action, all_in, disconnected_at').eq('table_id', tableId).order('seat_index'),
    admin.from('poker_hands').select('id, hand_no, phase, street, turn_seat, turn_deadline, action_seq, state_version, pots, completed_at').eq('table_id', tableId).order('hand_no', { ascending: false }).limit(20),
    admin.from('poker_incident_cases').select('id, status, severity, category, title, table_id, hand_id, related_user_ids, opened_at, closed_at, resolution').eq('table_id', tableId).order('opened_at', { ascending: false }).limit(50),
    admin.from('poker_admin_audit').select('id, action, actor_email, reason, table_id, hand_id, target_user_id, incident_case_id, detail, created_at').eq('table_id', tableId).order('created_at', { ascending: false }).limit(50),
  ])

  const cur = (hands ?? []).find((h) => h.id === t.current_hand_id) ?? null
  const curPots = (cur?.pots as { main?: { amount?: number }; sides?: { amount?: number }[] }) ?? null

  return {
    id: t.id as string, name: t.name as string, status: t.status as string, paused: !!t.paused,
    pausedReason: (t.paused_reason as string) ?? null, smallBlind: t.small_blind as number,
    bigBlind: t.big_blind as number, capacity: t.capacity as number, stateVersion: t.state_version as number,
    lastActivityAt: (t.last_activity_at as string) ?? null,
    seats: (seats ?? []).map((s) => ({
      seatIndex: s.seat_index as number, userId: (s.user_id as string) ?? null,
      displayName: (s.display_name as string) ?? null, status: s.status as string,
      stack: s.stack as number, pendingTopup: (s.pending_topup as number) ?? 0,
      committedThisStreet: (s.committed_this_street as number) ?? 0, committedTotal: (s.committed_total as number) ?? 0,
      lastAction: (s.last_action as string) ?? null, allIn: !!s.all_in, connected: s.disconnected_at == null,
    })),
    currentHand: cur ? {
      id: cur.id as string, handNo: cur.hand_no as number, phase: cur.phase as string,
      street: (cur.street as string) ?? null, turnSeat: (cur.turn_seat as number) ?? null,
      turnDeadline: (cur.turn_deadline as string) ?? null, actionSeq: (cur.action_seq as number) ?? 0,
      stateVersion: (cur.state_version as number) ?? 0,
      potTotal: curPots ? (curPots.main?.amount ?? 0) + (curPots.sides ?? []).reduce((a, x) => a + (x.amount ?? 0), 0) : 0,
    } : null,
    recentHands: (hands ?? []).map((h) => ({ id: h.id as string, handNo: h.hand_no as number, phase: h.phase as string, completedAt: (h.completed_at as string) ?? null })),
    incidents: (incidents ?? []).map(mapIncident),
    audit: (audit ?? []).map(mapAudit),
  }
}

// ── Hand inspection + replay ──────────────────────────────────────────────────────────────
export interface HandInspection {
  id: string
  tableId: string
  tableName: string | null
  handNo: number
  phase: string
  street: string | null
  buttonSeat: number | null
  board: string[]
  pots: unknown
  reveal: unknown
  actionSeq: number
  stateVersion: number
  smallBlind: number
  bigBlind: number
  createdAt: string
  completedAt: string | null
  actions: { actionSeq: number; seatIndex: number; userId: string | null; street: string; type: string; amount: number | null; createdAt: string }[]
  settlement: { kind: string; payouts: { seatIndex: number; amount: number }[]; totalContributed: number; settledAt: string } | null
  incidents: IncidentRow[]
  systemEvents: { kind: string; severity: string; detail: Record<string, unknown>; createdAt: string }[]
  audit: AuditRow[]
  replay: ReplayResult
}

export async function loadHandInspection(handId: string): Promise<HandInspection | null> {
  const admin = createAdminClient()
  const { data: h } = await admin.from('poker_hands')
    .select('id, table_id, hand_no, phase, street, button_seat, board, pots, reveal, action_seq, state_version, created_at, completed_at')
    .eq('id', handId).maybeSingle()
  if (!h) return null

  const [{ data: table }, { data: acts }, { data: settle }, { data: incidents }, { data: sysEvents }, { data: audit }] = await Promise.all([
    admin.from('poker_tables').select('name, small_blind, big_blind').eq('id', h.table_id).maybeSingle(),
    admin.from('poker_actions').select('action_seq, seat_index, user_id, street, type, amount, created_at').eq('hand_id', handId).order('action_seq'),
    admin.from('poker_hand_settlements').select('kind, payouts, total_contributed, settled_at').eq('hand_id', handId).maybeSingle(),
    admin.from('poker_incident_cases').select('id, status, severity, category, title, table_id, hand_id, related_user_ids, opened_at, closed_at, resolution').eq('hand_id', handId).order('opened_at', { ascending: false }),
    admin.from('poker_incidents').select('kind, severity, detail, created_at').eq('hand_id', handId).order('created_at', { ascending: false }),
    admin.from('poker_admin_audit').select('id, action, actor_email, reason, table_id, hand_id, target_user_id, incident_case_id, detail, created_at').eq('hand_id', handId).order('created_at', { ascending: false }),
  ])

  const actions = (acts ?? []).map((a) => ({
    actionSeq: a.action_seq as number, seatIndex: a.seat_index as number, userId: (a.user_id as string) ?? null,
    street: a.street as string, type: a.type as string, amount: (a.amount as number) ?? null, createdAt: a.created_at as string,
  }))
  const seatSet = Array.from(new Set(actions.map((a) => a.seatIndex)))
  const totalContributed = (settle?.total_contributed as number) ?? null
  const replay = reconstructReplay({
    seatIndexes: seatSet,
    actions: actions.map<ReplayActionInput>((a) => ({
      actionSeq: a.actionSeq, seatIndex: a.seatIndex, street: a.street as ReplayActionInput['street'],
      type: a.type as ReplayActionInput['type'], amount: a.amount,
    })),
    authoritativeTotalContributed: totalContributed,
  })

  return {
    id: h.id as string, tableId: h.table_id as string, tableName: (table?.name as string) ?? null,
    handNo: h.hand_no as number, phase: h.phase as string, street: (h.street as string) ?? null,
    buttonSeat: (h.button_seat as number) ?? null, board: (h.board as string[]) ?? [], pots: h.pots,
    reveal: h.reveal ?? null, actionSeq: (h.action_seq as number) ?? 0, stateVersion: (h.state_version as number) ?? 0,
    smallBlind: (table?.small_blind as number) ?? 0, bigBlind: (table?.big_blind as number) ?? 0,
    createdAt: h.created_at as string, completedAt: (h.completed_at as string) ?? null,
    actions,
    settlement: settle ? {
      kind: settle.kind as string, payouts: (settle.payouts as { seatIndex: number; amount: number }[]) ?? [],
      totalContributed: (settle.total_contributed as number) ?? 0, settledAt: settle.settled_at as string,
    } : null,
    incidents: (incidents ?? []).map(mapIncident),
    systemEvents: (sysEvents ?? []).map((e) => ({ kind: e.kind as string, severity: e.severity as string, detail: (e.detail as Record<string, unknown>) ?? {}, createdAt: e.created_at as string })),
    audit: (audit ?? []).map(mapAudit),
    replay,
  }
}

// ── Incidents list + detail ────────────────────────────────────────────────────────────────
export async function loadIncidents(status?: string): Promise<IncidentRow[]> {
  const admin = createAdminClient()
  let q = admin.from('poker_incident_cases')
    .select('id, status, severity, category, title, table_id, hand_id, related_user_ids, opened_at, closed_at, resolution')
    .order('opened_at', { ascending: false }).limit(200)
  if (status && status !== 'all') q = q.eq('status', status)
  const { data } = await q
  return (data ?? []).map(mapIncident)
}

export interface IncidentDetail extends IncidentRow {
  evidence: Record<string, unknown>
  audit: AuditRow[]
  restrictions: RestrictionRow[]
}

export async function loadIncidentDetail(caseId: string): Promise<IncidentDetail | null> {
  const admin = createAdminClient()
  const { data: c } = await admin.from('poker_incident_cases')
    .select('id, status, severity, category, title, table_id, hand_id, related_user_ids, evidence, opened_at, closed_at, resolution')
    .eq('id', caseId).maybeSingle()
  if (!c) return null
  const [{ data: audit }, { data: restrictions }] = await Promise.all([
    admin.from('poker_admin_audit').select('id, action, actor_email, reason, table_id, hand_id, target_user_id, incident_case_id, detail, created_at').eq('incident_case_id', caseId).order('created_at', { ascending: false }),
    admin.from('poker_player_restrictions').select('id, user_id, kind, reason, active, created_at, expires_at, lifted_at').eq('incident_case_id', caseId).order('created_at', { ascending: false }),
  ])
  return {
    ...mapIncident(c),
    evidence: (c.evidence as Record<string, unknown>) ?? {},
    audit: (audit ?? []).map(mapAudit),
    restrictions: (restrictions ?? []).map(mapRestriction),
  }
}

// ── Restrictions ──────────────────────────────────────────────────────────────────────────
export interface RestrictionRow {
  id: string; userId: string; kind: string; reason: string; active: boolean;
  createdAt: string; expiresAt: string | null; liftedAt: string | null;
}
function mapRestriction(r: Record<string, unknown>): RestrictionRow {
  return {
    id: r.id as string, userId: r.user_id as string, kind: r.kind as string, reason: r.reason as string,
    active: !!r.active, createdAt: r.created_at as string, expiresAt: (r.expires_at as string) ?? null,
    liftedAt: (r.lifted_at as string) ?? null,
  }
}
export async function loadActiveRestrictions(): Promise<RestrictionRow[]> {
  const admin = createAdminClient()
  const { data } = await admin.from('poker_player_restrictions')
    .select('id, user_id, kind, reason, active, created_at, expires_at, lifted_at')
    .eq('active', true).order('created_at', { ascending: false }).limit(200)
  return (data ?? []).map(mapRestriction)
}

// ── Observability events ────────────────────────────────────────────────────────────────────
export interface OpsEventRow {
  id: string; kind: string; severity: string; tableId: string | null; handId: string | null;
  userId: string | null; detail: Record<string, unknown>; createdAt: string;
}
export async function loadOpsEvents(opts: { kind?: string; severity?: string } = {}): Promise<{ rows: OpsEventRow[]; countsByKind: Record<string, number> }> {
  const admin = createAdminClient()
  let q = admin.from('poker_ops_events')
    .select('id, kind, severity, table_id, hand_id, user_id, detail, created_at')
    .order('created_at', { ascending: false }).limit(300)
  if (opts.kind && opts.kind !== 'all') q = q.eq('kind', opts.kind)
  if (opts.severity && opts.severity !== 'all') q = q.eq('severity', opts.severity)
  const { data } = await q
  const rows = (data ?? []).map((r) => ({
    id: r.id as string, kind: r.kind as string, severity: r.severity as string,
    tableId: (r.table_id as string) ?? null, handId: (r.hand_id as string) ?? null,
    userId: (r.user_id as string) ?? null, detail: (r.detail as Record<string, unknown>) ?? {},
    createdAt: r.created_at as string,
  }))
  // Counts across the last 7 days, irrespective of the current filter.
  const since = new Date(Date.now() - 7 * 86400_000).toISOString()
  const { data: recent } = await admin.from('poker_ops_events').select('kind').gte('created_at', since).limit(5000)
  const countsByKind: Record<string, number> = {}
  for (const e of recent ?? []) countsByKind[e.kind as string] = (countsByKind[e.kind as string] ?? 0) + 1
  return { rows, countsByKind }
}

// ── Anti-abuse evidence: collusion / chip-dumping signals from recent COMPLETED hands ──────
export async function loadCollusionSignals(limitHands = 500): Promise<readonly PairSignal[]> {
  const admin = createAdminClient()
  const { data: settles } = await admin.from('poker_hand_settlements')
    .select('hand_id, table_id, payouts, total_contributed, kind')
    .eq('kind', 'settle').order('settled_at', { ascending: false }).limit(limitHands)
  if (!settles?.length) return []
  const handIds = settles.map((s) => s.hand_id as string)

  // Reconstruct per-seat contributions from the action log, and map seat→user via hole cards.
  const [{ data: acts }, { data: holes }] = await Promise.all([
    admin.from('poker_actions').select('hand_id, action_seq, seat_index, user_id, street, type, amount').in('hand_id', handIds),
    admin.from('poker_hole_cards').select('hand_id, seat_index, user_id').in('hand_id', handIds),
  ])

  const actsByHand = new Map<string, Record<string, unknown>[]>()
  for (const a of acts ?? []) { const k = a.hand_id as string; (actsByHand.get(k) ?? actsByHand.set(k, []).get(k)!).push(a) }
  const seatUser = new Map<string, Map<number, string>>() // hand → seat → user
  for (const hc of holes ?? []) {
    const k = hc.hand_id as string
    if (!seatUser.has(k)) seatUser.set(k, new Map())
    seatUser.get(k)!.set(hc.seat_index as number, hc.user_id as string)
  }

  const flows = settles.map((s) => {
    const handId = s.hand_id as string
    const rows = actsByHand.get(handId) ?? []
    const seatIndexes = Array.from(new Set(rows.map((r) => r.seat_index as number)))
    const replay = reconstructReplay({
      seatIndexes,
      actions: rows.map<ReplayActionInput>((r) => ({
        actionSeq: r.action_seq as number, seatIndex: r.seat_index as number,
        street: r.street as ReplayActionInput['street'], type: r.type as ReplayActionInput['type'],
        amount: (r.amount as number) ?? null,
      })),
    })
    const last = replay.steps[replay.steps.length - 1]
    const contribBySeat: Record<number, number> = {}
    for (const si of seatIndexes) contribBySeat[si] = (last.committedTotal[si] ?? 0) + (last.committedThisStreet[si] ?? 0)
    const payouts = (s.payouts as { seatIndex: number; amount: number }[]) ?? []
    const payBySeat: Record<number, number> = {}
    for (const p of payouts) payBySeat[p.seatIndex] = (payBySeat[p.seatIndex] ?? 0) + p.amount

    const sMap = seatUser.get(handId) ?? new Map<number, string>()
    const netByUser: Record<string, number> = {}
    for (const si of seatIndexes) {
      const user = sMap.get(si) ?? (rows.find((r) => r.seat_index === si)?.user_id as string | undefined)
      if (!user) continue
      netByUser[user] = (netByUser[user] ?? 0) + (payBySeat[si] ?? 0) - (contribBySeat[si] ?? 0)
    }
    return { handId, tableId: s.table_id as string, netByUser }
  })

  return computeCollusionSignals(flows, { minHandsTogether: 3 })
}
