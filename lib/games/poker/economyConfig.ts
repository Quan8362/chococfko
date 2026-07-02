// ── Poker ECONOMY CONFIGURATION — versioned, config-driven single source of truth ─────
//
// PURE module — no React, no Supabase, no clock, no process.env. Every tunable number the
// poker economy depends on lives here as a VERSIONED config object. The server re-validates
// every host/player intent against the ACTIVE config; the browser may pre-check the same
// numbers but never decides them.
//
// PLAY-MONEY LAW: coins ("xu") have ZERO monetary value — no purchase, no cashout, no
// real-currency conversion, no user-to-user transfer. Nothing here creates any of those.
//
// COIN-INT-001: all coin amounts are integers. Blind tiers, buy-in bounds and faucet grants
// are integer coins; only advisory display ratios may be fractional.
//
// SYNC: the wallet-level faucet constants (starting grant, daily recovery, cooldown, entry
// gate) are RE-USED from the shared TLMN wallet in lib/game/economy.ts so poker can never
// drift from the one wallet every game shares. The matching DB defaults live in
// supabase/migration_tlmn_run7_economy.sql (wallet) and a PENDING
// supabase/migration_poker_economy_config.sql (versioned config table). KEEP IN SYNC.

import {
  SIGNUP_GRANT,
  DAILY_GRANT,
  DAILY_COOLDOWN_HRS,
  ENTRY_MIN_BALANCE,
} from '../../game/economy.ts'
import { DEFAULT_MIN_BUY_IN_BB, DEFAULT_MAX_BUY_IN_BB, buyInBounds, type BuyInBounds } from './economy.ts'
import type { PokerRankingMetric } from './ranking.ts'

// ── Sub-configs ────────────────────────────────────────────────────────────────────────

// Coin faucets (the ONLY inflation sources — see faucets-and-sinks.md). Poker settlement is
// zero-sum (no rake/ante), so it never creates or destroys coins; only these faucets do.
export interface FaucetConfig {
  readonly startingCoins: number          // one-time grant on first wallet creation
  readonly dailyRecoveryCoins: number     // per-claim recovery grant for a busted wallet
  readonly recoveryCooldownHours: number  // hours between recovery claims
  readonly recoveryEligibilityBalance: number // may claim only when balance <= this ("busted")
  // Optional lifetime cap on recovery claims (null = no hard cap; cooldown still rate-limits).
  // A cap defends against a farm that mints coins purely by claiming forever; null keeps the
  // existing TLMN behaviour (never permanently locked out) unchanged.
  readonly maxLifetimeRecoveryClaims: number | null
}

// A blind level. smallBlind/bigBlind are integer coins; buy-in bounds are per-tier in BB.
export interface BlindTier {
  readonly id: string                  // stable slug: 'micro' | 'low' | ...
  readonly smallBlind: number
  readonly bigBlind: number
  readonly minBuyInBb: number          // typically DEFAULT_MIN_BUY_IN_BB (40)
  readonly maxBuyInBb: number          // typically DEFAULT_MAX_BUY_IN_BB (100)
  readonly recommendedWalletMin: number      // advisory: wallet floor this tier is aimed at
  readonly recommendedWalletMax: number | null // advisory: null = open-ended (top tier)
  readonly volatility: 'low' | 'medium' | 'high' // expected session swing, for UX guidance
}

export interface TableLimitsConfig {
  readonly minSeats: number
  readonly maxSeats: number
  readonly maxTablesCreatedPerUser: number    // simultaneously OPEN tables a user may host
  readonly maxConcurrentSeatsPerUser: number  // seats occupied across ALL tables at once
}

export interface RatholingConfig {
  readonly retainedStackWindowMinutes: number // window in which a deep leaver must return deep
  readonly minReturnStackFactorPct: number    // must return with >= this % of retained stack (100 = full)
  readonly rejoinWindowMinutes: number        // sliding window for counting rejoins to a table
  readonly maxRejoinsPerWindow: number        // rejoins allowed to the SAME table per window
  readonly rapidRejoinCooldownSeconds: number // enforced pause after hitting the rejoin cap
  readonly reconnectGraceSeconds: number      // disconnect within this → treated as reconnect, no rathole rule
}

