import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeRng } from '../../tlmn/ai/seededRandom.ts'
import type { Card, Street } from '../types.ts'
import type { LegalAction } from '../betting.ts'
import { buildObservation, type ObservedSeat, type PublicActionEntry } from './observation.ts'
import { policyFor } from './policies.ts'
import type { BotDifficulty } from './policy.ts'

const H = (a: string, b: string): [Card, Card] => [a as Card, b as Card]
const B = (...cs: string[]) => cs as Card[]

function seat(i: number, stack: number, committed = 0, status: ObservedSeat['status'] = 'active'): ObservedSeat {
  return { seatIndex: i, stack, committedThisStreet: committed, committedTotal: committed, status, inHand: status === 'active' || status === 'allin' }
}

function post(opts: {
  actor: number
  hole: [Card, Card]
  board: Card[]
  seats: ObservedSeat[]
  button: number
  currentBet: number
  toCall: number
  legal: LegalAction[]
  street?: Street
  history?: PublicActionEntry[]
}) {
  return buildObservation({
    seatIndex: opts.actor,
    holeCards: opts.hole,
    fullBoard: opts.board,
    street: opts.street ?? 'FLOP',
    seats: opts.seats,
    buttonSeat: opts.button,
    bigBlind: 100,
    currentBet: opts.currentBet,
    toCall: opts.toCall,
    minRaiseTo: opts.currentBet > 0 ? opts.currentBet * 2 : 100,
    maxRaiseTo: (opts.seats.find((s) => s.seatIndex === opts.actor)?.stack ?? 0) + (opts.seats.find((s) => s.seatIndex === opts.actor)?.committedThisStreet ?? 0),
    legal: opts.legal,
    actionHistory: opts.history ?? [],
  })
}

const heads = (aStack = 5000, bStack = 5000, aCommit = 0, bCommit = 0): ObservedSeat[] => [seat(0, aStack, aCommit), seat(1, bStack, bCommit)]

test('value bet: a set on a dry board bets when checked to', () => {
  const obs = post({
    actor: 0,
    hole: H('Ac', 'Ad'),
    board: B('As', '7h', '2c'),
    seats: heads(4900, 4900, 100, 100),
    button: 0,
    currentBet: 0,
    toCall: 0,
    legal: [{ type: 'check' }, { type: 'bet', min: 100, max: 4900 }],
  })
  for (const d of ['normal', 'hard'] as BotDifficulty[]) {
    const a = policyFor(d)(obs, makeRng(9)).action
    assert.equal(a.type, 'bet', `${d} should value-bet a set`)
    if (a.type === 'bet') assert.ok(Number.isInteger(a.to) && a.to >= 100 && a.to <= 4900)
  }
})

test('never fold a set facing a bet (raise or call for value)', () => {
  const obs = post({
    actor: 0,
    hole: H('Ac', 'Ad'),
    board: B('Ah', 'Kd', 'Qc'),
    seats: [seat(0, 4600, 100), seat(1, 4400, 300)],
    button: 0,
    currentBet: 300,
    toCall: 300,
    legal: [{ type: 'fold' }, { type: 'call', amount: 300 }, { type: 'raise', min: 600, max: 4600 }],
  })
  for (const d of ['normal', 'hard'] as BotDifficulty[]) {
    assert.notEqual(policyFor(d)(obs, makeRng(9)).action.type, 'fold')
  }
})

test('fold air facing a pot-sized bet (no equity, no draw)', () => {
  const obs = post({
    actor: 0,
    hole: H('2c', '7d'),
    board: B('As', 'Kd', 'Qc'),
    seats: [seat(0, 4600, 100), seat(1, 4400, 400)],
    button: 0,
    currentBet: 400,
    toCall: 400,
    legal: [{ type: 'fold' }, { type: 'call', amount: 400 }, { type: 'raise', min: 800, max: 4600 }],
  })
  for (const d of ['normal', 'hard'] as BotDifficulty[]) {
    assert.equal(policyFor(d)(obs, makeRng(9)).action.type, 'fold')
  }
})

test('air checks back OOP multiway when it cannot value-bet or bluff', () => {
  // Three opponents ⇒ the (heads-up-only) bluff branch cannot fire; air has no value ⇒ check.
  const seats = [seat(0, 4900, 100), seat(1, 4900, 100), seat(2, 4900, 100), seat(3, 4900, 100)]
  const obs = post({ actor: 0, hole: H('2c', '7d'), board: B('As', 'Kd', 'Qh'), seats, button: 3, currentBet: 0, toCall: 0, legal: [{ type: 'check' }, { type: 'bet', min: 100, max: 4900 }] })
  assert.equal(policyFor('normal')(obs, makeRng(9)).action.type, 'check')
  assert.equal(policyFor('hard')(obs, makeRng(9)).action.type, 'check')
})

test('normal & hard CAN semi-bluff a strong draw in position; easy never bluffs a marginal one', () => {
  const strongDraw = () =>
    post({
      actor: 0,
      hole: H('Ah', 'Kh'),
      board: B('Qh', '7h', '2c'), // nut flush draw + two overcards
      seats: heads(4900, 4900, 100, 100),
      button: 0, // in position heads-up
      currentBet: 0,
      toCall: 0,
      legal: [{ type: 'check' }, { type: 'bet', min: 100, max: 4900 }],
    })
  // A bare gutshot with NO overcards / flush / made hand: any bet here would be a pure bluff, and
  // its equity is far below the value bar — so a value-only bot must always check it.
  const marginalDraw = () =>
    post({
      actor: 0,
      hole: H('9c', '5d'),
      board: B('7h', '6s', '2c'),
      seats: heads(4900, 4900, 100, 100),
      button: 0,
      currentBet: 0,
      toCall: 0,
      legal: [{ type: 'check' }, { type: 'bet', min: 100, max: 4900 }],
    })

  const betsFor = (d: BotDifficulty, mk: () => ReturnType<typeof post>) => {
    let bets = 0
    for (let s = 0; s < 40; s++) if (policyFor(d)(mk(), makeRng(s)).action.type === 'bet') bets++
    return bets
  }

  assert.ok(betsFor('normal', strongDraw) > 0, 'normal should sometimes semi-bluff a nut draw')
  assert.ok(betsFor('hard', strongDraw) > 0, 'hard should sometimes semi-bluff a nut draw')
  assert.equal(betsFor('easy', marginalDraw), 0, 'easy must never bluff a marginal draw (no bluffing capability)')
})

test('a made hand calls a priced bet it beats often enough (draw/odds continue)', () => {
  // Top pair top kicker facing a half-pot bet should not fold.
  const obs = post({
    actor: 0,
    hole: H('Ah', 'Kd'),
    board: B('As', '9d', '4c'),
    seats: [seat(0, 4600, 100), seat(1, 4400, 300)],
    button: 0,
    currentBet: 300,
    toCall: 300,
    legal: [{ type: 'fold' }, { type: 'call', amount: 300 }, { type: 'raise', min: 600, max: 4600 }],
  })
  for (const d of ['normal', 'hard'] as BotDifficulty[]) {
    assert.notEqual(policyFor(d)(obs, makeRng(9)).action.type, 'fold', `${d} should continue with top pair`)
  }
})
