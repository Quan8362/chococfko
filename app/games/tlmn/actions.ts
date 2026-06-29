'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  resolveRules, pickHostOverride, explainSettlement, settleRound,
  loserHandPayment, calculateRemainingHandPenalties,
  type Card, type Rules,
  type HostRulesOverride, type CutEvent, type InstantWinType, type RoundBreakdown,
} from '@/lib/games/tlmn/engine'
import {
  dealRound, applyPlay, applyPass, applyTimeout, cardCounts, type RoundState,
} from '@/lib/games/tlmn/round'
import { chooseBotMove, botMoveAudit } from '@/lib/games/tlmn/bot'
import { chooseBotMoveAI, chooseAiMove, policyViewFromRound } from '@/lib/games/tlmn/ai'
import { resolveAvatarUrl, resolveDisplayName, type AuthMetaLike } from '@/lib/games/tlmn/avatar'
import { ENTRY_MIN_BALANCE } from '@/lib/game/economy'
import { ensureWallet } from './wallet'

// ── Types ───────────────────────────────────────────────────────────────────────
export type TlmnStatus = 'lobby' | 'playing' | 'ended'
// MODE A = 'practice' (solo vs bots, no stakes, private); MODE B = 'multiplayer'.
export type TlmnMode = 'multiplayer' | 'practice'

export type TlmnSettings = {
  // Host rule override — ONLY the changed fields are stored (untouched ⇒ full ruleset).
  rules?: HostRulesOverride
}

export type TlmnRoom = {
  id: string
  invite_code: string
  host_seat: number
  status: TlmnStatus
  mode: TlmnMode
  settings: TlmnSettings
  created_at: string
  updated_at: string
}

export type TlmnSeat = {
  id: string
  room_id: string
  seat_index: number
  user_id: string | null
  display_name: string
  avatar_url: string | null
  is_ready: boolean
  is_bot: boolean
  connected: boolean
  cumulative_score: number
  // Phase 5 — resilience. A seat is "bot-controlled" when is_bot (a real lobby bot)
  // OR bot_takeover (a human seat auto-piloted after going AFK / disconnecting).
  missed_turns: number
  bot_takeover: boolean
  last_seen: string | null
}

export type TlmnRoomState = { room: TlmnRoom; seats: TlmnSeat[] }
export type SeatResult = { state: TlmnRoomState | null; error?: string }
export type ActionResult = { error: string } | null

const MAX_SEATS = 4

// Phase 5 — resilience tuning.
// A seat is auto-piloted by a bot once the human misses this many turns in a row…
const MISSED_TURNS_TAKEOVER = 2
// …or has not sent a heartbeat for this long (tab closed). The room heartbeat fires
// every 15s, so this is ~3 missed beats — comfortably past a transient hiccup.
const OFFLINE_MS = 45000
// A LOBBY seat whose human occupant has stopped heart-beating for this long is treated
// as a closed tab and freed so its slot reopens live for everyone (see pruneStaleLobbySeats).
const LOBBY_SEAT_STALE_MS = 45000
// Randomized bot "think" window before it acts (server-gated off turn_started_at so
// every client agrees, and the move can't fire the instant the turn opens).
const BOT_MIN_DELAY_MS = 600
const BOT_MAX_DELAY_MS = 1400

// ── Helpers ─────────────────────────────────────────────────────────────────────
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function genCode(): string {
  return Array.from({ length: 5 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('')
}

type Admin = ReturnType<typeof createAdminClient>

type ProfileInfo = { name: string; avatar: string | null }

// Fetch a single user's auth metadata (OAuth picture / name) — used only as a fallback
// when the application profile is missing a field. Bounded to the handful of real seats
// per room, never per leaderboard row.
async function getAuthMeta(admin: Admin, userId: string): Promise<AuthMetaLike | null> {
  const { data: { user } } = await admin.auth.admin.getUserById(userId)
  if (!user) return null
  const m = (user.user_metadata ?? {}) as Record<string, unknown>
  return {
    display_name: (m.display_name as string) ?? null,
    name: (m.name as string) ?? null,
    full_name: (m.full_name as string) ?? null,
    avatar_url: (m.avatar_url as string) ?? null,
    picture: (m.picture as string) ?? null,
    email: user.email ?? null,
  }
}

// Resolve ONE user's authoritative identity (name + avatar). Source of truth is the
// application profile; OAuth metadata fills any gap (avatar/name) using the player's
// OWN account only. Used when snapshotting a seat at create/join time.
async function getProfileInfo(admin: Admin, userId: string): Promise<ProfileInfo> {
  const { data: profile } = await admin
    .from('profiles')
    .select('display_name, avatar_url')
    .eq('id', userId)
    .maybeSingle()
  // Only reach for auth metadata when the profile leaves a field empty (common for
  // OAuth users onboarded before the trigger copied their picture into profiles).
  const needsMeta = !profile?.display_name || !profile?.avatar_url
  const meta = needsMeta ? await getAuthMeta(admin, userId) : null
  return {
    name: resolveDisplayName(profile, meta),
    avatar: resolveAvatarUrl(profile, meta),
  }
}

// Batch-resolve the CURRENT authoritative identity for many real users at once — the
// single hydration primitive behind room seats, the waiting-room host list and the
// leaderboard. ONE profiles query for everyone (no N+1); bounded auth-metadata lookups
// ONLY for the users still missing an avatar after the profile read. Keyed strictly by
// user_id, so a player always resolves to their own avatar regardless of seat/order/who
// is logged in. Bots / null ids are simply absent from the map.
const META_FALLBACK_CAP = 24
async function resolveProfiles(
  admin: Admin,
  userIds: Array<string | null | undefined>,
): Promise<Map<string, ProfileInfo>> {
  const ids = Array.from(new Set(userIds.filter((id): id is string => !!id)))
  const out = new Map<string, ProfileInfo>()
  if (ids.length === 0) return out

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, display_name, avatar_url')
    .in('id', ids)
  const byId = new Map<string, { display_name: string | null; avatar_url: string | null }>()
  for (const p of (profiles ?? []) as Array<{ id: string; display_name: string | null; avatar_url: string | null }>) {
    byId.set(p.id, { display_name: p.display_name, avatar_url: p.avatar_url })
  }

  // Anyone whose profile lacks an avatar gets a bounded auth-metadata fallback (their
  // own OAuth picture). Capped so a large leaderboard page can never fan out unbounded.
  const missing = ids.filter(id => !byId.get(id)?.avatar_url).slice(0, META_FALLBACK_CAP)
  const metas = new Map<string, AuthMetaLike | null>()
  await Promise.all(missing.map(async id => { metas.set(id, await getAuthMeta(admin, id)) }))

  for (const id of ids) {
    const profile = byId.get(id) ?? null
    const meta = metas.get(id) ?? null
    out.set(id, { name: resolveDisplayName(profile, meta), avatar: resolveAvatarUrl(profile, meta) })
  }
  return out
}

// Overlay the freshly-resolved profile (name + avatar) onto a set of seats, keyed by
// user_id. Bots and empty seats are returned untouched — their stored display_name /
// null avatar is authoritative. avatar_url on a seat is therefore DISPLAY data refreshed
// on every read, never the source of truth.
async function hydrateSeatProfiles(admin: Admin, seats: TlmnSeat[]): Promise<TlmnSeat[]> {
  const profiles = await resolveProfiles(admin, seats.filter(s => !s.is_bot).map(s => s.user_id))
  if (profiles.size === 0) return seats
  return seats.map(s => {
    if (s.is_bot || !s.user_id) return s
    const p = profiles.get(s.user_id)
    if (!p) return s
    return { ...s, display_name: p.name || s.display_name, avatar_url: p.avatar }
  })
}

async function readState(admin: Admin, roomId: string): Promise<TlmnRoomState | null> {
  const [{ data: room }, { data: seats }] = await Promise.all([
    admin.from('tlmn_rooms').select('*').eq('id', roomId).maybeSingle(),
    admin.from('tlmn_seats').select('*').eq('room_id', roomId).order('seat_index', { ascending: true }),
  ])
  if (!room) return null
  // Refresh every real seat's name + avatar from the authoritative profile on each read
  // (initial load, realtime reconcile, reconnect) so a stale join-time snapshot — or a
  // profile updated mid-room — never sticks. Keyed by user_id; bots are left untouched.
  const hydrated = await hydrateSeatProfiles(admin, (seats ?? []) as TlmnSeat[])
  return { room: room as TlmnRoom, seats: hydrated }
}

// Seat the current user into the lowest free seat. Idempotent: a user already in
// the room is a no-op. Relies on the UNIQUE(room_id, seat_index) constraint so two
// players racing for the same slot can't both win — the loser retries the next free
// index. Never seats into a room that has left the lobby.
async function seatUser(admin: Admin, roomId: string, userId: string): Promise<string | null> {
  const { data: seats } = await admin
    .from('tlmn_seats')
    .select('seat_index, user_id')
    .eq('room_id', roomId)
  const rows = (seats ?? []) as Array<{ seat_index: number; user_id: string | null }>

  if (rows.some(s => s.user_id === userId)) return null // already seated

  const { data: room } = await admin.from('tlmn_rooms').select('status').eq('id', roomId).maybeSingle()
  if (!room) return 'not_found'
  if (room.status !== 'lobby') return 'in_progress'

  const taken = new Set(rows.map(s => s.seat_index))
  const info = await getProfileInfo(admin, userId)

  for (let idx = 0; idx < MAX_SEATS; idx++) {
    if (taken.has(idx)) continue
    const { error } = await admin.from('tlmn_seats').insert({
      room_id: roomId,
      seat_index: idx,
      user_id: userId,
      display_name: info.name,
      avatar_url: info.avatar,
      is_ready: false,
      connected: true,
      last_seen: new Date().toISOString(),
    })
    if (!error) return null
    // 23505 = unique violation: slot or user grabbed concurrently. If it's the
    // user-uniqueness index, we're already seated → done; otherwise try next slot.
    const { data: mine } = await admin
      .from('tlmn_seats').select('id').eq('room_id', roomId).eq('user_id', userId).maybeSingle()
    if (mine) return null
  }
  return 'full'
}

// ── createRoom ──────────────────────────────────────────────────────────────────
export async function createRoom(): Promise<never> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Entry gate: must hold at least ENTRY_MIN_BALANCE to open a table. ensureWallet
  // also grants the one-time signup bonus on a first-ever visit. If broke, bounce
  // back to the lobby where the "Hết xu" daily-claim panel takes over.
  const { balance } = await ensureWallet()
  if (balance < ENTRY_MIN_BALANCE) redirect('/games/tlmn')

  const admin = createAdminClient()

  let code = genCode()
  for (let i = 0; i < 5; i++) {
    const { data } = await admin.from('tlmn_rooms').select('id').eq('invite_code', code).maybeSingle()
    if (!data) break
    code = genCode()
  }

  const { data: room, error } = await admin
    .from('tlmn_rooms')
    .insert({ invite_code: code, host_seat: 0, status: 'lobby', mode: 'multiplayer', settings: {} })
    .select('id')
    .single()
  if (error || !room) throw new Error(error?.message ?? 'create_failed')

  const info = await getProfileInfo(admin, user.id)
  await admin.from('tlmn_seats').insert({
    room_id: room.id,
    seat_index: 0,
    user_id: user.id,
    display_name: info.name,
    avatar_url: info.avatar,
    is_ready: false,
    connected: true,
    last_seen: new Date().toISOString(),
  })

  redirect(`/games/tlmn/${code}`)
}

// ── createPracticeRoom (MODE A — instant Practice vs Bots) ─────────────────────────
// One-tap: open a PRIVATE single-player session, seat the host + N bots (default 3),
// deal, and jump straight into the game. NO coin entry-gate and NO settlement — it's
// practice (see settleRoundCoins, which skips mode='practice'). The room is never
// listed in the public "Phòng chờ" lobby and is not joinable by anyone else (the room
// page 404s a non-host visitor). Always available, including at 0 coins.
export async function createPracticeRoom(
  botCount = 3,
  override: HostRulesOverride | null = null,
): Promise<never> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  let code = genCode()
  for (let i = 0; i < 5; i++) {
    const { data } = await admin.from('tlmn_rooms').select('id').eq('invite_code', code).maybeSingle()
    if (!data) break
    code = genCode()
  }

  const clean = override ? pickHostOverride(override) : {}
  const rules = resolveRules(clean)

  // Open the room already in 'playing' so it never surfaces in the waiting-room list
  // and the page routes straight to the table.
  const { data: room, error } = await admin
    .from('tlmn_rooms')
    .insert({ invite_code: code, host_seat: 0, status: 'playing', mode: 'practice', settings: { rules: clean } })
    .select('id')
    .single()
  if (error || !room) throw new Error(error?.message ?? 'create_failed')

  const info = await getProfileInfo(admin, user.id)
  await admin.from('tlmn_seats').insert({
    room_id: room.id,
    seat_index: 0,
    user_id: user.id,
    display_name: info.name,
    avatar_url: info.avatar,
    is_ready: true,
    connected: true,
    last_seen: new Date().toISOString(),
  })

  const bots = Math.min(MAX_SEATS - 1, Math.max(1, Math.floor(botCount)))
  const botRows = Array.from({ length: bots }, (_, i) => ({
    room_id: room.id,
    seat_index: i + 1,
    user_id: null,
    display_name: `Bot ${i + 1}`,
    avatar_url: null,
    is_ready: true,
    is_bot: true,
    connected: true,
  }))
  await admin.from('tlmn_seats').insert(botRows)

  const seats = Array.from({ length: bots + 1 }, (_, i) => i)
  await dealAndPersist(admin, room.id, seats, 1, rules, null)

  redirect(`/games/tlmn/${code}`)
}