export interface SessionSafeguardConfig {
  readonly softReminderMinutes: number        // gentle "you've played N min" nudge
  readonly longSessionMinutes: number         // stronger break suggestion
  readonly maxDailyRecoveryClaims: number      // recovery claims counted per rolling day (UX guard)
}

export interface SeasonConfig {
  readonly enabled: boolean
  readonly lengthDays: number
  // Seasonal reset NEVER touches wallets. It only archives + resets the leaderboard window.
  readonly resetScope: 'leaderboard_only'
}

export interface PokerEconomyConfig {
  readonly version: string             // 'v1', 'v2', … — monotonic, immutable once published
  readonly effectiveFrom: string       // ISO date the config becomes active
  readonly note: string
  readonly faucet: FaucetConfig
  readonly defaultMinBuyInBb: number
  readonly defaultMaxBuyInBb: number
  readonly blindTiers: readonly BlindTier[]
  readonly tableLimits: TableLimitsConfig
  readonly ratholing: RatholingConfig
  readonly session: SessionSafeguardConfig
  readonly season: SeasonConfig
  readonly leaderboardMetric: PokerRankingMetric
}

// ── v1 — the canonical launch economy ──────────────────────────────────────────────────
//
// Blind tiers use round, readable numbers with SB = BB/2 throughout. A fresh wallet
// (startingCoins = 1,000,000) buys ~100 max buy-ins at Micro, so a beginner cannot bust
// out of the whole game in one bad session, while the ladder still reaches stakes where a
// multi-million wallet is meaningfully at risk. Six tiers keep the lobby from fragmenting.
export const POKER_ECONOMY_V1: PokerEconomyConfig = {
  version: 'v1',
  effectiveFrom: '2026-07-02',
  note: 'Launch economy: reuses shared wallet faucets; 6 readable blind tiers; leaderboard = bb/100.',
  faucet: {
    startingCoins: SIGNUP_GRANT,             // 1,000,000
    dailyRecoveryCoins: DAILY_GRANT,         // 200,000
    recoveryCooldownHours: DAILY_COOLDOWN_HRS, // 24
    recoveryEligibilityBalance: ENTRY_MIN_BALANCE, // 10,000 — "busted"
    maxLifetimeRecoveryClaims: null,         // cooldown-limited only (never permanently locked out)
  },
  defaultMinBuyInBb: DEFAULT_MIN_BUY_IN_BB,  // 40
  defaultMaxBuyInBb: DEFAULT_MAX_BUY_IN_BB,  // 100
  blindTiers: [
    { id: 'micro',  smallBlind: 50,      bigBlind: 100,     minBuyInBb: 40, maxBuyInBb: 100, recommendedWalletMin: 10_000,     recommendedWalletMax: 100_000,     volatility: 'low' },
    { id: 'low',    smallBlind: 250,     bigBlind: 500,     minBuyInBb: 40, maxBuyInBb: 100, recommendedWalletMin: 100_000,    recommendedWalletMax: 500_000,     volatility: 'low' },
    { id: 'medium', smallBlind: 1_000,   bigBlind: 2_000,   minBuyInBb: 40, maxBuyInBb: 100, recommendedWalletMin: 500_000,    recommendedWalletMax: 2_000_000,   volatility: 'medium' },
    { id: 'high',   smallBlind: 5_000,   bigBlind: 10_000,  minBuyInBb: 40, maxBuyInBb: 100, recommendedWalletMin: 2_000_000,  recommendedWalletMax: 10_000_000,  volatility: 'medium' },
    { id: 'elite',  smallBlind: 25_000,  bigBlind: 50_000,  minBuyInBb: 40, maxBuyInBb: 100, recommendedWalletMin: 10_000_000, recommendedWalletMax: 50_000_000,  volatility: 'high' },
    { id: 'whale',  smallBlind: 100_000, bigBlind: 200_000, minBuyInBb: 40, maxBuyInBb: 100, recommendedWalletMin: 50_000_000, recommendedWalletMax: null,        volatility: 'high' },
  ],
  tableLimits: {
    minSeats: 2,
    maxSeats: 6,
    maxTablesCreatedPerUser: 3,
    maxConcurrentSeatsPerUser: 2, // anti-collusion: one human should not grind many tables at once
  },
  ratholing: {
    retainedStackWindowMinutes: 30,
    minReturnStackFactorPct: 100, // a deep leaver must return with their full retained stack
    rejoinWindowMinutes: 10,
    maxRejoinsPerWindow: 3,
    rapidRejoinCooldownSeconds: 120,
    reconnectGraceSeconds: 120,   // technical drops inside this window resume without penalty
  },
  session: {
    softReminderMinutes: 90,
    longSessionMinutes: 180,
    maxDailyRecoveryClaims: 1, // matches the 24h cooldown; surfaced for UX messaging only
  },
  season: {
    enabled: false,           // seasons OFF at launch (opt-in later, leaderboard-only reset)
    lengthDays: 90,
    resetScope: 'leaderboard_only',
  },
  leaderboardMetric: 'bb_per_100',
}

