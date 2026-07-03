// ── Poker TOURNAMENT — settlement & payout (TNMT-PAY / TNMT-CANCEL) ──────────────────────
//
// PURE, INTEGER-ONLY. Turns finishing places + a prize table into the concrete payout rows, with
// TIE handling (TNMT-PAY-026) and hard conservation checks (TNMT-PAY-030). Also implements the two
// cancellation branches (pre-start full refund, post-start chip-proportional) from
// cancellation-policy.md. Nothing here moves coins — it produces the rows the DEFINER settlement
// RPC writes idempotently.

import type { EliminationRecord, PayoutRecord, TournamentConfig } from './types.ts'
import type { PlacePrize } from './prizePool.ts'
import { assertCoin, sumCoins } from '../../shared/coins.ts'
import { placeMultiplicity } from './elimination.ts'

// Idempotency key for a single entry's settlement (TNMT-PAY-028).
export function settlementKey(tournamentId: string, entryId: string): string {
  return `settle:${tournamentId}:${entryId}`
}
export function refundKey(tournamentId: string, entryId: string): string {
  return `refund:${tournamentId}:${entryId}`
}

// place → prize amount lookup; 0 for unpaid places.
function prizeLookup(placePrizes: readonly PlacePrize[]): (place: number) => number {
  const m = new Map<number, number>()
  for (const p of placePrizes) m.set(p.place, p.amount)
  return (place: number) => m.get(place) ?? 0
}

// Split an integer `amount` across `n` members as evenly as possible; the remainder goes one coin
// at a time to the FIRST members of `orderedForRemainder` (caller pre-orders — e.g. lower entryId
// for ties, larger stack for proportional). Returns amounts aligned to `orderedForRemainder`.
function evenSplitWithRemainder(amount: number, n: number): { base: number; remainder: number } {
  const base = Math.floor(amount / n)
  return { base, remainder: amount - base * n }
}

// Final settlement of a COMPLETED tournament (TNMT-PAY-028). `records` are the finishing places
// (from elimination.assignFinishingOrder), `placePrizes` the projected prize per place. Produces
// one payout row per entry (amount may be 0 for unpaid finishes). Asserts sum == pool.
export function settleFinal(records: readonly EliminationRecord[], placePrizes: readonly PlacePrize[]): PayoutRecord[] {
  const prizeAt = prizeLookup(placePrizes)
  const mult = placeMultiplicity(records)
  const pool = sumCoins(placePrizes.map((p) => p.amount))

  // Group members by their (shared) finishing place.
  const byPlace = new Map<number, EliminationRecord[]>()
  for (const r of records) {
    const arr = byPlace.get(r.finishingPlace) ?? []
    arr.push(r)
    byPlace.set(r.finishingPlace, arr)
  }

  const out: PayoutRecord[] = []
  for (const [place, members] of Array.from(byPlace.entries())) {
    const T = mult.get(place) ?? members.length
    // Combined prize for a tie block = prizes for places [place .. place + T - 1] (TNMT-PAY-026).
    let combined = 0
    for (let p = place; p < place + T; p++) combined += prizeAt(p)
    assertCoin(combined, 'combined')

    if (members.length === 1) {
      out.push({ entryId: members[0].entryId, userId: members[0].userId, place, amount: combined })
      continue
    }
    // True tie: split combined evenly; remainder to LOWER entryId first (frozen, TNMT-PAY-026).
    const ordered = [...members].sort((a, b) => (a.entryId < b.entryId ? -1 : 1))
    const { base, remainder } = evenSplitWithRemainder(combined, ordered.length)
    ordered.forEach((m, i) => {
      out.push({ entryId: m.entryId, userId: m.userId, place, amount: base + (i < remainder ? 1 : 0) })
    })
  }

  const total = sumCoins(out.map((r) => r.amount))
  if (total !== pool) throw new Error(`settleFinal: conservation violated (${total} != ${pool})`)
  return out
}

