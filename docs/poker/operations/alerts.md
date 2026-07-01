# Poker Alerts

Actionable alert definitions for Chợ Cóc FKO Poker. **No external production alerting is enabled in
this phase** (no PagerDuty/Slack/email webhook, no billing change). These are the definitions and
routing rules to wire up later, with explicit approval. Until then, alerts are evaluated by an
administrator reading `/admin/poker/metrics` and `/admin/poker/observability`, and by grepping
Vercel logs for `[poker-telemetry]`.

Design rule: **do not alert on a normal single-user mistake.** A player mis-clicking an illegal
action is a `warn` metric, not a page. Alerts fire on *rates*, *repetition*, or *integrity*.

## Severity → routing

| Severity | Meaning | Routing (when wired) | Default behavior now |
|---|---|---|---|
| Critical | integrity/security breach; user funds or fairness at risk | page on-call immediately | high-severity incident + freeze unsafe settlement + manual review |
| High | reliability degraded, users likely affected | notify on-call channel | dashboard review within the hour |
| Warning | early signal, not yet user-visible | daily digest | dashboard review |

Routing is environment-gated: in non-production, an alert only logs (`[poker-alert]`) and never
calls an external service. See “Alert routing in non-production mode” under tests below.

## Critical

| Alert | Condition | Response |
|---|---|---|
| Private-card exposure | any `PKR_PRIVATE_LEAK_GUARD` / `private_data_access_denied` | treat as sev-1; open incident; audit the payload path; **never** include cards in the alert |
| Coin invariant failure | `coinIntegrityFailures ≥ 1` (ops or live audit) | freeze settlement for the hand; open incident with correlation ids; preserve evidence |
| Duplicate settlement | live audit `DUPLICATE_SETTLEMENT ≥ 1` | investigate idempotency; the `hand_id` PK should make this impossible — a hit means schema drift |
| RLS bypass | a sensitive read/write succeeded that RLS should have denied | sev-1; rotate/patch; audit |
| Repeated settlement failure | `settlement_failure` count rising across consecutive windows | the reaper retry is failing; inspect `poker_settle_hand` |

## High

| Alert | Condition (default threshold) | Response |
|---|---|---|
| Reconnect success below target | reconnect success `< 95%` (once instrumented) | inspect realtime + snapshot recovery |
| Hand completion drop | `handCompletionRate < 98%` | inspect frozen/cancelled hands |
| Sequence-gap spike | `sequence_gap` count sharply above baseline | inspect realtime delivery / state_version monotonicity |
| Action latency over budget | action p95 `> 1500ms` (once instrumented) | inspect RPC / DB contention |
| Frozen hands over threshold | `frozen_hand` count above baseline | manual review queue; `/admin/poker/observability` |
| Cash-out failures | cash-out error rate rising | inspect wallet RPC path |

## Warning

| Alert | Condition |
|---|---|
| Increased timeout rate | `timeout_applied` share of actions rising |
| Increased mobile UI errors | client-error beacons by device class rising |
| Realtime disconnect spike | `realtime_disconnected` above baseline |
| Lobby-query slowdown | lobby p95 above budget (once instrumented) |
| Storage growth anomaly | `poker_ops_events` / hand-history growth spikes |

## Implemented: scheduled evaluator (Prompt 17B)

`GET /api/cron/poker-integrity` (CRON_SECRET-guarded; scheduled in `vercel.json` every 15 min) runs
`loadPokerMetrics` + the live integrity audit and routes any SLO **breach** or integrity violation to
a durable, greppable **`[poker-alert]`** structured log line (payload passed through
`redactTelemetryDetail`), and returns a JSON summary (`ok`/`alert`/`breaches`/`integrityViolations`)
a cron monitor can act on. It only READS — it does **not** write `poker_ops_events` (would feed back
into the next run's integrity counters) and does **not** auto-open incidents (those require a human
admin actor + reason from `/admin/poker`).

## Wiring later (requires approval)

1. An external notifier (Slack/email/PagerDuty) subscribed to the `[poker-alert]` log channel or the
   cron summary — **only in production and only after approval**. No such notifier is enabled today.
2. Optional auto-creation of `poker_incident_cases` rows once a system actor identity is defined.
3. All notification payloads must pass through `redactTelemetryDetail` — an alert can never carry a
   card, token, or PII.
