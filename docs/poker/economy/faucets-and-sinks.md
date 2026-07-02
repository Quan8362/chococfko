# Faucets and Sinks

Every place a coin can enter ("faucet") or leave ("sink") the poker economy. The guiding rule:
**no hidden coin loss and no hidden coin mint.** Because poker settlement is zero-sum, the
supply is fully explained by faucets alone.

## 1. Faucets (the only inflation)

| # | Faucet | Amount | Trigger / gate | Cooldown | Status | Owner |
|---|---|---:|---|---|---|---|
| F1 | **Signup grant** | 1,000,000 | first wallet creation | once (lifetime) | **LIVE** (shared) | `ensure_wallet` |
| F2 | **Busted recovery** | 200,000 | balance ≤ 10,000 | 24 h | **LIVE** (shared) | `claim_daily_coins` |
| F3 | Approved achievement reward | TBD | approved milestone | per-achievement | **FUTURE — needs approval** | n/a |
| F4 | Admin correction | any | incident remediation | n/a, audited | **LIVE, restricted** | admin RPCs |

- **F1/F2 are shared with TLMN** — poker enables **no new faucet**. Recovery guarantees a user
  is never permanently locked out: at ≤ 10,000 they claim 200,000 (~20 Micro buy-ins) every
  24 h. `maxLifetimeRecoveryClaims` is `null` (cooldown-limited only) to preserve today's
  behaviour; a numeric cap can be published later if farming becomes a problem.
- **F3 is not built and not enabled.** The config table already carries faucet parameters, so a
  poker-specific reward can be wired later — but only with explicit approval. This phase adds
  **zero** new production rewards.
- **F4** (admin correction) moves coins only via audited, service-role RPCs with a mandatory
  actor + reason. It is remediation, not a reward, and never an arbitrary balance rewrite.

## 2. Sinks

| Sink | Effect | Status |
|---|---|---|
| Poker settlement | **none** — zero-sum; a loss is exactly another player's win | by design |
| Cosmetic purchases | would burn coins for non-gameplay items | **FUTURE, optional, needs approval** |
| Explicitly approved non-gameplay systems | TBD | **FUTURE, needs approval** |

There is intentionally **no rake, no ante, no straddle** (`POKER_RAKE_BPS = 0`,
`POKER_ANTE = 0`, `POKER_STRADDLE_ENABLED = false` in `lifecycle.ts`). A rake would be a hidden
sink; we don't want one in a play-money game, and its absence keeps every hand a clean zero-sum
transfer that the conservation tests can assert exactly.

## 3. Conservation

- **Per hand:** `Σ payouts + Σ refunds == Σ contributions` (`POT-CONSERVE-001`), asserted by
  `poker_settle_hand` and by `poker_full_hand_conservation_test.sql`.
- **Per wallet:** every crossing writes a `coin_ledger` row with `balance_after`, so the ledger
  is a complete, append-only history; `CHECK (balance >= 0)` forbids a negative wallet.
- **Economy-wide:** the simulation asserts `finalTotalCoins == totalFaucetCoins` — i.e. supply
  equals faucet output exactly, proving gameplay + chip-dumping are pure transfers
  (`economySim.test.ts`).

## 4. Inflation outlook

Total supply rises only at the faucet rate. From the baseline scenario (1,000 players, +20
signups/day), ~185% total growth over 90 days is dominated by **new-signup grants** (F1), not
recovery. Because grinders can only *redistribute* existing coins, inflation is bounded by
population growth, not by play volume. If signup-driven inflation ever needs damping, the
levers are: lower `startingCoins`, add an `F3` sink (cosmetics), or introduce a small time-
decay — each a **new config version**, none applied here.

## 5. What must never happen

- No faucet that is not in this table.
- No sink that silently removes coins without a ledger row / audit.
- No path that mints coins outside a SECURITY DEFINER RPC.
- No user-to-user transfer, gift, or trade of coins.
