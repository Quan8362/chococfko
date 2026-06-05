'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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

const SIZE = 15

function checkWinner(
  board: (string | null)[],
  lastIdx: number,
): { cells: number[] } | null {
  const player = board[lastIdx]
  if (!player) return null
  const row = Math.floor(lastIdx / SIZE)
  const col = lastIdx % SIZE
  const dirs: [number, number][] = [[0, 1], [1, 0], [1, 1], [1, -1]]

  for (const [dr, dc] of dirs) {
    const cells = [lastIdx]
    for (let i = 1; i < 5; i++) {
      const r = row + dr * i, c = col + dc * i
      if (r < 0 || r >= SIZE || c < 0 || c >= SIZE || board[r * SIZE + c] !== player) break
      cells.push(r * SIZE + c)
    }
    for (let i = 1; i < 5; i++) {
      const r = row - dr * i, c = col - dc * i
      if (r < 0 || r >= SIZE || c < 0 || c >= SIZE || board[r * SIZE + c] !== player) break
      cells.unshift(r * SIZE + c)
    }
    if (cells.length >= 5) return { cells }
  }
  return null
}

// ── createRoom ────────────────────────────────────────────────────────────────
export async function createRoom(): Promise<never> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/dang-nhap')

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
  if (!user) redirect('/dang-nhap')

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

  const mySymbol = room.player_x === user.id ? 'X' : room.player_o === user.id ? 'O' : null
  if (!mySymbol) return { error: 'not_a_player' }
  if (room.current_turn !== mySymbol) return { error: 'not_your_turn' }

  const board: (string | null)[] = [...(room.board as (string | null)[])]
  if (board[cellIndex]) return { error: 'cell_occupied' }

  board[cellIndex] = mySymbol
  const winResult = checkWinner(board, cellIndex)
  const isDraw = !winResult && board.every((c) => c !== null)
  const isFinished = !!winResult || isDraw

  const { error } = await admin.from('caro_rooms').update({
    board,
    current_turn: mySymbol === 'X' ? 'O' : 'X',
    winner: winResult ? mySymbol : isDraw ? 'draw' : null,
    winning_cells: winResult ? winResult.cells : [],
    status: isFinished ? 'finished' : 'playing',
    finished_at: isFinished ? new Date().toISOString() : null,
  }).eq('id', roomId)

  if (error) return { error: error.message }
  return null
}

// ── surrenderGame ─────────────────────────────────────────────────────────────
export async function surrenderGame(roomId: string): Promise<ActionResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'not_logged_in' }

  const admin = createAdminClient()
  const { data: room } = await admin
    .from('caro_rooms')
    .select('player_x, player_o, status')
    .eq('id', roomId)
    .single()

  if (!room || room.status !== 'playing') return { error: 'invalid' }

  const mySymbol = room.player_x === user.id ? 'X' : room.player_o === user.id ? 'O' : null
  if (!mySymbol) return { error: 'not_a_player' }

  const opponentSymbol = mySymbol === 'X' ? 'O' : 'X'
  await admin.from('caro_rooms').update({
    status: 'finished',
    winner: opponentSymbol,
    finished_at: new Date().toISOString(),
  }).eq('id', roomId)

  return null
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
