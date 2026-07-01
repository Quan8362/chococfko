// Framework-free tests for seating, button, blinds & turn order.
// Run with:  node --test lib/games/poker/order.test.ts
//
// Maps to BUTTON-001/MOVE-001, BLIND-001/SB-001, BLIND-HEADSUP-001/-POSTFLOP-001,
// BUTTON-HEADSUP-INTO/OUTOF-001, BLIND-DEADBTN-001, BLIND-PREFLOP/POSTFLOP-ORDER-001.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  nextButton,
  assignBlinds,
  firstToActPreflop,
  firstToActPostflop,
  nextActor,
  seatOrderFromButton,
  type RingSeat,
  type ActorSeat,
} from './order.ts'

const ring = (...eligible: number[]): RingSeat[] =>
  [0, 1, 2, 3, 4, 5].map((seatIndex) => ({ seatIndex, eligible: eligible.includes(seatIndex) }))

const actors = (canActSeats: number[], allSeats: number[]): ActorSeat[] =>
  allSeats.map((seatIndex) => ({ seatIndex, canAct: canActSeats.includes(seatIndex) }))

// ── BUTTON-MOVE-001 ──────────────────────────────────────────────────────────────────
test('BUTTON-MOVE-001 button moves one eligible seat clockwise, wrapping', () => {
  const seats = ring(0, 1, 2, 3)
  assert.equal(nextButton(seats, null), 0) // first hand → lowest eligible
  assert.equal(nextButton(seats, 0), 1)
  assert.equal(nextButton(seats, 3), 0) // wrap
  // skips an ineligible seat
  assert.equal(nextButton(ring(0, 2, 3), 0), 2)
})

// ── BLIND-001 / BLIND-SB-001: 3+ handed ──────────────────────────────────────────────
test('BLIND-001 three-handed SB is left of button, BB left of SB', () => {
  const seats = ring(0, 1, 2)
  const b = assignBlinds(seats, 0)
  assert.equal(b.isHeadsUp, false)
  assert.equal(b.buttonSeat, 0)
  assert.equal(b.smallBlindSeat, 1)
  assert.equal(b.bigBlindSeat, 2)
})

test('BLIND-PREFLOP-ORDER-001 UTG (left of BB) acts first preflop; BB last', () => {
  const seats = ring(0, 1, 2, 3, 4)
  const b = assignBlinds(seats, 0) // SB=1, BB=2
  assert.equal(firstToActPreflop(seats, b), 3) // left of BB(2) = seat 3 (UTG)
})

// ── BLIND-POSTFLOP-ORDER-001 ─────────────────────────────────────────────────────────
test('BLIND-POSTFLOP-ORDER-001 first active left of button acts first postflop', () => {
  const seats = [0, 1, 2, 3]
  // SB seat 1 folded; first active left of button(0) is seat 2.
  const a = actors([2, 3, 0], seats)
  assert.equal(firstToActPostflop(a, 0), 2)
})

// ── BLIND-HEADSUP-001 / -POSTFLOP-001 ────────────────────────────────────────────────
test('BLIND-HEADSUP-001 heads-up: button posts SB and acts first preflop', () => {
  const seats = ring(2, 5)
  const b = assignBlinds(seats, 2)
  assert.equal(b.isHeadsUp, true)
  assert.equal(b.smallBlindSeat, 2) // button = SB
  assert.equal(b.bigBlindSeat, 5)
  assert.equal(firstToActPreflop(seats, b), 2) // button acts first preflop
})

test('BLIND-HEADSUP-POSTFLOP-001 heads-up: non-button (BB) acts first postflop', () => {
  // button = 2 (SB), BB = 5. Postflop the BB acts first.
  const a = actors([2, 5], [2, 5])
  assert.equal(firstToActPostflop(a, 2), 5)
})

// ── BUTTON-HEADSUP transitions ───────────────────────────────────────────────────────
test('BUTTON-HEADSUP-INTO-001 dropping to two players recomputes heads-up blinds', () => {
  // 3-handed table where one seat became ineligible → heads-up rule applies next hand.
  const seats = ring(1, 4) // only two eligible now
  const button = nextButton(seats, 1) // move from old button 1 → next eligible
  const b = assignBlinds(seats, button)
  assert.equal(b.isHeadsUp, true)
  assert.equal(b.smallBlindSeat, button)
})

test('BUTTON-HEADSUP-OUTOF-001 returning to 3 players uses multi-handed blind order', () => {
  const seats = ring(0, 1, 2)
  const b = assignBlinds(seats, 0)
  assert.equal(b.isHeadsUp, false)
  assert.equal(b.smallBlindSeat, 1)
  assert.equal(b.bigBlindSeat, 2)
})

// ── BLIND-DEADBTN-001 ────────────────────────────────────────────────────────────────
test('BLIND-DEADBTN-001 blind assignment is deterministic when seats are non-contiguous', () => {
  // Eligible seats 0,2,5 (gaps from players who left). Button on 2.
  const seats = ring(0, 2, 5)
  const b = assignBlinds(seats, 2)
  assert.equal(b.smallBlindSeat, 5) // next clockwise after 2
  assert.equal(b.bigBlindSeat, 0) // wraps to 0
  assert.equal(firstToActPreflop(seats, b), 2) // UTG wraps back to the button seat
})

// ── nextActor: skip folded / all-in / sit-out / ineligible ───────────────────────────
test('nextActor returns the next seat that can act, skipping the rest', () => {
  // seats 0..4; only 2 and 4 can act (others folded/all-in/sit-out).
  const a = actors([2, 4], [0, 1, 2, 3, 4])
  assert.equal(nextActor(a, 0), 2)
  assert.equal(nextActor(a, 2), 4)
  assert.equal(nextActor(a, 4), 2) // wrap
})

test('nextActor returns null when nobody else can act', () => {
  const a = actors([3], [0, 1, 2, 3])
  assert.equal(nextActor(a, 3), null) // only seat 3 can act, exclusive of itself
})

// ── seatOrderFromButton (odd-chip + show order) ──────────────────────────────────────
test('seatOrderFromButton lists seats clockwise from the first seat left of the button', () => {
  assert.deepEqual(seatOrderFromButton([0, 1, 2, 3], 0), [1, 2, 3, 0])
  assert.deepEqual(seatOrderFromButton([0, 1, 2, 3], 2), [3, 0, 1, 2])
  assert.deepEqual(seatOrderFromButton([0, 2, 5], 2), [5, 0, 2])
})
