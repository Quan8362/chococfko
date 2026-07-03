// ── Poker TOURNAMENT — versioned config templates + validation ──────────────────────────
//
// PURE. Config-driven single source of truth for tournament templates (blind + payout structures),
// mirroring the economyConfig.ts convention. The server re-validates every admin-authored config
// against validateTournamentConfig; the browser never decides these numbers. All chip/coin values
// are integers (COIN-INT-001). These templates are the seed reference for the migration.

import type {
  TournamentConfig,
  BlindStructure,
  PayoutStructure,
} from './types.ts'
import { validateBlindStructure } from './blinds.ts'
import { resolvePaidWeights } from './prizePool.ts'

// ── Blind structures ────────────────────────────────────────────────────────────────────
// Turbo-ish 6-max structure: 10-minute levels, an ante from L5, a 5-min break after L4.
export const BLINDS_STANDARD_6MAX: BlindStructure = {
  id: 'std-6max-v1',
  levels: [
    { level: 1, smallBlind: 10, bigBlind: 20, ante: 0, durationSeconds: 600, isBreak: false },
    { level: 2, smallBlind: 15, bigBlind: 30, ante: 0, durationSeconds: 600, isBreak: false },
    { level: 3, smallBlind: 25, bigBlind: 50, ante: 0, durationSeconds: 600, isBreak: false },
    { level: 4, smallBlind: 50, bigBlind: 100, ante: 0, durationSeconds: 600, isBreak: false },
    { level: 5, smallBlind: 0, bigBlind: 0, ante: 0, durationSeconds: 300, isBreak: true },
    { level: 6, smallBlind: 75, bigBlind: 150, ante: 20, durationSeconds: 600, isBreak: false },
    { level: 7, smallBlind: 100, bigBlind: 200, ante: 25, durationSeconds: 600, isBreak: false },
    { level: 8, smallBlind: 150, bigBlind: 300, ante: 40, durationSeconds: 600, isBreak: false },
    { level: 9, smallBlind: 200, bigBlind: 400, ante: 50, durationSeconds: 600, isBreak: false },
    { level: 10, smallBlind: 300, bigBlind: 600, ante: 75, durationSeconds: 600, isBreak: false },
    { level: 11, smallBlind: 500, bigBlind: 1000, ante: 100, durationSeconds: 600, isBreak: false },
    { level: 12, smallBlind: 800, bigBlind: 1600, ante: 200, durationSeconds: 600, isBreak: false },
  ],
}

// ── Payout structures ─────────────────────────────────────────────────────────────────────
// Weights are relative positive integers; a place's share = weight / sum(weights). The highest
// minEntries tier the field meets is used (TNMT-PAY-022).
export const PAYOUTS_STANDARD: PayoutStructure = {
  id: 'std-payout-v1',
  tiers: [
    { minEntries: 2, weights: [100] },
    { minEntries: 6, weights: [65, 35] },
    { minEntries: 10, weights: [50, 30, 20] },
    { minEntries: 18, weights: [40, 25, 20, 15] },
    { minEntries: 27, weights: [35, 23, 18, 13, 11] },
    { minEntries: 45, weights: [30, 20, 14, 11, 9, 8, 8] },
  ],
}

// ── Tournament templates ──────────────────────────────────────────────────────────────────
// A single-table Sit & Go: fills, starts, plays to a winner. No late reg / re-entry.
export const TEMPLATE_STT_6MAX: TournamentConfig = {
  entryFee: 1000,
  startingStack: 5000,
  minEntries: 2,
  maxEntries: 6,
  seatsPerTable: 6,
  blindStructure: BLINDS_STANDARD_6MAX,
  payoutStructure: PAYOUTS_STANDARD,
  guaranteedPrizePool: 0,
  lateRegUntilLevelIndex: null,
  maxReEntriesPerUser: 0,
  reEntryUntilLevelIndex: null,
}

// A scheduled multi-table tournament with late reg (through L4, index 3) and single re-entry.
export const TEMPLATE_MTT: TournamentConfig = {
  entryFee: 1000,
  startingStack: 10000,
  minEntries: 6,
  maxEntries: 180,
  seatsPerTable: 6,
  blindStructure: BLINDS_STANDARD_6MAX,
  payoutStructure: PAYOUTS_STANDARD,
  guaranteedPrizePool: 0,
  lateRegUntilLevelIndex: 3,
  maxReEntriesPerUser: 1,
  reEntryUntilLevelIndex: 3,
}

export const TOURNAMENT_TEMPLATES = {
  stt_6max: TEMPLATE_STT_6MAX,
  mtt: TEMPLATE_MTT,
} as const

export type ValidationResult = { ok: true } | { ok: false; reason: string }

export function validateTournamentConfig(c: TournamentConfig): ValidationResult {
  const posInt = (v: number, label: string): string | null =>
    Number.isInteger(v) && v > 0 ? null : `${label} must be a positive integer`
  const nonNegInt = (v: number, label: string): string | null =>
    Number.isInteger(v) && v >= 0 ? null : `${label} must be a non-negative integer`

  for (const [v, label] of [
    [c.entryFee, 'entryFee'],
    [c.startingStack, 'startingStack'],
    [c.minEntries, 'minEntries'],
    [c.maxEntries, 'maxEntries'],
    [c.seatsPerTable, 'seatsPerTable'],
  ] as const) {
    const e = posInt(v, label)
    if (e) return { ok: false, reason: e }
  }
  const gErr = nonNegInt(c.guaranteedPrizePool, 'guaranteedPrizePool')
  if (gErr) return { ok: false, reason: gErr }
  const rErr = nonNegInt(c.maxReEntriesPerUser, 'maxReEntriesPerUser')
  if (rErr) return { ok: false, reason: rErr }

  if (c.seatsPerTable < 2) return { ok: false, reason: 'seatsPerTable must be >= 2' }
  if (c.minEntries < 2) return { ok: false, reason: 'minEntries must be >= 2' }
  if (c.maxEntries < c.minEntries) return { ok: false, reason: 'maxEntries < minEntries' }

  const bs = validateBlindStructure(c.blindStructure)
  if (!bs.ok) return { ok: false, reason: `blindStructure: ${bs.reason}` }

  // Late-reg / re-entry deadlines must reference a real level index when set.
  const nLevels = c.blindStructure.levels.length
  for (const [idx, label] of [
    [c.lateRegUntilLevelIndex, 'lateRegUntilLevelIndex'],
    [c.reEntryUntilLevelIndex, 'reEntryUntilLevelIndex'],
  ] as const) {
    if (idx !== null && (!Number.isInteger(idx) || idx < 0 || idx >= nLevels)) {
      return { ok: false, reason: `${label} out of range` }
    }
  }
  if (c.maxReEntriesPerUser > 0 && c.reEntryUntilLevelIndex === null) {
    return { ok: false, reason: 're-entry enabled but reEntryUntilLevelIndex is null' }
  }

  // Payout structure must resolve a non-empty, positive-weight ladder at the minimum field size.
  if (!c.payoutStructure.tiers.length) return { ok: false, reason: 'payoutStructure has no tiers' }
  const weightsAtMin = resolvePaidWeights(c.payoutStructure, c.minEntries)
  if (!weightsAtMin.length) return { ok: false, reason: 'payoutStructure pays no places at minEntries' }

  return { ok: true }
}
