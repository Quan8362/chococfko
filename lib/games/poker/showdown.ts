// ── Poker showdown & settlement orchestration (pure) ───────────────────────────────
//
// PURE module — no React, no Supabase, no browser API. Tested by showdown.test.ts.
//
// Ties the evaluator and pot modules together: determines each pot's winner(s), splits exact
// ties, applies the uncalled refund, and produces the LEGALLY REVEALED-card metadata. A player
// who is not required to show may muck and their cards are NEVER placed in the reveal output
// (SHOWDOWN-MUCK-001 / SHOWDOWN-REVEAL-001). A single remaining player wins with no showdown
// and no reveal (POT-ONELEFT-001).
//
// 🔴 PRIVACY: `reveal` contains ONLY the cards of non-folded, non-mucking contenders. Folded
// and mucked hole cards never appear here (SECURITY-HOLE-CARDS-001).

import type { Card, Pot, Payout } from './types.ts'
import { evaluateHand } from './evaluator.ts'
import {
  buildPots,
  settlePots,
  type SeatContribution,
  type UncalledRefund,
} from './pot.ts'
import { seatOrderFromButton } from './order.ts'

export interface ShowdownReveal {
  readonly seatIndex: number
  readonly cards: readonly [Card, Card]
}

export interface ShowdownResult {
  readonly payouts: readonly Payout[]
  readonly refund: UncalledRefund | null
  readonly pots: readonly Pot[]
  readonly winnersByPot: readonly (readonly number[])[] // winners for pots[i]
  readonly reveal: readonly ShowdownReveal[] // non-mucking contenders only
  readonly showOrder: readonly number[]
  readonly wentToShowdown: boolean
}

export interface ShowdownInput {
  readonly contribs: readonly SeatContribution[]
  readonly board: readonly Card[] // up to 5 community cards (runout fills to 5)
  readonly holeBySeat: ReadonlyMap<number, readonly [Card, Card]>
  readonly buttonSeat: number
  // The river's last aggressor shows first (SHOWDOWN-ORDER-001). When omitted (checked down),
  // the first active seat clockwise-left of the button shows first.
  readonly showFirstSeat?: number
}

function contenders(contribs: readonly SeatContribution[]): number[] {
  return contribs.filter((c) => !c.folded).map((c) => c.seatIndex)
}

// POT-ONELEFT-001: exactly one non-folded seat — they win the whole pot immediately, no
// showdown, no card reveal.
function settleOneLeft(contribs: readonly SeatContribution[], winnerSeat: number): ShowdownResult {
  const { pots, refund } = buildPots(contribs)
  const payouts = settlePots(pots, (seat) => (seat === winnerSeat ? 1 : 0), [winnerSeat])
  return {
    payouts,
    refund,
    pots,
    winnersByPot: pots.map(() => [winnerSeat]),
    reveal: [], // SHOWDOWN-MUCK-001: an uncontested winner never shows
    showOrder: [],
    wentToShowdown: false,
  }
}

export function settleShowdown(input: ShowdownInput): ShowdownResult {
  const contesting = contenders(input.contribs)
  if (contesting.length === 0) {
    // Degenerate (everyone folded) — nothing to award beyond refunds.
    const { pots, refund } = buildPots(input.contribs)
    return { payouts: [], refund, pots, winnersByPot: pots.map(() => []), reveal: [], showOrder: [], wentToShowdown: false }
  }
  if (contesting.length === 1) {
    return settleOneLeft(input.contribs, contesting[0])
  }

  // Score every contender from its best 5-of-7 (HAND-USE-001). Higher score wins.
  const scoreBySeat = new Map<number, number>()
  for (const seat of contesting) {
    const hole = input.holeBySeat.get(seat)
    if (!hole) throw new Error(`showdown: missing hole cards for contending seat ${seat}`)
    scoreBySeat.set(seat, evaluateHand(hole, input.board).score)
  }
  const score = (seat: number) => {
    const s = scoreBySeat.get(seat)
    if (s === undefined) throw new Error(`showdown: scored a non-contending seat ${seat}`)
    return s
  }

  const dealtSeats = input.contribs.map((c) => c.seatIndex)
  const fromButton = seatOrderFromButton(dealtSeats, input.buttonSeat)

  const { pots, refund } = buildPots(input.contribs)
  const payouts = settlePots(pots, score, fromButton)

  const winnersByPot = pots.map((pot) => {
    if (pot.eligibleSeatIndexes.length === 0) return []
    let best = -Infinity
    for (const seat of pot.eligibleSeatIndexes) best = Math.max(best, score(seat))
    return pot.eligibleSeatIndexes.filter((seat) => score(seat) === best)
  })

  // Show order: contenders clockwise from the button, rotated so the show-first seat leads.
  const contenderOrder = fromButton.filter((seat) => contesting.includes(seat))
  let showOrder = contenderOrder
  if (input.showFirstSeat !== undefined && contenderOrder.includes(input.showFirstSeat)) {
    const pivot = contenderOrder.indexOf(input.showFirstSeat)
    showOrder = [...contenderOrder.slice(pivot), ...contenderOrder.slice(0, pivot)]
  }

  // Reveal vs muck (SHOWDOWN-MUCK-001): the first to show always shows; a later seat may muck
  // if it cannot match the best already-shown hand. Winners always equal the best, so they show.
  const reveal: ShowdownReveal[] = []
  let bestShown = -Infinity
  for (const seat of showOrder) {
    const s = score(seat)
    const mustShow = reveal.length === 0 || s >= bestShown
    if (mustShow) {
      const hole = input.holeBySeat.get(seat)!
      reveal.push({ seatIndex: seat, cards: hole })
      bestShown = Math.max(bestShown, s)
    }
  }

  return { payouts, refund, pots, winnersByPot, reveal, showOrder, wentToShowdown: true }
}