// ── seatIntoRoom ────────────────────────────────────────────────────────────────
// Called by the room page on load to auto-seat the visitor into the next free seat.
// Always returns the current authoritative state (even when seating is a benign
// no-op — already seated, room full, or game already in progress → spectator).
export async function seatIntoRoom(code: string): Promise<SeatResult> {
  const admin = createAdminClient()
  const { data: room } = await admin
    .from('tlmn_rooms').select('id').eq('invite_code', code.toUpperCase()).maybeSingle()
  if (!room) return { state: null, error: 'not_found' }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let error: string | undefined
  if (user) {
    // Entry gate: a broke player isn't seated (stays a spectator). ensureWallet also
    // grants the one-time signup bonus on a first-ever visit.
    const { balance } = await ensureWallet()
    if (balance < ENTRY_MIN_BALANCE) {
      return { state: await readState(admin, room.id), error: 'insufficient_coins' }
    }
    const err = await seatUser(admin, room.id, user.id)
    if (err) error = err
  }
  return { state: await readState(admin, room.id), error }
}

// ── joinRoomByCode (lobby form) ─────────────────────────────────────────────────
export async function joinRoomByCode(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const code = ((formData.get('invite_code') as string) ?? '').trim().toUpperCase()
  if (!code) return { error: 'no_code' }

  // Entry gate: must hold at least ENTRY_MIN_BALANCE to join a table.
  const { balance } = await ensureWallet()
  if (balance < ENTRY_MIN_BALANCE) return { error: 'insufficient_coins' }

  const admin = createAdminClient()
  const { data: room } = await admin
    .from('tlmn_rooms').select('id, status').eq('invite_code', code).maybeSingle()
  if (!room) return { error: 'not_found' }

  const err = await seatUser(admin, room.id, user.id)
  if (err === 'full') return { error: 'full' }
  if (err === 'in_progress') return { error: 'in_progress' }

  redirect(`/games/tlmn/${code}`)
}

// ── refetchRoomState ────────────────────────────────────────────────────────────
// Reconcile after the realtime channel (re)subscribes, mirroring caro/chess.
export async function refetchRoomState(roomId: string): Promise<TlmnRoomState | null> {
  return readState(createAdminClient(), roomId)
}

// ── getRoomState (read-only, by code) ─────────────────────────────────────────────
// Resolve a room by its invite code WITHOUT seating anyone — used by the room page to
// decide between the invite-preview (visitor not yet seated) and the in-room view, and
// to render the inviter/host + current player list in the preview. Seating happens only
// on an explicit "Vào phòng" (seatIntoRoom), never on a passive page load.
export async function getRoomState(code: string): Promise<TlmnRoomState | null> {
  const admin = createAdminClient()
  const { data: room } = await admin
    .from('tlmn_rooms').select('id').eq('invite_code', code.toUpperCase()).maybeSingle()
  if (!room) return null
  return readState(admin, room.id)
}

// ── Public "Phòng chờ" list (mirror Cờ Caro's fetchWaitingRooms) ───────────────────
export type WaitingRoom = {
  id: string
  invite_code: string
  host_id: string
  host_name: string
  host_avatar: string | null
  host_balance: number
  seat_count: number
  created_at: string
  updated_at: string
}

// A waiting room's host is considered ONLINE while their seat heart-beats (every 15s
// via heartbeatRoom). ~3 missed beats ⇒ ghost room, excluded from the list.
const LOBBY_HOST_STALE_MS = 50_000

