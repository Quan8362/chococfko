// ── Poker TOURNAMENT — prize pool & place shares (TNMT-PAY) ─────────────────────────────
//
// PURE, INTEGER-ONLY. Computes the prize pool total, resolves how many places are paid + their
// weights from the payout structure, and splits the pool into per-place integer amounts with the
// frozen remainder rule (TNMT-PAY-024). Conservation is guaranteed: sum(shares) == pool.

import type { PayoutStructure, PayoutTier, TournamentConfig } from './types.ts'
import { assertCoin, sumCoins } from '../../shared/coins.ts'

// Prize pool = sum of fees, lifted to the guarantee if one applies (TNMT-PAY-010/021). `entriesGranted`
// counts every granted entry INCLUDING re-entries (each paid the fee).
export function prizePool(config: TournamentConfig, entriesGranted: number): number {
  if (!Number.isInteger(entriesGranted) || entriesGranted < 0) {
    throw new Error('prizePool: entriesGranted must be a non-negative integer')
  }
  assertCoin(config.entryFee, 'entryFee')
  const collected = config.entryFee * entriesGranted
  assertCoin(config.guaranteedPrizePool, 'guaranteedPrizePool')
  return Math.max(collected, config.guaranteedPrizePool)
}

export function collectedFees(config: TournamentConfig, entriesGranted: number): number {
  return config.entryFee * entriesGranted
}

// Overlay owed (guarantee shortfall) — the operator faucet funds this (TNMT-PAY-021). 0 when fees
// meet/exceed the guarantee.
export function overlay(config: TournamentConfig, entriesGranted: number): number {
  return Math.max(0, config.guaranteedPrizePool - collectedFees(config, entriesGranted))
}

// Resolve the paid weights for a given field size: the highest `minEntries` tier that the field
// meets wins (TNMT-PAY-022). Returns [] for an empty structure (defensive). Weights are cloned.
export function resolvePaidWeights(structure: PayoutStructure, fieldSize: number): number[] {
  const tiers = [...structure.tiers].sort((a: PayoutTier, b: PayoutTier) => b.minEntries - a.minEntries)
  for (const t of tiers) {
    if (fieldSize >= t.minEntries) {
      const w = t.weights.filter((x) => x > 0)
      // Never pay more places than there are players.
      return w.slice(0, Math.max(1, fieldSize))
    }
  }
  return []
}

export function paidPlacesCount(structure: PayoutStructure, fieldSize: number): number {
  return resolvePaidWeights(structure, fieldSize).length
}

// Split `pool` across the given integer weights → one amount per place (index 0 = 1st). Uses
// integer division; the leftover coins are handed out one at a time from the TOP place downward
// (TNMT-PAY-024). Guarantees sum(result) == pool exactly.
export function splitByWeights(pool: number, weights: readonly number[]): number[] {
  assertCoin(pool, 'pool')
  if (!weights.length) {
    if (pool !== 0) throw new Error('splitByWeights: non-zero pool with no paid places')
    return []
  }
  for (const w of weights) {
    if (!Number.isInteger(w) || w < 0) throw new Error('splitByWeights: weights must be non-negative integers')
  }
  const totalWeight = weights.reduce((a, w) => a + w, 0)
  if (totalWeight <= 0) throw new Error('splitByWeights: total weight must be positive')

  const base = weights.map((w) => Math.floor((pool * w) / totalWeight))
  let remainder = pool - base.reduce((a, x) => a + x, 0)
  // Distribute remainder from the highest-paying place downward (TNMT-PAY-024).
  for (let i = 0; i < base.length && remainder > 0; i++) {
    base[i] += 1
    remainder -= 1
  }
  // Defensive: remainder must be fully consumed (weights.length >= 1 guarantees enough places
  // because remainder < weights.length always for floor division).
  if (remainder !== 0) throw new Error('splitByWeights: remainder not conserved')
  if (sumCoins(base) !== pool) throw new Error('splitByWeights: conservation violated')
  return base
}

// Full projected payout table for a field: place (1-based) → amount. The single source the UI uses
// for "what would N-th place win".
export interface PlacePrize {
  readonly place: number
  readonly amount: number
}

export function projectedPayouts(
  config: TournamentConfig,
  entriesGranted: number,
  fieldSize: number,
): PlacePrize[] {
  const pool = prizePool(config, entriesGranted)
  const weights = resolvePaidWeights(config.payoutStructure, fieldSize)
  const amounts = splitByWeights(pool, weights)
  return amounts.map((amount, i) => ({ place: i + 1, amount }))
}
