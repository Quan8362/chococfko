// ── Poker player statistics (pure, integer-only) ─────────────────────────────────────────
//
// PURE module — no Supabase, no React, no browser API. Tested by stats.test.ts.
//
// Derives a player's authoritative per-hand outcome and aggregate record from the completed
// hand's engine contributions + the settlement payouts. Play-money coins are integers
// (COIN-INT-001) and every quantity here stays integer.
//
// 🔴 The net stack change for a seat in a hand is:
//
//        net = payout + uncalledRefund − committed
//
// The uncalled-bet refund (POT-UNCALLED-001) is credited back to the seat's stack at settlement
// but is NOT persisted in the payouts audit (poker_hand_settlements.payouts holds only pot
// awards). It MUST be reconstructed from the SAME contributions the settlement used
// (detectUncalledRefund) — otherwise the net is understated by that refund and, in particular, a
// fold win where an over-bet was returned is misreported as break-even (its true net is > 0).
//
// A hand "went to showdown" when ≥2 non-folded contenders remained at the end. A seat "reached
// showdown" when it was one of those contenders — INDEPENDENT of whether it won or mucked. A
// mucked hand is absent from the public `reveal` (SHOWDOWN-MUCK-001), so reveal membership
// undercounts showdowns; contribution/fold state is the authoritative signal.

import { detectUncalledRefund, type SeatContribution } from './pot.ts'

export interface SeatPayout {
  readonly seatIndex: number
  readonly amount: number
}

export interface SeatHandOutcome {
  readonly contributed: number
  readonly payout: number
  readonly refund: number
  readonly net: number
  readonly folded: boolean
  readonly wentToShowdown: boolean
  readonly reachedShowdown: boolean
  readonly wonHand: boolean // won at least one pot (a positive award)
  readonly wonWithoutShowdown: boolean
  readonly result: 'won' | 'lost' | 'even'
}

// Sum a seat's pot awards (a split pot may award the seat from multiple pots).
export function seatPayoutAmount(payouts: readonly SeatPayout[] | null | undefined, seat: number): number {
  let sum = 0
  for (const p of payouts ?? []) if (p.seatIndex === seat) sum += p.amount
  return sum
}

// Authoritative per-seat outcome for ONE completed hand. `contribs` are the seat contributions
// the settlement was computed from (each seat's total committed + folded flag); `payouts` are the
// persisted pot awards.
export function seatHandOutcome(
  contribs: readonly SeatContribution[],
  payouts: readonly SeatPayout[] | null | undefined,
  seat: number,
): SeatHandOutcome {
  const mine = contribs.find((c) => c.seatIndex === seat)
  const contributed = mine?.committed ?? 0
  const folded = mine?.folded ?? false
  const uncalled = detectUncalledRefund(contribs)
  const refund = uncalled && uncalled.seatIndex === seat ? uncalled.amount : 0
  const payout = seatPayoutAmount(payouts, seat)
  const net = payout + refund - contributed
  const contenders = contribs.filter((c) => !c.folded).length
  const wentToShowdown = contenders >= 2
  const reachedShowdown = wentToShowdown && mine != null && !folded
  const wonHand = payout > 0
  return {
    contributed,
    payout,
    refund,
    net,
    folded,
    wentToShowdown,
    reachedShowdown,
    wonHand,
    wonWithoutShowdown: wonHand && !wentToShowdown,
    result: net > 0 ? 'won' : net < 0 ? 'lost' : 'even',
  }
}

export interface PokerStatsAgg {
  handsPlayed: number
  handsWon: number
  showdownsReached: number
  showdownsWon: number
  biggestPotWon: number
  netChange: number
}

export function emptyPokerStats(): PokerStatsAgg {
  return { handsPlayed: 0, handsWon: 0, showdownsReached: 0, showdownsWon: 0, biggestPotWon: 0, netChange: 0 }
}

// One completed hand the caller was dealt into. `contribs` come from the authoritative engine
// state; when it is missing (a legacy/partial row) `contribs` is null and we degrade to the
// public payouts + reveal seats only (net cannot include the unknown contribution/refund).
export interface HandForStats {
  readonly contribs: readonly SeatContribution[] | null
  readonly payouts: readonly SeatPayout[] | null
  readonly seat: number
  readonly revealSeats?: readonly number[] | null // fallback showdown signal when contribs is null
}

// Aggregate the caller's record across their completed hands. Each hand is counted exactly once
// (the caller passes a de-duplicated set of hands), so retries / duplicate settlement events
// never double-count.
export function aggregatePokerStats(hands: readonly HandForStats[]): PokerStatsAgg {
  const agg = emptyPokerStats()
  for (const h of hands) {
    agg.handsPlayed++
    if (h.contribs) {
      const o = seatHandOutcome(h.contribs, h.payouts, h.seat)
      agg.netChange += o.net
      if (o.wonHand) {
        agg.handsWon++
        if (o.payout > agg.biggestPotWon) agg.biggestPotWon = o.payout
      }
      if (o.reachedShowdown) {
        agg.showdownsReached++
        if (o.wonHand) agg.showdownsWon++
      }
    } else {
      // Degrade-safe: engine state missing → net from payout only, showdown from public reveal.
      const payout = seatPayoutAmount(h.payouts, h.seat)
      agg.netChange += payout
      if (payout > 0) {
        agg.handsWon++
        if (payout > agg.biggestPotWon) agg.biggestPotWon = payout
      }
      const rs = h.revealSeats ?? []
      if (rs.length > 0 && rs.includes(h.seat)) {
        agg.showdownsReached++
        if (payout > 0) agg.showdownsWon++
      }
    }
  }
  return agg
}