// fetchWaitingRooms — MODE-B rooms still gathering players: multiplayer + in the lobby
// (not started) + not full + host still online. MODE-A practice sessions are mode!=
// 'multiplayer' so they can never appear here. Newest-first, like Cờ Caro.
export async function fetchWaitingRooms(): Promise<WaitingRoom[]> {
  const admin = createAdminClient()
  const { data: rooms } = await admin
    .from('tlmn_rooms')
    .select('id, invite_code, host_seat, created_at, updated_at')
    .eq('mode', 'multiplayer')
    .eq('status', 'lobby')
    .order('updated_at', { ascending: false })
    .limit(30)
  if (!rooms || rooms.length === 0) return []

  const roomIds = rooms.map(r => r.id)
  const { data: seats } = await admin
    .from('tlmn_seats')
    .select('room_id, seat_index, user_id, is_bot, display_name, avatar_url, last_seen')
    .in('room_id', roomIds)
  type SeatRow = {
    room_id: string; seat_index: number; user_id: string | null; is_bot: boolean
    display_name: string; avatar_url: string | null; last_seen: string | null
  }
  const byRoom = new Map<string, SeatRow[]>()
  for (const s of (seats ?? []) as SeatRow[]) {
    const arr = byRoom.get(s.room_id) ?? []
    arr.push(s)
    byRoom.set(s.room_id, arr)
  }

  const cutoff = Date.now() - LOBBY_HOST_STALE_MS
  const out: Array<WaitingRoom & { host_id: string }> = []
  for (const r of rooms) {
    const rs = byRoom.get(r.id) ?? []
    if (rs.length === 0 || rs.length >= MAX_SEATS) continue // empty/ghost or already full
    const host = rs.find(s => s.seat_index === r.host_seat) ?? rs[0]
    if (!host.user_id || host.is_bot) continue // host must be a real player
    if (!host.last_seen || new Date(host.last_seen).getTime() < cutoff) continue // ghost — host offline
    out.push({
      id: r.id,
      invite_code: r.invite_code,
      host_id: host.user_id,
      host_name: host.display_name || '',
      host_avatar: host.avatar_url,
      host_balance: 0,
      seat_count: rs.length,
      created_at: r.created_at,
      updated_at: r.updated_at,
    })
  }

  // Host coin balance → drives the host's dynamic coin-rank badge in the lobby. One batched
  // read of game_wallets (no N+1). Tier is derived from this CURRENT balance on the client.
  if (out.length > 0) {
    const [{ data: wallets }, profiles] = await Promise.all([
      admin.from('game_wallets').select('user_id, balance').in('user_id', out.map(o => o.host_id)),
      // Refresh each host's name + avatar from the authoritative profile (the seat row may
      // hold a stale join-time snapshot). Keyed by host_id → never another player's avatar.
      resolveProfiles(admin, out.map(o => o.host_id)),
    ])
    const bal = new Map<string, number>()
    for (const w of (wallets ?? []) as Array<{ user_id: string; balance: number | string }>) {
      bal.set(w.user_id, Number(w.balance ?? 0))
    }
    for (const o of out) {
      o.host_balance = bal.get(o.host_id) ?? 0
      const p = profiles.get(o.host_id)
      if (p) { o.host_name = p.name || o.host_name; o.host_avatar = p.avatar }
    }
  }
  return out
}

// joinRoomFromLobby — join a public waiting room by code WITHOUT redirecting (the
// client routes on success, mirroring Cờ Caro). Enforces the coin entry-gate and the
// same full / in-progress guards as the lobby form.
export async function joinRoomFromLobby(code: string): Promise<ActionResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'not_logged_in' }

  const { balance } = await ensureWallet()
  if (balance < ENTRY_MIN_BALANCE) return { error: 'insufficient_coins' }

  const admin = createAdminClient()
  const { data: room } = await admin
    .from('tlmn_rooms').select('id, mode').eq('invite_code', code.toUpperCase()).maybeSingle()
  if (!room || room.mode === 'practice') return { error: 'not_found' } // practice is private

  const err = await seatUser(admin, room.id, user.id)
  if (err === 'full') return { error: 'full' }
  if (err === 'in_progress') return { error: 'in_progress' }
  return null
}

// ── toggleReady ─────────────────────────────────────────────────────────────────
export async function toggleReady(roomId: string): Promise<ActionResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'not_logged_in' }

  const admin = createAdminClient()
  const { data: seat } = await admin
    .from('tlmn_seats').select('id, is_ready')
    .eq('room_id', roomId).eq('user_id', user.id).maybeSingle()
  if (!seat) return { error: 'not_seated' }

  const { data: room } = await admin.from('tlmn_rooms').select('status').eq('id', roomId).maybeSingle()
  if (!room || room.status !== 'lobby') return { error: 'not_in_lobby' }

  await admin.from('tlmn_seats').update({ is_ready: !seat.is_ready }).eq('id', seat.id)
  return null
}

// ── startGame (host only) ────────────────────────────────────────────────────────
// Flip the room to 'playing' AND deal round 1 server-side: shuffle (secure RNG via
// the engine's Fisher–Yates), deal 13/seat, drop the remainder, run the tới-trắng
// check, and persist the public game row + the per-seat secret hands. The resolved
// ruleset is locked into the game row. Idempotent: the status='lobby' guard makes a
// double-click a no-op.
export async function startGame(roomId: string): Promise<ActionResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'not_logged_in' }

  const admin = createAdminClient()
  const state = await readState(admin, roomId)
  if (!state) return { error: 'not_found' }
  if (state.room.status !== 'lobby') return { error: 'already_started' }

  const mySeat = state.seats.find(s => s.user_id === user.id)
  if (!mySeat || mySeat.seat_index !== state.room.host_seat) return { error: 'not_host' }

  // The host is always a player (no self-ready needed); everyone else joins the deal
  // only once they've marked ready. Bots are always ready, so host + bots just works.
  const playingSeats = state.seats.filter(s => s.is_ready || s.seat_index === state.room.host_seat)
  if (playingSeats.length < 2) return { error: 'not_enough_ready' }

  // Claim the lobby→playing transition first so a double Start can't double-deal.
  const { data: claimed } = await admin
    .from('tlmn_rooms').update({ status: 'playing' })
    .eq('id', roomId).eq('status', 'lobby').select('id')
  if (!claimed || claimed.length === 0) return { error: 'already_started' }

  const rules = resolveRules(state.room.settings?.rules)
  const seats = playingSeats.map(s => s.seat_index).sort((a, b) => a - b)
  await dealAndPersist(admin, roomId, seats, 1, rules, null)
  return null
}

// ── updateRules (host only) ──────────────────────────────────────────────────────
// Persist a partial host override (ONLY the changed fields) into settings.rules. An
// empty/undefined override clears it → the room runs the complete default ruleset.
export async function updateRules(roomId: string, override: HostRulesOverride | null): Promise<ActionResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'not_logged_in' }

  const admin = createAdminClient()
  const state = await readState(admin, roomId)
  if (!state) return { error: 'not_found' }
  if (state.room.status !== 'lobby') return { error: 'not_in_lobby' }

  const mySeat = state.seats.find(s => s.user_id === user.id)
  if (!mySeat || mySeat.seat_index !== state.room.host_seat) return { error: 'not_host' }

  const clean = override ? pickHostOverride(override) : {}
  const settings: TlmnSettings = { ...(state.room.settings ?? {}), rules: clean }
  await admin.from('tlmn_rooms').update({ settings }).eq('id', roomId)
  return null
}

// ── leaveSeat ────────────────────────────────────────────────────────────────────
// Leaving behaves differently depending on whether a round is in progress:
//   • Lobby/ended → free the seat outright. If the room empties, delete it.
//   • Playing → the active round references this seat's hand, so we DON'T delete it:
//     mark it offline + bot_takeover so a bot finishes the round, and the game
//     continues uninterrupted. (The human can return any time via the room code.)
// Either way, if the leaver was the host, host migrates to the lowest-index
// remaining HUMAN seat (falling back to the lowest remaining seat if none).
export async function leaveSeat(roomId: string): Promise<ActionResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'not_logged_in' }

  const admin = createAdminClient()
  const { data: seat } = await admin
    .from('tlmn_seats').select('id, seat_index')
    .eq('room_id', roomId).eq('user_id', user.id).maybeSingle()
  if (!seat) return null // already gone

  const { data: room } = await admin
    .from('tlmn_rooms').select('host_seat, status, mode').eq('id', roomId).maybeSingle()

  // A practice session belongs to its single human — when they leave, there's nobody
  // (only bots) to keep it alive, so tear the whole room down rather than handing it
  // to a bot. The CASCADE on tlmn_seats/tlmn_games/tlmn_hands cleans up the rest.
  if (room?.mode === 'practice') {
    await admin.from('tlmn_rooms').delete().eq('id', roomId)
    return null
  }

  const playing = room?.status === 'playing'

  if (playing) {
    // Hand the seat to a bot for the rest of the game — never break the round.
    await admin.from('tlmn_seats')
      .update({ connected: false, bot_takeover: true, is_ready: false })
      .eq('id', seat.id)
  } else {
    await admin.from('tlmn_seats').delete().eq('id', seat.id)
  }

  const { data: remaining } = await admin
    .from('tlmn_seats').select('seat_index, user_id, bot_takeover')
    .eq('room_id', roomId).order('seat_index', { ascending: true })
  const rows = (remaining ?? []) as Array<{ seat_index: number; user_id: string | null; bot_takeover: boolean }>

  if (rows.length === 0) {
    await admin.from('tlmn_rooms').delete().eq('id', roomId)
    return null
  }

  // Host migration → lowest present human (a real, non-taken-over seat), else lowest.
  if (room && room.host_seat === seat.seat_index) {
    const human = rows.find(r => r.user_id && !r.bot_takeover)
    const target = (human ?? rows[0]).seat_index
    await admin.from('tlmn_rooms').update({ host_seat: target }).eq('id', roomId)
  }
  return null
}

