# Poker Metrics

Source of truth: [`lib/games/poker/metrics.ts`](../../../lib/games/poker/metrics.ts) (pure math) +
[`app/admin/poker/metrics-data.ts`](../../../app/admin/poker/metrics-data.ts) (loader).
Dashboard: **`/admin/poker/metrics`** (admin-gated). Default window: **7 days (168h)**.

## Honesty contract

A metric with **no data** is reported as `null` = *unknown because there is no traffic yet* — never
as a fabricated `0%` or `0ms`. Every field carries a **provenance** so the dashboard labels it:

- **measured** — counted directly from authoritative tables.
- **audited** — produced by the live coin-integrity invariant checker over real settlements.
- **not_instrumented** — no data source yet; shown as `0`/`—` and flagged so a zero is never
  mistaken for a verified pass.

## Usage

| Metric | Source | Provenance |
|---|---|---|
| Active players | distinct seated `poker_seats.user_id` (`sitting_in`/`sitting_out`) | measured |
| Active tables | `poker_tables.status = 'open'` | measured |
| Hands started / completed / cancelled | `poker_hands` count by phase in window | measured |
| Average hand duration | `completed_at − created_at` over completed hands | measured |
| Average session duration | — | not_instrumented |
| Players by device class | — | not_instrumented |
| Players by locale | — | not_instrumented |

## Reliability

| Metric | Formula / source | Provenance |
|---|---|---|
| Hand completion rate | `completed / (completed + cancelled)` | measured |
| Action acceptance rate | `accepted / (accepted + rejected)`; accepted = `poker_actions` in window, rejected = ops `failed_action` | measured |
| Action rejection rate | `1 − acceptance` | measured |
| Realtime disconnects | ops `realtime_subscription_error` | measured (ops) |
| Sequence gaps | ops `sequence_gap` | measured (ops) |
| Snapshot recoveries | — (no ops kind yet) | not_instrumented |
| Reconnect success rate | `(attempts − failures) / attempts`; attempts/failures persisted as `poker_reconnect_*` rows in `analytics_events` (via `trackEvent` from the realtime hook) | measured (unknown until traffic) |
| Timeouts | `poker_actions.type IN (timeout_fold, timeout_check)` in window | measured |
| Frozen hands | ops `frozen_hand` | measured (ops) |
| Settlement failures | ops `settlement_failure` | measured (ops) |

## Performance (latency)

p50 / p95 / p99 per operation. Server durations are persisted as `poker_perf` rows
(`{ op, ms }`) in the existing `analytics_events` table by `recordPerf()` in `actions.ts`, then
bucketed by `groupPerfSamples()` (pure, in `lib/games/poker/perf.ts`) and summarized by the loader.

| Operation | Status |
|---|---|
| action command | **measured** (`pokerAct`) |
| snapshot | **measured** (`fetchPokerSnapshot`) |
| settlement | **measured** (`poker_settle_hand` call) |
| lobby query | **measured** (`listLobby`) |
| buy-in | not_instrumented (add identically in `sitDown`/`topUp`) |
| cash-out | not_instrumented (add identically in `leaveTable`) |
| hand history | not_instrumented (page loader) |
| realtime delivery | not_instrumented (no reliable client→server clock) |

A latency reads `—` (unknown) only while there are no samples yet — never a fabricated 0 ms.

## Integrity

| Metric | Source | Provenance |
|---|---|---|
| Coin-conservation failures | ops `coin_conservation_failure` **+** live audit `CONSERVATION_MISMATCH`/`SETTLEMENT_RECONCILE_MISMATCH` | measured + audited |
| Pot-construction failures | live audit `POT_CONSTRUCTION_MISMATCH` | audited |
| Duplicate settlement attempts | live audit `DUPLICATE_SETTLEMENT` (DB PK on `hand_id` structurally prevents >1) | audited |
| Duplicate buy-in / cash-out attempts | — (idempotency enforced in RPCs) | not_instrumented |
| Negative-balance prevention events | — | not_instrumented |
| Private-card exposures | log-based guard `PKR_PRIVATE_LEAK_GUARD` (not in DB) | not_instrumented |
| Unauthorized admin attempts | log-based | not_instrumented |

### Live coin-integrity audit

`metrics-data.ts` runs `checkHandCoinIntegrity()` over the **200 most recent settled hands**:
it reconstructs per-seat contributions from `poker_actions` (via `reconstructReplay`), then checks

1. `sum(contributions) == declared pot total` (pot construction),
2. `sum(payouts) + sum(refunds) == total_contributed` (conservation),
3. `sum(contributions) == authoritative total_contributed` (reconciliation),
4. no negative / non-integer coin values,
5. exactly one settlement row per hand.

Violations are surfaced with numbers-only, redacted evidence + hand/table correlation ids, ready to
promote into a high-severity incident. See [alerts.md](./alerts.md) for the response workflow.

## Adding a metric

1. Add the field to `MetricsInput` + the relevant `compute*Metrics` in `metrics.ts` (pure) and a
   unit test.
2. Populate it in `metrics-data.ts` from an authoritative table (or mark it `not_instrumented`).
3. Render it on the dashboard with its provenance dot.
4. If it has a target, add it to `POKER_SLO` and `evaluatePokerSlo` (see
   [service-level-objectives.md](./service-level-objectives.md)).
