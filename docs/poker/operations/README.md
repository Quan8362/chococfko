# Poker Operations

Everything an administrator needs to run Chợ Cóc FKO Poker continuously — maintenance, incidents,
recovery, refunds, rollback, reporting, and drills. It builds on the observability layer already in
the repo and adds **no new vendor**.

**North star:** the server/DB is the sole authority. No hand-edited balances, ever. Every coin
correction is idempotent, audited, and tied to an incident. Every admin action writes
`poker_admin_audit`. Hole cards never leave the server unredacted.

## Live-operations foundation (this phase)

| Doc | Purpose |
|---|---|
| [maintenance.md](./maintenance.md) | Graduated, server-enforced maintenance modes (`normal` → `emergency_shutdown`). |
| [incident-response.md](./incident-response.md) | SEV-0…SEV-4 ladder: owner, response time, action, comms, recovery, review. |
| [refunds.md](./refunds.md) | The only sanctioned coin correction: idempotent, audited, incident-tied. |
| [backup-and-restore.md](./backup-and-restore.md) | Backup approach, RPO/RTO, and the (honest) tested-restore procedure. |
| [deployment-rollback.md](./deployment-rollback.md) | Back out a bad deploy without stranding tables or coins. |
| [reporting.md](./reporting.md) | Daily / weekly / monthly reports + privacy-safe support search. |
| [staging-drills.md](./staging-drills.md) | Rehearse the runbooks on staging before you need them. |
| [runbooks/](./runbooks/README.md) | 16 step-by-step incident runbooks. |

## Observability (prior phase)

| Doc | Purpose |
|---|---|
| [observability.md](./observability.md) | The observability map. |
| [event-taxonomy.md](./event-taxonomy.md) | Versioned event catalog. |
| [metrics.md](./metrics.md) | Every metric + provenance. |
| [alerts.md](./alerts.md) | Alert definitions + routing. |
| [service-level-objectives.md](./service-level-objectives.md) | SLO targets vs. measured. |
| [privacy-safe-logging.md](./privacy-safe-logging.md) | What may and may not be logged. |

## Supporting code (pure, unit-tested)

| Module | Role |
|---|---|
| `lib/games/poker/maintenance.ts` | Graduated maintenance-mode resolver + capability gate. |
| `lib/games/poker/opsReport.ts` | Daily/weekly/monthly report shaping + health classification. |
| `lib/games/poker/metrics.ts` | Usage / reliability / performance / integrity aggregation + SLO. |
| `lib/games/poker/coinIntegrity.ts` | Coin-conservation invariant checker. |
| `lib/games/poker/admin.ts` | Incident FSM, hand replay, redaction, collusion signals. |
| `app/games/poker/access.ts` | Server enforcement (flags ∧ maintenance ∧ beta wind-down). |

## Admin surfaces & automation

- Dashboards (gated by `ADMIN_EMAILS`): `/admin/poker/{metrics,observability,incidents,integrity,hands,anti-abuse}`.
- Cron (`vercel.json`, `CRON_SECRET`): `GET /api/cron/poker-integrity` (every 15 min), `GET /api/cron/poker-risk-scoring`.
- Deploy: git-linked — push to `main` → Vercel `chococfko`. Never `vercel --prod` locally.

## Verification status (as of Prompt 25B, 2026-07-03)

Honest ledger of what is proven vs. planned. Legend: **TESTED** = automated evidence · **DOC-ONLY**
= written + reviewed, not executed end-to-end · **BLOCKED** = missing dependency · **NOT CONFIGURED**
= not wired · **PROD-PROHIBITED** = must never run on prod.

| Capability | Status | Evidence / note |
|---|---|---|
| Graduated maintenance modes (7 tiers) + fail-closed | **TESTED** | `maintenance.test.ts`, `maintenance.access.verify.test.ts` (9/9) |
| Server capability gating (flags ∧ maintenance ∧ beta) | **TESTED** | `access.ts` composition mirrored + asserted per tier |
| Coin-integrity invariant checker | **TESTED** | `coinIntegrity.test.ts` |
| Daily/weekly/monthly report shaping + health | **TESTED** | `opsReport.test.ts` |
| Incident FSM + hand replay + redaction | **TESTED** | `admin.test.ts` |
| Internal severe-alert visibility (`[poker-alert]` logs) | **IMPLEMENTED** | `app/api/cron/poker-integrity/route.ts`; visible in Vercel logs + `/admin/poker/*` |
| **External paging (PagerDuty/Slack/email)** | **NOT CONFIGURED** | no approved notifier wired; **requires an on-call human watching logs/dashboards** |
| Incident-triage runbooks (stuck/frozen/settlement/…) | **DOC-ONLY** | need a live table/DB/realtime to exercise; see [staging-drills.md](./staging-drills.md) |
| Controlled refund end-to-end | **DOC-ONLY** | refund RPC exists + idempotent; not exercised on live data this release |
| Backup / restore + RPO/RTO | **BLOCKED / UNVERIFIED** | no disposable DB target; RPO/RTO measured value = (empty) |
| Deployment rollback execution | **DOC-ONLY (commands reviewed)** | [deployment-rollback.md](./deployment-rollback.md) |
| Production SQL execution by ops | **PROD-PROHIBITED** | forward-only; via Supabase SQL editor + compensating migration only |

Illustrative SQL in the runbooks is labelled as such and is **not** verified against the production
schema — confirm columns before use and never run write/DDL on production.

## Closed Beta operator checklist

The current production posture (do **not** change without an explicit approved request):

- Closed Beta: **ON** (`POKER_CLOSED_BETA_ENABLED=1`); cohort = `chococfko@gmail.com`,
  `luongvanquan2002@gmail.com` — **do not expand or modify the cohort**.
- Public Poker **OFF** · Alpha **OFF** · Spectator **OFF** · Bots **OFF** · Tournaments **OFF**.
- Maintenance mode: **normal** in production (`POKER_MAINTENANCE_MODE` unset/`normal`). Only ever
  test non-`normal` tiers in an isolated non-production environment.

Before touching production:

1. Confirm the flag/cohort state above is unchanged.
2. Never edit wallets/hands/settlements by hand — corrections go through the audited refund RPC
   ([refunds.md](./refunds.md)); refund authority requires an open incident + a second-admin
   approval for SEV-1.
3. Rollback triggers + levers: [deployment-rollback.md](./deployment-rollback.md). DB is
   forward-only — no destructive prod SQL, ever.
4. Severe alerts have **no external pager** — a human must watch `[poker-alert]` logs +
   `/admin/poker/*` during any risky window.
