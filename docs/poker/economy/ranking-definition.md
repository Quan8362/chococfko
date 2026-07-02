# Ranking Definition

Authoritative logic: [`lib/games/poker/ranking.ts`](../../../lib/games/poker/ranking.ts) (pure,
unit-tested). Ranking is **analytics** — it reads aggregated per-player results and produces an
ordering. It **never** mutates a wallet or a stack.

## 1. The core rule: balance is not a rank

Wallet balance must **never** be a skill ranking. A big balance means "got a big signup grant"
or "played a lot", not "good", and ranking by balance would directly reward:

- **chip dumping** (funnel many accounts' coins into one), and
- **multi-accounting** (fund one account from many).

So every skill metric below is a **rate** or **net-result** metric, gated by a minimum sample
**and** a minimum number of **distinct opponents** — the control a colluding farm cannot pass.

## 2. Metrics

| Metric | Meaning | Public? | Notes |
|---|---|---|---|
| `bb_per_100` | big blinds won per 100 hands | ✅ **primary** | stake-independent skill rate |
| `net_bb_won` | total big blinds won | ✅ | volume-weighted; favours grinders |
| `hands_played` | participation | ✅ | no coin signal; cannot be gamed for coins |
| `showdown_win_rate` | won ÷ showdowns reached | ✅ | secondary skill signal |
| `biggest_pot_bb` | biggest single pot won (bb) | ✅ | fun stat, not skill |
| `net_profit_chips` | raw coin profit | ❌ **internal only** | dumping-sensitive; ops dashboards only |

Big-blind figures are carried upstream as **hundredths of a bb** (`netBbHundredths`) so a
normalized rate needs no floating-point accumulation. Coins stay integer.

**Primary published metric (v1): `bb_per_100`** (`leaderboardMetric` in `economyConfig.ts`). It
is stake-independent — a 100-coin BB win and a 200,000-coin BB win each count as 1 bb — so
Micro grinders and Whale players are compared fairly, and inflating raw chip counts (the
dumping goal) does not move it.

## 3. Eligibility gate (anti-farm)

A player appears on a **skill** leaderboard only when **both** hold
(`DEFAULT_RANK_ELIGIBILITY`):

- `handsPlayed ≥ minHands` (**500**) — enough sample to blunt variance, and
- `distinctOpponents ≥ minDistinctOpponents` (**8**) — the anti-farm control: two (or a few)
  colluding accounts can never satisfy it, and a closed private-table group can't either.

`hands_played` (pure participation) and `net_profit_chips` (internal) intentionally skip the
gate — participation is not a skill claim, and raw profit is never public. Every genuine skill
metric is gated (`rankPlayers`).

## 4. Deterministic ordering

`rankPlayers` sorts by metric value **desc**, then `handsPlayed` **desc**, then `userId`
**asc** — a total order, so the leaderboard is stable and reproducible (no random tie-breaks).

## 5. Collusion / chip-dumping signal

`collusionRiskScore` produces a 0–1 score from:

- **counterparty concentration** — share of all winnings that came from a single opponent
  (`single_counterparty_dominant` at ≥ 70%), and
- **opponent scarcity** — very few distinct opponents (`few_distinct_opponents` at < 4), plus a
  `fast_large_winner` flag for large profit over very few hands.

It is a **review signal**, never an automatic penalty. A broad grinder scores near 0; a
lopsided dump-collector scores high. Remediation flows through the audited admin/incident
system, not through ranking.

## 6. Seasons

`season.enabled = false` at launch. When enabled, a season is a fixed-length window
(`lengthDays`, default 90) whose **only** reset scope is `leaderboard_only` — a seasonal reset
archives and clears the leaderboard window and **never touches wallets**. Seasonal participation
can itself become a (gated) metric later.

## 7. Admin configuration, versioning & rollback

The published leaderboard metric and every economy threshold live in a **versioned** config:

- **Versioned + effective-dated:** `economyConfig.ts` registry; DB mirror in the pending
  `poker_economy_config` table (`version` PK, `effective_from`, `is_active`).
- **Validated:** `validateEconomyConfig` (and an admin "preview") must pass before a version is
  activated.
- **Audited:** `poker_publish_economy_config` / `poker_activate_economy_config` are
  service-role, take a mandatory actor + reason, and write an append-only
  `poker_economy_config_audit` row in the same transaction.
- **Rollback:** activating an older published version is a first-class, audited rollback;
  published bodies are immutable so any prior config can be restored exactly.
- **No arbitrary balance rewrite:** activation/rollback change *which tuning is active*, never a
  balance. Coins move only through the settlement/faucet RPCs.

At most one version is active at a time (partial unique index on `is_active`).

## 8. What the ranking must never do

- Never rank by wallet balance.
- Never publish a metric that rewards dumping or multi-accounting (raw profit stays internal).
- Never mutate coins.
- Never reset wallets on a seasonal roll.
