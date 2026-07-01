// ── Poker pot, side-pots & settlement (pure, integer-only) ─────────────────────────
//
// PURE module — no React, no Supabase, no browser API. Tested by pot.test.ts.
//
// Builds the main pot and layered side-pots from each seat's TOTAL hand contribution, handles
// the uncalled-bet refund, decides pot eligibility, and settles each pot independently with
// integer split and odd-chip-by-position. ALL math is integer (COIN-INT-001) and conserves
// coins exactly (POT-CONSERVE-001).
//
// Rule IDs: POT-UNCALLED-001, POT-MAIN-001, POT-SIDE-001/002, POT-ELIG-001, POT-INDEP-001,
// POT-SPLIT-001, POT-ODD-001, CONTRIB-FOLDED-001, POT-CONSERVE-001.

import type { Pot, Payout } from './types.ts'
import { assertCoin, splitInteger, sumCoins } from '../shared/coins.ts'

// One seat's standing for pot construction. `committed` is the TOTAL across all streets
// (CONTRIB-TOTAL-001). Folded seats keep their chips in the pot (dead money,
// CONTRIB-FOLDED-001) but are never eligible to win (POT-ELIG-001).
export interface SeatContribution {
  readonly seatIndex: number
  readonly committed: number
  readonly folded: boolean
}

export interface UncalledRefund {
  readonly seatIndex: number
  readonly amount: number
}

export interface PotBuild {
  readonly pots: readonly Pot[] // pots[0] is the main pot; the rest are side-pots
  readonly refund: UncalledRefund | null
}

// POT-UNCALLED-001: if exactly one seat committed strictly more than every other seat, the
// excess over the second-highest contribution is uncalled and refunded to that seat BEFORE any
// pot is built. Returns null when the top contribution is matched (a tie at the top).
export function detectUncalledRefund(contribs: readonly SeatContribution[]): UncalledRefund | null {
  if (contribs.length === 0) return null
  let max = -1
  let second = -1
  let maxSeat = -1
  let maxCount = 0
  for (const c of contribs) {
    assertCoin(c.committed, 'committed')
    if (c.committed > max) {
      second = max
      max = c.committed
      maxSeat = c.seatIndex
      maxCount = 1
    } else if (c.committed === max) {
      maxCount++
    } else if (c.committed > second) {
      second = c.committed
    }
  }
  if (maxCount !== 1) return null // top is matched → nothing uncalled
  const refund = max - Math.max(second, 0)
  if (refund <= 0) return null
  return { seatIndex: maxSeat, amount: refund }
}

function sortedEligible(seats: readonly number[]): number[] {
  return [...seats].sort((a, b) => a - b)
}

function sameSet(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

// Build main + side-pots (POT-MAIN-001 / POT-SIDE-001/002). The uncalled excess (if any) is
// removed first and the top seat's effective contribution is capped at the second-highest.
export function buildPots(contribs: readonly SeatContribution[]): PotBuild {
  const refund = detectUncalledRefund(contribs)

  // Effective contributions after removing the uncalled excess.
  const effective = contribs.map((c) =>
    refund && c.seatIndex === refund.seatIndex
      ? { ...c, committed: c.committed - refund.amount }
      : c,
  )

  // Distinct positive contribution levels, ascending — each is a side-pot boundary.
  const levels = Array.from(
    new Set(effective.filter((c) => c.committed > 0).map((c) => c.committed)),
  ).sort((a, b) => a - b)

  const rawPots: { amount: number; eligible: number[] }[] = []
  let prev = 0
  for (const level of levels) {
    const band = level - prev
    const contributors = effective.filter((c) => c.committed >= level)
    const amount = band * contributors.length
    const eligible = sortedEligible(contributors.filter((c) => !c.folded).map((c) => c.seatIndex))
    rawPots.push({ amount, eligible })
    prev = level
  }

  // Merge consecutive layers with identical eligible sets (eligibility shrinks monotonically as
  // the level rises, so equal sets are always adjacent). Drop zero-amount layers.
  const merged: { amount: number; eligible: number[] }[] = []
  for (const layer of rawPots) {
    if (layer.amount === 0) continue
    const last = merged[merged.length - 1]
    if (last && sameSet(last.eligible, layer.eligible)) {
      last.amount += layer.amount
    } else {
      merged.push({ amount: layer.amount, eligible: layer.eligible })
    }
  }

  const pots: Pot[] = merged.map((m) => ({ amount: m.amount, eligibleSeatIndexes: m.eligible }))
  // Guarantee at least an (empty) main pot so callers always have pots[0].
  if (pots.length === 0) pots.push({ amount: 0, eligibleSeatIndexes: [] })

  return { pots, refund }
}

// ── Settlement (POT-INDEP-001 / POT-SPLIT-001 / POT-ODD-001) ─────────────────────────

// `score(seat)` returns the seat's comparable hand strength (higher wins; ties split). It is
// only ever called for eligible seats, so folded/mucked seats need no score.
// `seatOrderFromButton` lists seat indexes clockwise starting from the first seat left of the
// button (SB seat). The odd chip goes to the EARLIEST winner in that order (POT-ODD-001).
export function settlePots(
  pots: readonly Pot[],
  score: (seatIndex: number) => number,
  seatOrderFromButton: readonly number[],
): Payout[] {
  const award = new Map<number, number>()
  const orderIndex = (seat: number) => {
    const i = seatOrderFromButton.indexOf(seat)
    return i === -1 ? Number.MAX_SAFE_INTEGER : i
  }

  for (const pot of pots) {
    if (pot.amount === 0 || pot.eligibleSeatIndexes.length === 0) continue
    let best = -Infinity
    for (const seat of pot.eligibleSeatIndexes) {
      const s = score(seat)
      if (s > best) best = s
    }
    const winners = pot.eligibleSeatIndexes
      .filter((seat) => score(seat) === best)
      .sort((a, b) => orderIndex(a) - orderIndex(b)) // earliest-from-button first for odd chips

    const { base, remainder } = splitInteger(pot.amount, winners.length)
    winners.forEach((seat, i) => {
      const extra = i < remainder ? 1 : 0 // POT-ODD-001: one odd chip each to earliest winners
      award.set(seat, (award.get(seat) ?? 0) + base + extra)
    })
  }

  return Array.from(award.entries())
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => a[0] - b[0])
    .map(([seatIndex, amount]) => ({ seatIndex, amount }))
}

// POT-CONSERVE-001 helper: Σ(pot awards) + Σ(refunds) must equal Σ(total contributions).
export function totalContributed(contribs: readonly SeatContribution[]): number {
  return sumCoins(contribs.map((c) => c.committed))
}

export function isSettlementConserved(
  contribs: readonly SeatContribution[],
  payouts: readonly Payout[],
  refund: UncalledRefund | null,
): boolean {
  const awards = payouts.map((p) => p.amount)
  const refunds = refund ? [refund.amount] : []
  return sumCoins(awards) + sumCoins(refunds) === totalContributed(contribs)
}
