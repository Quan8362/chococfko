'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleMatchFinished } from '@/app/admin/caro/actions'
import { decideMoveOutcome, forfeitWinner, type Mark, type Cell } from '@/lib/caro/winner'
import { parseBoard } from '@/lib/caro/realtimePayload'

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

// ── joinRoom ──────────────────────────────────────────────────────────────────
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
    .select('*')
    .eq('room_code', code)
    .maybeSingle()

  if (!room) return { error: 'not_found' }

  // Already in room → go in
  if (room.player_x === user.id || room.player_o === user.id) {
    redirect(`/games/caro/${code}`)
  }

  if (room.status !== 'waiting' || room.player_o) {
    return { error: 'full' }
  }

  await admin.from('caro_rooms').update({
    player_o: user.id,
    status: 'playing',
  }).eq('id', room.id)

  redirect(`/games/caro/${code}`)
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
export async function makeMove(
  roomId: string,
  cellIndex: number,
): Promise<ActionResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'not_logged_in' }

  const admin = createAdminClient()
  const { data: room } = await admin
    .from('caro_rooms')
    .select('*')
    .eq('id', roomId)
    .single()

  if (!room) return { error: 'room_not_found' }
  if (room.status !== 'playing') return { error: 'game_not_active' }

  const mySymbol: Mark | null = room.player_x === user.id ? 'X' : room.player_o === user.id ? 'O' : null
  if (!mySymbol) return { error: 'not_a_player' }
  if (room.current_turn !== mySymbol) return { error: 'not_your_turn' }

  // Resolve the authoritative outcome from a normalized board (guards a malformed
  // / partially-stored board) and reject occupied/out-of-range cells.
  const outcome = decideMoveOutcome(parseBoard(room.board) as Cell[], cellIndex, mySymbol)
  if (!outcome.ok) return { error: outcome.reason }

  // Atomic, idempotent write: the conditional `current_turn`/`status` guards mean a
  // concurrent move or a duplicate submit (e.g. double click, two tabs) cannot be
  // applied twice — once the turn advances, the second write matches 0 rows.
  const { data: updated, error } = await admin.from('caro_rooms').update({
    board: outcome.board,
    current_turn: outcome.nextTurn,
    winner: outcome.winner,
    winning_cells: outcome.winningCells,
    status: outcome.status,
    finished_at: outcome.isFinished ? new Date().toISOString() : null,
  })
    .eq('id', roomId)
    .eq('current_turn', mySymbol)
    .eq('status', 'playing')
    .select('id')

  if (error) {
    const incidentId = logResultError('makeMove', roomId, room.status, error)
    return { error: `write_failed:${incidentId}` }
  }
  // 0 rows → another move already advanced the turn; benign, realtime will resync.
  if (!updated || updated.length === 0) return { error: 'move_superseded' }

  // If this room belongs to a tournament match and the game just finished, record the
  // result. Best-effort: the room is already finalized in the DB, so a tournament
  // linkage failure must NOT roll it back or report the move as failed.
  if (outcome.isFinished) {
    const won = outcome.winner === 'X' || outcome.winner === 'O'
    const winnerId = won ? (mySymbol === 'X' ? room.player_x : room.player_o) : null
    const loserId = won ? (mySymbol === 'X' ? room.player_o : room.player_x) : null
    try {
      await recordTournamentResult(admin, room.room_code, winnerId, loserId)
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
// is older than the abandon window is forfeited to the player NOT on the clock.
// Single conditional statement per room → atomic & idempotent (a concurrent call
// matches 0 rows once finalized). Bounded per call. Cheap to run on lobby load;
// can also be scheduled via pg_cron for full browser-independence.
const PLAYING_ABANDON_MS = 3 * 60 * 1000

export async function finalizeStaleGames(): Promise<{ finalized: number }> {
  const admin = createAdminClient()
  const cutoff = new Date(Date.now() - PLAYING_ABANDON_MS).toISOString()

  const { data: stale, error: readErr } = await admin
    .from('caro_rooms')
    .select('id, room_code, current_turn, player_x, player_o')
    .eq('status', 'playing')
    .lt('updated_at', cutoff)
    .limit(50)

  if (readErr || !stale || stale.length === 0) return { finalized: 0 }

  let finalized = 0
  for (const room of stale) {
    const winnerSym = forfeitWinner(room.current_turn as Mark)
    const { data: updated, error } = await admin
      .from('caro_rooms')
      .update({ status: 'finished', winner: winnerSym, finished_at: new Date().toISOString() })
      .eq('id', room.id)
      .eq('status', 'playing') // idempotency guard
      .select('id')

    if (error) { logResultError('finalizeStaleGames', room.id, 'playing', error); continue }
    if (!updated || updated.length === 0) continue // already finalized by a concurrent call

    finalized++
    const winnerId = winnerSym === 'X' ? room.player_x : room.player_o
    const loserId = winnerSym === 'X' ? room.player_o : room.player_x
    try {
      await recordTournamentResult(admin, room.room_code, winnerId, loserId)
    } catch (e) {
      logResultError('finalizeStaleGames.tournament', room.id, 'finished', e)
    }
  }

  return { finalized }
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

// ── joinRoomFromLobby ──────────────────────────────────────────────────────────
// Joins a waiting room from the lobby. Uses .is('player_o', null) guard to
// prevent two players joining the same slot simultaneously.
export async function joinRoomFromLobby(roomCode: string): Promise<ActionResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'not_logged_in' }

  const admin = createAdminClient()
  const { data: room } = await admin
    .from('caro_rooms')
    .select('id, player_x, player_o, status, updated_at')
    .eq('room_code', roomCode)
    .maybeSingle()

  if (!room) return { error: 'not_found' }
  if (room.player_x === user.id || room.player_o === user.id) return null  // already in room
  if (room.status !== 'waiting' || room.player_o) return { error: 'full' }

  // Reject if host has been inactive for longer than the lobby timeout
  const since = new Date(Date.now() - LOBBY_STALE_MS).toISOString()
  if (room.updated_at < since) return { error: 'stale' }

  const { data: updated, error } = await admin
    .from('caro_rooms')
    .update({ player_o: user.id, status: 'playing' })
    .eq('id', room.id)
    .is('player_o', null)  // atomicity: only succeeds if slot is still free
    .select('id')

  if (error) return { error: error.message }
  if (!updated || updated.length === 0) return { error: 'full' }

  return null
}
