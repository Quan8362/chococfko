'use server'

// ── Poker authoritative server actions (DB persistence & security layer) ───────────────
//
// 'use server' — the ONLY authoritative API surface. The browser sends INTENT; identity is
// resolved server-side from the session cookie (auth.uid()). The browser NEVER decides cards,
// winners, pots, stacks, or settlement, and NEVER supplies its own user id.
//
// This file implements the DB-backed commands (table/seat/escrow lifecycle + public/own-card
// reads) AND the Phase P3 engine-driven gameplay (startHand / pokerAct / tickActionTimer /
// settlement) that wires the pure engine (lib/games/poker) to the atomic compare-and-swap RPCs.
//
// 🔴 PRIVACY: fetchTableState returns a PUBLIC projection only (no hole cards, no deck). Own
// hole cards are read ONLY via fetchMyHoleCards through the RLS read-own anon/cookie client.

import { randomUUID, randomInt } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  validateTableConfig,
  projectLobbyTable,
  type LobbyTable,
  type LobbyTableRaw,
  type PostBbPolicy,
} from '@/lib/games/poker/lifecycle'
import type {
  PublicTableState,
  MyHoleCardsState,
  PublicSeat,
  HoleCards,
  Card,
  Pots,
  PokerActionType,
} from '@/lib/games/poker/types'
import { makeDeck, makeSecureShuffleAdapter, deal } from '@/lib/games/poker/deck'
import { nextButton, type RingSeat } from '@/lib/games/poker/order'
import { minRaiseTo, type AppliedAction } from '@/lib/games/poker/betting'
import {
  initHand,
  applyPlayerAction,
  nextStep,
  enterStreet,
  markComplete,
  legalActionModel,
  serializeHand,
  deserializeHand,
  handContributions,
  livePots,
  type HandState,
  type SerializedHand,
} from '@/lib/games/poker/hand'
import { settleShowdown } from '@/lib/games/poker/showdown'
import { totalContributed } from '@/lib/games/poker/pot'
import { assertSnapshotPrivacy, type PokerSnapshot, type PokerLegalView } from '@/lib/games/poker/realtime'
import { emitSev1 } from '@/lib/games/poker/incidentNotifier'
import { checkPokerCapability } from './access'
import { ensurePokerWallet } from './wallet-server'
import { hashTablePassword, verifyTablePassword, privateTableAccessAllowed } from '@/lib/games/poker/tableAccess'
import {
  getActiveEconomyConfig,
  checkBlindTier,
  evaluateRejoinGuard,
  recordSeatEvent,
} from './economy-server'
import { defaultOpsSeverity, type OpsEventKind } from '@/lib/games/poker/admin'
import { redactTelemetryDetail, TELEMETRY_SCHEMA_VERSION } from '@/lib/games/poker/telemetry'
import { PERF_EVENT_NAME, type PerfOp } from '@/lib/games/poker/perf'
import { recordHandProgress } from './progress-record'

// Stable result shape: never throw raw to the client; return a coded error UI can translate.
export type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string }

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error }
}

// Private-table password hashing + verification live in the pure lib/games/poker/tableAccess
// module (scrypt, salted, constant-time) so the same authoritative logic is unit-tested.

// ── createTable — host config → poker_tables (service role; never a client write) ──────
export interface CreateTableInput {
  name: string
  smallBlind: number
  bigBlind: number
  capacity?: number // 2..6
  isPrivate?: boolean
  password?: string // required iff isPrivate
  minBuyInBb?: number
  maxBuyInBb?: number
  allowSpectators?: boolean
}

export async function createTable(input: CreateTableInput): Promise<ActionResult<{ tableId: string }>> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('not_authenticated')

  // Feature-flag gate (server-authoritative): hosting requires the create capability,
  // and a private table additionally requires the private-table capability.
  const capErr = await checkPokerCapability('create')
  if (capErr) return fail(capErr)
  if (input.isPrivate) {
    const privErr = await checkPokerCapability('private_table')
    if (privErr) return fail(privErr)
  }

  // All host settings re-validated server-side via the pure lifecycle validator (single source
  // of truth shared with the unit tests + the DB CHECKs). The browser is never trusted.
  const validated = validateTableConfig(input)
  if (!validated.ok) return fail(validated.error)
  const c = validated.config

  // Economy authority: the (SB,BB) must be a SANCTIONED blind tier of the active config, and the
  // buy-in bb window is DERIVED from that tier (never the client's numbers). This keeps the
  // lobby on the ladder and makes buy-in limits authoritatively tier-driven. Server-only.
  const econ = await getActiveEconomyConfig()
  const tierCheck = checkBlindTier(econ, c.smallBlind, c.bigBlind)
  if (!tierCheck.ok) return fail(tierCheck.error)
  const minBuyInBb = tierCheck.minBuyInBb
  const maxBuyInBb = tierCheck.maxBuyInBb

  const admin = createAdminClient()
  const { data: table, error } = await admin
    .from('poker_tables')
    .insert({
      name: c.name,
      created_by: user.id,
      small_blind: c.smallBlind,
      big_blind: c.bigBlind,
      min_buy_in_bb: minBuyInBb,
      max_buy_in_bb: maxBuyInBb,
      capacity: c.capacity,
      is_private: c.isPrivate,
      allow_spectators: c.allowSpectators,
      action_time_seconds: c.actionTimeSeconds,
      time_bank_seconds: c.timeBankSeconds,
    })
    .select('id')
    .single()
  if (error || !table) return fail('create_failed')

  // Seat rows 0..capacity-1 (empty), then the secret hash (private only).
  const seats = Array.from({ length: c.capacity }, (_, i) => ({ table_id: table.id, seat_index: i }))
  const { error: seatErr } = await admin.from('poker_seats').insert(seats)
  if (seatErr) {
    await admin.from('poker_tables').delete().eq('id', table.id) // best-effort cleanup
    return fail('create_failed')
  }
  if (c.isPrivate && c.password) {
    await admin.from('poker_table_secrets').insert({
      table_id: table.id,
      password_hash: hashTablePassword(c.password),
    })
  }
  // The host implicitly knows the password (they set it) — record membership so their own direct
  // navigation to the table is authorized without re-entering it (also feeds the members list).
  await admin
    .from('poker_table_members')
    .upsert({ table_id: table.id, user_id: user.id, role: 'player', last_seen_at: new Date().toISOString() })
  return { ok: true, tableId: table.id }
}

// ── Lobby — authoritative, spectator-safe listing (NEVER exposes a password/secret) ─────
function epochMs(ts: string | null | undefined): number {
  return ts ? new Date(ts).getTime() : 0
}