// ── Cancellation: pre-start full refund (TNMT-CANCEL-010) ───────────────────────────────
// Refunds every entry its entry fee. Conservation is vs collected FEES (no overlay owed pre-start,
// TNMT-CANCEL-030).
export function settlePreStartRefund(
  entries: readonly { readonly entryId: string; readonly userId: string }[],
  entryFee: number,
): PayoutRecord[] {
  assertCoin(entryFee, 'entryFee')
  return entries.map((e) => ({ entryId: e.entryId, userId: e.userId, place: null, amount: entryFee }))
}

// ── Cancellation: post-start chip-proportional (TNMT-CANCEL-020..023) ───────────────────
// `pool` is the effective prize pool. `lockedPrizes` are payouts already locked for players who
// were in the money before the cancel — they are removed from the pool first. The remainder is
// split among still-LIVE players in proportion to current chips; integer remainder goes one coin at
// a time to the LARGEST stack first (tie-break lower entryId). Returns lockedPrizes + live splits;
// asserts total == pool.
export function settlePostStartCancellation(
  pool: number,
  lockedPrizes: readonly PayoutRecord[],
  livePlayers: readonly { readonly entryId: string; readonly userId: string; readonly chips: number }[],
): PayoutRecord[] {
  assertCoin(pool, 'pool')
  const lockedTotal = sumCoins(lockedPrizes.map((r) => r.amount))
  if (lockedTotal > pool) throw new Error('settlePostStartCancellation: locked prizes exceed pool')
  const remaining = pool - lockedTotal

  const totalChips = livePlayers.reduce((a, p) => a + p.chips, 0)
  const out: PayoutRecord[] = [...lockedPrizes]

  if (livePlayers.length === 0 || totalChips === 0) {
    // No live players / no chips to weight by: nothing more to distribute. (Any remaining is a
    // caller/data error — assert conservation below will catch a nonzero remainder.)
    if (remaining !== 0) throw new Error('settlePostStartCancellation: remainder with no live players')
    return out
  }

  // Single live player → treated as winner of the remaining pool (TNMT-CANCEL-023).
  if (livePlayers.length === 1) {
    out.push({ entryId: livePlayers[0].entryId, userId: livePlayers[0].userId, place: null, amount: remaining })
    assertTotal(out, pool)
    return out
  }

  const base = livePlayers.map((p) => ({ p, amount: Math.floor((remaining * p.chips) / totalChips) }))
  let rem = remaining - base.reduce((a, x) => a + x.amount, 0)
  // Remainder: largest stack first, tie-break lower entryId (TNMT-CANCEL-022).
  const order = [...base].sort((a, b) => (b.p.chips - a.p.chips) || (a.p.entryId < b.p.entryId ? -1 : 1))
  for (let i = 0; i < order.length && rem > 0; i++) {
    order[i].amount += 1
    rem -= 1
  }
  for (const b of base) out.push({ entryId: b.p.entryId, userId: b.p.userId, place: null, amount: b.amount })

  assertTotal(out, pool)
  return out
}

function assertTotal(rows: readonly PayoutRecord[], expected: number): void {
  const total = sumCoins(rows.map((r) => r.amount))
  if (total !== expected) throw new Error(`payout: conservation violated (${total} != ${expected})`)
}

// Convenience: verify a completed settlement conserves against the entry fees collected (used by
// tests + the release audit). `entriesGranted` includes re-entries.
export function conservesAgainstFees(config: TournamentConfig, entriesGranted: number, rows: readonly PayoutRecord[]): boolean {
  const collected = config.entryFee * entriesGranted
  const paid = sumCoins(rows.map((r) => r.amount))
  // Payout may exceed fees only by a funded overlay; without a guarantee they must match exactly.
  if (config.guaranteedPrizePool <= collected) return paid === collected
  return paid === config.guaranteedPrizePool
}
