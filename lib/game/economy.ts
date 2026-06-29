// ── TLMN virtual-coin ("xu") economy — single source of truth ──────────────────────
//
// PLAY-MONEY ONLY. These coins have ZERO monetary value: not convertible to real
// currency, no purchase, no cashout, no payment of any kind. This module is the one
// place the economy is tuned; the matching DB defaults live in
// supabase/migration_tlmn_run7_economy.sql and MUST be kept in sync with these numbers.

export const SIGNUP_GRANT = 1_000_000 // coins granted once, on first wallet creation
export const DAILY_GRANT = 200_000 // coins granted per daily claim when broke
export const DAILY_COOLDOWN_HRS = 24 // hours between daily claims
export const ENTRY_MIN_BALANCE = 10_000 // minimum balance required to JOIN a table
export const COIN_PER_POINT = 1_000 // coin delta = (ĐẾM LÁ card-point delta) × this
export const BROKE_THRESHOLD = ENTRY_MIN_BALANCE // at/below this → must claim daily to keep playing

export const DAILY_COOLDOWN_MS = DAILY_COOLDOWN_HRS * 60 * 60 * 1000

// Compact social-casino formatting: 1_250_000 → "1.25M", 269_260 → "269K", 9_320 → "9.3K", 940 → "940".
export function formatCoins(n: number): string {
  const v = Math.max(0, Math.round(n))
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v >= 10_000_000 ? 1 : 2)}M`.replace(/\.0+M$/, 'M')
  if (v >= 1_000) return `${(v / 1_000).toFixed(v >= 100_000 ? 0 : 1)}K`.replace(/\.0K$/, 'K')
  return `${v}`
}

// Compact leaderboard/badge formatting WITH billions: 1_000 → "1K", 1_000_000 → "1M",
// 1_000_000_000 → "1B", 1_500_000_000 → "1.5B". Trailing ".0" is trimmed so exact powers
// read cleanly ("1B" not "1.0B"). Use formatCoinsFull() for the exact value in a tooltip.
export function formatCoinsShort(n: number): string {
  const v = Math.max(0, Math.round(n))
  const trim = (val: number, suffix: string, decimals: number) =>
    `${val.toFixed(decimals).replace(/\.?0+$/, '')}${suffix}`
  if (v >= 1_000_000_000) return trim(v / 1_000_000_000, 'B', v >= 10_000_000_000 ? 1 : 2)
  if (v >= 1_000_000) return trim(v / 1_000_000, 'M', v >= 10_000_000 ? 1 : 2)
  if (v >= 1_000) return trim(v / 1_000, 'K', v >= 100_000 ? 0 : 1)
  return `${v}`
}

// Exact value with thousands separators for tooltips / accessible labels, e.g.
// 1_000_000_000 → "1,000,000,000". Fixed en-US grouping so it never varies by locale.
export function formatCoinsFull(n: number): string {
  return Math.max(0, Math.round(n)).toLocaleString('en-US')
}

// Format a remaining duration (ms) as a ticking countdown "HH:MM:SS" (display only —
// eligibility is always re-checked server-side against now() in Postgres).
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}
