# Poker Operational Reporting

The cadence of operational reports (daily / weekly / monthly), how they are built, and the
privacy-safe support-search surface. Reporting **reuses** the observability stack — no new vendor.

- **Shaping module (pure, tested):** [`lib/games/poker/opsReport.ts`](../../../lib/games/poker/opsReport.ts) (`opsReport.test.ts`).
- **Metrics source:** [`lib/games/poker/metrics.ts`](../../../lib/games/poker/metrics.ts) → `computePokerMetrics()` (usage / reliability / performance / integrity / SLO).
- **Server loader:** `app/admin/poker/metrics-data.ts` assembles a `MetricsInput` from `poker_*` tables; a report is `computePokerMetrics(input)` → `buildDailyReport / buildWeeklyReport / buildMonthlyReport`.

Each builder returns a **serializable, privacy-safe** report object plus a traffic-light `health`
(`green | amber | red | unknown`). `unknown` beats `green` so a blind spot is never reported as
healthy. Nothing in a report contains a card value or PII — only counts, rates, device/locale
buckets, and correlation ids.

## Daily report — `buildDailyReport`

Reviewed every morning. Window = last 24 h.

| Field | Source |
|---|---|
| Active players / tables | `usage.activePlayers` / `activeTables` |
| Completed hands | `usage.handsCompleted` |
| Failed hands | `usage.handsCancelled + reliability.settlementFailures` |
| Frozen hands | `reliability.frozenHands` |
| Coin incidents | `integrityIncidentCount(integrity)` (any non-zero ⇒ **red**) |
| Reconnect failure rate | `1 − reliability.reconnectSuccessRate` (null ⇒ uninstrumented) |
| Critical errors | `OpsCounters.criticalErrors` (error/critical `poker_ops_events`) |

`health` = worst of {SLO status, integrity health, frozen-hands amber, critical-errors amber}.
`renderDailyReportText()` emits a compact, greppable `[poker-report] daily …` line for a cron/log.

## Weekly report — `buildWeeklyReport`

Reviewed each week.

- **Reliability:** hand-completion / action-acceptance / reconnect-success rates, timeouts, frozen,
  settlement failures.
- **Performance:** p50/p95/p99 for action / snapshot / settlement / buy-in / cash-out / lobby /
  hand-history (uninstrumented buckets show `—`, never faked).
- **Device distribution / Language distribution:** `usage.playersByDevice` / `playersByLocale`.
- **Bug trends / Support volume:** `OpsCounters.bugReportsOpened` (`poker_bug_reports`) +
  `supportTicketsOpened`.
- **Suspicious activity:** top account pairs by `PairSignal.suspicion` (from
  `computeCollusionSignals` in `lib/games/poker/admin.ts`) — **advisory evidence only, never
  auto-punishment.** A pair ≥ 80 makes the week **amber** (investigate), not red.

## Monthly report — `buildMonthlyReport`

Reviewed monthly, for governance.

- **Coin-integrity audit:** total integrity incidents + `coinIntegrityClean`; refunds issued +
  coins refunded (`OpsCounters`).
- **Capacity review:** observed `peakActiveTables` / `peakActivePlayers` vs. the recommended cap
  (≤ 20–30 concurrent tables — see the poker load/scalability notes). Feeds capacity planning.
- **Data-retention review:** confirm audit/ledger/ops rows are within the retention policy and that
  append-only tables have not been mutated.
- **Security review:** `unauthorizedAdminAttempts` + `privateCardExposures` must be **0**
  (`securityClean`); any non-zero is a governance finding.
- **Economy review:** wallet/ledger reconciliation clean; refill/sink balance sane (reuses the
  economy sim + `coin_ledger`).

## Automation

- **Semi-automated today:** an admin opens `/admin/poker/metrics` and the loader can render the
  report objects. The 15-min `GET /api/cron/poker-integrity` already runs the integrity + SLO
  evaluation and emits `[poker-alert]` on any breach.
- **Fully-automated (optional next step):** schedule a daily cron that calls the same loader and
  logs `renderDailyReportText()` (a `[poker-report]` line), or posts to a channel once an external
  notifier is explicitly approved. No such external notifier is wired yet — surfaced honestly.

## Support tools (privacy-safe search)

Support staff work from the admin dashboards, which are gated by `ADMIN_EMAILS`. Safe search axes:

| Search by | Where | Returns |
|---|---|---|
| **User** | `/admin/poker/anti-abuse`, incident search | tables/hands they were in, restrictions, wallet/ledger summary — **never** their hole cards |
| **Table ID** | `/admin/poker/[tableId]` | table status, seats, recent hands, ops events |
| **Hand ID** | `/admin/poker/hands/[handId]` | authoritative replay from the public action log (no card values needed) |
| **Incident ID** | `/admin/poker/incidents/[caseId]` | case status/notes/audit trail |
| **Transaction ID** | `coin_ledger` lookup | the ledger entry + its correlation (hand/table) |

Rules:

- **No unnecessary private data.** Hole cards are exposed **only** via
  `poker_admin_reveal_hole_cards` — terminal hands only, fully audited — and only when an incident
  requires it. Security internals (RLS policy detail, tokens) are never shown in a support view.
- Every support action that changes state (restrict, refund, freeze) goes through an audited
  `poker_admin_*` RPC and appears in `poker_admin_audit`.

## Related

- [../operations/observability.md](./observability.md) · [metrics.md](./metrics.md) ·
  [service-level-objectives.md](./service-level-objectives.md) · [incident-response.md](./incident-response.md)