// ── leaveTable (the single client-facing "exit" path) ──────────────────────────────
// Decides — SERVER-SIDE, never trusting the client — whether leaving is a plain departure
// or a VOLUNTARY-EXIT forfeit, then performs the matching settlement atomically.
//
// A forfeit (coin penalty) is charged ONLY when ALL of these hold:
//   • a round is actively in progress (latest tlmn_games row status='playing'),
//   • the caller owns a seat in it,
//   • that seat still HOLDS cards (not already out / on the result screen),
//   • the caller has NOT already forfeited this round (idempotent — the RPC double-guards).
// Refresh / disconnect / backgrounding never reach here (no leaveTable call — those go
// stale via the heartbeat and become a bot takeover). Lobby / ended-round / practice exits
// fall through to the normal leaveSeat departure with NO penalty.
//
// The penalty is computed HERE in trusted server code from the AUTHORITATIVE hidden hand
// (tlmn_hands via the service role) using the SAME engine formula as a round-end loss
// (loserHandPayment). The browser supplies only roomId. The deduction + once-only forfeit
// record + ledger row commit atomically inside settle_tlmn_voluntary_exit (service_role
// only). After settling we run the normal departure (bot takeover keeps the round alive;
// host migrates) so remaining players continue uninterrupted.
export type ForfeitOutcome = {
  cardsLeft: number
  penaltyPoints: number
  coinPenalty: number
  balance: number
}
export type LeaveTableResult =
  | { ok: true; outcome: 'left' }
  | { ok: true; outcome: 'forfeited'; forfeit: ForfeitOutcome }
  | { error: string }

export async function leaveTable(roomId: string): Promise<LeaveTableResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'not_logged_in' }

  const admin = createAdminClient()

  // Is there an active round AND do I hold cards in it AND have I not already forfeited?
  const game = await latestGame(admin, roomId, true) // status='playing' only
  let forfeit: ForfeitOutcome | null = null

  if (game) {
    const mySeat = await seatIndexOf(admin, roomId, user.id)
    if (mySeat != null) {
      const { data: already } = await admin
        .from('tlmn_forfeits').select('coin_penalty')
        .eq('room_id', roomId).eq('round_no', game.round_no).eq('user_id', user.id).maybeSingle()

      if (!already) {
        const hands = await loadHands(admin, game.id)
        const myHand = hands[mySeat] ?? []
        if (myHand.length > 0) {
          // ── VOLUNTARY EXIT — settle the forfeit BEFORE the seat departs. ──────────
          const rules: Rules = game.rules
          // played_counts is JSON so its keys are strings; 0 (or absent) ⇒ cóng.
          const playedZero = (((game.played_counts ?? {}) as Record<string, number>)[String(mySeat)] ?? 0) === 0
          const points = loserHandPayment(myHand, playedZero, rules)
          const pen = calculateRemainingHandPenalties(myHand)
          // COUNTS only — never card identities (the row is self-readable history).
          const breakdown = {
            cardsLeft: myHand.length,
            cong: playedZero,
            redTwos: pen.redTwos.length,
            blackTwos: pen.blackTwos.length,
            bomUnits: pen.bomUnits,
            points,
          }
          const { data, error } = await admin.rpc('settle_tlmn_voluntary_exit', {
            p_room_id: roomId,
            p_round_no: game.round_no,
            p_user_id: user.id,
            p_seat_index: mySeat,
            p_cards_left: myHand.length,
            p_penalty_points: points,
            p_breakdown: breakdown,
          })
          if (error) return { error: 'settle_failed' }
          const row = (data ?? {}) as { coin_penalty?: number; balance?: number }
          forfeit = {
            cardsLeft: myHand.length,
            penaltyPoints: points,
            coinPenalty: Number(row.coin_penalty ?? 0),
            balance: Number(row.balance ?? 0),
          }
        }
      }
    }
  }

  // Normal departure: frees a lobby seat or hands a live seat to a bot (keeping the round
  // going) and migrates the host. Reused so there is ONE departure code path.
  await leaveSeat(roomId)

  return forfeit ? { ok: true, outcome: 'forfeited', forfeit } : { ok: true, outcome: 'left' }
}

// ── heartbeatRoom ────────────────────────────────────────────────────────────────
// Keep the caller's seat marked connected while the tab is open (mirrors the
// caro/chess waiting-room heartbeat). Also drives RECONNECT: if the seat had been
// auto-piloted by a bot (AFK/disconnect) AND we've been gone past the offline
// threshold, returning hands control back to the human and clears the miss counter.
export async function heartbeatRoom(roomId: string): Promise<void> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const admin = createAdminClient()

  const { data: seat } = await admin.from('tlmn_seats')
    .select('id, bot_takeover, last_seen')
    .eq('room_id', roomId).eq('user_id', user.id).maybeSingle()
  if (!seat) return

  const wasOffline = !seat.last_seen || Date.now() - new Date(seat.last_seen).getTime() > OFFLINE_MS
  const patch: Record<string, unknown> = { connected: true, last_seen: new Date().toISOString() }
  // Resume control only on a genuine reconnect — a steady stream of heartbeats from
  // an idle-but-open tab must NOT keep clearing a takeover earned by missed turns.
  if (seat.bot_takeover && wasOffline) {
    patch.bot_takeover = false
    patch.missed_turns = 0
  }
  await admin.from('tlmn_seats').update(patch).eq('id', seat.id)
}

// ── addBot (host only) ─────────────────────────────────────────────────────────────
// Fill the lowest free seat with a bot (is_bot=true, NULL user_id, always ready).
// Lobby-only. Idempotent against the UNIQUE(room_id, seat_index) constraint.
// Returns the fresh authoritative state so the caller updates instantly — never
// relying on a possibly-delayed/missed realtime broadcast for its own action.
export async function addBot(roomId: string): Promise<SeatResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { state: null, error: 'not_logged_in' }

  const admin = createAdminClient()
  const state = await readState(admin, roomId)
  if (!state) return { state: null, error: 'not_found' }
  if (state.room.status !== 'lobby') return { state, error: 'not_in_lobby' }

  const mySeat = state.seats.find(s => s.user_id === user.id)
  if (!mySeat || mySeat.seat_index !== state.room.host_seat) return { state, error: 'not_host' }

  const taken = new Set(state.seats.map(s => s.seat_index))
  const botCount = state.seats.filter(s => s.is_bot).length
  for (let idx = 0; idx < MAX_SEATS; idx++) {
    if (taken.has(idx)) continue
    const { error } = await admin.from('tlmn_seats').insert({
      room_id: roomId,
      seat_index: idx,
      user_id: null,
      display_name: `Bot ${botCount + 1}`,
      avatar_url: null,
      is_ready: true,   // bots are always ready so the host can start
      is_bot: true,
      connected: true,
    })
    if (!error) return { state: await readState(admin, roomId) }
  }
  return { state, error: 'full' }
}

// ── removeBot (host only) ──────────────────────────────────────────────────────────
// Remove a lobby bot seat (is_bot + NULL user_id). Never touches a human seat nor a
// human under bot takeover. Lobby-only. Returns the fresh authoritative state (see addBot).
export async function removeBot(roomId: string, seatIndex: number): Promise<SeatResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { state: null, error: 'not_logged_in' }

  const admin = createAdminClient()
  const state = await readState(admin, roomId)
  if (!state) return { state: null, error: 'not_found' }
  if (state.room.status !== 'lobby') return { state, error: 'not_in_lobby' }

  const mySeat = state.seats.find(s => s.user_id === user.id)
  if (!mySeat || mySeat.seat_index !== state.room.host_seat) return { state, error: 'not_host' }

  await admin.from('tlmn_seats')
    .delete()
    .eq('room_id', roomId).eq('seat_index', seatIndex).eq('is_bot', true).is('user_id', null)
  return { state: await readState(admin, roomId) }
}

