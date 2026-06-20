// Framework-free tests for the Chinese Chess realtime payload helpers + rules.
// Run with:  node --test lib/games/chineseChess/realtimePayload.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  mergeChessRoomUpdate,
  isValidChessBoard,
  isTurnDeadlineExpired,
  timeoutWinner,
  BOARD_ROWS,
  BOARD_COLS,
  type ChessRoomState,
} from './realtimePayload.ts'
import {
  createInitialChineseChessBoard,
  isValidMove,
  makeMove,
  isCheckmate,
  type Board,
} from './rules.ts'

function emptyBoard(): Board {
  return Array.from({ length: BOARD_ROWS }, () => Array<string | null>(BOARD_COLS).fill(null))
}

function baseRoom(): ChessRoomState {
  return {
    id: 'room-1',
    room_code: 'AB12C',
    player_red: 'user-red',
    player_black: 'user-black',
    current_turn: 'red',
    board: createInitialChineseChessBoard(),
    status: 'playing',
    winner: null,
    end_reason: null,
    last_move: null,
    move_count: 4,
    red_offered_draw: false,
    black_offered_draw: false,
    turn_started_at: '2026-01-01T00:00:00.000Z',
    turn_timeout_seconds: 60,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    finished_at: null,
  }
}

test('isValidChessBoard accepts a 10x9 grid and rejects malformed input', () => {
  assert.equal(isValidChessBoard(createInitialChineseChessBoard()), true)
  assert.equal(isValidChessBoard(null), false)
  assert.equal(isValidChessBoard([]), false)
  assert.equal(isValidChessBoard(Array(10).fill([])), false) // wrong col count
  assert.equal(isValidChessBoard('board'), false)
})

test('mergeChessRoomUpdate applies a normal move update (turn flip + move_count up)', () => {
  const prev = baseRoom()
  const next = mergeChessRoomUpdate(prev, {
    id: 'room-1',
    current_turn: 'black',
    move_count: 5,
    status: 'playing',
  })
  assert.equal(next.current_turn, 'black')
  assert.equal(next.move_count, 5)
})

test('mergeChessRoomUpdate: TERMINAL guard — a finished game is immutable', () => {
  const prev = { ...baseRoom(), status: 'finished' as const, winner: 'red' as const, end_reason: 'checkmate' as const }
  // A stale event tries to push it back to playing.
  const next = mergeChessRoomUpdate(prev, { id: 'room-1', status: 'playing', winner: null, end_reason: null, move_count: 99 })
  assert.equal(next.status, 'finished')
  assert.equal(next.winner, 'red')
  assert.equal(next, prev)
})

test('mergeChessRoomUpdate: applying the finishing update itself works', () => {
  const prev = baseRoom()
  const next = mergeChessRoomUpdate(prev, {
    id: 'room-1',
    status: 'finished',
    winner: 'red',
    end_reason: 'checkmate',
    move_count: 5,
    finished_at: '2026-01-01T00:01:00.000Z',
  })
  assert.equal(next.status, 'finished')
  assert.equal(next.winner, 'red')
  assert.equal(next.end_reason, 'checkmate')
})

test('mergeChessRoomUpdate: STALE guard — lower move_count is ignored', () => {
  const prev = { ...baseRoom(), move_count: 10 }
  const next = mergeChessRoomUpdate(prev, { id: 'room-1', move_count: 7, current_turn: 'black' })
  assert.equal(next, prev)
  assert.equal(next.move_count, 10)
})

test('mergeChessRoomUpdate: preserves board when payload board is malformed', () => {
  const prev = baseRoom()
  const next = mergeChessRoomUpdate(prev, { id: 'room-1', board: 'corrupt', move_count: 5 })
  assert.equal(next.board, prev.board)
})

test('mergeChessRoomUpdate: ignores wrong-room, empty, and non-object payloads', () => {
  const prev = baseRoom()
  assert.equal(mergeChessRoomUpdate(prev, { id: 'other', status: 'finished' }), prev)
  assert.deepEqual(mergeChessRoomUpdate(prev, {}), prev)
  assert.equal(mergeChessRoomUpdate(prev, null), prev)
  assert.equal(mergeChessRoomUpdate(prev, 42), prev)
})

test('mergeChessRoomUpdate: opponent join (player_black null → id) applies', () => {
  const prev = { ...baseRoom(), player_black: null, status: 'waiting' as const, move_count: 0 }
  const next = mergeChessRoomUpdate(prev, { id: 'room-1', player_black: 'user-black', status: 'playing' })
  assert.equal(next.player_black, 'user-black')
  assert.equal(next.status, 'playing')
})

test('isTurnDeadlineExpired uses the authoritative deadline', () => {
  const started = Date.UTC(2026, 0, 1, 0, 0, 0)
  const room = { status: 'playing' as const, turn_started_at: new Date(started).toISOString(), turn_timeout_seconds: 60 }
  assert.equal(isTurnDeadlineExpired(room, started + 59_000), false)
  assert.equal(isTurnDeadlineExpired(room, started + 61_000), true)
  // not playing / no timer → never expired
  assert.equal(isTurnDeadlineExpired({ ...room, status: 'finished' }, started + 999_000), false)
  assert.equal(isTurnDeadlineExpired({ ...room, turn_started_at: null }, started + 999_000), false)
})

test('timeoutWinner awards the opponent of the player on the clock', () => {
  assert.equal(timeoutWinner('red'), 'black')
  assert.equal(timeoutWinner('black'), 'red')
})

// ── Rules-engine sanity (legal/illegal/checkmate) ───────────────────────────
test('rules: a legal red soldier/chariot move validates; an illegal one does not', () => {
  const b = createInitialChineseChessBoard()
  // Red chariot at (9,0). Moving straight up to (8,0) should be blocked by own soldier?
  // Initial layout: verify with a clearly legal cannon move instead.
  // Find a red cannon (rC) and a forward empty square via the engine itself.
  let found = false
  for (let r = 0; r < BOARD_ROWS && !found; r++) {
    for (let c = 0; c < BOARD_COLS && !found; c++) {
      if (b[r][c] === 'rC') {
        // cannon moves like a rook when not capturing; one step forward (toward row 0) is empty
        if (isValidMove(b, r, c, r - 1, c)) {
          const { board: nb } = makeMove(b, r, c, r - 1, c)
          assert.equal(nb[r - 1][c], 'rC')
          assert.equal(nb[r][c], null)
          found = true
        }
      }
    }
  }
  assert.equal(found, true)
  // Illegal: moving a piece to its own square is never valid.
  assert.equal(isValidMove(b, 9, 0, 9, 0), false)
})

test('rules: isCheckmate returns a boolean for the initial position (not mate)', () => {
  const b = createInitialChineseChessBoard()
  assert.equal(isCheckmate(b, 'r'), false)
  assert.equal(isCheckmate(b, 'b'), false)
})
