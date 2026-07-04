import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeRng } from '../../tlmn/ai/seededRandom.ts'
import type { Card } from '../types.ts'
import type { LegalAction } from '../betting.ts'
import { buildObservation, type ObservedSeat, type PublicActionEntry } from './observation.ts'
import { policyFor } from './policies.ts'
import type { BotDifficulty } from './policy.ts'

const H = (a: string, b: string): [Card, Card] => [a as Card, b as Card]

// A preflop observation builder. `seats` carry per-seat public facts; `actor` is the acting seat.
function pf(opts: {
  actor: number
  hole: [Card, Card]
  seats: ObservedSeat[]
  button: number
  currentBet: number
  toCall: number
  legal: LegalAction[]
  history?: PublicActionEntry[]
}) {
  return buildObservation({
    seatIndex: opts.actor,
    holeCards: opts.hole,
    fullBoard: [],
    street: 'PREFLOP',
    seats: opts.seats,
    buttonSeat: opts.button,
    bigBlind: 100,
    currentBet: opts.currentBet,
    toCall: opts.toCall,
    minRaiseTo: opts.currentBet + 100,
    maxRaiseTo: (opts.seats.find((s) => s.seatIndex === opts.actor)?.stack ?? 0) + (opts.seats.find((s) => s.seatIndex === opts.actor)?.committedThisStreet ?? 0),
    legal: opts.legal,
    actionHistory: opts.history ?? [],
  })
}

function seat(i: number, stack: number, committed = 0, status: ObservedSeat['status'] = 'active'): ObservedSeat {
  return { seatIndex: i, stack, committedThisStreet: committed, committedTotal: committed, status, inHand: status === 'active' || status === 'allin' }
}

// Full 6-max ring, blinds posted, unopened to the acting seat.
function ring(actor: number, extraCommitted: Record<number, number> = {}): ObservedSeat[] {
  return [0, 1, 2, 3, 4, 5].map((i) =>
    seat(i, 10000 - (extraCommitted[i] ?? (i === 1 ? 50 : i === 2 ? 100 : 0)), extraCommitted[i] ?? (i === 1 ? 50 : i === 2 ? 100 : 0)),
  )
}

const openLegal: LegalAction[] = [{ type: 'fold' }, { type: 'call', amount: 100 }, { type: 'raise', min: 200, max: 10000 }, { type: 'all_in', amount: 10000 }]

test('PFR fix: normal & hard OPEN-RAISE a premium first-in (was ~1% PFR in 27C-A)', () => {
  for (const d of ['normal', 'hard'] as BotDifficulty[]) {
    const obs = pf({ actor: 3, hole: H('As', 'Ah'), seats: ring(3), button: 0, currentBet: 100, toCall: 100, legal: openLegal })
    const a = policyFor(d)(obs, makeRng(5)).action
    assert.equal(a.type, 'raise', `${d} should open-raise AA in EP, got ${a.type}`)
  }
})

test('normal folds pure trash first-in (does not limp — raise-or-fold)', () => {
  const obs = pf({ actor: 3, hole: H('7c', '2d'), seats: ring(3), button: 0, currentBet: 100, toCall: 100, legal: openLegal })
  assert.equal(policyFor('normal')(obs, makeRng(5)).action.type, 'fold')
})

test('easy over-limps a medium hand it will not raise (bounded beginner leak)', () => {
  const obs = pf({ actor: 3, hole: H('Kc', 'Td'), seats: ring(3), button: 0, currentBet: 100, toCall: 100, legal: openLegal })
  assert.equal(policyFor('easy')(obs, makeRng(5)).action.type, 'call')
})

test('easy never 3-bets: it flat-calls a premium facing a raise', () => {
  const hist: PublicActionEntry[] = [{ seatIndex: 5, street: 'PREFLOP', type: 'raise', to: 300, addedChips: 300 }]
  const seats = ring(2, { 1: 50, 2: 100, 5: 300 })
  const obs = pf({ actor: 3, hole: H('As', 'Ah'), seats, button: 0, currentBet: 300, toCall: 300, legal: [{ type: 'fold' }, { type: 'call', amount: 300 }, { type: 'raise', min: 500, max: 10000 }], history: hist })
  assert.equal(policyFor('easy')(obs, makeRng(5)).action.type, 'call')
})