// ── kickSeat (host only) ───────────────────────────────────────────────────────────
// Host removes another occupied seat from the lobby; the freed slot reopens live for
// everyone via the tlmn_seats DELETE event. Lobby-only. The host can never kick their
// own seat (they use Leave). Works on a human seat (a lobby bot has its own removeBot
// path, but kicking one is harmless). Returns the fresh authoritative state so the host
// updates instantly without waiting on the realtime broadcast.
export async function kickSeat(roomId: string, seatIndex: number): Promise<SeatResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { state: null, error: 'not_logged_in' }

  const admin = createAdminClient()
  const state = await readState(admin, roomId)
  if (!state) return { state: null, error: 'not_found' }
  if (state.room.status !== 'lobby') return { state, error: 'not_in_lobby' }

  const mySeat = state.seats.find(s => s.user_id === user.id)
  if (!mySeat || mySeat.seat_index !== state.room.host_seat) return { state, error: 'not_host' }
  if (seatIndex === state.room.host_seat) return { state, error: 'cannot_kick_host' }

  await admin.from('tlmn_seats').delete().eq('room_id', roomId).eq('seat_index', seatIndex)
  return { state: await readState(admin, roomId) }
}

// ── pruneStaleLobbySeats ───────────────────────────────────────────────────────────
// Free lobby seats whose human occupant has stopped heart-beating (closed tab) so the
// slot reopens for everyone in realtime. There is no long-lived server, so this is
// NUDGED by any still-connected client on its heartbeat tick (the same pattern as the
// timeout reaper / bot driver); the caller is by definition fresh, so it never prunes
// itself. Lobby-only — a seat in a live round is handed to a bot (leaveSeat/timeout),
// never deleted. Bots and seats that have not heart-beaten yet are left alone. Migrates
// the host and tears down a room left with no humans, exactly like leaveSeat.
export async function pruneStaleLobbySeats(roomId: string): Promise<void> {
  const admin = createAdminClient()
  const { data: room } = await admin
    .from('tlmn_rooms').select('host_seat, status').eq('id', roomId).maybeSingle()
  if (!room || room.status !== 'lobby') return

  const { data: seats } = await admin
    .from('tlmn_seats').select('id, seat_index, user_id, is_bot, last_seen').eq('room_id', roomId)
  const rows = (seats ?? []) as Array<{
    id: string; seat_index: number; user_id: string | null; is_bot: boolean; last_seen: string | null
  }>

  const cutoff = Date.now() - LOBBY_SEAT_STALE_MS
  const stale = rows.filter(s =>
    s.user_id && !s.is_bot && s.last_seen != null && new Date(s.last_seen).getTime() < cutoff,
  )
  if (stale.length === 0) return

  for (const s of stale) await admin.from('tlmn_seats').delete().eq('id', s.id)

  const { data: remaining } = await admin
    .from('tlmn_seats').select('seat_index, user_id, is_bot, bot_takeover')
    .eq('room_id', roomId).order('seat_index', { ascending: true })
  const left = (remaining ?? []) as Array<{
    seat_index: number; user_id: string | null; is_bot: boolean; bot_takeover: boolean
  }>

  // No humans left (empty, or only orphaned bots) → tear the lobby down.
  if (left.length === 0 || left.every(r => !r.user_id || r.is_bot)) {
    await admin.from('tlmn_rooms').delete().eq('id', roomId)
    return
  }

  // Host fell away → migrate to the lowest present human, else the lowest seat.
  if (stale.some(s => s.seat_index === room.host_seat)) {
    const human = left.find(r => r.user_id && !r.bot_takeover)
    const target = (human ?? left[0]).seat_index
    await admin.from('tlmn_rooms').update({ host_seat: target }).eq('id', roomId)
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 3 — server-authoritative play (hidden hands).
// The engine (lib/games/tlmn) is the single source of truth. All hand writes go
// through the service role; clients only ever assert which cards they WANT to play.
// ═══════════════════════════════════════════════════════════════════════════════

// Grace window: a move is accepted up to GRACE_MS past the turn deadline; the
// timeout reaper only acts once now() is past deadline + GRACE_MS — so there is no
// dead zone and the player always has priority right at the buzzer.
const GRACE_MS = 3000

export type TlmnTrick = { cards: Card[]; by_seat: number } | null
export type TlmnGameResult = {
  deltas: Record<string, number>
  instant: { seat: number; type: InstantWinType } | null
  winner: number | null
  // Itemized đếm-lá breakdown for the scoreboard (presentation only — same totals).
  breakdown?: RoundBreakdown | null
}
export type TlmnPublicGame = {
  id: string
  room_id: string
  round_no: number
  status: 'playing' | 'ended'
  seats: number[]
  turn_seat: number | null
  trick: TlmnTrick
  pass_flags: number[]
  card_counts: Record<string, number>
  played_counts: Record<string, number>
  must_three_spade: boolean
  turn_deadline: string | null
  turn_started_at: string | null
  nhat_seat: number | null
  chat_events: CutEvent[]
  rules: Rules
  result: TlmnGameResult | null
}

// ── Round ↔ DB mapping ─────────────────────────────────────────────────────────
async function loadHands(admin: Admin, gameId: string): Promise<Record<number, Card[]>> {
  const { data } = await admin.from('tlmn_hands').select('seat, cards').eq('game_id', gameId)
  const out: Record<number, Card[]> = {}
  for (const row of (data ?? []) as Array<{ seat: number; cards: Card[] }>) out[row.seat] = row.cards
  return out
}

async function latestGame(admin: Admin, roomId: string, onlyPlaying = false): Promise<TlmnPublicGame | null> {
  let q = admin.from('tlmn_games').select('*').eq('room_id', roomId)
  if (onlyPlaying) q = q.eq('status', 'playing')
  const { data } = await q.order('round_no', { ascending: false }).limit(1).maybeSingle()
  return (data as TlmnPublicGame | null) ?? null
}

function roundFromDb(row: TlmnPublicGame, hands: Record<number, Card[]>): RoundState {
  return {
    seats: row.seats,
    roundNo: row.round_no,
    rules: row.rules,
    hands,
    turnSeat: row.turn_seat ?? row.seats[0],
    trick: row.trick ? { cards: row.trick.cards, bySeat: row.trick.by_seat } : null,
    passed: row.pass_flags ?? [],
    playedCount: (row.played_counts ?? {}) as unknown as Record<number, number>,
    cutEvents: row.chat_events ?? [],
    mustIncludeThreeSpade: row.must_three_spade,
    status: row.status,
    winner: row.nhat_seat,
    instantWin: row.result?.instant ?? null,
    deltas: (row.result?.deltas ?? null) as unknown as Record<number, number> | null,
  }
}

// Mutable columns derived from a (post-action) round. A playing round gets a fresh
// per-turn deadline; an ended round clears the clock and writes the result.
function gameColumns(round: RoundState): Record<string, unknown> {
  const playing = round.status === 'playing'
  const now = Date.now()
  return {
    status: round.status,
    turn_seat: playing ? round.turnSeat : null,
    trick: round.trick ? { cards: round.trick.cards, by_seat: round.trick.bySeat } : null,
    pass_flags: round.passed,
    card_counts: cardCounts(round),
    played_counts: round.playedCount,
    must_three_spade: round.mustIncludeThreeSpade,
    turn_deadline: playing ? new Date(now + round.rules.turnSeconds * 1000).toISOString() : null,
    turn_started_at: playing ? new Date(now).toISOString() : null,
    nhat_seat: round.winner,
    chat_events: round.cutEvents,
    result: round.status === 'ended'
      ? {
          deltas: round.deltas ?? {},
          instant: round.instantWin,
          winner: round.winner,
          breakdown: explainSettlement(
            {
              seats: round.seats,
              winner: round.winner ?? round.seats[0],
              hands: round.hands,
              playedCount: round.playedCount,
              cutEvents: round.cutEvents,
              instantWin: round.instantWin,
            },
            round.rules,
          ),
        }
      : null,
  }
}

// Fold a finished round's per-seat deltas into the cumulative seat scores.
async function applyScores(admin: Admin, roomId: string, deltas: Record<number, number>): Promise<void> {
  const { data: seats } = await admin
    .from('tlmn_seats').select('id, seat_index, cumulative_score').eq('room_id', roomId)
  for (const s of (seats ?? []) as Array<{ id: string; seat_index: number; cumulative_score: number }>) {
    const d = deltas[s.seat_index]
    if (!d) continue
    await admin.from('tlmn_seats').update({ cumulative_score: (s.cumulative_score ?? 0) + d }).eq('id', s.id)
  }
}

// ── Coin settlement (Run 7 — persistent virtual-coin economy) ─────────────────────
// Persist the authoritative ĐẾM LÁ per-seat deltas as coin deltas for every REAL
// (authenticated, non-bot) player. This is the ONLY place coins move during play and
// it runs ONLY from the trusted server round-end path. The actual balance math,
// clamping, ledger and once-only guard all live in the settle_round SECURITY DEFINER
// function; idempotency is keyed on (game_code = room_id, round_number) so a reconnect
// or retry can never double-apply. Bots have no wallet and are skipped. Best-effort:
// a settlement hiccup must never break gameplay (scores are already applied).
// Seat indices that already settled a VOLUNTARY-EXIT forfeit this round (a coin sink,
// charged the instant they confirmed leaving). They are excluded from the round-end
// zero-sum settlement so they are never charged twice. Degrade-safe: if the forfeit
// migration is not yet applied the query errors → treated as "no forfeits" (the game
// keeps working exactly as before).
async function forfeitedSeats(admin: Admin, roomId: string, roundNo: number): Promise<Set<number>> {
  const { data, error } = await admin
    .from('tlmn_forfeits').select('seat_index').eq('room_id', roomId).eq('round_no', roundNo)
  if (error || !data) return new Set()
  return new Set((data as Array<{ seat_index: number }>).map(r => r.seat_index))
}

// Coin deltas to apply at round-end, with any forfeited seats removed. When nobody
// forfeited (the overwhelmingly common case) this is exactly the round's authoritative
// deltas — zero behaviour change. When a seat forfeited, the zero-sum đếm-lá is RE-derived
// over only the live (non-forfeited) seats so the winner's payout stays balanced and no
// coins are created or destroyed beyond the separate forfeit sink. If the round's winner
// is itself a forfeited (bot-piloted) seat — i.e. nobody live "won" — the live players keep
// their coins (no movement), which is also balanced.
function coinDeltasFor(round: RoundState, forfeited: Set<number>): Record<number, number> {
  const full = (round.deltas ?? {}) as Record<number, number>
  if (forfeited.size === 0) return full
  // Tới trắng ends the round at the deal, before anyone can leave — a forfeit can't
  // co-occur, so fall back to the stored deltas unchanged.
  if (round.instantWin) return full

  const live = round.seats.filter(s => !forfeited.has(s))
  const winner = round.winner
  if (winner == null || !live.includes(winner)) return {}

  const hands: Record<number, Card[]> = {}
  const played: Record<number, number> = {}
  for (const s of live) { hands[s] = round.hands[s] ?? []; played[s] = round.playedCount[s] ?? 0 }
  const cuts = round.cutEvents.filter(e => !forfeited.has(e.cutVictim) && !forfeited.has(e.cutter))
  return settleRound(
    { seats: live, winner, hands, playedCount: played, cutEvents: cuts, instantWin: null },
    round.rules,
  )
}

async function settleRoundCoins(
  admin: Admin,
  roomId: string,
  roundNo: number,
  round: RoundState,
): Promise<void> {
  // MODE A (practice) is play-only: round results display but never touch the
  // persisted "xu" balance. Settlement runs ONLY for real multiplayer rooms.
  const { data: room } = await admin.from('tlmn_rooms').select('mode').eq('id', roomId).maybeSingle()
  if (room?.mode === 'practice') return

  const forfeited = await forfeitedSeats(admin, roomId, roundNo)
  const deltas = coinDeltasFor(round, forfeited)

  const { data: seats } = await admin
    .from('tlmn_seats').select('seat_index, user_id, is_bot').eq('room_id', roomId)
  const results: Array<{ user_id: string; delta: number }> = []
  for (const s of (seats ?? []) as Array<{ seat_index: number; user_id: string | null; is_bot: boolean }>) {
    if (!s.user_id || s.is_bot) continue // bots / empty seats have no wallet
    if (forfeited.has(s.seat_index)) continue // already settled via the forfeit sink — never twice
    const d = deltas[s.seat_index]
    if (!d) continue // skip unaffected (0 / undefined) seats
    results.push({ user_id: s.user_id, delta: d })
  }
  if (results.length === 0) return
  try {
    await admin.rpc('settle_round', {
      p_game_code: roomId, p_round_number: roundNo, p_results: results,
    })
  } catch {
    // Never let a wallet error wedge the round — đếm-lá scores are already persisted.
  }
}

// ── Achievement stats (leaderboard) — server-authoritative, idempotent ─────────────
// Fold a finished round into public.game_player_stats for every REAL (authenticated,
// non-bot) participant: +1 game for each, +1 win for the round's winner. This is the ONLY
// place wins are recorded and it runs ONLY from the trusted round-end path — the win count
// can never be claimed by an untrusted client. The math, streaks and the once-only guard
// (keyed on room_id + round_number) live in the record_tlmn_round SECURITY DEFINER
// function, so a reconnect/retry can never double-count. Practice (vs bots) is unranked,
// matching settleRoundCoins. A bot/AFK-takeover winner records no win (winner = null) but
// the round still counts as a game for the humans. Best-effort: never wedge the round.
async function recordRoundStats(
  admin: Admin,
  roomId: string,
  roundNo: number,
  round: RoundState,
): Promise<void> {
  const { data: room } = await admin.from('tlmn_rooms').select('mode').eq('id', roomId).maybeSingle()
  if (room?.mode === 'practice') return // MODE A is unranked

  // A seat that voluntarily forfeited this round is still a real participant (+1 game,
  // counted as a loss because it is never the recorded winner) — but if a bot piloting
  // that abandoned hand happens to go out first, that "win" must NOT be credited to the
  // quitter. Treat a forfeited winner as no winner (like an AFK/bot-takeover winner).
  const forfeited = await forfeitedSeats(admin, roomId, roundNo)

  const { data: seats } = await admin
    .from('tlmn_seats').select('seat_index, user_id, is_bot').eq('room_id', roomId)
  const players: string[] = []
  let winner: string | null = null
  for (const s of (seats ?? []) as Array<{ seat_index: number; user_id: string | null; is_bot: boolean }>) {
    if (!s.user_id || s.is_bot) continue // bots / empty seats are not ranked
    players.push(s.user_id)
    if (round.winner != null && !forfeited.has(round.winner) && s.seat_index === round.winner) winner = s.user_id
  }
  if (players.length === 0) return
  try {
    await admin.rpc('record_tlmn_round', {
      p_room_id: roomId, p_round_number: roundNo, p_winner: winner, p_players: players,
    })
  } catch {
    // A stats hiccup must never break gameplay — the round result is already persisted.
  }
}

// Deal a round and persist the public game row + all secret hands. Used by both the
// initial Start and "Ván mới". Handles the tới-trắng instant end transparently.
async function dealAndPersist(
  admin: Admin,
  roomId: string,
  seats: number[],
  roundNo: number,
  rules: Rules,
  previousWinner: number | null,
): Promise<void> {
  // A fresh round starts everyone in HUMAN control again: clear any stale AFK takeover
  // (and miss counter) left over from a previous round/game so a present player is never
  // auto-piloted from the first turn. Real lobby bots keep is_bot=true and still play; a
  // genuinely-absent human simply re-triggers takeover after actually timing out.
  await admin.from('tlmn_seats')
    .update({ missed_turns: 0, bot_takeover: false })
    .eq('room_id', roomId)

  const round = dealRound({ seats, roundNo, rules, previousWinner })

  const { data: game } = await admin
    .from('tlmn_games')
    .insert({ room_id: roomId, round_no: roundNo, seats, rules, ...gameColumns(round) })
    .select('id')
    .single()
  if (!game) return

  const handRows = seats.map(seat => ({ game_id: game.id, seat, cards: round.hands[seat] }))
  await admin.from('tlmn_hands').insert(handRows)

  if (round.status === 'ended' && round.deltas) {
    await applyScores(admin, roomId, round.deltas)
    await settleRoundCoins(admin, roomId, roundNo, round)
    await recordRoundStats(admin, roomId, roundNo, round)
  }
}

// Commit a post-action round. The game-row UPDATE is guarded on (status='playing',
// turn_seat=actingSeat) so two racing actors (player vs. the timeout reaper, or a
// double-submit) can't both apply — exactly one wins; the loser is a no-op. Hands
// and scores are written only AFTER the guarded row update succeeds.
async function commitRound(
  admin: Admin,
  roomId: string,
  gameId: string,
  actingSeat: number,
  round: RoundState,
  changedSeats: number[],
): Promise<ActionResult> {
  const { data: updated } = await admin
    .from('tlmn_games')
    .update(gameColumns(round))
    .eq('id', gameId)
    .eq('status', 'playing')
    .eq('turn_seat', actingSeat)
    .select('id')
  if (!updated || updated.length === 0) return { error: 'conflict' }

  for (const seat of changedSeats) {
    await admin.from('tlmn_hands').update({ cards: round.hands[seat] }).eq('game_id', gameId).eq('seat', seat)
  }
  if (round.status === 'ended' && round.deltas) {
    await applyScores(admin, roomId, round.deltas)
    await settleRoundCoins(admin, roomId, round.roundNo, round)
    await recordRoundStats(admin, roomId, round.roundNo, round)
  }
  return null
}

function isExpired(deadline: string | null): boolean {
  if (!deadline) return false
  return Date.now() > new Date(deadline).getTime() + GRACE_MS
}

// ── fetchGameState ───────────────────────────────────────────────────────────────
// The latest game row (public — counts only) for the room. Used on mount and to
// reconcile after the realtime channel (re)subscribes.
export async function fetchGameState(roomId: string): Promise<TlmnPublicGame | null> {
  return latestGame(createAdminClient(), roomId)
}

// ── fetchMyHand ──────────────────────────────────────────────────────────────────
// Returns ONLY the caller's own cards. Deliberately uses the user-scoped (anon)
// client so RLS physically prevents reading any other seat's hand — the network
// payload can never contain an opponent's cards even if the server is wrong.
export async function fetchMyHand(roomId: string): Promise<{ seat: number; cards: Card[] } | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: game } = await supabase
    .from('tlmn_games').select('id').eq('room_id', roomId).eq('status', 'playing')
    .order('round_no', { ascending: false }).limit(1).maybeSingle()
  if (!game) return null

  const { data: hand } = await supabase
    .from('tlmn_hands').select('seat, cards').eq('game_id', game.id).maybeSingle()
  if (!hand) return null
  return { seat: hand.seat as number, cards: (hand.cards ?? []) as Card[] }
}

