import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Card } from '../types.ts'
import type { BotObservation, ObservedSeat, PublicActionEntry } from './observation.ts'
import { derivePublicContext } from './context.ts'

function seat(i: number, stack: number, committed = 0, status: ObservedSeat['status'] = 'active'): ObservedSeat {
  return { seatIndex: i, stack, committedThisStreet: committed, committedTotal: committed, status, inHand: status === 'active' || status === 'allin' }
}

function obs(over: Partial<BotObservation> & { seats: readonly ObservedSeat[]; seatIndex: number; buttonSeat: number }): BotObservation {
  const potTotal = over.seats.reduce((s, x) => s + x.committedTotal, 0)
  return {
    holeCards: ['As', 'Kd'] as [Card, Card],
    board: [],
    street: 'PREFLOP',
    bigBlind: 100,
    potTotal,
    currentBet: 100,
    toCall: 0,
    minRaiseTo: 0,
    maxRaiseTo: 0,
    legal: [{ type: 'check' }],
    opponentsInHand: over.seats.filter((s) => s.seatIndex !== over.seatIndex && s.inHand).length,
    actionHistory: [],
    ...over,
  }
}

const six = () => [seat(0, 10000), seat(1, 10000, 50), seat(2, 10000, 100), seat(3, 10000), seat(4, 10000), seat(5, 10000)]

test('position classes around the button (6-max)', () => {
  const at = (i: number) => derivePublicContext(obs({ seats: six(), seatIndex: i, buttonSeat: 0 })).position
  assert.equal(at(0), 'btn')
  assert.equal(at(1), 'sb')
  assert.equal(at(2), 'bb')
  assert.equal(at(3), 'ep')
  assert.equal(at(4), 'mp')
  assert.equal(at(5), 'co')
})

test('heads-up: button is the small blind, other seat is the big blind', () => {
  const seats = [seat(0, 10000, 50), seat(1, 10000, 100)]
  const btn = derivePublicContext(obs({ seats, seatIndex: 0, buttonSeat: 0 }))
  const bb = derivePublicContext(obs({ seats, seatIndex: 1, buttonSeat: 0 }))
  assert.equal(btn.position, 'btn')
  assert.equal(btn.isSmallBlind, true)
  assert.equal(btn.isButton, true)
  assert.equal(bb.position, 'bb')
  assert.equal(bb.isBigBlind, true)
})

test('effective stack is the smaller of own and largest in-hand opponent (in bb)', () => {
  const seats = [seat(0, 4000), seat(1, 10000, 50), seat(2, 10000, 100)]
  const ctx = derivePublicContext(obs({ seats, seatIndex: 0, buttonSeat: 0 }))
  assert.equal(ctx.ownStackBb, 40) // 4000 / 100
  assert.equal(ctx.effectiveStackBb, 40) // min(own 4000, largest opp 10100) / 100
})

test('preflop situation is read from public action history', () => {
  const hist = (...es: PublicActionEntry[]) => es
  const raise: PublicActionEntry = { seatIndex: 3, street: 'PREFLOP', type: 'raise', to: 300, addedChips: 300 }
  const reRaise: PublicActionEntry = { seatIndex: 5, street: 'PREFLOP', type: 'raise', to: 900, addedChips: 900 }
  const limp: PublicActionEntry = { seatIndex: 4, street: 'PREFLOP', type: 'call', addedChips: 100 }

  const unopened = derivePublicContext(obs({ seats: six(), seatIndex: 0, buttonSeat: 0, actionHistory: hist() }))
  assert.equal(unopened.preflop, 'unopened')
  assert.equal(unopened.preflopRaises, 0)

  const limped = derivePublicContext(obs({ seats: six(), seatIndex: 0, buttonSeat: 0, actionHistory: hist(limp) }))
  assert.equal(limped.preflop, 'limped')

  const raised = derivePublicContext(obs({ seats: six(), seatIndex: 0, buttonSeat: 0, currentBet: 300, actionHistory: hist(raise) }))
  assert.equal(raised.preflop, 'raised')
  assert.equal(raised.preflopRaises, 1)

  const threeBet = derivePublicContext(obs({ seats: six(), seatIndex: 0, buttonSeat: 0, currentBet: 900, actionHistory: hist(raise, reRaise) }))
  assert.equal(threeBet.preflop, 'threebet_plus')
  assert.equal(threeBet.isPreflopAggressor, false)

  const iAggress = derivePublicContext(obs({ seats: six(), seatIndex: 5, buttonSeat: 0, currentBet: 900, actionHistory: hist(raise, reRaise) }))
  assert.equal(iAggress.isPreflopAggressor, true)
})

test('historyless fallback infers the pot state from the bet level (practice path)', () => {
  const unopened = derivePublicContext(obs({ seats: six(), seatIndex: 0, buttonSeat: 0, currentBet: 100 }))
  assert.equal(unopened.preflopRaises, 0)
  const raised = derivePublicContext(obs({ seats: six(), seatIndex: 0, buttonSeat: 0, currentBet: 300 }))
  assert.equal(raised.preflopRaises, 1)
  const threeBet = derivePublicContext(obs({ seats: six(), seatIndex: 0, buttonSeat: 0, currentBet: 900 }))
  assert.equal(threeBet.preflopRaises, 2)
})

test('facing all-in is flagged only when an opponent is all-in and we owe chips', () => {
  const seats = [seat(0, 10000), seat(1, 0, 5000, 'allin'), seat(2, 10000)]
  const facing = derivePublicContext(obs({ seats, seatIndex: 0, buttonSeat: 0, toCall: 5000 }))
  assert.equal(facing.facingAllIn, true)
  const notFacing = derivePublicContext(obs({ seats, seatIndex: 0, buttonSeat: 0, toCall: 0 }))
  assert.equal(notFacing.facingAllIn, false)
})

test('multiway + opponents count reflect in-hand seats only', () => {
  const seats = [seat(0, 10000), seat(1, 10000), seat(2, 10000, 0, 'folded'), seat(3, 10000)]
  const ctx = derivePublicContext(obs({ seats, seatIndex: 0, buttonSeat: 0 }))
  assert.equal(ctx.opponents, 2) // seats 1 & 3 (seat 2 folded)
  assert.equal(ctx.multiway, true)
})
