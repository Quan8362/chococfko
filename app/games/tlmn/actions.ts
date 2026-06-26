'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ── Types ───────────────────────────────────────────────────────────────────────
export type TlmnStatus = 'lobby' | 'playing' | 'ended'

export type TlmnSettings = {
  rules?: string        // rules/score preset key — no effect yet (Phase 1 stub)
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
}

export type TlmnRoomState = { room: TlmnRoom; seats: TlmnSeat[] }
export type SeatResult = { state: TlmnRoomState | null; error?: string }
export type ActionResult = { error: string } | null

const MAX_SEATS = 4

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
// Phase 1: only flips the room to 'playing' once ≥2 seats are ready. The deal lands
// in Phase 3. Idempotent: the status='lobby' guard means a double-click is a no-op.
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

  const readyCount = state.seats.filter(s => s.is_ready).length
  if (readyCount < 2) return { error: 'not_enough_ready' }

  const { data: updated } = await admin
    .from('tlmn_rooms').update({ status: 'playing' })
    .eq('id', roomId).eq('status', 'lobby').select('id')
  if (!updated || updated.length === 0) return { error: 'already_started' }
  return null
}

// ── updateSettings (host only) ───────────────────────────────────────────────────
export async function updateSettings(roomId: string, settings: TlmnSettings): Promise<ActionResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'not_logged_in' }

  const admin = createAdminClient()
  const state = await readState(admin, roomId)
  if (!state) return { error: 'not_found' }
  if (state.room.status !== 'lobby') return { error: 'not_in_lobby' }

  const mySeat = state.seats.find(s => s.user_id === user.id)
  if (!mySeat || mySeat.seat_index !== state.room.host_seat) return { error: 'not_host' }

  await admin.from('tlmn_rooms').update({ settings }).eq('id', roomId)
  return null
}

// ── leaveSeat ────────────────────────────────────────────────────────────────────
// Free the leaver's seat. If they were the host, migrate host to the lowest
// remaining occupied seat. If the room empties out, delete it (cascades seats).
export async function leaveSeat(roomId: string): Promise<ActionResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'not_logged_in' }

  const admin = createAdminClient()
  const { data: seat } = await admin
    .from('tlmn_seats').select('id, seat_index')
    .eq('room_id', roomId).eq('user_id', user.id).maybeSingle()
  if (!seat) return null // already gone

  await admin.from('tlmn_seats').delete().eq('id', seat.id)

  const { data: remaining } = await admin
    .from('tlmn_seats').select('seat_index')
    .eq('room_id', roomId).order('seat_index', { ascending: true })

  const rows = (remaining ?? []) as Array<{ seat_index: number }>
  if (rows.length === 0) {
    await admin.from('tlmn_rooms').delete().eq('id', roomId)
    return null
  }

  // Host migration: if the leaver held the host seat, hand it to the lowest seat.
  const { data: room } = await admin.from('tlmn_rooms').select('host_seat').eq('id', roomId).maybeSingle()
  if (room && room.host_seat === seat.seat_index) {
    await admin.from('tlmn_rooms').update({ host_seat: rows[0].seat_index }).eq('id', roomId)
  }
  return null
}

// ── heartbeatRoom ────────────────────────────────────────────────────────────────
// Keep the caller's seat marked connected while the tab is open (mirrors the
// caro/chess waiting-room heartbeat).
export async function heartbeatRoom(roomId: string): Promise<void> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const admin = createAdminClient()
  await admin.from('tlmn_seats')
    .update({ connected: true })
    .eq('room_id', roomId).eq('user_id', user.id)
}
