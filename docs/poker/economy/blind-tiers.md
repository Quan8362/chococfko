# Blind Tiers

Authoritative source: `POKER_ECONOMY_V1.blindTiers` in
[`lib/games/poker/economyConfig.ts`](../../../lib/games/poker/economyConfig.ts). This document
explains the design; the numbers here must match that module (and the seeded
`poker_economy_config` row).

## 1. Rules every tier obeys

- **SB = BB / 2**, integer coins, ascending — validated by `validateEconomyConfig`
  (`tier_bad_blinds`).
- **Buy-in = 40–100 BB** (`DEFAULT_MIN_BUY_IN_BB` / `DEFAULT_MAX_BUY_IN_BB`), the industry-
  standard cash-game window. Min buy-in `= 40 × BB`, max `= 100 × BB`
  (`buyInBoundsForTier`).
- **Readable numbers** — every value is a round 1/2/5 × power of ten.
- **Six tiers only** — enough to serve beginners through high-rollers without fragmenting the
  lobby into dozens of near-identical stakes.

## 2. The ladder (v1)

| Tier | SB | BB | Min buy-in (40 BB) | Max buy-in (100 BB) | Intended wallet range | Volatility |
|---|---:|---:|---:|---:|---|---|
| **Micro**  | 50 | 100 | 4,000 | 10,000 | 10,000 – 100,000 | low |
| **Low**    | 250 | 500 | 20,000 | 50,000 | 100,000 – 500,000 | low |
| **Medium** | 1,000 | 2,000 | 80,000 | 200,000 | 500,000 – 2,000,000 | medium |
| **High**   | 5,000 | 10,000 | 400,000 | 1,000,000 | 2,000,000 – 10,000,000 | medium |
| **Elite**  | 25,000 | 50,000 | 2,000,000 | 5,000,000 | 10,000,000 – 50,000,000 | high |
| **Whale**  | 100,000 | 200,000 | 8,000,000 | 20,000,000 | 50,000,000+ | high |

Each tier is 5× the previous BB, so the whole ladder spans Micro → Whale in five steps.

## 3. Why these numbers

- **Beginner safety.** A fresh wallet (`SIGNUP_GRANT = 1,000,000`) buys **100** Micro
  max-buy-ins (`1,000,000 / 10,000`). A new player would have to lose 100 full stacks in one
  sitting to bust — practically impossible in a session — so nobody churns out on day one.
- **Entry gate alignment.** The entry gate (`ENTRY_MIN_BALANCE = 10,000`) equals one Micro
  max-buy-in, so "can I sit at the lowest stake?" and "am I above the recovery threshold?" are
  the same boundary. A busted player who claims recovery (200,000) immediately has ~20 Micro
  buy-ins again.
- **Meaningful top end.** At Whale (200k BB), a 20,000,000-coin max buy-in puts a real
  multi-million wallet at risk, giving high-rollers somewhere to play without inventing
  bespoke stakes.
- **Volatility guidance** (`volatility` field) drives UX copy: low-tier tables are framed as
  "learn here", high-tier as "big swings".

## 4. Wallet → tier guidance

`recommendTierForBalance(cfg, balance)` returns the richest tier the wallet is *aimed at* and
can *afford a min buy-in* for, falling back to the cheapest affordable tier, or `undefined`
when the balance can't even cover a Micro min buy-in (→ steer to recovery). This powers the
lobby's "recommended stakes" without ever forcing a choice.

## 5. Host-chosen blinds vs. sanctioned tiers

Today a host may create a table with any valid `(SB, BB)` (the lifecycle validator only checks
`SB < BB` and positivity). To reduce lobby fragmentation, an **optional** policy check is
available — `isSupportedBlindTier(cfg, sb, bb)` — that a server action *can* enforce to keep
hosts on the sanctioned ladder. It is **not** enforced by the database today; enabling it is a
product decision. Documented here so the switch is deliberate, not accidental.

## 6. Changing the ladder

Add or edit tiers only by publishing a **new config version** (`v2`, …) via
`poker_publish_economy_config` + `poker_activate_economy_config`. Never edit a published
version's body (the immutability trigger blocks it) so any prior ladder can be rolled back to
exactly. Existing seated stacks are unaffected by a tier change — only new sit-downs read the
new bounds.