export async function listLobby(): Promise<ActionResult<{ tables: LobbyTable[] }>> {
  const tLobby0 = Date.now()
  const supabase = createClient() // RLS: poker_tables/poker_seats are SELECT(true), public-safe
  const { data: tables, error } = await supabase
    .from('poker_tables')
    .select('id, name, is_private, small_blind, big_blind, min_buy_in_bb, max_buy_in_bb, capacity, status, allow_spectators, created_at, updated_at')
    .neq('status', 'closed')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) return fail('lobby_failed')
  const ids = (tables ?? []).map((t) => t.id)
  if (ids.length === 0) { await recordPerf(supabase, 'lobby', Date.now() - tLobby0, null); return { ok: true, tables: [] } }

  const { data: seatRows } = await supabase
    .from('poker_seats')
    .select('table_id, user_id, updated_at')
    .in('table_id', ids)

  const occupied = new Map<string, number>()
  const lastSeat = new Map<string, number>()
  for (const s of seatRows ?? []) {
    if (s.user_id) occupied.set(s.table_id, (occupied.get(s.table_id) ?? 0) + 1)
    const ms = epochMs(s.updated_at)
    if (ms > (lastSeat.get(s.table_id) ?? 0)) lastSeat.set(s.table_id, ms)
  }

  const projected = (tables ?? []).map((t) => {
    const raw: LobbyTableRaw = {
      id: t.id,
      name: t.name,
      isPrivate: !!t.is_private,
      smallBlind: t.small_blind,
      bigBlind: t.big_blind,
      minBuyInBb: t.min_buy_in_bb,
      maxBuyInBb: t.max_buy_in_bb,
      capacity: t.capacity,
      occupiedSeats: occupied.get(t.id) ?? 0,
      status: t.status as LobbyTableRaw['status'],
      allowSpectators: !!t.allow_spectators,
      createdAt: epochMs(t.created_at),
      lastActivityAt: Math.max(epochMs(t.updated_at), lastSeat.get(t.id) ?? 0),
    }
    return projectLobbyTable(raw)
  })
  await recordPerf(supabase, 'lobby', Date.now() - tLobby0, null)
  return { ok: true, tables: projected }
}

export async function fetchLobbyTable(tableId: string): Promise<ActionResult<{ table: LobbyTable }>> {
  const supabase = createClient()
  const { data: t } = await supabase
    .from('poker_tables')
    .select('id, name, is_private, small_blind, big_blind, min_buy_in_bb, max_buy_in_bb, capacity, status, allow_spectators, created_at, updated_at')
    .eq('id', tableId)
    .single()
  if (!t) return fail('table_not_found')
  const { data: seatRows } = await supabase
    .from('poker_seats')
    .select('user_id, updated_at')
    .eq('table_id', tableId)
  let occupiedSeats = 0
  let lastSeat = 0
  for (const s of seatRows ?? []) {
    if (s.user_id) occupiedSeats++
    lastSeat = Math.max(lastSeat, epochMs(s.updated_at))
  }
  const raw: LobbyTableRaw = {
    id: t.id,
    name: t.name,
    isPrivate: !!t.is_private,
    smallBlind: t.small_blind,
    bigBlind: t.big_blind,
    minBuyInBb: t.min_buy_in_bb,
    maxBuyInBb: t.max_buy_in_bb,
    capacity: t.capacity,
    occupiedSeats,
    status: t.status as LobbyTableRaw['status'],
    allowSpectators: !!t.allow_spectators,
    createdAt: epochMs(t.created_at),
    lastActivityAt: Math.max(epochMs(t.updated_at), lastSeat),
  }
  return { ok: true, table: projectLobbyTable(raw) }
}

// ── joinTable — verify private password (service role), record membership ──────────────
export async function joinTable(
  tableId: string,
  password?: string,
): Promise<ActionResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('not_authenticated')

  // Feature-flag / wind-down freeze gate (server-authoritative): joining a table
  // requires the join capability, which the blockNewJoins freeze closes.
  const joinCapErr = await checkPokerCapability('join')
  if (joinCapErr) return fail(joinCapErr)

  const admin = createAdminClient()
  const { data: table } = await admin
    .from('poker_tables')
    .select('id, is_private, status')
    .eq('id', tableId)
    .single()
  if (!table) return fail('table_not_found')
  if (table.status !== 'open') return fail('table_not_open')

  // Admin restriction gate (server-enforced; full_ban also blocks join).
  if (await isRestricted(user.id, 'no_join')) return fail('restricted')

  if (table.is_private) {
    const { data: secret } = await admin
      .from('poker_table_secrets')
      .select('password_hash')
      .eq('table_id', tableId)
      .single()
    if (!secret || !verifyTablePassword((password ?? '').trim(), secret.password_hash)) {
      return fail('wrong_password')
    }
  }
  await admin
    .from('poker_table_members')
    .upsert({ table_id: tableId, user_id: user.id, role: 'player', last_seen_at: new Date().toISOString() })
  return { ok: true }
}

// ── Private-table access gate — the SINGLE authoritative check every seat path shares ──────────
// A seat at a PRIVATE table is allowed only if the caller passed its password (recorded as a
// membership row by joinTable), created it (host), or already holds a seat (reconnect). A public
// table is always allowed. This closes the direct-URL bypass: sitDown / reserveSeat consult this
// BEFORE any seat reservation or coin movement, so a browser that navigates straight to the table
// URL cannot seat itself without the password. The stored secret is NEVER read here (only the
// existence of proof), so no password-equivalent value is exposed.
async function privateSeatAllowed(admin: AdminClient, tableId: string, userId: string): Promise<boolean> {
  const { data: table } = await admin
    .from('poker_tables')
    .select('is_private, created_by')
    .eq('id', tableId)
    .maybeSingle()
  if (!table) return false
  const isCreator = table.created_by === userId
  let isSeated = false
  let isMember = false
  if (table.is_private && !isCreator) {
    const [{ data: seat }, { data: member }] = await Promise.all([
      admin.from('poker_seats').select('seat_index').eq('table_id', tableId).eq('user_id', userId).limit(1).maybeSingle(),
      admin.from('poker_table_members').select('user_id').eq('table_id', tableId).eq('user_id', userId).maybeSingle(),
    ])
    isSeated = !!seat
    isMember = !!member
  }
  return privateTableAccessAllowed({ isPrivate: !!table.is_private, isCreator, isSeated, isMember })
}

// Server action for the table route: does this viewer need to enter the password before the table
// is shown? Returns authorized=true for public tables and for private tables the viewer may enter.
// NEVER returns the password or any secret — only the boolean decision.
export async function fetchTableAccess(tableId: string): Promise<{ isPrivate: boolean; authorized: boolean }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const admin = createAdminClient()
  const { data: table } = await admin
    .from('poker_tables')
    .select('is_private')
    .eq('id', tableId)
    .maybeSingle()
  const isPrivate = !!table?.is_private
  if (!isPrivate) return { isPrivate: false, authorized: true }
  if (!user) return { isPrivate: true, authorized: false }
  return { isPrivate: true, authorized: await privateSeatAllowed(admin, tableId, user.id) }
}

// ── Escrow commands — call the auth.uid()-scoped SECURITY DEFINER RPCs via the COOKIE ──
// client so RLS/auth.uid() applies (NEVER the admin client — its auth.uid() is null).
async function callPlayerRpc(fn: string, args: Record<string, unknown>): Promise<ActionResult<{ data: unknown }>> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('not_authenticated')
  const { data, error } = await supabase.rpc(fn, args)
  if (error) return fail(error.message || 'rpc_failed')
  return { ok: true, data }
}

// Admin restriction check (best-effort; degrade-safe if the admin-ops layer is not yet applied).
async function isRestricted(userId: string, kind: 'no_join' | 'no_sit'): Promise<boolean> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.rpc('poker_is_restricted', { p_user_id: userId, p_kind: kind })
    if (error) return false
    return data === true
  } catch { return false }
}

