'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleMatchFinished } from '@/app/admin/caro/actions'
import { getTranslations } from 'next-intl/server'
import { type CaroHistoryRow } from './CaroHistoryClient'

// ── Types ─────────────────────────────────────────────────────────────────────
export type CaroRoom = {
  id: string
  room_code: string
  player_x: string | null
  player_o: string | null
  current_turn: 'X' | 'O'
  board: (string | null)[]
  status: 'waiting' | 'playing' | 'finished' | 'cancelled'
  winner: 'X' | 'O' | 'draw' | null
  winning_cells: number[]
  created_at: string
  updated_at: string
  finished_at: string | null
  state_version?: number
  turn_started_at?: string | null
  turn_deadline?: string | null
}

export type ActionResult = { error: string } | null

export type WaitingRoom = {
  id: string
  room_code: string
  player_x: string | null
  player_x_name: string
  created_at: string
  updated_at: string  // used as heartbeat proxy for stale detection
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function genCode(): string {
  return Array.from({ length: 5 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('')
}

// Structured, non-PII diagnostic for a failed result-writing operation. Logged
// server-side (captured by Vercel runtime logs) and surfaced to the client as an
// incident id so a failed history/result write is never silently treated as success.
function logResultError(op: string, roomId: string, status: string, err: unknown): string {
  const incidentId = `CARO-SRV-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase()
  // eslint-disable-next-line no-console
  console.error('[caro-result-error]', JSON.stringify({
    incidentId,
    op,
    roomId,
    status,
    buildId: process.env.NEXT_PUBLIC_BUILD_ID ?? null,
    message: err instanceof Error ? err.message : String(err),
    timestamp: new Date().toISOString(),
  }))
  return incidentId
}

// ── createRoom ────────────────────────────────────────────────────────────────
export async function createRoom(): Promise<never> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const board = Array(225).fill(null)

  let roomCode = genCode()
  for (let i = 0; i < 5; i++) {
    const { data } = await admin.from('caro_rooms').select('id').eq('room_code', roomCode).maybeSingle()
    if (!data) break
    roomCode = genCode()
  }

  const { error } = await admin.from('caro_rooms').insert({
    room_code: roomCode,
    player_x: user.id,
    board,
    status: 'waiting',
    current_turn: 'X',
})

  if (error) throw new Error(error.message)
  redirect(`/games/caro/${roomCode}`)
}

// ── joinRoom (by code) ──────────────────────────────────────────────────────────
// Navigates to a room by its code WITHOUT mutating it. Occupying the Player O seat
// is an explicit in-room action (joinCaroRoom) — opening/landing on a room must
// never auto-join. Here we only validate the code exists, then redirect.
export async function joinRoom(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const code = ((formData.get('room_code') as string) ?? '').trim().toUpperCase()
  if (!code) return { error: 'no_code' }

  const admin = createAdminClient()
  const { data: room } = await admin
    .from('caro_rooms')
    .select('id')
    .eq('room_code', code)
    .maybeSingle()

  if (!room) return { error: 'not_found' }

  redirect(`/games/caro/${code}`)
}

// ── joinCaroRoom ──────────────────────────────────────────────────────────────
// The single explicit, atomic join mutation. Triggered by the in-room
// "Tham gia phòng" button. Occupies the Player O seat only if it is still free,
// transitions the room to 'playing' (which initializes turn_started_at /
// turn_deadline via the caro_rooms_initial_deadline trigger), and rejects the
// host trying to take O or a seat already taken by someone else.
export async function joinCaroRoom(roomId: string): Promise<ActionResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'not_logged_in' }

  const admin = createAdminClient()
  const { data: room } = await admin
    .from('caro_rooms')
    .select('id, player_x, player_o, status, updated_at')
    .eq('id', roomId)
    .maybeSingle()

  if (!room) return { error: 'not_found' }
  if (room.player_x === user.id) return { error: 'host_cannot_join' }
  if (room.player_o === user.id) return null // already joined
  if (room.status !== 'waiting' || room.player_o) return { error: 'full' }

  const since = new Date(Date.now() - LOBBY_STALE_MS).toISOString()
  if (room.updated_at < since) return { error: 'stale' }

  // Atomicity: only the first caller whose `player_o` is still null wins the seat.
  const { data: updated, error } = await admin
    .from('caro_rooms')
    .update({ player_o: user.id, status: 'playing' })
    .eq('id', room.id)
    .is('player_o', null)
    .eq('status', 'waiting')
    .select('id')

  if (error) return { error: error.message }
  if (!updated || updated.length === 0) return { error: 'full' }

  return null
}

// ── refetchRoom ───────────────────────────────────────────────────────────────
// Returns the authoritative room row by id. The client calls this after the
// realtime channel (re)subscribes to reconcile any events missed between the
// initial server render and the subscription being established, or during a
// dropped/restored connection. Returns null if the room no longer exists.
export async function refetchRoom(roomId: string): Promise<CaroRoom | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('caro_rooms')
    .select('*')
    .eq('id', roomId)
    .maybeSingle()
  return (data as CaroRoom | null) ?? null
}

// ── makeMove ──────────────────────────────────────────────────────────────────
// Single authoritative path: the move is validated and written by the
// SECURITY DEFINER RPC `caro_make_move` (migration_caro_secure_moves.sql), called
// with the user's own JWT so auth.uid() identifies the actor. The RPC checks
// ownership/turn/cell/version and writes atomically under a row lock; direct
// table UPDATE is revoked from authenticated, so this is the ONLY way to move.
// The RPC returns { ok, error?, room? } with stable error codes — never a raw
// DB error.
export async function makeMove(
  roomId: string,
  cellIndex: number,
  expectedStateVersion?: number | null,
): Promise<ActionResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'not_logged_in' }

  const { data, error } = await supabase.rpc('caro_make_move', {
    p_room_id: roomId,
    p_cell_index: cellIndex,
    p_expected_state_version: expectedStateVersion ?? null,
  })

  if (error) {
    const incidentId = logResultError('makeMove', roomId, 'rpc', error)
    return { error: `write_failed:${incidentId}` }
  }

  const result = (data ?? null) as { ok: boolean; error?: string; room?: CaroRoom } | null
  if (!result || !result.ok) return { error: result?.error ?? 'move_failed' }

  // If this room belongs to a tournament match and the game just finished, record
  // the result. Best-effort: the room is already finalized authoritatively in the
  // DB, so a tournament linkage failure must NOT report the move as failed.
  const room = result.room
  if (room && room.status === 'finished') {
    const won = room.winner === 'X' || room.winner === 'O'
    const winnerId = won ? (room.winner === 'X' ? room.player_x : room.player_o) : null
    const loserId = won ? (room.winner === 'X' ? room.player_o : room.player_x) : null
    try {
      await recordTournamentResult(createAdminClient(), room.room_code, winnerId, loserId)
    } catch (e) {
      logResultError('makeMove.tournament', roomId, 'finished', e)
    }
  }

  return null
}

// ── recordTournamentResult ────────────────────────────────────────────────────
// Checks if a room is linked to a tournament match and records the result.
// For group_stage matches (group_id set): draws are also recorded.
// For single_elimination matches: draws are ignored (allow rematch).
async function recordTournamentResult(
  admin: ReturnType<typeof createAdminClient>,
  roomCode: string,
  winnerId: string | null,
  loserId: string | null,
): Promise<void> {
  const { data: match } = await admin
    .from('caro_tournament_matches')
    .select('id, tournament_id, round_number, match_number, status, group_id')
    .eq('room_code', roomCode)
    .maybeSingle()

  if (!match || match.status === 'finished' || match.status === 'walkover') return

  // Single-elimination draw: ignore so players can rematch
  if (!winnerId && !match.group_id) return

  await admin.from('caro_tournament_matches').update({
    winner_user_id: winnerId,
    loser_user_id: loserId,
    status: 'finished',
    finished_at: new Date().toISOString(),
  }).eq('id', match.id)

  // Group stage matches: no bracket advancement (handleMatchFinished returns early for group_id)
  if (winnerId) {
    await handleMatchFinished(admin, match.tournament_id, match.round_number, match.match_number, winnerId, loserId, match.group_id)
  }
}

// ── surrenderGame ─────────────────────────────────────────────────────────────
export async function surrenderGame(roomId: string): Promise<ActionResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'not_logged_in' }

  const admin = createAdminClient()
  const { data: room } = await admin
    .from('caro_rooms')
    .select('player_x, player_o, status, room_code')
    .eq('id', roomId)
    .single()

  if (!room || room.status !== 'playing') return { error: 'invalid' }

  const mySymbol = room.player_x === user.id ? 'X' : room.player_o === user.id ? 'O' : null
  if (!mySymbol) return { error: 'not_a_player' }

  const opponentSymbol = mySymbol === 'X' ? 'O' : 'X'
  // Idempotent: only finalize if the game is still 'playing'.
  const { error } = await admin.from('caro_rooms').update({
    status: 'finished',
    winner: opponentSymbol,
    finished_at: new Date().toISOString(),
  }).eq('id', roomId).eq('status', 'playing')

  if (error) {
    const incidentId = logResultError('surrenderGame', roomId, room.status, error)
    return { error: `write_failed:${incidentId}` }
  }

  const winnerId = mySymbol === 'X' ? room.player_o : room.player_x
  try {
    await recordTournamentResult(admin, room.room_code, winnerId, user.id)
  } catch (e) {
    logResultError('surrenderGame.tournament', roomId, 'finished', e)
  }

  return null
}

// ── finalizeStaleGames ─────────────────────────────────────────────────────────
// SERVER-AUTHORITATIVE completion safety net. A 'playing' room becomes finished
// ONLY when a player completes five-in-a-row or surrenders — both of which require
// a live browser to submit the action. If a client crashes, disconnects, or the
// user simply closes the tab, the game is stranded in 'playing' forever and never
// enters the history view (caro_games_history filters status IN finished/cancelled).
//
// This finalizes abandoned games independently of any browser: a 'playing' room
// whose updated_at (== last move time, since heartbeats only run while 'waiting')
// is older than the abandon window is closed out.
//
// IMPORTANT — no invented winners, no fake "just now":
//  • Caro has NO authoritative per-turn deadline, so we cannot fairly prove who
//    abandoned. We therefore mark the game 'cancelled' (a NO-CONTEST, winner NULL)
//    rather than awarding a forfeit win. It still appears in history (the view
//    includes 'cancelled') but is labelled as a no-contest, not a normal win.
//  • finished_at is stamped with the LAST MOVE time (updated_at, read BEFORE this
//    write) — NOT now() — so a long-stranded game shows its true historical time
//    instead of appearing as "vừa xong".
// Single conditional statement per room → atomic & idempotent. Bounded per call.
const PLAYING_ABANDON_MS = 3 * 60 * 1000

export async function finalizeStaleGames(): Promise<{ finalized: number }> {
  const admin = createAdminClient()
  const cutoff = new Date(Date.now() - PLAYING_ABANDON_MS).toISOString()

  const { data: stale, error: readErr } = await admin
    .from('caro_rooms')
    .select('id, updated_at')
    .eq('status', 'playing')
    .lt('updated_at', cutoff)
    .limit(50)

  if (readErr || !stale || stale.length === 0) return { finalized: 0 }

  let finalized = 0
  for (const room of stale) {
    const { data: updated, error } = await admin
      .from('caro_rooms')
      .update({
        status: 'cancelled',
        winner: null,
        winning_cells: [],
        finished_at: room.updated_at, // last move time, not now()
      })
      .eq('id', room.id)
      .eq('status', 'playing') // idempotency guard
      .select('id')

    if (error) { logResultError('finalizeStaleGames', room.id, 'playing', error); continue }
    if (!updated || updated.length === 0) continue // already finalized by a concurrent call
    finalized++
  }

  return { finalized }
}

// ── fetchCaroHistory ───────────────────────────────────────────────────────────
// Authoritative, formatted history rows (same shape the lobby server component
// builds). The history view joins auth.users, so it can only be read with the
// admin client — hence a server action rather than a client-side query. Used to
// live-refresh the lobby history list when a room reaches a terminal status,
// without the client needing access to private tables.
export async function fetchCaroHistory(): Promise<CaroHistoryRow[]> {
  const [admin, tCommon] = await Promise.all([
    Promise.resolve(createAdminClient()),
    getTranslations('common'),
  ])
  const { data } = await admin
    .from('caro_games_history')
    .select('id,winner,player_x,player_o,player_x_name,player_o_name,finished_at')
    .order('finished_at', { ascending: false })
    .limit(100)

  const justNow = tCommon('just_now')
  const rows = (data ?? []) as Array<{
    id: string
    winner: 'X' | 'O' | 'draw' | null
    player_x: string | null
    player_o: string | null
    player_x_name: string
    player_o_name: string
    finished_at: string | null
  }>
  return rows.map(r => ({
    id: r.id,
    winner: r.winner,
    player_x: r.player_x,
    player_o: r.player_o,
    player_x_name: r.player_x_name,
    player_o_name: r.player_o_name,
    time_label: r.finished_at ? relativeCaroTime(r.finished_at, justNow) : '—',
  }))
}

function relativeCaroTime(iso: string, justNow: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (diff < 1) return justNow
  if (diff < 60) return `${diff}m`
  const hrs = Math.floor(diff / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

// Rooms are considered active if updated_at is within this window.
// Host heartbeat fires every 25s, so 3 minutes is a generous tolerance.
const LOBBY_STALE_MS = 3 * 60 * 1000

// ── fetchWaitingRooms ──────────────────────────────────────────────────────────
// Returns waiting rooms where the host is still active (updated_at within 3 min).
export async function fetchWaitingRooms(): Promise<WaitingRoom[]> {
  const admin = createAdminClient()
  const since = new Date(Date.now() - LOBBY_STALE_MS).toISOString()

  const { data: rooms } = await admin
    .from('caro_rooms')
    .select('id, room_code, player_x, created_at, updated_at')
    .eq('status', 'waiting')
    .is('player_o', null)
    .gte('updated_at', since)
    .order('updated_at', { ascending: false })
    .limit(20)

  if (!rooms || rooms.length === 0) return []

  const seen = new Set<string>()
  const playerIds = rooms.map(r => r.player_x).filter((id): id is string => !!id && !seen.has(id) && (seen.add(id), true))
  const nameMap: Record<string, string> = {}

  if (playerIds.length > 0) {
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, display_name')
      .in('id', playerIds)
    profiles?.forEach(p => { if (p.display_name) nameMap[p.id] = p.display_name })
  }

  return rooms.map(r => ({
    id: r.id,
    room_code: r.room_code,
    player_x: r.player_x,
    player_x_name: (r.player_x && nameMap[r.player_x]) || '',
    created_at: r.created_at,
    updated_at: r.updated_at,
  }))
}

// ── heartbeatWaitingRoom ───────────────────────────────────────────────────────
// Host calls this every ~25s to keep their waiting room visible in the lobby.
// Uses updated_at as the activity timestamp (no extra column needed).
export async function heartbeatWaitingRoom(roomId: string): Promise<void> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const admin = createAdminClient()
  await admin
    .from('caro_rooms')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', roomId)
    .eq('status', 'waiting')
    .eq('player_x', user.id)  // only the host can heartbeat their own room
}

// ── resolveTimeout ──────────────────────────────────────────────────────────────
// Single-room authoritative timeout resolution. Any player's browser calls this
// when its deadline-derived countdown expires; the DB (caro_resolve_timeout)
// re-confirms the real deadline has passed (+grace) before finalizing the
// current-turn owner as the loser. Idempotent — duplicate requests are no-ops.
export async function resolveTimeout(
  roomId: string,
  expectedStateVersion?: number | null,
): Promise<ActionResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'not_logged_in' }

  const { data, error } = await supabase.rpc('caro_resolve_timeout', {
    p_room_id: roomId,
    p_expected_state_version: expectedStateVersion ?? null,
  })

  if (error) {
    const incidentId = logResultError('resolveTimeout', roomId, 'rpc', error)
    return { error: `write_failed:${incidentId}` }
  }

  const result = (data ?? null) as { ok: boolean; error?: string; room?: CaroRoom } | null
  if (!result || !result.ok) return { error: result?.error ?? 'timeout_failed' }

  const room = result.room
  if (room && room.status === 'finished' && room.winner) {
    const winnerId = room.winner === 'X' ? room.player_x : room.player_o
    const loserId = room.winner === 'X' ? room.player_o : room.player_x
    try {
      await recordTournamentResult(createAdminClient(), room.room_code, winnerId, loserId)
    } catch (e) {
      logResultError('resolveTimeout.tournament', roomId, 'finished', e)
    }
  }

  return null
}

// ── resolveExpiredCaroGames ─────────────────────────────────────────────────────
// Browser-independent bulk timeout sweep. Finalizes every 'playing' room whose
// turn_deadline has passed (+grace) as an opponent win, in one atomic statement,
// then records any tournament results. Triggered on lobby load and by the cron
// route (see app/api/cron/caro-maintenance). Idempotent.
export async function resolveExpiredCaroGames(): Promise<{ resolved: number }> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('caro_resolve_expired', { p_grace_seconds: 2 })
  if (error) {
    logResultError('resolveExpiredCaroGames', '-', 'playing', error)
    return { resolved: 0 }
  }
  const rows = (data ?? []) as { room_code: string; winner_id: string | null; loser_id: string | null }[]
  for (const r of rows) {
    try {
      await recordTournamentResult(admin, r.room_code, r.winner_id, r.loser_id)
    } catch (e) {
      logResultError('resolveExpiredCaroGames.tournament', r.room_code, 'finished', e)
    }
  }
  return { resolved: rows.length }
}

// ── cleanupStaleWaitingRooms ────────────────────────────────────────────────────
// Removes waiting rooms whose host has gone silent (no heartbeat within the lobby
// window). Only deletes rooms that NEVER started (status='waiting' AND player_o IS
// NULL), so active games and completed match history (status finished/cancelled)
// are never touched. Idempotent and bounded.
export async function cleanupStaleWaitingRooms(): Promise<{ removed: number }> {
  const admin = createAdminClient()
  const cutoff = new Date(Date.now() - LOBBY_STALE_MS).toISOString()
  const { data, error } = await admin
    .from('caro_rooms')
    .delete()
    .eq('status', 'waiting')
    .is('player_o', null)
    .lt('updated_at', cutoff)
    .select('id')
  if (error) {
    logResultError('cleanupStaleWaitingRooms', '-', 'waiting', error)
    return { removed: 0 }
  }
  return { removed: data?.length ?? 0 }
}
