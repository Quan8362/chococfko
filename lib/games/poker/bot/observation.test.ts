import { test } from 'node:test'
import assert from 'node:assert/strict'
import { revealedBoardCount, boardForStreet, buildObservation } from './observation.ts'
import type { Card, Street } from '../types.ts'

const BOARD: Card[] = ['As', 'Kd', 'Qc', 'Jh', 'Ts']

test('revealedBoardCount matches Texas Hold’em streets', () => {
  const expect: Record<Street, number> = {
    PREFLOP: 0,
    FLOP: 3,
    TURN: 4,
    RIVER: 5,
    SHOWDOWN: 5,
  }
  for (const [street, n] of Object.entries(expect) as [Street, number][]) {
    assert.equal(revealedBoardCount(street), n)
  }
})

test('boardForStreet slices the full board to the revealed prefix', () => {
  assert.deepEqual(boardForStreet(BOARD, 'PREFLOP'), [])
  assert.deepEqual(boardForStreet(BOARD, 'FLOP'), ['As', 'Kd', 'Qc'])
  assert.deepEqual(boardForStreet(BOARD, 'TURN'), ['As', 'Kd', 'Qc', 'Jh'])
  assert.deepEqual(boardForStreet(BOARD, 'RIVER'), BOARD)
})

test('buildObservation derives potTotal and opponentsInHand from public seats', () => {
  const obs = buildObservation({
    seatIndex: 0,
    holeCards: ['2c', '7d'],
    fullBoard: BOARD,
    street: 'FLOP',
    seats: [
      { seatIndex: 0, stack: 900, committedThisStreet: 100, committedTotal: 100, status: 'active', inHand: true },
      { seatIndex: 1, stack: 800, committedThisStreet: 200, committedTotal: 200, status: 'active', inHand: true },
      { seatIndex: 2, stack: 1000, committedThisStreet: 0, committedTotal: 50, status: 'folded', inHand: false },
    ],
    buttonSeat: 0,
    bigBlind: 100,
    currentBet: 200,
    toCall: 100,
    minRaiseTo: 400,
    maxRaiseTo: 1000,
    legal: [{ type: 'fold' }, { type: 'call', amount: 100 }, { type: 'raise', min: 400, max: 1000 }],
    actionHistory: [],
  })
  assert.equal(obs.potTotal, 350) // 100 + 200 + 50
  assert.equal(obs.opponentsInHand, 1) // only seat 1 (seat 2 folded, seat 0 is self)
  assert.equal(obs.board.length, 3)
})
