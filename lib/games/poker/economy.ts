// ── Poker coin-escrow vocabulary + buy-in bounds (PURE, integer-only) ──────────────────
//
// PURE module — no React, no Supabase. The single TS source of truth for the poker-specific
// coin-ledger reasons (kept in sync with migration_poker_economy.sql's CHECK) and the buy-in
// bound math. Coins are play-money "xu" (zero monetary value). All math is integer
// (COIN-INT-001) — never floating point. Reuses ENTRY_MIN_BALANCE from lib/game/economy.ts.

import { ENTRY_MIN_BALANCE } from '../../game/economy.ts'

// coin_ledger.reason values poker writes for WALLET↔stack crossings. Stack↔pot movements are
// escrow-internal and audited in poker_actions / poker_hand_settlements, NOT here.
export const POKER_LEDGER_REASONS = [
  'poker_sit_down',
  'poker_top_up',
  'poker_rebuy',
  'poker_stand_up',
] as const
export type PokerLedgerReason = (typeof POKER_LEDGER_REASONS)[number]

export const POKER_ENTRY_MIN_BALANCE = ENTRY_MIN_BALANCE // 10_000 — must hold to sit down

// Default buy-in window in big blinds (BUYIN-MIN/MAX-001). A table may narrow this.
export const DEFAULT_MIN_BUY_IN_BB = 40
export const DEFAULT_MAX_BUY_IN_BB = 100

export interface BuyInBounds {
  readonly min: number // integer coins
  readonly max: number // integer coins
}

// Buy-in coin bounds for a table: [minBb × BB, maxBb × BB]. Integer in → integer out.
export function buyInBounds(
  bigBlind: number,
  minBb: number = DEFAULT_MIN_BUY_IN_BB,
  maxBb: number = DEFAULT_MAX_BUY_IN_BB,
): BuyInBounds {
  if (!Number.isInteger(bigBlind) || bigBlind <= 0) throw new Error('poker: bigBlind must be a positive integer')
  if (!Number.isInteger(minBb) || !Number.isInteger(maxBb) || minBb <= 0 || maxBb < minBb) {
    throw new Error('poker: invalid buy-in bb bounds')
  }
  return { min: minBb * bigBlind, max: maxBb * bigBlind }
}

// Server-side validation mirror of poker_sit_down's bounds (UI may pre-check; server re-checks).
export function isBuyInInRange(amount: number, bounds: BuyInBounds): boolean {
  return Number.isInteger(amount) && amount >= bounds.min && amount <= bounds.max
}
