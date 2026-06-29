// ── Coin-rank tiers — SINGLE SOURCE OF TRUTH ────────────────────────────────────────
//
// The dynamic coin badge a player wears is ALWAYS derived from their CURRENT spendable
// balance (public.game_wallets.balance). It is never a stored entitlement: cross a
// threshold up → upgrade; drop below → downgrade/remove. Do NOT scatter these numbers
// across components — import getCoinTier()/TIERS everywhere instead.
//
// Thresholds are in "xu" coins (PLAY-MONEY, zero monetary value). bigint in Postgres;
// JS numbers represent integers exactly up to 2^53 (~9e15), well above any reachable
// balance, so reading the balance into a number here is safe.

export type CoinTier = 'bronze' | 'silver' | 'gold' | 'diamond' | 'vip'

export type CoinTierDef = {
  key: CoinTier
  /** i18n key (within the shared `coin_tier` namespace) for the localized tier name. */
  labelKey: string
  /** i18n key (within `coin_tier`) for the tooltip / accessible description. */
  descKey: string
  /** Inclusive minimum current balance to hold this tier. */
  minBalance: number
  /** Display order (ascending prestige). */
  order: number
  /** Visual token key used by CoinTierBadge to pick the palette/emblem. */
  iconKey: CoinTier
}

// A next-intl translate fn (from useTranslations('coin_tier') / getTranslations('coin_tier')).
// Typed loosely here because the tier keys are resolved dynamically.
export type CoinTierTranslate = (key: string, values?: Record<string, string | number>) => string

// Initial default thresholds (centralized so an admin config table can override later):
//   Bronze  ≥ 1B   < 2B
//   Silver  ≥ 2B   < 3B
//   Gold    ≥ 3B   < 5B
//   Diamond ≥ 5B   < 10B
//   VIP     ≥ 10B
export const TIERS: readonly CoinTierDef[] = [
  { key: 'bronze',  labelKey: 'bronze',  descKey: 'bronze_desc',  minBalance: 1_000_000_000,  order: 1, iconKey: 'bronze' },
  { key: 'silver',  labelKey: 'silver',  descKey: 'silver_desc',  minBalance: 2_000_000_000,  order: 2, iconKey: 'silver' },
  { key: 'gold',    labelKey: 'gold',    descKey: 'gold_desc',    minBalance: 3_000_000_000,  order: 3, iconKey: 'gold' },
  { key: 'diamond', labelKey: 'diamond', descKey: 'diamond_desc', minBalance: 5_000_000_000,  order: 4, iconKey: 'diamond' },
  { key: 'vip',     labelKey: 'vip',     descKey: 'vip_desc',     minBalance: 10_000_000_000, order: 5, iconKey: 'vip' },
] as const

// Highest tier per descending threshold — used by getCoinTier to find the best match.
const TIERS_DESC = [...TIERS].sort((a, b) => b.minBalance - a.minBalance)

/**
 * Resolve the highest tier the current balance satisfies, or `null` when the balance is
 * below the first threshold (= no badge). Always derived from the live balance, so it
 * upgrades/downgrades correctly across every boundary (and handles multi-tier jumps).
 */
export function getCoinTier(balance: number | null | undefined): CoinTierDef | null {
  if (balance == null || !Number.isFinite(balance) || balance <= 0) return null
  for (const tier of TIERS_DESC) {
    if (balance >= tier.minBalance) return tier
  }
  return null
}

export function getTierByKey(key: CoinTier): CoinTierDef | undefined {
  return TIERS.find(t => t.key === key)
}

// Localized tier name, e.g. "Vàng" / "Gold". `t` = useTranslations('coin_tier').
export function coinTierName(t: CoinTierTranslate, def: CoinTierDef): string {
  return t(def.labelKey)
}

// Localized accessible name + tooltip, e.g. "Huy hiệu Vàng – số dư từ 3 tỷ xu".
export function coinTierAria(t: CoinTierTranslate, def: CoinTierDef): string {
  return t('badge_aria', { tier: t(def.labelKey), desc: t(def.descKey) })
}
