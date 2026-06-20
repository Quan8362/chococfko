// Framework-free tests for the Caro realtime payload helpers.
// Run with:  node --test lib/caro/realtimePayload.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseBoard,
  parseWinningCells,
  mergeRoomUpdate,
  countMoves,
  BOARD_CELLS,
  type CaroRoomState,
} from './realtimePayload.ts'

function emptyBoard(): (string | null)[] {
  return Array(BOARD_CELLS).fill(null)
}

function baseRoom(): CaroRoomState {
  const board = emptyBoard()
  board[0] = 'X'
  board[1] = 'O'
  return {
    id: 'room-1',
    room_code: 'JFX3G',
    player_x: 'user-x',
    player_o: 'user-o',
    current_turn: 'X',
    board,
    status: 'playing',
    winner: null,
    winning_cells: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    finished_at: null,
  }
}

test('parseBoard normalizes bad input to a 225-cell null board', () => {
  assert.equal(parseBoard(null).length, BOARD_CELLS)
  assert.equal(parseBoard('nope').length, BOARD_CELLS)
  assert.equal(parseBoard([1, 2, 3]).length, BOARD_CELLS) // wrong length → reset
  assert.deepEqual(parseBoard(null).every((c) => c === null), true)
  const good = emptyBoard()
  good[5] = 'X'
  assert.equal(parseBoard(good)[5], 'X')
  // sanitizes junk cell values to null
  const dirty = emptyBoard()
  // @ts-expect-error intentional bad value
  dirty[2] = 'Z'
  assert.equal(parseBoard(dirty)[2], null)
})

test('parseWinningCells filters to valid in-range indices and never throws', () => {
  assert.deepEqual(parseWinningCells([0, 14, 224]), [0, 14, 224])
  assert.deepEqual(parseWinningCells([-1, 999, 'x', null]), [])
  assert.deepEqual(parseWinningCells(null), [])
  assert.deepEqual(parseWinningCells({}), [])
})

test('mergeRoomUpdate applies a full valid payload', () => {
  const prev = baseRoom()
  const board = emptyBoard()
  board[0] = 'X'; board[1] = 'O'; board[2] = 'X'
  const next = mergeRoomUpdate(prev, {
    ...prev,
    board,
    current_turn: 'O',
    updated_at: '2026-01-01T00:01:00Z',
  })
  assert.equal(next.current_turn, 'O')
  assert.equal(countMoves(next.board), 3)
})

test('mergeRoomUpdate preserves board when payload omits/nulls it (TOAST guard)', () => {
  const prev = baseRoom()
  // Surrender-style update: status/winner change, board delivered as null.
  const next = mergeRoomUpdate(prev, {
    id: 'room-1',
    status: 'finished',
    winner: 'O',
    finished_at: '2026-01-01T00:05:00Z',
    board: null,
    current_turn: 'X',
  })
  assert.equal(next.status, 'finished')
  assert.equal(next.winner, 'O')
  // board must NOT be wiped
  assert.equal(countMoves(next.board), 2)
  assert.equal(next.player_x, 'user-x')
  assert.equal(next.player_o, 'user-o')
})

test('mergeRoomUpdate preserves board when payload board has wrong length', () => {
  const prev = baseRoom()
  const next = mergeRoomUpdate(prev, { id: 'room-1', board: [1, 2, 3], status: 'playing' })
  assert.equal(countMoves(next.board), 2)
})

test('mergeRoomUpdate ignores an empty payload (no state wipe)', () => {
  const prev = baseRoom()
  const next = mergeRoomUpdate(prev, {})
  assert.deepEqual(next, prev)
})

test('mergeRoomUpdate ignores non-object payloads', () => {
  const prev = baseRoom()
  assert.equal(mergeRoomUpdate(prev, null), prev)
  assert.equal(mergeRoomUpdate(prev, 'x'), prev)
  assert.equal(mergeRoomUpdate(prev, undefined), prev)
})

test('mergeRoomUpdate ignores a payload for a different room id', () => {
  const prev = baseRoom()
  const next = mergeRoomUpdate(prev, { id: 'other-room', status: 'finished' })
  assert.equal(next, prev)
  assert.equal(next.status, 'playing')
})

test('mergeRoomUpdate applies opponent-join (player_o goes from null to id)', () => {
  const prev = { ...baseRoom(), player_o: null, status: 'waiting' as const }
  const next = mergeRoomUpdate(prev, {
    id: 'room-1',
    player_o: 'user-o',
    status: 'playing',
  })
  assert.equal(next.player_o, 'user-o')
  assert.equal(next.status, 'playing')
})

test('mergeRoomUpdate applies a winning update with winning_cells', () => {
  const prev = baseRoom()
  const board = emptyBoard()
  for (let i = 0; i < 5; i++) board[i] = 'X'
  const next = mergeRoomUpdate(prev, {
    id: 'room-1',
    board,
    status: 'finished',
    winner: 'X',
    winning_cells: [0, 1, 2, 3, 4],
  })
  assert.deepEqual(next.winning_cells, [0, 1, 2, 3, 4])
  assert.equal(next.winner, 'X')
})