export async function reserveSeat(tableId: string, seatIndex: number) {
  const joinCapErr = await checkPokerCapability('join')
  if (joinCapErr) return fail(joinCapErr)
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('not_authenticated')
  if (await isRestricted(user.id, 'no_sit')) return fail('restricted')
  // Private-table password gate: a non-member cannot reserve a seat by navigating straight to the
  // table URL. Denied BEFORE the RPC → no reservation is created.
  const admin = createAdminClient()
  if (!(await privateSeatAllowed(admin, tableId, user.id))) return fail('password_required')
  return callPlayerRpc('poker_reserve_seat', { p_table_id: tableId, p_seat_index: seatIndex })
}
export async function sitDown(tableId: string, seatIndex: number, buyIn: number) {
  if (!Number.isInteger(buyIn) || buyIn <= 0) return fail('invalid_buy_in')
  // A wind-down freeze (blockNewJoins) preserves running tables but refuses new
  // seatings so an Alpha can be closed without stranding coins mid-hand.
  const joinCapErr = await checkPokerCapability('join')
  if (joinCapErr) return fail(joinCapErr)
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('not_authenticated')
  if (await isRestricted(user.id, 'no_sit')) return fail('restricted')
  // Bootstrap the shared wallet (idempotent signup faucet) so a poker-first player is funded before
  // buy-in — otherwise poker_sit_down would raise `no_wallet`. Same shared faucet as TLMN's entry,
  // so coin conservation is unchanged.
  await ensurePokerWallet()

  // Private-table password gate: a direct-URL visitor who never passed the password (no
  // membership), is not the host, and is not already seated cannot take a seat. Denied BEFORE the
  // wallet is touched → no seat reservation and no coin debit for a denied attempt.
  const admin = createAdminClient()
  if (!(await privateSeatAllowed(admin, tableId, user.id))) return fail('password_required')

  // Rathole / rejoin guard (server-authoritative, config-driven, degrade-safe). The client
  // cannot bypass it. The authoritative buy-in bounds are still enforced by the RPC below.
  const { data: t } = await admin
    .from('poker_tables')
    .select('big_blind, min_buy_in_bb, max_buy_in_bb')
    .eq('id', tableId)
    .single()
  if (t) {
    const econ = await getActiveEconomyConfig()
    const guard = await evaluateRejoinGuard(
      admin, tableId, user.id, t.big_blind, t.min_buy_in_bb, t.max_buy_in_bb,
      buyIn, Number.MAX_SAFE_INTEGER, econ,
    )
    if (!guard.ok) return fail(guard.reason)
  }

  const res = await callPlayerRpc('poker_sit_down', { p_table_id: tableId, p_seat_index: seatIndex, p_buy_in: buyIn })
  if (res.ok) await recordSeatEvent(admin, tableId, user.id, seatIndex, 'join')
  return res
}
export async function topUp(tableId: string, seatIndex: number, amount: number, idempotencyKey?: string) {
  if (!Number.isInteger(amount) || amount <= 0) return fail('invalid_amount')
  // A client token dedupes a retried top-up so a double-submit never debits the wallet twice.
  const idem = (idempotencyKey ?? '').trim() || randomUUID()
  return callPlayerRpc('poker_top_up', {
    p_table_id: tableId, p_seat_index: seatIndex, p_amount: amount, p_idem: idem,
  })
}
export async function rebuy(tableId: string, seatIndex: number, amount: number) {
  if (!Number.isInteger(amount) || amount <= 0) return fail('invalid_amount')
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('not_authenticated')

  // Rathole / rejoin guard also covers rebuy (a busted departure is exempt by design, so this
  // is a no-op unless a prior deep stand-up was logged). Server-authoritative, degrade-safe.
  const admin = createAdminClient()
  const { data: t } = await admin
    .from('poker_tables')
    .select('big_blind, min_buy_in_bb, max_buy_in_bb')
    .eq('id', tableId)
    .single()
  if (t) {
    const econ = await getActiveEconomyConfig()
    const guard = await evaluateRejoinGuard(
      admin, tableId, user.id, t.big_blind, t.min_buy_in_bb, t.max_buy_in_bb,
      amount, Number.MAX_SAFE_INTEGER, econ,
    )
    if (!guard.ok) return fail(guard.reason)
  }
  return callPlayerRpc('poker_rebuy', { p_table_id: tableId, p_seat_index: seatIndex, p_amount: amount })
}
export async function standUp(tableId: string, seatIndex: number) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const res = await callPlayerRpc('poker_stand_up', { p_table_id: tableId, p_seat_index: seatIndex })
  // Log the departure with the retained stack (poker_stand_up returns `moved` = stack cashed
  // out now; a mid-hand queued leave returns 0 and is captured at settlement). Best-effort.
  if (res.ok && user) {
    const moved = Number((res.data as { moved?: number })?.moved ?? 0)
    const admin = createAdminClient()
    await recordSeatEvent(admin, tableId, user.id, seatIndex, 'stand_up', moved)
  }
  return res
}
// Leave / cash-out — outside a hand returns the stack now; during a hand sets LEAVING and the
// stand-up runs at settlement (LEAVE-001). Idempotent: a duplicate call credits the wallet once.
export async function leaveTable(tableId: string, seatIndex: number) {
  return standUp(tableId, seatIndex)
}

// ── Seat lifecycle commands ────────────────────────────────────────────────────────────
export async function sitOut(tableId: string, seatIndex: number) {
  return callPlayerRpc('poker_sit_out', { p_table_id: tableId, p_seat_index: seatIndex })
}
export async function returnFromSitOut(tableId: string, seatIndex: number) {
  return callPlayerRpc('poker_return_from_sit_out', { p_table_id: tableId, p_seat_index: seatIndex })
}
export async function setPostBbPolicy(tableId: string, seatIndex: number, policy: PostBbPolicy) {
  if (policy !== 'post' && policy !== 'wait') return fail('invalid_policy')
  return callPlayerRpc('poker_set_post_bb_policy', {
    p_table_id: tableId, p_seat_index: seatIndex, p_policy: policy,
  })
}
// "Post Big Blind Now" vs "Wait for the natural big blind" (JOIN-POSTBB-001 / JOIN-BB-001).
export async function postBigBlindNow(tableId: string, seatIndex: number) {
  return setPostBbPolicy(tableId, seatIndex, 'post')
}
export async function waitForBigBlind(tableId: string, seatIndex: number) {
  return setPostBbPolicy(tableId, seatIndex, 'wait')
}
// Presence heartbeat / disconnect-reconnect. Never releases the seat or returns the stack.
export async function setSeatConnection(tableId: string, seatIndex: number, connected: boolean) {
  const res = await callPlayerRpc('poker_set_seat_connection', {
    p_table_id: tableId, p_seat_index: seatIndex, p_connected: connected,
  })
  // Log a disconnect so a reconnect within the documented grace is exempt from the rathole
  // rule (reconnect ≠ voluntary stand-up). Best-effort; never affects the seat/stack.
  if (res.ok && !connected) {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const admin = createAdminClient()
        const { data: s } = await admin
          .from('poker_seats').select('stack, pending_topup')
          .eq('table_id', tableId).eq('seat_index', seatIndex).maybeSingle()
        const stack = Number(s?.stack ?? 0) + Number(s?.pending_topup ?? 0)
        await recordSeatEvent(admin, tableId, user.id, seatIndex, 'disconnect', stack)
      }
    } catch { /* best-effort */ }
  }
  return res
}
export async function cleanExpiredReservations(tableId: string) {
  return callPlayerRpc('poker_clean_expired_reservations', { p_table_id: tableId })
}
// Close a table (host only — enforced server-side via created_by == auth.uid()).
export async function closeTable(tableId: string) {
  return callPlayerRpc('poker_close_table', { p_table_id: tableId })
}