// ── playCards ────────────────────────────────────────────────────────────────────
export async function playCards(roomId: string, cards: Card[]): Promise<ActionResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'not_logged_in' }

  const admin = createAdminClient()
  const mySeat = await seatIndexOf(admin, roomId, user.id)
  if (mySeat == null) return { error: 'not_seated' }

  const game = await latestGame(admin, roomId, true)
  if (!game) return { error: 'no_active_game' }
  if (game.turn_seat !== mySeat) return { error: 'not_your_turn' }
  if (isExpired(game.turn_deadline)) return { error: 'turn_expired' }

  const hands = await loadHands(admin, game.id)
  const round = roundFromDb(game, hands)
  const res = applyPlay(round, mySeat, cards)
  if (!res.ok) return { error: res.error }

  const committed = await commitRound(admin, roomId, game.id, mySeat, res.state, [mySeat])
  if (!committed) await clearMisses(admin, roomId, mySeat)
  return committed
}

// ── passTurn ─────────────────────────────────────────────────────────────────────
export async function passTurn(roomId: string): Promise<ActionResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'not_logged_in' }

  const admin = createAdminClient()
  const mySeat = await seatIndexOf(admin, roomId, user.id)
  if (mySeat == null) return { error: 'not_seated' }

  const game = await latestGame(admin, roomId, true)
  if (!game) return { error: 'no_active_game' }
  if (game.turn_seat !== mySeat) return { error: 'not_your_turn' }
  if (isExpired(game.turn_deadline)) return { error: 'turn_expired' }

  const hands = await loadHands(admin, game.id)
  const round = roundFromDb(game, hands)
  const res = applyPass(round, mySeat)
  if (!res.ok) return { error: res.error }

  const committed = await commitRound(admin, roomId, game.id, mySeat, res.state, [])
  if (!committed) await clearMisses(admin, roomId, mySeat)
  return committed
}

