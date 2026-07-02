// ── Poker RANKING aggregation (PURE) — settled-hand records → PlayerRankStats ───────────
//
// PURE module — no React, no Supabase. Transforms AUTHORITATIVE per-hand records (assembled by
// the read-only server loader from poker_hand_settlements + poker_hole_cards + poker_hands) into
// the PlayerRankStats the ranking module ranks. Never touches coins.
//
// PROVENANCE / honesty (see ranking-definition.md):
//   • handsPlayed, distinctOpponents, showdownsSeen/Won, biggestPotBbHundredths — EXACT from the
//     dealt-in seats (hole cards), the showdown reveal, and the settlement payouts.
//   • netProfitChips — EXACT: supplied per user from the coin_ledger poker wallet↔stack crossings
//     (Σ stand_up − Σ sit_down/top_up/rebuy), the true realized poker P&L.
//   • netBbHundredths — APPROXIMATE: netProfitChips normalized by the player's hand-weighted
//     average big blind. Exact per-hand bb net is not reconstructable from stored data (per-seat
//     contributions are not persisted past hand end), so this is a stake-normalized estimate.

import type { PlayerRankStats } from './ranking.ts'

// One settled hand, already reduced to what ranking needs (no cards, no secrets).
export interface HandResultRecord {
  readonly handId: string
  readonly bigBlind: number
  readonly seats: ReadonlyArray<{ readonly seatIndex: number; readonly userId: string }> // dealt-in
  readonly payouts: ReadonlyArray<{ readonly seatIndex: number; readonly amount: number }> // winners (chips)
  readonly revealSeatIndexes: readonly number[] // seats that reached showdown
}

interface Acc {
  handsPlayed: number
  showdownsSeen: number
  showdownsWon: number
  biggestPotBbHundredths: number
  opponents: Set<string>
  bbWeightSum: number // Σ bigBlind over the player's hands (for the weighted-average bb)
}

function emptyAcc(): Acc {
  return { handsPlayed: 0, showdownsSeen: 0, showdownsWon: 0, biggestPotBbHundredths: 0, opponents: new Set(), bbWeightSum: 0 }
}

// Build PlayerRankStats for every user seen across the settled hands. `ledgerNetByUser` carries
// the EXACT realized net chips per user from the coin ledger (may be absent for a user → 0).
export function buildRankStats(
  hands: readonly HandResultRecord[],
  ledgerNetByUser: ReadonlyMap<string, number>,
): PlayerRankStats[] {
  const byUser = new Map<string, Acc>()

  for (const h of hands) {
    if (!(h.bigBlind > 0)) continue
    const seatToUser = new Map<number, string>()
    for (const s of h.seats) seatToUser.set(s.seatIndex, s.userId)
    const reveal = new Set(h.revealSeatIndexes)
    const wonSeats = new Set(h.payouts.filter((p) => p.amount > 0).map((p) => p.seatIndex))

    for (const s of h.seats) {
      let a = byUser.get(s.userId)
      if (!a) { a = emptyAcc(); byUser.set(s.userId, a) }
      a.handsPlayed += 1
      a.bbWeightSum += h.bigBlind
      // distinct opponents = other dealt-in users this hand
      for (const other of h.seats) if (other.userId !== s.userId) a.opponents.add(other.userId)
      // showdown participation
      if (reveal.has(s.seatIndex)) {
        a.showdownsSeen += 1
        if (wonSeats.has(s.seatIndex)) a.showdownsWon += 1
      }
      // biggest pot won (this player's own biggest payout), in bb×100
      const myPayout = h.payouts.find((p) => p.seatIndex === s.seatIndex && p.amount > 0)?.amount ?? 0
      if (myPayout > 0) {
        const potBbH = Math.round((myPayout / h.bigBlind) * 100)
        if (potBbH > a.biggestPotBbHundredths) a.biggestPotBbHundredths = potBbH
      }
    }
  }

  const out: PlayerRankStats[] = []
  for (const [userId, a] of Array.from(byUser.entries())) {
    const netProfitChips = ledgerNetByUser.get(userId) ?? 0
    const avgBb = a.handsPlayed > 0 ? a.bbWeightSum / a.handsPlayed : 0
    const netBbHundredths = avgBb > 0 ? Math.round((netProfitChips / avgBb) * 100) : 0
    out.push({
      userId,
      handsPlayed: a.handsPlayed,
      showdownsSeen: a.showdownsSeen,
      showdownsWon: a.showdownsWon,
      netBbHundredths,
      netProfitChips,
      biggestPotBbHundredths: a.biggestPotBbHundredths,
      distinctOpponents: a.opponents.size,
      sessionsCount: 0, // filled by the loader from coin_ledger sit-down count if needed
    })
  }
  return out
}