// ── Trusted reaper helpers — service role ONLY (cron / abandonment sweep, not client-bound) ──
export async function resolveClosingTrusted(tableId: string): Promise<ActionResult<{ data: unknown }>> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('poker_resolve_closing', { p_table_id: tableId })
  if (error) return fail(error.message || 'resolve_failed')
  return { ok: true, data }
}
export async function reapIdleTableTrusted(tableId: string, idleSeconds = 600): Promise<ActionResult<{ data: unknown }>> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('poker_reap_idle_table', { p_table_id: tableId, p_idle_seconds: idleSeconds })
  if (error) return fail(error.message || 'reap_failed')
  return { ok: true, data }
}

// ── fetchTableState — PUBLIC projection ONLY (no hole cards, no deck) ───────────────────
export async function fetchTableState(tableId: string): Promise<ActionResult<{ state: PublicTableState }>> {
  const supabase = createClient() // RLS-guarded; public rows only
  const { data: table } = await supabase
    .from('poker_tables')
    .select('id, current_hand_id, state_version')
    .eq('id', tableId)
    .single()
  if (!table) return fail('table_not_found')

  const { data: seatRows } = await supabase
    .from('poker_seats')
    .select('seat_index, user_id, display_name, avatar_url, status, stack, committed_this_street, last_action, all_in, disconnected_at')
    .eq('table_id', tableId)
    .order('seat_index')

  const { data: hand } = await supabase
    .from('poker_hands')
    .select('id, hand_no, phase, street, board, pots, button_seat, turn_seat, turn_started_at, turn_deadline, state_version, reveal')
    .eq('table_id', tableId)
    .order('hand_no', { ascending: false })
    .limit(1)
    .maybeSingle()

  const seats: PublicSeat[] = (seatRows ?? []).map((s) => ({
    seatIndex: s.seat_index,
    userId: s.user_id,
    displayName: s.display_name,
    avatarUrl: s.avatar_url,
    stack: s.stack,
    committedThisStreet: s.committed_this_street ?? 0,
    lastAction: s.last_action,
    allIn: !!s.all_in,
    status: (s.status ?? 'empty') as PublicSeat['status'],
    connected: s.disconnected_at == null,
  }))

  const toMs = (ts: string | null) => (ts ? new Date(ts).getTime() : null)
  const state: PublicTableState = {
    tableId: table.id,
    handId: hand?.id ?? null,
    handNo: hand?.hand_no ?? 0,
    stateVersion: hand?.state_version ?? table.state_version ?? 0,
    phase: hand?.phase ?? 'COMPLETED',
    street: hand?.street ?? null,
    board: ((hand?.board as PublicTableState['board']) ?? []),
    pots: (hand?.pots as PublicTableState['pots']) ?? { main: { amount: 0, eligibleSeatIndexes: [] }, sides: [] },
    seats,
    buttonSeat: hand?.button_seat ?? null,
    turnSeat: hand?.turn_seat ?? null,
    turnDeadline: toMs(hand?.turn_deadline ?? null),
    turnStartedAt: toMs(hand?.turn_started_at ?? null),
    reveal: (hand?.reveal as PublicTableState['reveal']) ?? undefined,
  }
  return { ok: true, state }
}

// ── fetchMyHoleCards — caller's OWN cards only, via RLS read-own (never others') ───────
export async function fetchMyHoleCards(
  tableId: string,
): Promise<ActionResult<{ hole: MyHoleCardsState | null }>> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('not_authenticated')

  const { data: hand } = await supabase
    .from('poker_hands')
    .select('id')
    .eq('table_id', tableId)
    .order('hand_no', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!hand) return { ok: true, hole: null }

  // RLS scopes this to user_id = auth.uid(); a wrong/absent row simply returns nothing.
  const { data: row } = await supabase
    .from('poker_hole_cards')
    .select('hand_id, seat_index, cards')
    .eq('hand_id', hand.id)
    .maybeSingle()
  if (!row) return { ok: true, hole: null }
  return {
    ok: true,
    hole: { handId: row.hand_id, seatIndex: row.seat_index, cards: row.cards as HoleCards },
  }
}

// ── Trusted settlement helpers — service role ONLY (called by the engine/reaper, P3) ──
// Exposed as server-internal functions; NOT bound to any client form. The browser cannot call
// poker_settle_hand / poker_refund_hand (REVOKEd from authenticated; admin client = service role).
export async function settleHandTrusted(
  handId: string,
  payouts: { seatIndex: number; amount: number }[],
  refunds: { seatIndex: number; amount: number }[] = [],
  totalContributed?: number,
): Promise<ActionResult<{ data: unknown }>> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('poker_settle_hand', {
    p_hand_id: handId,
    p_payouts: payouts,
    p_refunds: refunds,
    p_total_contributed: totalContributed ?? null,
  })
  if (error) return fail(error.message || 'settle_failed')
  return { ok: true, data }
}
export async function refundHandTrusted(handId: string): Promise<ActionResult<{ data: unknown }>> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('poker_refund_hand', { p_hand_id: handId })
  if (error) return fail(error.message || 'refund_failed')
  return { ok: true, data }
}

// ════════════════════════════════════════════════════════════════════════════════════
// ── Engine-driven authoritative gameplay (Phase P3) ───────────────────────────────────
// The browser sends ONLY minimal intent (fold/check/call/bet/raise/all_in + amount). The
// server resolves identity, validates seat/turn/legality/deadline/state, runs the PURE engine
// (lib/games/poker), and commits each transition through the atomic compare-and-swap RPCs
// (poker_start_hand / poker_commit_action). Cards are dealt with a CSPRNG into the server-only
// deck; private hole cards reach a client only via the RLS read-own path. A duplicate or stale
// command never double-applies (CAS + idempotency key); a refresh never reshuffles/redeals
// (engine_state is the resume source of truth).
// ════════════════════════════════════════════════════════════════════════════════════

type AdminClient = ReturnType<typeof createAdminClient>

// CSPRNG-backed random source (DECK-SHUFFLE-001) — never Math.random, never in the browser.
function secureRandomSource(): () => number {
  return () => randomInt(0, 0x100000000) / 0x100000000 // uniform float in [0, 1)
}

// A freshly shuffled 52-card deck from crypto-grade randomness.
function secureShuffledDeck(): Card[] {
  const adapter = makeSecureShuffleAdapter(secureRandomSource())
  return adapter(makeDeck())
}

// Community-card indices in the shuffled stub for a hand dealt to `n` seats (DECK-DEAL-001:
// 2n hole cards, burn, flop(3), burn, turn, burn, river).
function boardFromStub(stub: readonly Card[], n: number): { flop: Card[]; turn: Card; river: Card } {
  const base = 2 * n
  return {
    flop: [stub[base + 1], stub[base + 2], stub[base + 3]],
    turn: stub[base + 5],
    river: stub[base + 7],
  }
}