// A human acted of their own accord → they're present; reset the AFK counter.
async function clearMisses(admin: Admin, roomId: string, seatIndex: number): Promise<void> {
  await admin.from('tlmn_seats')
    .update({ missed_turns: 0 })
    .eq('room_id', roomId).eq('seat_index', seatIndex)
}

// ── tickTurnTimer ────────────────────────────────────────────────────────────────
// Server-authoritative timeout safety net. Any seated client may call this when it
// sees the deadline pass; the server re-checks now() against the AUTHORITATIVE
// deadline and, if truly expired, auto-passes (or auto-plays the lowest legal single
// when the timed-out player is leading and cannot pass). Idempotent.
export async function tickTurnTimer(roomId: string): Promise<ActionResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'not_logged_in' }

  const admin = createAdminClient()
  const game = await latestGame(admin, roomId, true)
  if (!game || game.turn_seat == null) return null
  if (!isExpired(game.turn_deadline)) return null // not yet — nothing to do

  const hands = await loadHands(admin, game.id)
  const round = roundFromDb(game, hands)
  const wasLeading = round.trick === null
  const timedOutSeat = round.turnSeat
  const res = applyTimeout(round)
  if (!res.ok) return { error: res.error }

  // A leading timeout auto-PLAYS (hand changes); a following timeout auto-PASSES.
  const changed = wasLeading ? [timedOutSeat] : []
  const committed = await commitRound(admin, roomId, game.id, timedOutSeat, res.state, changed)
  if (committed) return committed // a conflicting actor already advanced this turn

  // The commit is OURS → this was a genuine miss. Count it against a HUMAN seat and,
  // after enough misses (or once the tab has gone offline), hand the seat to a bot
  // for the rest of the round. Real lobby bots / already-taken-over seats are skipped.
  const { data: seat } = await admin.from('tlmn_seats')
    .select('id, user_id, is_bot, bot_takeover, missed_turns, last_seen')
    .eq('room_id', roomId).eq('seat_index', timedOutSeat).maybeSingle()
  if (seat && seat.user_id && !seat.is_bot && !seat.bot_takeover) {
    const missed = (seat.missed_turns ?? 0) + 1
    const offline = !seat.last_seen || Date.now() - new Date(seat.last_seen).getTime() > OFFLINE_MS
    await admin.from('tlmn_seats')
      .update({ missed_turns: missed, bot_takeover: missed >= MISSED_TURNS_TAKEOVER || offline })
      .eq('id', seat.id)
  }
  return null
}

// ── runBotTurn ───────────────────────────────────────────────────────────────────
// Drives a bot-controlled turn. Like the timeout reaper, it's NUDGED by any client
// (there is no long-lived server) and is fully server-authoritative + idempotent: it
// only acts when the current turn belongs to a bot seat (a real lobby bot OR a human
// under AFK takeover) AND a randomized think delay has elapsed since the turn opened.
// The chosen move comes from the engine's legalMoves (see bot.ts) and is committed
// through the SAME guarded path a human uses, so a bot can never play illegally and
// two racing nudges can never both apply.
export async function runBotTurn(roomId: string): Promise<ActionResult> {
  const admin = createAdminClient()
  const game = await latestGame(admin, roomId, true)
  if (!game || game.turn_seat == null || !game.turn_started_at) return null

  const { data: seat } = await admin.from('tlmn_seats')
    .select('is_bot, bot_takeover')
    .eq('room_id', roomId).eq('seat_index', game.turn_seat).maybeSingle()
  if (!seat || !(seat.is_bot || seat.bot_takeover)) return null // not a bot turn

  // Server-side think delay: deterministic per turn so every nudging client agrees.
  const elapsed = Date.now() - new Date(game.turn_started_at).getTime()
  if (elapsed < botDelay(game.turn_started_at, game.turn_seat)) return null

  const actingSeat = game.turn_seat
  const hands = await loadHands(admin, game.id)
  const round = roundFromDb(game, hands)

  // PROMOTED policy: the trained expert AI (ai/weights ACTIVE_POLICY_VERSION) decides,
  // building only a PUBLIC view (own hand + opponent COUNTS) — it never sees hidden
  // hands. A per-turn deterministic seed makes every nudging client agree. Rollback:
  // replace this line with `chooseBotMove(round, actingSeat)` (the legacy bot) — it
  // stays fully intact and tested.
  const turnSeed = `${game.id}|${actingSeat}|${game.turn_started_at}`
  let move: { type: 'play'; cards: Card[] } | { type: 'pass' }
  try {
    move = chooseBotMoveAI(round, actingSeat, { difficulty: 'expert', seed: turnSeed })
  } catch {
    move = chooseBotMove(round, actingSeat) // never let an AI error wedge a bot turn
  }
  let res = move.type === 'play' ? applyPlay(round, actingSeat, move.cards) : applyPass(round, actingSeat)

  // Development-only AI audit (gated, off in production). Logs ONLY the bot's own
  // hand + the public table — never another player's hidden cards.
  if (process.env.TLMN_BOT_DEBUG === '1') {
    const view = policyViewFromRound(round, actingSeat)
    const ai = chooseAiMove(view, { difficulty: 'expert', seed: turnSeed })
    console.log('[tlmn-bot]', JSON.stringify({
      ...botMoveAudit(round, actingSeat),
      aiExplanation: ai.explanation.text,
      usedSearch: ai.usedSearch,
      validationResult: res.ok ? 'ok' : res.error,
    }))
  }

  // The AI is provably legal (picks from engine legalMoves), but never trust a single
  // source: fall back to the always-legal timeout move so a bot turn can't wedge the round.
  if (!res.ok) res = applyTimeout(round)
  if (!res.ok) return { error: res.error }

  const changed = res.state.hands[actingSeat].length !== round.hands[actingSeat].length ? [actingSeat] : []
  return commitRound(admin, roomId, game.id, actingSeat, res.state, changed)
}

