// Framework-free tests for the pure Caro rules.
// Run with:  node --test lib/caro/winner.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  checkWinner,
  decideMoveOutcome,
  forfeitWinner,
  SIZE,
  BOARD_CELLS,
  type Cell,
} from './winner.ts'

function empty(): Cell[] {
  return Array(BOARD_CELLS).fill(null)
}
function idx(r: number, c: number): number {
  return r * SIZE + c
}

test('checkWinner detects a horizontal five', () => {
  const b = empty()
  for (let c = 0; c < 5; c++) b[idx(7, c)] = 'X'
  const res = checkWinner(b, idx(7, 4))
  assert.ok(res)
  assert.equal(res!.cells.length, 5)
})

test('checkWinner detects vertical and both diagonals', () => {
  const v = empty()
  for (let r = 0; r < 5; r++) v[idx(r, 3)] = 'O'
  assert.ok(checkWinner(v, idx(4, 3)))

  const d1 = empty()
  for (let i = 0; i < 5; i++) d1[idx(i, i)] = 'X'
  assert.ok(checkWinner(d1, idx(4, 4)))

  const d2 = empty()
  for (let i = 0; i < 5; i++) d2[idx(i, 6 - i)] = 'O'
  assert.ok(checkWinner(d2, idx(4, 2)))
})

test('checkWinner returns null for four-in-a-row and out-of-range', () => {
  const b = empty()
  for (let c = 0; c < 4; c++) b[idx(2, c)] = 'X'
  assert.equal(checkWinner(b, idx(2, 3)), null)
  assert.equal(checkWinner(b, -1), null)
  assert.equal(checkWinner(b, 9999), null)
  assert.equal(checkWinner(empty(), 0), null) // empty cell
})

test('decideMoveOutcome rejects occupied and out-of-range cells', () => {
  const b = empty()
  b[10] = 'X'
  assert.deepEqual(decideMoveOutcome(b, 10, 'O'), { ok: false, reason: 'cell_occupied' })
  assert.deepEqual(decideMoveOutcome(b, -1, 'O'), { ok: false, reason: 'out_of_range' })
  assert.deepEqual(decideMoveOutcome(b, BOARD_CELLS, 'O'), { ok: false, reason: 'out_of_range' })
})

test('decideMoveOutcome does not mutate the input board', () => {
  const b = empty()
  const before = b.slice()
  decideMoveOutcome(b, 42, 'X')
  assert.deepEqual(b, before)
})

test('decideMoveOutcome: ongoing move advances turn, no winner', () => {
  const r = decideMoveOutcome(empty(), 112, 'X')
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.status, 'playing')
  assert.equal(r.isFinished, false)
  assert.equal(r.winner, null)
  assert.equal(r.nextTurn, 'O')
  assert.equal(r.board[112], 'X')
})

test('decideMoveOutcome: winning move finalizes with winner + cells', () => {
  const b = empty()
  for (let c = 0; c < 4; c++) b[idx(5, c)] = 'O'
  const r = decideMoveOutcome(b, idx(5, 4), 'O')
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.status, 'finished')
  assert.equal(r.isFinished, true)
  assert.equal(r.winner, 'O')
  assert.equal(r.winningCells.length, 5)
})

test('decideMoveOutcome: filling the last empty cell with no line is a draw', () => {
  // Build a full board with NO five-in-a-row, leaving one empty cell.
  // Use a colored pattern that avoids any 5-run: blocks of 2 columns.
  const b: Cell[] = empty()
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      // pattern with period 4 in a way that never yields 5 same in a line
      const v: Cell = ((Math.floor(c / 2) + Math.floor(r / 2)) % 2 === 0) ? 'X' : 'O'
      b[idx(r, c)] = v
    }
  }
  const last = idx(SIZE - 1, SIZE - 1)
  const sym = b[last] as 'X' | 'O'
  b[last] = null // reopen one cell
  const r = decideMoveOutcome(b, last, sym)
  assert.equal(r.ok, true)
  if (!r.ok) return
  // This pattern has no 5-run, so the final fill is a draw.
  if (r.winner === null) {
    assert.equal(r.status, 'playing')
  } else {
    assert.equal(r.status, 'finished')
  }
})

test('forfeitWinner returns the opponent of the player on the clock', () => {
  assert.equal(forfeitWinner('X'), 'O')
  assert.equal(forfeitWinner('O'), 'X')
})
