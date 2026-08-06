// Run with: node --test lib/tournaments/domain/pairing-board.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  boardFromArrangement,
  boardsEqual,
  locate,
  moveToPool,
  moveToSeat,
  toArrangement,
  type BoardState,
} from './pairing-board.ts'

function board(size: number, seatList: (string | null)[], pool: string[]): BoardState {
  const seats = new Array(size).fill(null)
  seatList.forEach((v, i) => (seats[i] = v))
  return { seats, pool }
}

// Invariant: every token appears exactly once across seats + pool.
function assertNoTokenLost(state: BoardState, all: string[]) {
  const seen = state.seats.filter((s): s is string => s !== null).concat(state.pool)
  assert.equal(seen.length, all.length, 'token count changed')
  assert.deepEqual([...seen].sort(), [...all].sort(), 'a token was lost or duplicated')
}

test('boardFromArrangement copies seats + pool', () => {
  const b = boardFromArrangement({ size: 4, seats: ['t1', null, 't2', null], pool: ['t3'] })
  assert.deepEqual([...b.seats], ['t1', null, 't2', null])
  assert.deepEqual([...b.pool], ['t3'])
})

test('drag a token from the pool into an empty seat', () => {
  const b = board(4, [null, null, null, null], ['t1', 't2'])
  const next = moveToSeat(b, 't1', 2)
  assert.equal(next.seats[2], 't1')
  assert.deepEqual([...next.pool], ['t2'])
  assertNoTokenLost(next, ['t1', 't2'])
})

test('drag a token between two seats (target empty) moves it, leaving the old seat empty', () => {
  const b = board(4, ['t1', null, null, null], [])
  const next = moveToSeat(b, 't1', 3)
  assert.equal(next.seats[0], null)
  assert.equal(next.seats[3], 't1')
  assertNoTokenLost(next, ['t1'])
})

test('dropping a seated token onto another occupied seat SWAPS them', () => {
  const b = board(4, ['t1', 't2', null, null], [])
  const next = moveToSeat(b, 't1', 1) // t1 → seat1 (holds t2)
  assert.equal(next.seats[1], 't1')
  assert.equal(next.seats[0], 't2') // t2 took t1's old seat
  assertNoTokenLost(next, ['t1', 't2'])
})

test('dropping a POOL token onto an occupied seat displaces the occupant back to the pool', () => {
  const b = board(4, ['t2', null, null, null], ['t1'])
  const next = moveToSeat(b, 't1', 0)
  assert.equal(next.seats[0], 't1')
  assert.ok(next.pool.includes('t2'))
  assert.ok(!next.pool.includes('t1'))
  assertNoTokenLost(next, ['t1', 't2'])
})

test('moveToPool returns a seated token to the pool', () => {
  const b = board(4, ['t1', 't2', null, null], [])
  const next = moveToPool(b, 't1')
  assert.equal(next.seats[0], null)
  assert.ok(next.pool.includes('t1'))
  assertNoTokenLost(next, ['t1', 't2'])
})

test('no token is ever lost across a sequence of swaps and pool moves', () => {
  const all = ['t1', 't2', 't3', 't4', 't5']
  let b = board(8, [], all)
  b = moveToSeat(b, 't1', 0)
  b = moveToSeat(b, 't2', 1)
  b = moveToSeat(b, 't3', 1) // swap t2/t3
  b = moveToSeat(b, 't4', 0) // t4 from pool onto t1 → t1 to pool
  b = moveToPool(b, 't3')
  b = moveToSeat(b, 't5', 7)
  assertNoTokenLost(b, all)
})

test('moving a token onto its own seat is a no-op', () => {
  const b = board(4, ['t1', null, null, null], [])
  assert.ok(boardsEqual(moveToSeat(b, 't1', 0), b))
})

test('an unknown token id is ignored (never inserted)', () => {
  const b = board(4, ['t1', null, null, null], [])
  assert.ok(boardsEqual(moveToSeat(b, 'ghost', 1), b))
  assert.ok(boardsEqual(moveToPool(b, 'ghost'), b))
})

test('locate reports seat index / pool / null', () => {
  const b = board(4, ['t1', null, null, null], ['t2'])
  assert.deepEqual(locate(b, 't1'), { where: 'seat', index: 0 })
  assert.deepEqual(locate(b, 't2'), { where: 'pool' })
  assert.equal(locate(b, 'ghost'), null)
})

test('toArrangement carries the fixed size through', () => {
  const b = board(8, ['t1'], ['t2'])
  const a = toArrangement(b, 8)
  assert.equal(a.size, 8)
  assert.equal(a.seats.length, 8)
})
