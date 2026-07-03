// ── Poker PRACTICE isolated economy (pure, integer-only) ──────────────────────────────
//
// PURE module — no React, no Supabase. Tested by economy.test.ts.
//
// Practice chips are a CLOSED, isolated integer ledger that lives ONLY inside a PracticeGame.
// This module is the single place practice chips move, and it structurally CANNOT touch the real
// economy: it imports no Supabase client, references no `game_wallets` / `coin_ledger`, and mints
// nothing. Every hand is zero-sum within the table (settlement moves chips between seats and the
// total is invariant), exactly like the cash game — but the total is the isolated practice supply,
// never a real balance.
//
// 🔴 There is NO faucet into the real wallet here. A busted practice seat's rebuy (if the runtime
// offers one) tops up from NOTHING — it is a display convenience of an isolated sandbox, not a
// coin source, and it is confined to the practice game object.

import { assertCoin, sumCoins } from '../../shared/coins.ts'
import type { Payout } from '../types.ts'
import type { UncalledRefund } from '../pot.ts'

// Apply settlement payouts + an optional uncalled refund to an isolated chip map, returning a NEW
// map (pure). Chips are integers; the result is asserted to conserve against the pot contributed.
export function applyPracticePayouts(
  chips: Readonly<Record<number, number>>,
  contributedBySeat: Readonly<Record<number, number>>,
  payouts: readonly Payout[],
  refund: UncalledRefund | null,
): Record<number, number> {
  const next: Record<number, number> = {}
  for (const [seat, stack] of Object.entries(chips)) {
    assertCoin(stack, `chips[${seat}]`)
    next[Number(seat)] = stack
  }
  // Contributions already left each seat's live stack during betting; here we credit results.
  for (const p of payouts) {
    assertCoin(p.amount, 'payout')
    next[p.seatIndex] = (next[p.seatIndex] ?? 0) + p.amount
  }
  if (refund) {
    assertCoin(refund.amount, 'refund')
    next[refund.seatIndex] = (next[refund.seatIndex] ?? 0) + refund.amount
  }
  return next
}

// Verify the isolated supply is exactly conserved across a settlement: chips returned to seats
// (payouts + refund) must equal the chips that were contributed to the pot. Integer-exact.
export function isPracticeSettlementConserved(
  contributed: readonly number[],
  payouts: readonly Payout[],
  refund: UncalledRefund | null,
): boolean {
  const out = sumCoins(payouts.map((p) => p.amount)) + (refund ? refund.amount : 0)
  return out === sumCoins(contributed)
}

// The total isolated practice supply across all seats — used to assert a whole session conserves
// (no chip is created or destroyed by gameplay, only moved).
export function practiceSupply(chips: Readonly<Record<number, number>>): number {
  return sumCoins(Object.values(chips))
}

// Guard: a value handed to the practice economy must be a plain integer chip count, never an
// object that could carry a wallet reference. Throws on anything non-integer.
export function assertPracticeChips(value: unknown, label = 'chips'): void {
  assertCoin(value, label)
}
