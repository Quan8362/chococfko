# Poker Economy Model

> **PLAY-MONEY ONLY.** Coins ("xu") have **zero monetary value**: no purchase, no cashout, no
> real-currency conversion, no transfer to external assets, and **no direct user-to-user
> transfer**. Nothing in this economy creates any of those. This document defines the design;
> the authoritative numbers live in [`lib/games/poker/economyConfig.ts`](../../../lib/games/poker/economyConfig.ts).

## 1. Goals

A fair, sustainable economy that:

- lets new users start playing immediately,
- prevents rapid inflation and runaway concentration,
- never permanently locks a user out (they can always recover enough to keep playing),
- limits abuse (ratholing, chip dumping, multi-accounting),
- supports multiple blind levels for beginners through high-rollers,
- does not reward manipulative behaviour, and
- preserves exact coin-accounting integrity.

## 2. The one wallet

Poker does **not** introduce a new currency or a new wallet. It reuses the shared
`public.game_wallets` + `public.coin_ledger` that already back Tiến Lên Miền Nam
(`migration_tlmn_run7_economy.sql`). One balance per user, spendable across every game.
Consequences:

- The **starting grant** (`SIGNUP_GRANT = 1,000,000`) and **busted-wallet recovery**
  (`claim_daily_coins`, `DAILY_GRANT = 200,000` when balance ≤ `10,000`, 24 h cooldown) are
  **already live**. Poker adds **no new production reward** — it inherits recovery for free.
- The coin-rank badge (`lib/games/coinTier.ts`) is shared too.

## 3. Money locations (where a coin can be)

```
game_wallets.balance  ⇄  poker_seats.stack (+ pending_topup)  ⇄  poker_hands pot
     (wallet)                    (table escrow)                     (in-hand)
```

- **Wallet ⇄ stack** crossings (sit down / top up / rebuy / stand up / cash out) write a
  `coin_ledger` row → `balance_after` is always the true wallet balance. Reasons:
  `poker_sit_down`, `poker_top_up`, `poker_rebuy`, `poker_stand_up`.
- **Stack ⇄ pot** movements (bets, settlement, refunds) are **escrow-internal** — they never
  cross the wallet, so they are audited in `poker_actions` / `poker_hand_settlements`, not the
  ledger. This keeps `coin_ledger` a strict, always-correct wallet ledger while still fully
  auditing every coin. Conservation is enforced and tested either way.

See `migration_poker_economy.sql` for the SECURITY DEFINER RPCs that own every crossing.

## 4. Integer-only law (COIN-INT-001)

All coin math is integer `bigint`/`number`. No floating point in blinds, bets, pots,
side-pots, splits, or refunds. Enforced in JS by `lib/games/shared/coins.ts` and in the DB by
`bigint` columns + `CHECK (balance >= 0)`. The economy config validator
(`validateEconomyConfig`) rejects any non-integer faucet or blind value.

## 5. Server authority

The browser may *request* an action; it never decides cards, winners, pot values, legal
actions, turn order, stack changes, or settlement. Every coin-changing command runs inside a
SECURITY DEFINER RPC with `SELECT … FOR UPDATE` (deterministic lock order) and is **idempotent**
(a duplicate request moves no extra coins). Private hole cards never appear in any public
payload, broadcast, spectator view, log, or cache.

## 6. Faucets and sinks (summary)

| Kind | Source/Sink | Notes |
|---|---|---|
| Faucet | Signup grant (1,000,000, once) | shared wallet, already live |
| Faucet | Busted recovery (200,000, ≤10,000, 24 h) | shared `claim_daily_coins`, already live |
| Faucet | Approved achievement reward | **future, requires approval** |
| Faucet | Admin correction | audited, service-role, no arbitrary rewrite |
| Sink | Poker settlement | **none** — zero-sum (no rake/ante/straddle) |
| Sink | Cosmetic purchases | **future, optional, requires approval** |

Because settlement is zero-sum, **gameplay neither creates nor destroys coins** — it only moves
them between players. The *only* inflation source is the faucets. Full detail in
[`faucets-and-sinks.md`](./faucets-and-sinks.md).

## 7. Blind tiers

Six readable tiers from Micro (50/100) to Whale (100k/200k), each with the 40–100 BB buy-in
rule. A fresh 1,000,000 wallet buys ~100 Micro max-buy-ins, so a beginner cannot bust out of
the whole game in one session. Full ladder in [`blind-tiers.md`](./blind-tiers.md).

## 8. Anti-abuse controls

- **Ratholing / value-transfer:** a deep voluntary leaver must return with their retained
  stack inside a 30-minute window; rapid rejoins are throttled; technical reconnects are
  exempt. See [`ratholing-policy.md`](./ratholing-policy.md).
- **Multi-seating:** one seat per table (enforced in `poker_reserve_seat` / `poker_sit_down`),
  and a config cap on concurrent seats across tables.
- **Chip dumping / collusion:** the ranking metric and a collusion-risk heuristic are designed
  so a farm cannot manufacture a rank or safely funnel coins. See
  [`ranking-definition.md`](./ranking-definition.md).

## 9. Configuration & rollback

Every tunable is versioned in `economyConfig.ts` and mirrored in the (pending)
`poker_economy_config` table. Publishing a version is immutable; activation and rollback are
service-role, audited actions that **never touch balances**. Admin flow and guarantees are in
[`ranking-definition.md`](./ranking-definition.md) §Admin and the migration header.

## 10. Non-goals / hard limits

No real-money gambling. No cashout. No external-asset transfer. No unreviewed paid coin
purchases. No direct user-to-user transfer. No changing existing balances without an approved
migration + rollback plan. No destructive migrations.