// Reveal the cards a street brings, sliced from the full board.
function streetCards(full: { flop: Card[]; turn: Card; river: Card }, street: 'FLOP' | 'TURN' | 'RIVER'): Card[] {
  if (street === 'FLOP') return full.flop
  if (street === 'TURN') return [full.turn]
  return [full.river]
}

function potsForPublic(main: { amount: number; eligibleSeatIndexes: readonly number[] }, sides: readonly { amount: number; eligibleSeatIndexes: readonly number[] }[]): Pots {
  return {
    main: { amount: main.amount, eligibleSeatIndexes: [...main.eligibleSeatIndexes] },
    sides: sides.map((s) => ({ amount: s.amount, eligibleSeatIndexes: [...s.eligibleSeatIndexes] })),
  }
}

// ── Load the live hand + its deserialized engine state (the resume snapshot) ────────────
interface LiveHand {
  tableId: string
  bigBlind: number
  actionTimeSeconds: number
  hand: { id: string; phase: string; action_seq: number; turn_seat: number | null; turn_deadline: string | null }
  state: HandState
}
async function loadLiveHand(admin: AdminClient, tableId: string): Promise<{ ok: true; live: LiveHand } | { ok: false; error: string }> {
  const { data: table } = await admin
    .from('poker_tables')
    .select('id, big_blind, action_time_seconds, current_hand_id')
    .eq('id', tableId)
    .single()
  if (!table) return { ok: false, error: 'table_not_found' }
  if (!table.current_hand_id) return { ok: false, error: 'no_live_hand' }

  const { data: hand } = await admin
    .from('poker_hands')
    .select('id, phase, action_seq, turn_seat, turn_deadline')
    .eq('id', table.current_hand_id)
    .single()
  if (!hand) return { ok: false, error: 'no_live_hand' }

  const { data: snap } = await admin
    .from('poker_hand_state')
    .select('engine_state')
    .eq('hand_id', hand.id)
    .maybeSingle()
  if (!snap?.engine_state) return { ok: false, error: 'no_live_hand' }

  const state = deserializeHand(snap.engine_state as SerializedHand)
  return {
    ok: true,
    live: {
      tableId,
      bigBlind: table.big_blind,
      actionTimeSeconds: table.action_time_seconds ?? 20,
      hand: { id: hand.id, phase: hand.phase, action_seq: hand.action_seq, turn_seat: hand.turn_seat, turn_deadline: hand.turn_deadline },
      state,
    },
  }
}

async function userSeatIndex(admin: AdminClient, tableId: string, userId: string): Promise<number | null> {
  const { data } = await admin
    .from('poker_seats')
    .select('seat_index')
    .eq('table_id', tableId)
    .eq('user_id', userId)
    .maybeSingle()
  return data?.seat_index ?? null
}

function deadlineIso(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString()
}

// ── startHand — deal a fresh hand and persist it atomically ─────────────────────────────
export async function startHand(tableId: string): Promise<ActionResult<{ handId: string }>> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('not_authenticated')

  const admin = createAdminClient()
  const { data: table } = await admin
    .from('poker_tables')
    .select('id, status, big_blind, small_blind, action_time_seconds, current_hand_id')
    .eq('id', tableId)
    .single()
  if (!table) return fail('table_not_found')
  if (table.status !== 'open') return fail('table_not_open')

  // Idempotent: a hand is already live → return it (a refresh never starts a second hand).
  if (table.current_hand_id) {
    const { data: cur } = await admin.from('poker_hands').select('id, phase').eq('id', table.current_hand_id).maybeSingle()
    if (cur && ['STARTING', 'BETTING', 'SHOWDOWN', 'SETTLEMENT'].includes(cur.phase)) {
      return { ok: true, handId: cur.id }
    }
  }

  const { data: seatRows } = await admin
    .from('poker_seats')
    .select('seat_index, user_id, status, stack, pending_topup')
    .eq('table_id', tableId)
    .order('seat_index')

  // Eligible = seated, sitting_in, with chips to play (stack + activated top-up > 0).
  const eligible = (seatRows ?? []).filter(
    (s) => s.user_id && s.status === 'sitting_in' && s.stack + (s.pending_topup ?? 0) > 0,
  )
  if (eligible.length < 2) return fail('not_enough_players')

  // Advance the button from the previous hand (BUTTON-MOVE-001) and number this hand.
  const { data: last } = await admin
    .from('poker_hands')
    .select('button_seat, hand_no')
    .eq('table_id', tableId)
    .order('hand_no', { ascending: false })
    .limit(1)
    .maybeSingle()
  const handNo = (last?.hand_no ?? 0) + 1
  const ring: RingSeat[] = eligible.map((s) => ({ seatIndex: s.seat_index, eligible: true }))
  const buttonSeat = nextButton(ring, last?.button_seat ?? null)

  // Effective starting stacks ACTIVATE pending top-ups (folded into the live stack this hand).
  const startSeats = eligible.map((s) => ({ seatIndex: s.seat_index, stack: s.stack + (s.pending_topup ?? 0) }))
  const userBySeat = new Map(eligible.map((s) => [s.seat_index, s.user_id as string]))

  const { state, blinds } = initHand({
    handNo,
    bigBlind: table.big_blind,
    smallBlind: table.small_blind,
    buttonSeat,
    seats: startSeats,
  })

  // Secure shuffle + deal (server-only deck). Hole cards mapped to ascending dealt seats.
  const stub = secureShuffledDeck()
  const dealt = deal(stub, eligible.length)
  const orderedSeats = startSeats.map((s) => s.seatIndex).sort((a, b) => a - b)
  const hole = orderedSeats.map((seatIndex, i) => ({
    seat_index: seatIndex,
    user_id: userBySeat.get(seatIndex)!,
    cards: dealt.holeBySeat[i],
  }))

  const seatPatch = state.round.players.map((p) => ({
    seat_index: p.seatIndex,
    user_id: userBySeat.get(p.seatIndex)!,
    stack: p.stack,
    committed_this_street: p.committedThisStreet,
    committed_total: p.committedTotal,
    all_in: p.status === 'allin',
  }))
  const blindAudit = blinds.map((b) => ({
    seat_index: b.seatIndex,
    user_id: userBySeat.get(b.seatIndex)!,
    type: b.type,
    amount: b.amount,
  }))

  const seed = randomInt(1, 0x7fffffff)
  const { data, error } = await admin.rpc('poker_start_hand', {
    p_table_id: tableId,
    p_hand_no: handNo,
    p_button_seat: buttonSeat,
    p_turn_seat: state.turnSeat,
    p_turn_deadline: state.turnSeat !== null ? deadlineIso(table.action_time_seconds ?? 20) : null,
    p_current_bet: state.round.currentBet,
    p_min_raise: minRaiseTo(state.round),
    p_last_full_raise: state.round.lastFullRaiseSize,
    p_pots: livePots(state),
    p_engine_state: serializeHand(state),
    p_seats: seatPatch,
    p_hole: hole,
    p_deck: { stub, seed, deal_index: eligible.length * 2 + 8, burns: [] },
    p_blinds: blindAudit,
  })
  if (error) return fail(error.message || 'start_failed')
  const handId = (data as { hand_id?: string })?.hand_id
  if (!handId) return fail('start_failed')

  // Degenerate start (everyone all-in from blinds) → run it straight to settlement.
  if (state.turnSeat === null) {
    await progressHand(admin, tableId, handId, state, table.action_time_seconds ?? 20)
  }
  return { ok: true, handId }
}

