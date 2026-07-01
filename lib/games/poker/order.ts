// ── Poker seating, button, blinds & turn order (pure) ──────────────────────────────
//
// PURE module — no React, no Supabase, no browser API. Tested by order.test.ts.
//
// Computes the dealer button, small/big-blind seats, the first player to act on each street,
// and the next eligible actor — skipping folded, all-in, sitting-out, and otherwise ineligible
// seats. Heads-up reverses the usual order (BLIND-HEADSUP-001 / -POSTFLOP-001).
//
// Rule IDs: BUTTON-001/MOVE-001, BLIND-001/SB-001, BLIND-HEADSUP-001/-POSTFLOP-001,
// BUTTON-HEADSUP-INTO/OUTOF-001, BLIND-PREFLOP/POSTFLOP-ORDER-001.

// A seat in the table ring. `eligible` = seated, not sitting out, can be dealt in (has chips).
export interface RingSeat {
  readonly seatIndex: number
  readonly eligible: boolean
}

// A seat's ability to ACT in the current betting round (active, in hand, chips behind).
export interface ActorSeat {
  readonly seatIndex: number
  readonly canAct: boolean
}

export interface BlindAssignment {
  readonly buttonSeat: number
  readonly smallBlindSeat: number
  readonly bigBlindSeat: number
  readonly isHeadsUp: boolean
}

function eligibleRing(seats: readonly RingSeat[]): number[] {
  return seats
    .filter((s) => s.eligible)
    .map((s) => s.seatIndex)
    .sort((a, b) => a - b)
}

// Clockwise seats strictly AFTER `pivot` (ascending seat index, wrapping). Works whether or not
// `pivot` itself is present in `ring`. `ring` must be sorted ascending.
function rotateAfter(ring: readonly number[], pivot: number): number[] {
  const after = ring.filter((s) => s > pivot)
  const before = ring.filter((s) => s <= pivot)
  return [...after, ...before]
}

// BUTTON-MOVE-001: the next button is the first eligible seat clockwise from the current one.
// With no current button (first hand), the lowest-indexed eligible seat takes it.
export function nextButton(seats: readonly RingSeat[], currentButton: number | null): number {
  const ring = eligibleRing(seats)
  if (ring.length === 0) throw new Error('order: no eligible seats for the button')
  if (currentButton === null) return ring[0]
  return rotateAfter(ring, currentButton)[0]
}

// Assign button / SB / BB for a hand (BLIND-001 / BLIND-HEADSUP-001). `buttonSeat` must be an
// eligible seat (caller uses nextButton). Heads-up: button posts the SB.
export function assignBlinds(seats: readonly RingSeat[], buttonSeat: number): BlindAssignment {
  const ring = eligibleRing(seats)
  if (ring.length < 2) throw new Error('order: need at least 2 eligible seats')
  if (!ring.includes(buttonSeat)) throw new Error(`order: button seat ${buttonSeat} is not eligible`)

  const afterButton = rotateAfter(ring, buttonSeat)
  if (ring.length === 2) {
    // BLIND-HEADSUP-001: button = SB, the other = BB.
    return { buttonSeat, smallBlindSeat: buttonSeat, bigBlindSeat: afterButton[0], isHeadsUp: true }
  }
  // BLIND-001: SB is left of button, BB is left of SB.
  const smallBlindSeat = afterButton[0]
  const bigBlindSeat = afterButton[1]
  return { buttonSeat, smallBlindSeat, bigBlindSeat, isHeadsUp: false }
}

// BLIND-PREFLOP-ORDER-001 / BLIND-HEADSUP-001: first seat to act preflop.
//  - Heads-up: the button (small blind) acts first.
//  - 3+: the seat left of the big blind ("under the gun").
export function firstToActPreflop(seats: readonly RingSeat[], blinds: BlindAssignment): number {
  const ring = eligibleRing(seats)
  if (blinds.isHeadsUp) return blinds.buttonSeat
  return rotateAfter(ring, blinds.bigBlindSeat)[0]
}

// BLIND-POSTFLOP-ORDER-001 / BLIND-HEADSUP-POSTFLOP-001: the FIRST seat to act on flop/turn/
// river is the first ACTIVE seat clockwise-left of the button. Heads-up the non-button (BB)
// acts first, which is exactly "first active left of the button" too. `actors.canAct` carries
// who is still able to act (not folded/all-in/sitting out).
export function firstToActPostflop(actors: readonly ActorSeat[], buttonSeat: number): number | null {
  const order = rotateAfter(
    actors.map((a) => a.seatIndex).sort((a, b) => a - b),
    buttonSeat,
  )
  for (const seat of order) {
    const a = actors.find((x) => x.seatIndex === seat)
    if (a && a.canAct) return seat
  }
  return null
}

// Next eligible actor clockwise after `fromSeatExclusive`, skipping seats that cannot act
// (folded / all-in / sitting out / ineligible). Returns null when nobody else can act.
export function nextActor(actors: readonly ActorSeat[], fromSeatExclusive: number): number | null {
  const ring = actors.map((a) => a.seatIndex).sort((a, b) => a - b)
  for (const seat of rotateAfter(ring, fromSeatExclusive)) {
    if (seat === fromSeatExclusive) continue // strictly exclusive even on a full wrap-around
    const a = actors.find((x) => x.seatIndex === seat)
    if (a && a.canAct) return seat
  }
  return null
}

// Seats clockwise starting from the first seat left of the button (the SB seat). Used for
// odd-chip awarding (POT-ODD-001) and showdown show-order fallback (SHOWDOWN-ORDER-001).
// `seatList` may be the dealt-in seats (a superset of any winner set is fine).
export function seatOrderFromButton(seatList: readonly number[], buttonSeat: number): number[] {
  return rotateAfter([...seatList].sort((a, b) => a - b), buttonSeat)
}
