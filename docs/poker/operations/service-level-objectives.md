# Poker Service Level Objectives (SLOs)

Internal reliability **goals**. Source of truth: `POKER_SLO` in
[`lib/games/poker/metrics.ts`](../../../lib/games/poker/metrics.ts). Evaluated by
`evaluatePokerSlo()` and shown on `/admin/poker/metrics` with status **ok / warn / breach /
unknown**.

> **We do not fabricate achieved performance.** Each row separates the **target** from the
> **current measured** value; where there is no traffic or no instrumentation the measured value is
> **unknown** (`—`), not a made-up number.

## Targets vs. current measured

| Objective | Kind | Target | Current measured |
|---|---|---|---|
| Coin-integrity failures | max count | **0** | measured + audited (see dashboard) |
| Private-card exposure | max count | **0** | not instrumented → treated as 0, flagged |
| Duplicate settlement | max count | **0** | audited (DB PK also prevents) |
| Unauthorized admin access | max count | **0** | not instrumented → treated as 0, flagged |
| Hand completion rate | min rate | **≥ 98%** | measured (unknown until hands complete) |
| Action acceptance rate | min rate | **≥ 95%** | measured (unknown until actions occur) |
| Reconnect success rate | min rate | **≥ 95%** | measured (attempts/failures persisted; unknown until traffic) |
| Action latency p95 | max latency | **≤ 1500ms** | measured (persisted via analytics_events) |
| Snapshot latency p95 | max latency | **≤ 1200ms** | measured |
| Settlement latency p95 | max latency | **≤ 3000ms** | measured |
| Buy-in latency p95 | max latency | **≤ 1500ms** | **not instrumented** yet |
| Cash-out latency p95 | max latency | **≤ 2000ms** | **not instrumented** yet |
| Lobby-query latency p95 | max latency | **≤ 800ms** | measured |
| Hand-history latency p95 | max latency | **≤ 1000ms** | **not instrumented** yet |

“Current measured” reflects live data on the dashboard; the words above describe *provenance*, not a
claimed result. As of this phase there is **no real-traffic dataset**, so most rows read `unknown`.

## Status semantics

- **ok** — measured value meets the target.
- **warn** — within a small band of the target (rates: within 1 percentage point below; latency:
  within 25% over budget). Early signal, not yet a breach.
- **breach** — target not met. Zero-tolerance counters (integrity/security) breach at the first
  occurrence.
- **unknown** — no measured value (no traffic / not instrumented). **Never** counted as a pass.

`worstSloStatus()` collapses the set into a single header badge (breach > warn > unknown > ok).

## Zero-tolerance vs. budgeted

- **Zero-tolerance** (integrity/security counters): any occurrence is a breach → critical incident,
  freeze unsafe settlement, preserve evidence. See [alerts.md](./alerts.md).
- **Budgeted** (rates/latency): transient dips are tolerated within the warn band; sustained breach
  across windows is the actionable signal.

## Reaching “measured” for the remaining unknowns

Done in Prompt 17B: reconnect attempts/failures and action/snapshot/settlement/lobby latency are now
persisted (via `analytics_events`) and read back into the dashboard. Still to do:

- **Buy-in / cash-out / hand-history latency**: add the same `recordPerf(...)` call in `sitDown`/
  `topUp`, `leaveTable`, and the history loader.
- **Private-card exposure / unauthorized admin**: promote the log-based guards
  (`PKR_PRIVATE_LEAK_GUARD`, `PKR_UNAUTHORIZED_ADMIN`) into counted signals.

None of these change the targets; they only replace `unknown` with a real measurement.
