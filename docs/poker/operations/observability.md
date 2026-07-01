# Poker Observability — Overview

Goal: make Chợ Cóc FKO Poker **operationally observable** so an administrator detects realtime
failures, reconnect failures, coin-integrity failures, settlement failures, stale-state problems,
abandoned tables, performance regressions, security denials, and UX problems **before** widespread
user complaints.

This document is the map. The details live in the sibling files:

- [event-taxonomy.md](./event-taxonomy.md) — the versioned event catalog.
- [metrics.md](./metrics.md) — every metric, how it is computed, and its provenance.
- [alerts.md](./alerts.md) — actionable alert definitions and routing.
- [privacy-safe-logging.md](./privacy-safe-logging.md) — what may and may not be logged.
- [service-level-objectives.md](./service-level-objectives.md) — targets vs. measured vs. unknown.

## No new vendor

This phase adds **no** monitoring vendor. It reuses the stack already in the repo:

| Concern | Existing mechanism | Poker use |
|---|---|---|
| Durable failure signals | `poker_ops_events` table + `poker_record_ops_event` RPC | ops dashboard, metrics counters |
| Structured server logs | `console` → Vercel runtime logs (as in `app/api/client-errors`) | `[poker-telemetry]` JSON lines |
| Client error beacons | `lib/diagnostics/*` + `/api/client-errors` | already wired for the table client |
| Audit / incidents | `poker_admin_audit`, `poker_incident_cases`, `poker_incidents` | integrity incidents |
| Admin dashboards | server components under `app/admin/poker/*` | ops + metrics pages |
| Product analytics | `analytics_events` + `lib/analytics.ts` | optional funnel signals |

## Components added this phase (all additive — no DB migration)

| File | Kind | Purpose |
|---|---|---|
| `lib/games/poker/telemetry.ts` | pure | Versioned taxonomy, correlation IDs, stable error codes, privacy-safe record builder + redaction. |
| `lib/games/poker/telemetryServer.ts` | server | Thin emitter: structured log line + optional durable ops row. Never throws. |
| `lib/games/poker/metrics.ts` | pure | Usage / reliability / performance / integrity aggregation + SLO evaluation. |
| `lib/games/poker/coinIntegrity.ts` | pure | Coin-conservation invariant checker (per-hand + per-wallet). |
| `app/admin/poker/metrics-data.ts` | server | Assembles metric inputs from `poker_*` tables; runs the live integrity audit. |
| `app/admin/poker/metrics/page.tsx` | UI | The metrics dashboard (`/admin/poker/metrics`). |
| `lib/games/poker/*.test.ts` | tests | 22 new unit tests (taxonomy, redaction, metrics, invariants). |

The existing observability event feed remains at `/admin/poker/observability`; the new **metrics**
dashboard is at `/admin/poker/metrics`.

## Data flow

```
 server action / RPC path
        │  emit failure/lifecycle signal
        ▼
 recordOpsEvent (actions.ts) ── redactTelemetryDetail ──▶ [poker-telemetry] JSON  → Vercel logs
        │                                                  (correlation ids, build id, region)
        └── poker_record_ops_event RPC ─▶ poker_ops_events (durable)
                                                │
 admin dashboards ◀── metrics-data.ts ◀────────┘  + poker_hands / poker_actions / poker_seats
        │                                            + poker_hand_settlements
        ├─ /admin/poker/observability  (raw event feed, existing)
        └─ /admin/poker/metrics        (aggregated metrics + SLO + live integrity audit)
```

## Boundaries preserved

- **Server/DB authoritative.** Telemetry observes; it never decides cards, winners, pots, turn
  order, or settlement. A monitoring write failing is swallowed — gameplay is never blocked.
- **Privacy.** No hole cards / decks / seeds / tokens / passwords / coarse PII ever reach a log
  line, analytics event, or alert. Enforced by `redactTelemetryDetail` + `scrubDetail` +
  `assertDetailClean` and covered by tests. See [privacy-safe-logging.md](./privacy-safe-logging.md).
- **Integers only** for coin math; a non-integer coin value is itself reported as an integrity
  violation rather than silently coerced.

## Prompt 17B additions (still additive — no schema change, no new vendor)

- **Latency now measured** for `action`, `snapshot`, `settlement`, and `lobby`: server durations are
  persisted as `poker_perf` rows in the existing generic `analytics_events` table and read back by
  the metrics loader into real p50/p95/p99. `buy_in` / `cash_out` / `hand_history` remain
  not-instrumented (shown as `—`, flagged) and can be added identically.
- **Reconnect signals now persisted**: the realtime hook records `poker_reconnect_attempt` /
  `_success` / `_failure` via the existing `trackEvent` analytics path, so reconnect success **rate**
  is measured (unknown only until traffic exists).
- **Scheduled coin-integrity evaluator**: `GET /api/cron/poker-integrity` (CRON_SECRET-guarded, in
  `vercel.json` every 15 min) runs the same live audit + SLO evaluation and routes any breach to a
  durable, greppable `[poker-alert]` structured log line (redacted). It only reads; it does not write
  ops rows (avoids feedback double-count) or auto-open incidents (those need a human admin actor).

## What is still NOT done

- The expanded taxonomy is **log-only** for lifecycle/usage events; only the 13 operational-failure
  kinds persist to `poker_ops_events` (its CHECK constraint). Widening it is an optional future
  additive migration.
- `buy_in` / `cash_out` / `hand_history` latency and average session duration / players-by-device /
  players-by-locale remain not-instrumented (surfaced honestly as unknown, never faked).
- No **external** production alerting is enabled (no PagerDuty/Slack webhook). Breaches surface as
  `[poker-alert]` log lines + the cron JSON summary; wiring an external notifier is a future,
  explicitly-approved step.
