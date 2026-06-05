'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  createInitialChineseChessBoard,
  isValidMove,
  makeMove,
  isCheckmate,
  isStalemate,
  type Board,
  type Side,
} from '@/lib/games/chineseChess/rules'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ChessBoard = (string | null)[][]

export type ChessRoom = {
  id: string
  room_code: string
  player_red: string | null
  player_black: string | null
  current_turn: 'red' | 'black'
  board: ChessBoard
  status: 'waiting' | 'playing' | 'finished' | 'cancelled'
  winner: 'red' | 'black' | 'draw' | null
  end_reason: 'checkmate' | 'resign' | 'draw' | 'general_captured' | 'timeout' | null
  last_move: { from: [number, number]; to: [number, number] } | null
  move_count: number
  red_offered_draw: boolean
  black_offered_draw: boolean
  turn_started_at: string | null
  turn_timeout_seconds: number
  created_at: string
  updated_at: string
  finished_at: string | null
}

export type ActionResult = { error: string } | null

export type MoveEntry = {
  id: string
  side: 'red' | 'black'
  from_row: number
  from_col: number
  to_row: number
  to_col: number
  piece: string | null
  captured_piece: string | null
  move_number: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function genCode(): string {
  return Array.from({ length: 5 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('')
}

export type WaitingChessRoom = {
  id: string
  room_code: string
  player_red: string | null
  player_red_name: string
  created_at: string
  updated_at: string
}

const CHESS_LOBBY_STALE_MS = 3 * 60 * 1000

export async function fetchWaitingChessRooms(): Promise<WaitingChessRoom[]> {
  const admin = createAdminClient()
  const since = new Date(Date.now() - CHESS_LOBBY_STALE_MS).toISOString()
  const { data: rooms } = await admin
    .from('chinese_chess_rooms')
    .select('id, room_code, player_red, created_at, updated_at')
    .eq('status', 'waiting')
    .is('player_black', null)
    .gte('updated_at', since)
    .order('updated_at', { ascending: false })
    .limit(20)

  if (!rooms || rooms.length === 0) return []

  const seen = new Set<string>()
  const playerIds = rooms
    .map(r => r.player_red)
    .filter((id): id is string => !!id && !seen.has(id) && (seen.add(id), true))

  let nameMap: Record<string, string> = {}
  if (playerIds.length > 0) {
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, display_name')
      .in('id', playerIds)
    if (profiles) {
      for (const p of profiles) nameMap[p.id] = p.display_name ?? 'Ẩn danh'
    }
  }

  return rooms.map(r => ({
    id: r.id,
    room_code: r.room_code,
    player_red: r.player_red,
    player_red_name: r.player_red ? (nameMap[r.player_red] ?? 'Ẩn danh') : 'Ẩn danh',
    created_at: r.created_at,
    updated_at: r.updated_at,
  }))
}

export async function heartbeatWaitingChessRoom(roomId: string): Promise<void> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const admin = createAdminClient()
  await admin
    .from('chinese_chess_rooms')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', roomId)
    .eq('status', 'waiting')
    .eq('player_red', user.id)
}

export async function joinChessRoomFromLobby(roomCode: string): Promise<ActionResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'not_logged_in' }

  const admin = createAdminClient()
  const { data: room } = await admin
    .from('chinese_chess_rooms')
    .select('id, player_red, player_black, status, updated_at')
    .eq('room_code', roomCode)
    .maybeSingle()

  if (!room) return { error: 'not_found' }
  if (room.player_red === user.id || room.player_black === user.id) return null
  if (room.status !== 'waiting' || room.player_black) return { error: 'full' }

  const since = new Date(Date.now() - CHESS_LOBBY_STALE_MS).toISOString()
  if (room.updated_at < since) return { error: 'stale' }

  const { data: updated, error } = await admin
    .from('chinese_chess_rooms')
    .update({ player_black: user.id, status: 'playing' })
    .eq('id', room.id)
    .is('player_black', null)
    .select('id')

  if (error) return { error: error.message }
  if (!updated || updated.length === 0) return { error: 'full' }
  return null
}

// ── createRoom ────────────────────────────────────────────────────────────────
export async function createRoom(): Promise<never> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/dang-nhap')

  const admin = createAdminClient()
  const board = createInitialChineseChessBoard()

  let roomCode = genCode()
  for (let i = 0; i < 5; i++) {
    const { data } = await admin
      .from('chinese_chess_rooms')
      .select('id')
      .eq('room_code', roomCode)
      .maybeSingle()
    if (!data) break
    roomCode = genCode()
  }

  const { error } = await admin.from('chinese_chess_rooms').insert({
    room_code: roomCode,
    player_red: user.id,
    board,
    status: 'waiting',
    current_turn: 'red',
  })

  if (error) throw new Error(error.message)
  redirect(`/games/chinese-chess/${roomCode}`)
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
    .from('chinese_chess_rooms')
    .select('*')
    .eq('room_code', code)
    .maybeSingle()

  if (!room) return { error: 'not_found' }

  // Already in room → go in
  if (room.player_red === user.id || room.player_black === user.id) {
    redirect(`/games/chinese-chess/${code}`)
  }

  if (room.status !== 'waiting' || room.player_black) {
    return { error: 'full' }
  }

  await admin.from('chinese_chess_rooms').update({
    player_black: user.id,
    status: 'playing',
  }).eq('id', room.id)

  redirect(`/games/chinese-chess/${code}`)
}