// ── Map minimal client intent → a validated engine action ───────────────────────────────
function toAppliedAction(action: PokerActionType, amount?: number): { ok: true; applied: AppliedAction } | { ok: false; error: string } {
  switch (action) {
    case 'fold': return { ok: true, applied: { type: 'fold' } }
    case 'check': return { ok: true, applied: { type: 'check' } }
    case 'call': return { ok: true, applied: { type: 'call' } }
    case 'all_in': return { ok: true, applied: { type: 'all_in' } }
    case 'bet':
      if (!Number.isInteger(amount)) return { ok: false, error: 'invalid_amount' }
      return { ok: true, applied: { type: 'bet', to: amount as number } }
    case 'raise':
      if (!Number.isInteger(amount)) return { ok: false, error: 'invalid_amount' }
      return { ok: true, applied: { type: 'raise', to: amount as number } }
    default:
      return { ok: false, error: 'invalid_action' }
  }
}

// ── pokerAct — accept ONE minimal intent, validate, apply, commit, then progress ────────
export async function pokerAct(
  tableId: string,
  action: PokerActionType,
  amount?: number,
  idempotencyKey?: string,
  expectedSeq?: number,
): Promise<ActionResult<{ phase: string; actionSeq: number }>> {
  const t0 = Date.now()
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('not_authenticated')

  const admin = createAdminClient()
  const loaded = await loadLiveHand(admin, tableId)
  if (!loaded.ok) return fail(loaded.error)
  const { live } = loaded
  if (live.hand.phase !== 'BETTING') return fail('not_betting')

  const seat = await userSeatIndex(admin, tableId, user.id)
  if (seat === null) return fail('not_seated')
  if (live.state.turnSeat !== seat) return fail('not_your_turn')
  if (expectedSeq !== undefined && expectedSeq !== live.state.actionSeq) return fail('stale_state')

  const mapped = toAppliedAction(action, amount)
  if (!mapped.ok) return fail(mapped.error)

  // Legality + amount bounds are decided by the PURE engine (server authority, not the client).
  const res = applyPlayerAction(live.state, seat, mapped.applied)
  if (!res.ok) return fail(res.error)
  const newState = res.state

  const idem = (idempotencyKey ?? '').trim() || `${live.hand.id}:${seat}:${live.state.actionSeq}`
  const committed = await commitPlayerAction(admin, live, seat, user.id, action, amount, newState, idem)
  if (!committed.ok) return committed

  const progressed = await progressHand(admin, tableId, live.hand.id, newState, live.actionTimeSeconds)
  await recordPerf(admin, 'action', Date.now() - t0, tableId)
  return { ok: true, phase: progressed.phase, actionSeq: newState.actionSeq }
}

// Build + commit a single player action via the atomic CAS RPC.
async function commitPlayerAction(
  admin: AdminClient,
  live: LiveHand,
  seat: number,
  userId: string,
  action: PokerActionType,
  amount: number | undefined,
  newState: HandState,
  idem: string,
  auditType?: 'timeout_fold' | 'timeout_check',
): Promise<ActionResult> {
  const actor = newState.round.players.find((p) => p.seatIndex === seat)!
  const auditAmount = action === 'bet' || action === 'raise' ? amount ?? null
    : action === 'all_in' ? actor.committedThisStreet
    : null
  const handPatch = {
    phase: 'BETTING',
    street: newState.street,
    pots: livePots(newState),
    turn_seat: newState.turnSeat,
    turn_deadline: newState.turnSeat !== null ? deadlineIso(live.actionTimeSeconds) : null,
    turn_started_at: newState.turnSeat !== null ? new Date().toISOString() : null,
    current_bet: newState.round.currentBet,
    min_raise: minRaiseTo(newState.round),
    last_full_raise: newState.round.lastFullRaiseSize,
    action_seq: newState.actionSeq,
    engine_state: serializeHand(newState),
  }
  const seatPatch = [{
    seat_index: seat,
    stack: actor.stack,
    committed_this_street: actor.committedThisStreet,
    committed_total: actor.committedTotal,
    all_in: actor.status === 'allin',
    last_action: action,
  }]
  const audit = {
    seat_index: seat,
    user_id: userId,
    street: live.state.street,
    type: auditType ?? action,
    amount: auditAmount,
  }
  const { data, error } = await admin.rpc('poker_commit_action', {
    p_hand_id: live.hand.id,
    p_expected_seq: live.state.actionSeq,
    p_idem: idem,
    p_hand: handPatch,
    p_seats: seatPatch,
    p_audit: audit,
  })
  if (error) return fail(error.message || 'commit_failed')
  const r = data as { ok: boolean; code?: string }
  if (!r.ok) return fail(r.code || 'commit_rejected')
  return { ok: true }
}

// ── progressHand — auto street advance / runout / showdown / settlement ─────────────────
// Drives the hand forward after a player action with NO further input: reveals the next
// street(s) from the server-only deck, or settles. Each transition is its own atomic commit so
// realtime sees the board build card-by-card. Idempotent on resume: engine_state is canonical.
async function progressHand(
  admin: AdminClient,
  tableId: string,
  handId: string,
  startState: HandState,
  actionTimeSeconds = 20,
): Promise<{ phase: string }> {
  let state = startState
  let stub: Card[] | null = null
  let guard = 0

  for (;;) {
    if (++guard > 30) break
    const step = nextStep(state)

    if (step.kind === 'await_action') {
      return { phase: 'BETTING' } // persisted by the caller's commit; waiting on the next actor
    }

    if (step.kind === 'deal' || step.kind === 'runout') {
      if (!stub) stub = await loadStub(admin, handId)
      if (!stub) { await pauseHand(admin, handId, 'deck_missing'); return { phase: 'PAUSED_FOR_REVIEW' } }
      const n = state.round.players.length
      const full = boardFromStub(stub, n)
      const street = step.kind === 'runout'
        ? (state.street === 'PREFLOP' ? 'FLOP' : state.street === 'FLOP' ? 'TURN' : 'RIVER')
        : (step.street as 'FLOP' | 'TURN' | 'RIVER')
      const next = enterStreet(state, street, streetCards(full, street))
      const ok = await commitStreet(admin, handId, state.actionSeq, next, actionTimeSeconds)
      if (!ok) return { phase: 'BETTING' } // a concurrent writer already advanced; let it own it
      state = next
      continue
    }

    // showdown or one_left → settle authoritatively.
    return settleHand(admin, tableId, handId, state)
  }
  return { phase: state.complete ? 'COMPLETED' : 'BETTING' }
}

async function loadStub(admin: AdminClient, handId: string): Promise<Card[] | null> {
  const { data } = await admin.from('poker_deck').select('stub').eq('hand_id', handId).maybeSingle()
  return (data?.stub as Card[] | undefined) ?? null
}