// Registry of every published config version, newest first. Rollback = re-activating a prior
// entry (an admin action, audited) — it NEVER rewrites balances. New versions are APPENDED.
export const POKER_ECONOMY_VERSIONS: readonly PokerEconomyConfig[] = [POKER_ECONOMY_V1] as const

export const ACTIVE_ECONOMY_VERSION = 'v1'

export function getEconomyConfig(version: string = ACTIVE_ECONOMY_VERSION): PokerEconomyConfig {
  const found = POKER_ECONOMY_VERSIONS.find((c) => c.version === version)
  if (!found) throw new Error(`poker economy: unknown config version "${version}"`)
  return found
}

// ── Validation — the server calls this before publishing/activating any config ──────────

export type EconomyConfigError =
  | 'no_tiers'
  | 'tier_bad_blinds'       // SB/BB not positive integers, or SB >= BB, or SB*2 != BB
  | 'tier_bad_buyin_bb'     // min/max BB not positive integers or max < min
  | 'tier_bad_wallet_range' // recommended wallet range inverted
  | 'duplicate_tier_id'
  | 'bad_faucet'            // negative/non-integer faucet amounts or non-positive cooldown
  | 'bad_table_limits'
  | 'bad_ratholing'
  | 'bad_session'

export type EconomyConfigValidation =
  | { readonly ok: true }
  | { readonly ok: false; readonly errors: readonly EconomyConfigError[] }

function isPosInt(n: number): boolean {
  return Number.isInteger(n) && n > 0
}
function isNonNegInt(n: number): boolean {
  return Number.isInteger(n) && n >= 0
}