// ── makeChessMove ─────────────────────────────────────────────────────────────
// Server-side: validates move with TypeScript rules engine, then calls the
// make_chinese_chess_move RPC (which does the atomic DB write + auth re-check).
export async function makeChessMove(
  roomCode: string,
  fromRow: number,
  fromCol: number,
  toRow: number,
  toCol: number,
): Promise<ActionResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'not_logged_in' }

  const admin = createAdminClient()
  const { data: room } = await admin
    .from('chinese_chess_rooms')
    .select('*')
    .eq('room_code', roomCode.toUpperCase())
    .maybeSingle()

  if (!room) return { error: 'room_not_found' }
  if (room.status !== 'playing') return { error: 'game_not_active' }

  const mySide: 'red' | 'black' | null =
    room.player_red === user.id ? 'red' :
    room.player_black === user.id ? 'black' :
    null

  if (!mySide) return { error: 'not_a_player' }
  if (room.current_turn !== mySide) return { error: 'not_your_turn' }

  const board = room.board as Board
  const mySideChar: Side = mySide === 'red' ? 'r' : 'b'

  const piece = board[fromRow]?.[fromCol]
  if (!piece || piece[0] !== mySideChar) return { error: 'invalid_piece' }

  if (!isValidMove(board, fromRow, fromCol, toRow, toCol)) {
    return { error: 'invalid_move' }
  }

  const { board: newBoard, capturedPiece } = makeMove(board, fromRow, fromCol, toRow, toCol)

  const oppChar: Side = mySideChar === 'r' ? 'b' : 'r'
  const oppSide = mySide === 'red' ? 'black' : 'red'

  const generalCaptured = capturedPiece === `${oppChar}G`
  const checkmated = !generalCaptured && isCheckmate(newBoard, oppChar)
  const stalemated = !generalCaptured && !checkmated && isStalemate(newBoard, oppChar)
  const isFinished = generalCaptured || checkmated || stalemated

  const { data, error } = await supabase.rpc('make_chinese_chess_move', {
    p_room_code: roomCode.toUpperCase(),
    p_from_row:  fromRow,
    p_from_col:  fromCol,
    p_to_row:    toRow,
    p_to_col:    toCol,
    p_new_board: newBoard as unknown as Record<string, unknown>,
    p_new_turn:  oppSide,
    p_captured:  capturedPiece ?? null,
    p_finished:  isFinished,
    p_winner:    isFinished ? mySide : null,
    p_reason:    isFinished ? (generalCaptured ? 'general_captured' : 'checkmate') : null,
  })

  if (error) return { error: error.message }
  const res = data as { ok?: boolean; error?: string } | null
  if (res?.error) return { error: res.error }
  return null
}

// ── resignGame ────────────────────────────────────────────────────────────────
export async function resignGame(roomCode: string): Promise<ActionResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'not_logged_in' }

  const { data, error } = await supabase.rpc('resign_chinese_chess_game', {
    p_room_code: roomCode.toUpperCase(),
  })

  if (error) return { error: error.message }
  const res = data as { ok?: boolean; error?: string } | null
  if (res?.error) return { error: res.error }
  return null
}

// ── claimTimeout ──────────────────────────────────────────────────────────────
export async function claimTimeout(roomCode: string): Promise<ActionResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'not_logged_in' }

  const { data, error } = await supabase.rpc('claim_chinese_chess_timeout', {
    p_room_code: roomCode.toUpperCase(),
  })

  if (error) return { error: error.message }
  const res = data as { ok?: boolean; error?: string } | null
  if (res?.error && res.error !== 'not_timed_out') return { error: res.error }
  return null
}

// ── offerDraw ─────────────────────────────────────────────────────────────────
export async function offerDraw(roomCode: string): Promise<ActionResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'not_logged_in' }

  const { data, error } = await supabase.rpc('offer_chinese_chess_draw', {
    p_room_code: roomCode.toUpperCase(),
  })

  if (error) return { error: error.message }
  const res = data as { ok?: boolean; error?: string } | null
  if (res?.error) return { error: res.error }
  return null
}

// ── respondDraw ───────────────────────────────────────────────────────────────
export async function respondDraw(roomCode: string, accepted: boolean): Promise<ActionResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'not_logged_in' }

  const { data, error } = await supabase.rpc('respond_chinese_chess_draw', {
    p_room_code: roomCode.toUpperCase(),
    p_accepted:  accepted,
  })

  if (error) return { error: error.message }
  const res = data as { ok?: boolean; error?: string } | null
  if (res?.error) return { error: res.error }
  return null
}