// Commit a street-advance (board reveal). No player action, no coin movement — just the new
// public street + engine_state. action_seq is unchanged (auto transitions don't count).
async function commitStreet(
  admin: AdminClient,
  handId: string,
  expectedSeq: number,
  next: HandState,
  actionTimeSeconds: number,
): Promise<boolean> {
  const seatPatch = next.round.players.map((p) => ({
    seat_index: p.seatIndex,
    stack: p.stack,
    committed_this_street: p.committedThisStreet,
    committed_total: p.committedTotal,
    all_in: p.status === 'allin',
  }))
  const handPatch = {
    phase: 'BETTING',
    street: next.street,
    board: next.board,
    pots: livePots(next),
    turn_seat: next.turnSeat,
    turn_deadline: next.turnSeat !== null ? deadlineIso(actionTimeSeconds) : null,
    turn_started_at: next.turnSeat !== null ? new Date().toISOString() : null,
    current_bet: next.round.currentBet,
    min_raise: minRaiseTo(next.round),
    last_full_raise: next.round.lastFullRaiseSize,
    action_seq: next.actionSeq,
    engine_state: serializeHand(next),
  }
  const { data, error } = await admin.rpc('poker_commit_action', {
    p_hand_id: handId,
    p_expected_seq: expectedSeq,
    p_idem: null,
    p_hand: handPatch,
    p_seats: seatPatch,
    p_audit: null,
  })
  if (error) return false
  return !!(data as { ok: boolean }).ok
}

// ── settleHand — construct pots, evaluate, write reveal, then settle coins idempotently ──
async function settleHand(
  admin: AdminClient,
  tableId: string,
  handId: string,
  state: HandState,
): Promise<{ phase: string }> {
  // Read hole cards for the contenders (service role bypasses RLS for settlement).
  const { data: holeRows } = await admin
    .from('poker_hole_cards')
    .select('seat_index, cards')
    .eq('hand_id', handId)
  const holeBySeat = new Map<number, readonly [Card, Card]>()
  for (const r of holeRows ?? []) holeBySeat.set(r.seat_index, r.cards as [Card, Card])

  const contribs = handContributions(state)
  const contesting = contribs.filter((c) => !c.folded).map((c) => c.seatIndex)
  const board = contesting.length <= 1 ? [] : [...state.board]

  let showdown
  try {
    showdown = settleShowdown({
      contribs,
      board,
      holeBySeat,
      buttonSeat: state.buttonSeat,
      showFirstSeat: state.lastAggressor ?? undefined,
    })
  } catch {
    // Never guess a winner — freeze the hand for admin review (missing/impossible state).
    await pauseHand(admin, handId, 'showdown_inconsistent')
    return { phase: 'PAUSED_FOR_REVIEW' }
  }

  const finalState = markComplete(state)
  const mainPot = showdown.pots[0] ?? { amount: 0, eligibleSeatIndexes: [] }
  const handPatch = {
    phase: 'SETTLEMENT',
    street: 'SHOWDOWN',
    board: state.board,
    pots: potsForPublic(mainPot, showdown.pots.slice(1)),
    reveal: showdown.wentToShowdown ? showdown.reveal : [],
    turn_seat: null,
    turn_deadline: null,
    action_seq: finalState.actionSeq,
    engine_state: serializeHand(finalState),
  }
  // Pre-settlement commit: publish the result (board + reveal + final pots). No coin movement.
  await admin.rpc('poker_commit_action', {
    p_hand_id: handId,
    p_expected_seq: state.actionSeq,
    p_idem: null,
    p_hand: handPatch,
    p_seats: [],
    p_audit: null,
  })

  // Move the coins idempotently (poker_settle_hand: credit winners, finalize seats, COMPLETED).
  const payouts = showdown.payouts.map((p) => ({ seatIndex: p.seatIndex, amount: p.amount }))
  const refunds = showdown.refund ? [{ seatIndex: showdown.refund.seatIndex, amount: showdown.refund.amount }] : []
  const total = totalContributed(contribs)
  const tSettle0 = Date.now()
  const { error } = await admin.rpc('poker_settle_hand', {
    p_hand_id: handId,
    p_payouts: payouts,
    p_refunds: refunds,
    p_total_contributed: total,
  })
  await recordPerf(admin, 'settlement', Date.now() - tSettle0, tableId)
  if (error) {
    // Settlement failed AFTER publishing the result — leave it for the reaper to retry (settle
    // is idempotent). Do not pause: the outcome is fully determined and recoverable.
    const conserved = /not_conserved/.test(error.message || '')
    await recordOpsEvent(admin, conserved ? 'coin_conservation_failure' : 'settlement_failure',
      tableId, handId, { code: error.message?.slice(0, 120) ?? 'settle_failed' })
    // A conservation breach is a zero-tolerance economy SEV-1 — page an operator (best-effort).
    if (conserved) {
      await emitSev1({ code: 'PKR_SEV1_ECONOMY_NOT_CONSERVED', correlation: { tableId, handId, source: 'cash_settle' } })
    }
    return { phase: 'SETTLEMENT' }
  }

  // Record cosmetic achievement + mission progress for this hand (best-effort, moves NO coins,
  // never throws into settlement). Runs AFTER coins are settled and correct.
  await recordHandProgress(admin, tableId, handId, finalState, showdown, holeBySeat)

  // If the table is closing, resolve the closure now that no hand is live.
  await admin.rpc('poker_resolve_closing', { p_table_id: tableId }).then(() => undefined, () => undefined)
  return { phase: 'COMPLETED' }
}

async function pauseHand(admin: AdminClient, handId: string, reason: string): Promise<void> {
  await admin.rpc('poker_pause_hand', { p_hand_id: handId, p_reason: reason }).then(() => undefined, () => undefined)
  // Structured monitoring signal: a frozen hand needs operator attention (best-effort, never throws).
  await recordOpsEvent(admin, 'frozen_hand', null, handId, { reason })
}

// Best-effort structured-observability emitter. NEVER throws (a monitoring write must not break
// gameplay) and NEVER logs cards/tokens — only a coded `detail`. Persists a durable signal to
// poker_ops_events (surfaced in /admin/poker/observability) AND emits a redacted, correlation-
// tagged structured log line captured by Vercel runtime logs (grep `[poker-telemetry]`).
async function recordOpsEvent(
  admin: AdminClient,
  kind: string,
  tableId: string | null,
  handId: string | null,
  detail: Record<string, unknown>,
): Promise<void> {
  const severity = defaultOpsSeverity(kind as OpsEventKind)
  const safeDetail = redactTelemetryDetail(detail)
  try {
    const line = `[poker-telemetry] ${JSON.stringify({
      schema: TELEMETRY_SCHEMA_VERSION, ts: new Date().toISOString(), source: 'ops_event',
      kind, severity,
      correlation: { tableId: tableId ?? undefined, handId: handId ?? undefined, buildVersion: process.env.NEXT_PUBLIC_BUILD_ID ?? undefined, region: process.env.VERCEL_REGION ?? undefined },
      detail: safeDetail,
    })}`
    // eslint-disable-next-line no-console
    if (severity === 'critical' || severity === 'error') console.error(line); else console.log(line)
  } catch { /* logging is best-effort */ }
  try {
    await admin.rpc('poker_record_ops_event', {
      p_kind: kind, p_severity: severity, p_table_id: tableId, p_hand_id: handId, p_user_id: null, p_detail: safeDetail,
    })
  } catch { /* monitoring is best-effort */ }
}

