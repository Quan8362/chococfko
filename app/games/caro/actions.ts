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
