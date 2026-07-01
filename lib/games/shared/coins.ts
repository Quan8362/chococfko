// ── Shared multiplayer infra: safe integer coin arithmetic ─────────────────────────
//
// PURE module — no React, no Supabase. Tested by coins.test.ts.
//
// Coin-integrity law (coin-model §6 / security-model §5): ALL virtual-coin math is integer.
// No floating point anywhere in blinds, bets, pots, side-pots, splits, or refunds
// (COIN-INT-001 / B2). These helpers are the one place that invariant is enforced in JS:
// every operation rejects non-integers and guards against silent precision loss past
// Number.MAX_SAFE_INTEGER.
//
// AUTHORITY NOTE: these are pure helpers for engine/display math. The authoritative coin
// movement still happens only inside SECURITY DEFINER RPCs with `FOR UPDATE` + ledger rows
// (coin-model §3). Nothing here mutates a wallet — UI/engine code must never do that.

// Postgres stores coins as `bigint`; in JS we operate on `number`. Realistic play-money
// balances (≤ tens of billions) sit far below MAX_SAFE_INTEGER, but we still assert it so a
// bug can never silently round a balance.
export const MAX_SAFE_COINS = Number.MAX_SAFE_INTEGER

// A valid coin amount: a finite, safe, integer >= 0.
export function isCoinAmount(n: unknown): n is number {
  return (
    typeof n === 'number' &&
    Number.isInteger(n) &&
    n >= 0 &&
    n <= MAX_SAFE_COINS
  )
}

export function assertCoin(n: unknown, label = 'amount'): asserts n is number {
  if (!isCoinAmount(n)) {
    throw new Error(`coins: ${label} must be a safe non-negative integer, got ${String(n)}`)
  }
}

function assertSafeResult(n: number, op: string): number {
  if (!Number.isSafeInteger(n)) {
    throw new Error(`coins: ${op} overflowed safe-integer range`)
  }
  return n
}

export function addCoins(a: number, b: number): number {
  assertCoin(a, 'a')
  assertCoin(b, 'b')
  return assertSafeResult(a + b, 'addCoins')
}

// Subtraction that can never produce a negative balance (CHECK (balance >= 0) parity, B6).
export function subCoins(a: number, b: number): number {
  assertCoin(a, 'a')
  assertCoin(b, 'b')
  if (b > a) throw new Error(`coins: subCoins would go negative (${a} - ${b})`)
  return a - b
}

export function sumCoins(amounts: readonly number[]): number {
  let total = 0
  for (const a of amounts) {
    assertCoin(a, 'amount')
    total = assertSafeResult(total + a, 'sumCoins')
  }
  return total
}

// Clamp a desired amount to what a stack can actually pay (B6 — bets clamped to stack).
export function clampToStack(desired: number, stack: number): number {
  assertCoin(desired, 'desired')
  assertCoin(stack, 'stack')
  return Math.min(desired, stack)
}

export function clampNonNegative(n: number): number {
  if (typeof n !== 'number' || Number.isNaN(n)) throw new Error('coins: clampNonNegative got NaN')
  return n < 0 ? 0 : Math.trunc(n)
}

// Integer split with the remainder reported separately. Pots divide by integer division and
// the leftover odd chip(s) are awarded by POSITION, never by rounding or suit (POT-ODD-001).
// This helper does the safe integer division; the caller decides who gets the remainder.
export type IntegerSplit = { readonly base: number; readonly remainder: number }

export function splitInteger(total: number, parts: number): IntegerSplit {
  assertCoin(total, 'total')
  if (!Number.isInteger(parts) || parts <= 0) {
    throw new Error(`coins: splitInteger parts must be a positive integer, got ${parts}`)
  }
  const base = Math.floor(total / parts)
  const remainder = total - base * parts
  return { base, remainder }
}

// Conservation check used by settlement tests (POT-CONSERVE-001): the awards (+ uncalled
// refunds) must sum EXACTLY to the total contributions. Returns true only on exact equality.
export function isConserved(contributions: number, awards: readonly number[], refunds: readonly number[] = []): boolean {
  assertCoin(contributions, 'contributions')
  return sumCoins(awards) + sumCoins(refunds) === contributions
}