// Deterministic randomized think delay in [BOT_MIN_DELAY_MS, BOT_MAX_DELAY_MS].
function botDelay(startedAt: string, seat: number): number {
  const base = new Date(startedAt).getTime() + seat * 1009
  const frac = Math.abs(Math.sin(base)) // stable pseudo-random 0..1
  return BOT_MIN_DELAY_MS + Math.floor(frac * (BOT_MAX_DELAY_MS - BOT_MIN_DELAY_MS))
}

// ── startNextRound (host only) — "Ván mới" ───────────────────────────────────────
export async function startNextRound(roomId: string): Promise<ActionResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'not_logged_in' }

  const admin = createAdminClient()
  const state = await readState(admin, roomId)
  if (!state) return { error: 'not_found' }
  if (state.room.status !== 'playing') return { error: 'not_playing' }

  const mySeat = state.seats.find(s => s.user_id === user.id)
  if (!mySeat || mySeat.seat_index !== state.room.host_seat) return { error: 'not_host' }

  // Entry gate also applies to "Ván mới": the host needs coins to open the next round.
  // Practice (MODE A) never charges, so it can always re-deal — even at 0 coins.
  if (state.room.mode !== 'practice') {
    const { balance } = await ensureWallet()
    if (balance < ENTRY_MIN_BALANCE) return { error: 'insufficient_coins' }
  }

  const prev = await latestGame(admin, roomId)
  if (!prev) return { error: 'no_game' }
  if (prev.status !== 'ended') return { error: 'round_in_progress' }

  // Re-deal to the seats still present (≥2). Previous Nhất leads the new round.
  const seats = state.seats.map(s => s.seat_index).sort((a, b) => a - b)
  if (seats.length < 2) return { error: 'not_enough_players' }

  const rules = resolveRules(state.room.settings?.rules)
  const previousWinner = prev.nhat_seat != null && seats.includes(prev.nhat_seat) ? prev.nhat_seat : null
  await dealAndPersist(admin, roomId, seats, prev.round_no + 1, rules, previousWinner)
  return null
}

// Resolve the caller's seat index in a room, or null if not seated.
async function seatIndexOf(admin: Admin, roomId: string, userId: string): Promise<number | null> {
  const { data } = await admin
    .from('tlmn_seats').select('seat_index').eq('room_id', roomId).eq('user_id', userId).maybeSingle()
  return data ? (data.seat_index as number) : null
}

// ── Phase 3: interaction economy (server-validated coin spend) ──────────────────────
export type InteractionCatalogRow = {
  key: string; coin_cost: number; free_daily_limit: number; is_enabled: boolean
}

// Public config (enabled AND disabled rows) so the client can hide disabled items and show
// prices. Visuals live in code; only economy/enable fields come from the DB. Empty on any
// error or before the migration is applied ⇒ the client falls back to "all items free".
export async function fetchInteractionCatalog(): Promise<InteractionCatalogRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('game_interaction_catalog')
    .select('key, coin_cost, free_daily_limit, is_enabled')
  if (error || !data) return []
  return data.map(r => ({
    key: r.key as string,
    coin_cost: Number(r.coin_cost ?? 0),
    free_daily_limit: Number(r.free_daily_limit ?? 0),
    is_enabled: !!r.is_enabled,
  }))
}

// Server-authoritative spend for a paid interaction. Called BEFORE the client broadcasts a
// throwable; the client only emits on { ok }. Deduction is atomic + idempotent (event id)
// inside spend_interaction(). Never deducts on a failed validation.
export async function spendInteraction(
  roomId: string, key: string, eventId: string,
): Promise<
  | { ok: true; wasFree: boolean; cost: number; balance: number }
  | { ok: false; error: string }
> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'not_logged_in' }
  const { data, error } = await supabase.rpc('spend_interaction', {
    p_event_id: eventId, p_room_id: roomId, p_key: key,
  })
  if (error) {
    const m = error.message || ''
    if (m.includes('insufficient_coins')) return { ok: false, error: 'insufficient_coins' }
    if (m.includes('item_disabled')) return { ok: false, error: 'item_disabled' }
    if (m.includes('not_authenticated')) return { ok: false, error: 'not_logged_in' }
    return { ok: false, error: 'spend_failed' }
  }
  const row = data as { was_free: boolean; cost: number; balance: number }
  return { ok: true, wasFree: !!row.was_free, cost: Number(row.cost ?? 0), balance: Number(row.balance ?? 0) }
}

// ── Phase 4: moderation — report a player ───────────────────────────────────────────
// Files a report as the caller (server resolves auth.uid()). recentEvent carries ONLY
// interaction keys/seats (no chat, no PII). Rate-limited inside report_player(). The
// reported user id comes from the (already public) seat list, never private account data.
export async function reportPlayer(
  reportedUserId: string,
  roomId: string,
  reason: string,
  recentEvent: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'not_logged_in' }
  const { error } = await supabase.rpc('report_player', {
    p_reported_user_id: reportedUserId,
    p_room_id: roomId,
    p_reason: reason,
    p_recent_event: (recentEvent ?? null) as never,
  })
  if (error) {
    const m = error.message || ''
    if (m.includes('invalid_target')) return { ok: false, error: 'invalid_target' }
    if (m.includes('invalid_reason')) return { ok: false, error: 'invalid_reason' }
    if (m.includes('not_authenticated')) return { ok: false, error: 'not_logged_in' }
    return { ok: false, error: 'report_failed' }
  }
  return { ok: true }
}

// ── Achievements / Leaderboard (public, paginated, ranked IN POSTGRES) ──────────────
// Reads the SECURITY DEFINER leaderboard RPCs which return ONLY safe public fields
// (no email / auth metadata) and rank + paginate server-side, so the browser never
// fetches the whole user table. bigint/numeric columns arrive as strings over the wire
// (PostgREST preserves precision) → coerced to numbers here. Balances ≤ ~9e15 are exact
// in JS, far above any reachable "xu" balance.
export type TlmnLeaderboardTab = 'wins' | 'coins'
export type TlmnLeaderboardRow = {
  user_id: string
  display_name: string | null
  avatar_url: string | null
  total_games: number
  total_wins: number
  total_losses: number
  win_rate: number
  balance: number
  rank: number
}

type RawLeaderboardRow = {
  user_id: string
  display_name: string | null
  avatar_url: string | null
  total_games: number | string | null
  total_wins: number | string | null
  total_losses: number | string | null
  win_rate: number | string | null
  balance: number | string | null
  rank: number | string | null
}

export async function fetchTlmnLeaderboard(
  tab: TlmnLeaderboardTab,
  limit = 20,
  offset = 0,
): Promise<{ rows: TlmnLeaderboardRow[]; error?: string }> {
  const supabase = createClient()
  const fn = tab === 'coins' ? 'tlmn_coins_leaderboard' : 'tlmn_wins_leaderboard'
  const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 100)
  const safeOffset = Math.max(0, Math.floor(offset))
  const { data, error } = await supabase.rpc(fn, { p_limit: safeLimit, p_offset: safeOffset })
  if (error) return { rows: [], error: 'load_failed' }
  const raw = (data ?? []) as RawLeaderboardRow[]

  // The RPC already joins profiles fresh; fill any remaining gaps (OAuth users whose
  // profiles.avatar_url is still null) from auth metadata via the same resolver the room
  // uses, so the board shows each user's CURRENT account avatar — never a stale snapshot.
  let resolved = new Map<string, ProfileInfo>()
  try {
    resolved = await resolveProfiles(createAdminClient(), raw.map(r => r.user_id))
  } catch { /* leaderboard still renders with the RPC's profile fields */ }

  const rows = raw.map(r => {
    const p = resolved.get(r.user_id)
    return {
      user_id: r.user_id,
      display_name: (p?.name || r.display_name) ?? null,
      avatar_url: p?.avatar ?? r.avatar_url ?? null,
      total_games: Number(r.total_games ?? 0),
      total_wins: Number(r.total_wins ?? 0),
      total_losses: Number(r.total_losses ?? 0),
      win_rate: Number(r.win_rate ?? 0),
      balance: Number(r.balance ?? 0),
      rank: Number(r.rank ?? 0),
    }
  })
  return { rows }
}

// Batch current balances for a set of users → the caller derives each coin tier from the
// CURRENT balance (single source of truth in lib/games/coinTier). Used to badge opponents
// in the game room and other shared-avatar surfaces. Authenticated-only RPC; bots/empty
// ids are simply absent from the result.
export async function fetchCoinBalances(userIds: string[]): Promise<Record<string, number>> {
  const ids = Array.from(new Set(userIds.filter(Boolean))).slice(0, 64)
  if (ids.length === 0) return {}
  const supabase = createClient()
  const { data, error } = await supabase.rpc('tlmn_public_balances', { p_user_ids: ids })
  if (error || !data) return {}
  const out: Record<string, number> = {}
  for (const row of data as Array<{ user_id: string; balance: number | string }>) {
    out[row.user_id] = Number(row.balance ?? 0)
  }
  return out
}
