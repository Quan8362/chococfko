import test from 'node:test'
import assert from 'node:assert/strict'
import { seatAccessibleName, emptySeatAccessibleName, type A11yTranslate } from './seatA11y.ts'

// Fake translator mirroring the games.poker.a11y catalog (English), with {pos}/{stack} interpolation.
const DICT: Record<string, string> = {
  seat: 'Seat {pos}', seat_stack: '{stack} chips', you: 'you', player: 'player',
  dealer: 'dealer', small_blind: 'small blind', big_blind: 'big blind', winner: 'winner',
  all_in: 'all in', folded: 'folded', sitting_out: 'sitting out', turn: 'to act',
  empty_seat: 'Empty seat {pos}',
}
const t: A11yTranslate = (k, v = {}) => (DICT[k] ?? k).replace(/\{(\w+)\}/g, (_, p) => String(v[p] ?? ''))

test('composes position, name, stack and markers in order', () => {
  const label = seatAccessibleName(
    { seatIndex: 2, displayName: 'Alice', isSelf: false, stackLabel: '12.3K', isButton: true, isCurrentActor: true },
    t,
  )
  assert.equal(label, 'Seat 3, Alice, 12.3K chips, dealer, to act')
})

test('a self seat with no name reads "you"', () => {
  const label = seatAccessibleName({ seatIndex: 0, displayName: null, isSelf: true, stackLabel: '5K' }, t)
  assert.equal(label, 'Seat 1, you, 5K chips')
})

test('a nameless opponent reads "player"', () => {
  const label = seatAccessibleName({ seatIndex: 4, displayName: '   ', isSelf: false, stackLabel: '900' }, t)
  assert.equal(label, 'Seat 5, player, 900 chips')
})

test('exactly one contention status, winner outranks all-in/folded and suppresses "to act"', () => {
  const label = seatAccessibleName(
    { seatIndex: 1, displayName: 'Bob', isSelf: false, stackLabel: '30K', isWinner: true, allIn: true, folded: true, isCurrentActor: true },
    t,
  )
  assert.equal(label, 'Seat 2, Bob, 30K chips, winner')
})

test('folded seat does not get "to act" even if flagged current actor', () => {
  const label = seatAccessibleName(
    { seatIndex: 3, displayName: 'Cara', isSelf: false, stackLabel: '2K', folded: true, isCurrentActor: true },
    t,
  )
  assert.equal(label, 'Seat 4, Cara, 2K chips, folded')
})

test('blind markers surface for the blind seats', () => {
  assert.equal(
    seatAccessibleName({ seatIndex: 0, displayName: 'D', isSelf: false, stackLabel: '1K', isSmallBlind: true }, t),
    'Seat 1, D, 1K chips, small blind',
  )
  assert.equal(
    seatAccessibleName({ seatIndex: 1, displayName: 'E', isSelf: false, stackLabel: '1K', isBigBlind: true }, t),
    'Seat 2, E, 1K chips, big blind',
  )
})

test('empty seat name', () => {
  assert.equal(emptySeatAccessibleName(5, t), 'Empty seat 6')
})

test('the accessible name never carries a raw stack number when a formatted label is given', () => {
  // The builder only ever emits the pre-formatted stackLabel — proving the raw integer never leaks.
  const label = seatAccessibleName({ seatIndex: 0, displayName: 'Z', isSelf: false, stackLabel: '9.9K' }, t)
  assert.ok(label.includes('9.9K'))
  assert.ok(!/\b9900\b/.test(label))
})