test('big blind defends WIDER than early position vs the same open', () => {
  const hist: PublicActionEntry[] = [{ seatIndex: 5, street: 'PREFLOP', type: 'raise', to: 300, addedChips: 300 }]
  const legal: LegalAction[] = [{ type: 'fold' }, { type: 'call', amount: 200 }, { type: 'raise', min: 500, max: 10000 }]
  const hand = H('Kc', 'Td') // ~0.33 normalized: below the EP call bar, above the BB (discounted) bar

  const inBb = pf({ actor: 2, hole: hand, seats: ring(2, { 1: 50, 2: 100, 5: 300 }), button: 0, currentBet: 300, toCall: 200, legal, history: hist })
  const inEp = pf({ actor: 3, hole: hand, seats: ring(3, { 1: 50, 2: 100, 5: 300 }), button: 0, currentBet: 300, toCall: 300, legal, history: hist })

  assert.equal(policyFor('normal')(inBb, makeRng(5)).action.type, 'call', 'BB should defend')
  assert.equal(policyFor('normal')(inEp, makeRng(5)).action.type, 'fold', 'EP should fold the same hand')
})

test('blind-vs-blind widens the small-blind open', () => {
  const hand = H('Kc', 'Jd') // ~0.38: below the full-ring SB open, above the blind-vs-blind open
  // Folded around to the SB (only the BB remains) — opponents === 1.
  const bvbSeats = [seat(0, 10000, 0, 'folded'), seat(1, 9950, 50), seat(2, 9900, 100), seat(3, 10000, 0, 'folded'), seat(4, 10000, 0, 'folded'), seat(5, 10000, 0, 'folded')]
  const bvb = pf({ actor: 1, hole: hand, seats: bvbSeats, button: 0, currentBet: 100, toCall: 50, legal: [{ type: 'fold' }, { type: 'call', amount: 50 }, { type: 'raise', min: 200, max: 9950 }] })
  assert.equal(policyFor('normal')(bvb, makeRng(5)).action.type, 'raise', 'SB should open blind-vs-blind')

  // Same hand, more players still in the pot (not blind-vs-blind): should not open.
  const fullSeats = ring(1)
  const full = pf({ actor: 1, hole: hand, seats: fullSeats, button: 0, currentBet: 100, toCall: 50, legal: [{ type: 'fold' }, { type: 'call', amount: 50 }, { type: 'raise', min: 200, max: 9950 }] })
  assert.equal(policyFor('normal')(full, makeRng(5)).action.type, 'fold', 'SB folds the same hand multiway')
})

test('short stack reshoves a strong hand facing a raise (jam-or-fold)', () => {
  const hist: PublicActionEntry[] = [{ seatIndex: 5, street: 'PREFLOP', type: 'raise', to: 300, addedChips: 300 }]
  // 9 bb effective, facing a raise, only fold/call/all-in legal (too short to make a min-raise).
  const seats = [seat(0, 900), seat(1, 850, 50), seat(2, 800, 100), seat(3, 900), seat(4, 900), seat(5, 600, 300)]
  const obs = pf({ actor: 3, hole: H('As', 'Ks'), seats, button: 0, currentBet: 300, toCall: 300, legal: [{ type: 'fold' }, { type: 'call', amount: 300 }, { type: 'all_in', amount: 900 }], history: hist })
  for (const d of ['normal', 'hard'] as BotDifficulty[]) {
    assert.equal(policyFor(d)(obs, makeRng(5)).action.type, 'all_in', `${d} should reshove short`)
  }
})

test('facing an all-in: call strong, fold trash', () => {
  const seats = [seat(0, 5000), seat(1, 4950, 50), seat(2, 0, 5000, 'allin')]
  const legal: LegalAction[] = [{ type: 'fold' }, { type: 'call', amount: 5000 }]
  const strong = pf({ actor: 0, hole: H('As', 'Ah'), seats, button: 0, currentBet: 5000, toCall: 5000, legal })
  const trash = pf({ actor: 0, hole: H('7c', '2d'), seats, button: 0, currentBet: 5000, toCall: 5000, legal })
  assert.equal(policyFor('hard')(strong, makeRng(5)).action.type, 'call')
  assert.equal(policyFor('hard')(trash, makeRng(5)).action.type, 'fold')
})
