// Framework-free tests for Poker event construction + the privacy invariant.
// The privacy assertion is a FIRST-CLASS test (test-plan §5 / security-model §9): no public
// payload may ever carry a hole card or deck card.
// Run with:  node --test lib/games/poker/events.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPokerEvent, assertSpectatorSafe } from './events.ts'
import type { PublicTableState } from './types.ts'

function publicState(): PublicTableState {
  return {
    tableId: 'table-1',
    handId: 'hand-1',
    handNo: 1,
    stateVersion: 7,
    phase: 'BETTING',
    street: 'FLOP',
    board: ['As', 'Kd', '2c'], // revealed streets only — allowed
    pots: { main: { amount: 300, eligibleSeatIndexes: [0, 1] }, sides: [] },
    seats: [
      {
        seatIndex: 0,
        userId: 'u0',
        displayName: 'Anh',
        avatarUrl: null,
        stack: 970,
        committedThisStreet: 30,
        lastAction: 'call',
        allIn: false,
      },
    ],
    buttonSeat: 0,
    turnSeat: 1,
    turnDeadline: 1_000_020_000,
    turnStartedAt: 1_000_000_000,
  }
}

test('createPokerEvent builds a valid envelope from a public projection', () => {
  const e = createPokerEvent({
    eventId: 'evt-1',
    type: 'table_updated',
    roomId: 'table-1',
    handId: 'hand-1',
    stateVersion: 7,
    actionSeq: 4,
    serverTs: 1_000_000_000,
    public: publicState(),
  })
  assert.equal(e.type, 'table_updated')
  assert.equal(e.public.board.length, 3)
})

test('hand_started names recipients but never carries their cards', () => {
  const e = createPokerEvent({
    eventId: 'evt-2',
    type: 'hand_started',
    roomId: 'table-1',
    handId: 'hand-2',
    stateVersion: 8,
    actionSeq: 0,
    public: { ...publicState(), handId: 'hand-2', phase: 'STARTING', street: 'PREFLOP', board: [] },
    privateRecipients: ['u0', 'u1'],
  })
  assert.deepEqual(e.privateRecipients, ['u0', 'u1'])
  // The envelope itself contains no card data beyond an (empty) board.
  assert.deepEqual(e.public.board, [])
})

test('assertSpectatorSafe passes a clean public payload', () => {
  assert.doesNotThrow(() => assertSpectatorSafe(publicState()))
})

test('assertSpectatorSafe rejects a hole card leaked into a seat', () => {
  const leaky = publicState() as unknown as Record<string, unknown>
  const seats = (leaky.seats as Record<string, unknown>[]).map((s) => ({ ...s, holeCards: ['As', 'Ks'] }))
  assert.throws(() => assertSpectatorSafe({ ...leaky, seats }), /forbidden private field "holeCards"/)
})

test('assertSpectatorSafe rejects a deck/stub leaked anywhere', () => {
  assert.throws(() => assertSpectatorSafe({ ...publicState(), deck: ['Ad', '7h'] }), /forbidden private field "deck"/)
  assert.throws(() => assertSpectatorSafe({ nested: { stub: ['x'] } }), /forbidden private field "stub"/)
})

test('createPokerEvent refuses to emit a payload with a private field', () => {
  const leaky = { ...publicState(), hole_cards: ['As', 'Ks'] } as unknown as PublicTableState
  assert.throws(
    () =>
      createPokerEvent({
        eventId: 'evt-3',
        type: 'table_updated',
        roomId: 'table-1',
        handId: 'hand-1',
        stateVersion: 9,
        actionSeq: 5,
        public: leaky,
      }),
    /forbidden private field "hole_cards"/,
  )
})

test('board and reveal are allowed card-bearing fields', () => {
  const withReveal: PublicTableState = {
    ...publicState(),
    phase: 'SETTLEMENT',
    street: 'SHOWDOWN',
    reveal: [{ seatIndex: 0, cards: ['As', 'Ks'] }],
  }
  assert.doesNotThrow(() => assertSpectatorSafe(withReveal))
})