export function validateEconomyConfig(cfg: PokerEconomyConfig): EconomyConfigValidation {
  const errors: EconomyConfigError[] = []

  // Faucet: all integer coins, cooldown positive.
  const f = cfg.faucet
  if (
    !isNonNegInt(f.startingCoins) ||
    !isNonNegInt(f.dailyRecoveryCoins) ||
    !isPosInt(f.recoveryCooldownHours) ||
    !isNonNegInt(f.recoveryEligibilityBalance) ||
    (f.maxLifetimeRecoveryClaims !== null && !isNonNegInt(f.maxLifetimeRecoveryClaims))
  ) {
    errors.push('bad_faucet')
  }

  // Blind tiers.
  if (cfg.blindTiers.length === 0) errors.push('no_tiers')
  const seen = new Set<string>()
  for (const t of cfg.blindTiers) {
    if (seen.has(t.id)) errors.push('duplicate_tier_id')
    seen.add(t.id)
    if (!isPosInt(t.smallBlind) || !isPosInt(t.bigBlind) || t.smallBlind >= t.bigBlind || t.smallBlind * 2 !== t.bigBlind) {
      errors.push('tier_bad_blinds')
    }
    if (!isPosInt(t.minBuyInBb) || !isPosInt(t.maxBuyInBb) || t.maxBuyInBb < t.minBuyInBb) {
      errors.push('tier_bad_buyin_bb')
    }
    if (
      !isNonNegInt(t.recommendedWalletMin) ||
      (t.recommendedWalletMax !== null && (!isNonNegInt(t.recommendedWalletMax) || t.recommendedWalletMax < t.recommendedWalletMin))
    ) {
      errors.push('tier_bad_wallet_range')
    }
  }

  // Table limits.
  const l = cfg.tableLimits
  if (
    !isPosInt(l.minSeats) || !isPosInt(l.maxSeats) || l.maxSeats < l.minSeats ||
    !isPosInt(l.maxTablesCreatedPerUser) || !isPosInt(l.maxConcurrentSeatsPerUser)
  ) {
    errors.push('bad_table_limits')
  }

  // Ratholing.
  const r = cfg.ratholing
  if (
    !isPosInt(r.retainedStackWindowMinutes) ||
    !isNonNegInt(r.minReturnStackFactorPct) || r.minReturnStackFactorPct > 100 ||
    !isPosInt(r.rejoinWindowMinutes) || !isPosInt(r.maxRejoinsPerWindow) ||
    !isNonNegInt(r.rapidRejoinCooldownSeconds) || !isNonNegInt(r.reconnectGraceSeconds)
  ) {
    errors.push('bad_ratholing')
  }

  // Session safeguards.
  const s = cfg.session
  if (!isPosInt(s.softReminderMinutes) || !isPosInt(s.longSessionMinutes) || s.longSessionMinutes < s.softReminderMinutes || !isPosInt(s.maxDailyRecoveryClaims)) {
    errors.push('bad_session')
  }

  const unique = Array.from(new Set(errors))
  return unique.length === 0 ? { ok: true } : { ok: false, errors: unique }
}

// ── Tier helpers ────────────────────────────────────────────────────────────────────────

export function buyInBoundsForTier(t: BlindTier): BuyInBounds {
  return buyInBounds(t.bigBlind, t.minBuyInBb, t.maxBuyInBb)
}

export function findTierById(cfg: PokerEconomyConfig, id: string): BlindTier | undefined {
  return cfg.blindTiers.find((t) => t.id === id)
}

// Does a (SB,BB) pair correspond to a supported tier? Used by an OPTIONAL server check that
// keeps hosts on the sanctioned ladder to avoid lobby fragmentation. Not enforced by the DB
// today (hosts may pick blinds freely) — it is opt-in policy, documented in blind-tiers.md.
export function findTierByBlinds(cfg: PokerEconomyConfig, smallBlind: number, bigBlind: number): BlindTier | undefined {
  return cfg.blindTiers.find((t) => t.smallBlind === smallBlind && t.bigBlind === bigBlind)
}

export function isSupportedBlindTier(cfg: PokerEconomyConfig, smallBlind: number, bigBlind: number): boolean {
  return findTierByBlinds(cfg, smallBlind, bigBlind) !== undefined
}

// Recommend the highest tier whose recommendedWalletMin the balance satisfies AND which the
// balance can afford at least a min buy-in for. Returns the lowest tier when nothing else
// fits (a nearly-broke player is steered to Micro), or undefined when balance < any min buy-in.
export function recommendTierForBalance(cfg: PokerEconomyConfig, balance: number): BlindTier | undefined {
  const affordable = cfg.blindTiers.filter((t) => balance >= buyInBoundsForTier(t).min)
  if (affordable.length === 0) return undefined
  // Prefer tiers the wallet is "aimed at", else the richest affordable tier.
  const aimed = affordable.filter((t) => balance >= t.recommendedWalletMin)
  const pool = aimed.length > 0 ? aimed : affordable
  return pool.reduce((best, t) => (t.bigBlind > best.bigBlind ? t : best))
}

export { ENTRY_MIN_BALANCE, SIGNUP_GRANT, DAILY_GRANT, DAILY_COOLDOWN_HRS }