// Best-effort server-operation latency sample. Persists ONE row to the existing generic
// analytics_events table (event_name='poker_perf', metadata={op, ms}) so the metrics dashboard can
// compute real p50/p95/p99 without a new table or vendor. NEVER throws and carries no cards/PII —
// only an operation name + an integer millisecond value. Works with either the anon or admin
// client (analytics_events INSERT is open; SELECT is service-role only).
type PerfWriter = { from: AdminClient['from'] }
async function recordPerf(client: PerfWriter, op: PerfOp, ms: number, tableId: string | null): Promise<void> {
  try {
    await client.from('analytics_events').insert({
      event_name: PERF_EVENT_NAME,
      path: '/games/poker',
      metadata: { op, ms: Math.max(0, Math.round(ms)), tableId },
    })
  } catch { /* perf sampling is best-effort */ }
}

// ── tickActionTimer — server-authoritative turn timeout (the client only nudges) ────────
// When the current actor's deadline has passed, the SERVER acts for them: fold if facing a bet,
// else check. Uses the same CAS path so a real action that lands first wins the race.
export async function tickActionTimer(tableId: string): Promise<ActionResult<{ acted: boolean }>> {
  const admin = createAdminClient()
  const loaded = await loadLiveHand(admin, tableId)
  if (!loaded.ok) return { ok: true, acted: false }
  const { live } = loaded
  if (live.hand.phase !== 'BETTING' || live.state.turnSeat === null) return { ok: true, acted: false }
  if (!live.hand.turn_deadline || Date.now() < new Date(live.hand.turn_deadline).getTime()) {
    return { ok: true, acted: false }
  }

  const seat = live.state.turnSeat
  const model = legalActionModel(live.state)
  if (!model) return { ok: true, acted: false }
  const action: PokerActionType = model.callAmount > 0 ? 'fold' : 'check'
  const applied: AppliedAction = action === 'fold' ? { type: 'fold' } : { type: 'check' }
  const res = applyPlayerAction(live.state, seat, applied)
  if (!res.ok) return { ok: true, acted: false }

  const { data: seatRow } = await admin
    .from('poker_seats').select('user_id').eq('table_id', tableId).eq('seat_index', seat).maybeSingle()
  const idem = `${live.hand.id}:timeout:${live.state.actionSeq}`
  const committed = await commitPlayerAction(
    admin, live, seat, (seatRow?.user_id as string) ?? '00000000-0000-0000-0000-000000000000',
    action, undefined, res.state, idem, action === 'fold' ? 'timeout_fold' : 'timeout_check',
  )
  if (!committed.ok) return { ok: true, acted: false }
  await progressHand(admin, tableId, live.hand.id, res.state, live.actionTimeSeconds)
  return { ok: true, acted: true }
}

// ── fetchLegalActions — the current actor's authoritative legal-action model ─────────────
// Returned ONLY to the seat whose turn it is. The client DISPLAYS these numbers and must never
// substitute its own (security-model §4). Includes the deadline + version for the action CAS.
// The payload shape is the canonical `PokerLegalView` (defined in the pure realtime module so
// the client reducer and this action speak exactly the same type).
export type LegalActionsPayload = PokerLegalView
export async function fetchLegalActions(tableId: string): Promise<ActionResult<{ legal: LegalActionsPayload }>> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('not_authenticated')

  const admin = createAdminClient()
  const loaded = await loadLiveHand(admin, tableId)
  if (!loaded.ok) {
    return { ok: true, legal: { model: null, turnSeat: null, turnDeadline: null, timeBankSeconds: 0, stateVersion: 0 } }
  }
  const { live } = loaded
  const seat = await userSeatIndex(admin, tableId, user.id)
  const isMyTurn = seat !== null && live.state.turnSeat === seat && live.hand.phase === 'BETTING'
  return {
    ok: true,
    legal: {
      model: isMyTurn ? legalActionModel(live.state) : null,
      turnSeat: live.state.turnSeat,
      turnDeadline: live.hand.turn_deadline ? new Date(live.hand.turn_deadline).getTime() : null,
      timeBankSeconds: 15,
      stateVersion: live.state.actionSeq,
    },
  }
}

// ── advanceStreet / reapStuckHand — trusted recovery (cron / nudge), service-role driven ──
// advanceStreet is a no-op safety net: progression is automatic inside pokerAct. It re-drives a
// hand that was left mid-advance (e.g. a crash between street commits) from persisted state.
export async function advanceStreet(tableId: string): Promise<ActionResult<{ phase: string }>> {
  const admin = createAdminClient()
  const loaded = await loadLiveHand(admin, tableId)
  if (!loaded.ok) return fail(loaded.error)
  const { live } = loaded
  if (live.hand.phase !== 'BETTING' || live.state.turnSeat !== null) {
    return { ok: true, phase: live.hand.phase } // someone is to act, or already terminal
  }
  const r = await progressHand(admin, tableId, live.hand.id, live.state, live.actionTimeSeconds)
  return { ok: true, phase: r.phase }
}

// ── fetchPokerSnapshot — THE recipient-aware authoritative reconcile source ──────────────
// One call returns everything a single viewer needs to render truth: the PUBLIC table state +
// (if seated) the viewer's OWN hole cards + (only on the viewer's turn) their legal-action
// model. A spectator gets viewerSeatIndex=null with no cards and no legal model. This is the
// single source the client reconciles against on EVERY recovery path (initial load, refresh,
// reconnect, sequence gap, background-tab resume, mobile transition) — recipient-aware by
// construction so the server never publishes one shared payload and trusts the browser to
// filter (security-model §2). The public projection is re-asserted spectator-safe before return.
export async function fetchPokerSnapshot(
  tableId: string,
): Promise<ActionResult<{ snapshot: PokerSnapshot }>> {
  const tSnap0 = Date.now()
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // A spectator may be unauthenticated; identity simply resolves to "no seat".

  const pub = await fetchTableState(tableId)
  if (!pub.ok) return pub
  const state = pub.state

  // Derive the viewer's seat from the PUBLIC seats (no extra query). null ⇒ spectator.
  const viewerSeatIndex =
    user ? (state.seats.find((s) => s.userId === user.id)?.seatIndex ?? null) : null

  let ownHole: PokerSnapshot['ownHole'] = null
  let legal: PokerLegalView | null = null
  if (viewerSeatIndex !== null) {
    const [holeRes, legalRes] = await Promise.all([
      fetchMyHoleCards(tableId),
      fetchLegalActions(tableId),
    ])
    if (holeRes.ok) ownHole = holeRes.hole
    if (legalRes.ok && legalRes.legal.model) legal = legalRes.legal
  }

  const snapshot: PokerSnapshot = { public: state, viewerSeatIndex, ownHole, legal, serverTs: Date.now() }
  // Defense in depth: refuse to emit a snapshot that would leak a foreign/private card. This
  // converts any future wiring mistake into a loud server error instead of a silent leak.
  try {
    assertSnapshotPrivacy(snapshot)
  } catch {
    // A snapshot that would leak private state is a SEV-1 rollback signal. Page an operator (best-
    // effort, never throws) and refuse to serve the snapshot.
    await emitSev1({ code: 'PKR_SEV1_PRIVATE_STATE_LEAK', correlation: { tableId, source: 'cash_snapshot' } })
    return fail('snapshot_privacy_violation')
  }
  await recordPerf(supabase, 'snapshot', Date.now() - tSnap0, tableId)
  return { ok: true, snapshot }
}
