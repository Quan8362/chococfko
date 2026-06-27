'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  resolveRules, pickHostOverride, explainSettlement, type Card, type Rules,
  type HostRulesOverride, type CutEvent, type InstantWinType, type RoundBreakdown,
} from '@/lib/games/tlmn/engine'
import {
  dealRound, applyPlay, applyPass, applyTimeout, cardCounts, type RoundState,
} from '@/lib/games/tlmn/round'
import { chooseBotMove } from '@/lib/games/tlmn/bot'
import { ENTRY_MIN_BALANCE } from '@/lib/game/economy'
import { ensureWallet } from './wallet'

// ── Types ───────────────────────────────────────────────────────────────────────
export type TlmnStatus = 'lobby' | 'playing' | 'ended'

export type TlmnSettings = {
  // Host rule override — ONLY the changed fields are stored (untouched ⇒ full ruleset).
  rules?: HostRulesOverride
}

export type TlmnRoom = {
  id: string
  invite_code: string
  host_seat: number
  status: TlmnStatus
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

async function getProfileInfo(
  admin: Admin,
  userId: string,
): Promise<{ name: string; avatar: string | null }> {
  const { data: profile } = await admin
    .from('profiles')
    .select('display_name, avatar_url')
    .eq('id', userId)
    .maybeSingle()
  if (profile?.display_name) return { name: profile.display_name, avatar: profile.avatar_url ?? null }

  const { data: { user } } = await admin.auth.admin.getUserById(userId)
  const name =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split('@')[0] ||
    ''
  const avatar = (user?.user_metadata?.avatar_url as string | undefined) ?? null
  return { name, avatar }
}

async function readState(admin: Admin, roomId: string): Promise<TlmnRoomState | null> {
  const [{ data: room }, { data: seats }] = await Promise.all([
    admin.from('tlmn_rooms').select('*').eq('id', roomId).maybeSingle(),
    admin.from('tlmn_seats').select('*').eq('room_id', roomId).order('seat_index', { ascending: true }),
  ])
  if (!room) return null
  return { room: room as TlmnRoom, seats: (seats ?? []) as TlmnSeat[] }
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
    .insert({ invite_code: code, host_seat: 0, status: 'lobby', settings: {} })
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
    .from('tlmn_rooms').select('host_seat, status').eq('id', roomId).maybeSingle()
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
async function settleRoundCoins(
  admin: Admin,
  roomId: string,
  roundNo: number,
  deltas: Record<number, number>,
): Promise<void> {
  const { data: seats } = await admin
    .from('tlmn_seats').select('seat_index, user_id, is_bot').eq('room_id', roomId)
  const results: Array<{ user_id: string; delta: number }> = []
  for (const s of (seats ?? []) as Array<{ seat_index: number; user_id: string | null; is_bot: boolean }>) {
    if (!s.user_id || s.is_bot) continue // bots / empty seats have no wallet
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
    await settleRoundCoins(admin, roomId, roundNo, round.deltas)
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
    await settleRoundCoins(admin, roomId, round.roundNo, round.deltas)
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

  const move = chooseBotMove(round, actingSeat)
  let res = move.type === 'play' ? applyPlay(round, actingSeat, move.cards) : applyPass(round, actingSeat)
  // chooseBotMove is provably legal, but never trust a single source: fall back to
  // the always-legal timeout move so a bot turn can't wedge the round.
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
  const { balance } = await ensureWallet()
  if (balance < ENTRY_MIN_BALANCE) return { error: 'insufficient_coins' }

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
