# Poker Live-Ops Runbooks

Operational runbooks for the Chợ Cóc FKO Poker foundation. Each one is a tight, actionable checklist: **Symptoms → Detect/Confirm → Immediate action → Diagnose → Recover → Verify → Communicate → Post-incident.**

## Standing invariants (true for every runbook here)
- **The server / DB is the sole authority.** Never edit balances, `poker_hands`, `poker_seats`, or `coin_ledger` by hand.
- **Every coin correction is idempotent + audited + incident-tied.** Corrections flow only through DEFINER RPCs (e.g. `poker_admin_refund_hand` → wraps the idempotent `poker_refund_hand`); each admin RPC writes a `poker_admin_audit` row via `poker_audit_write`.
- **Feature flags / maintenance mode gate NEW commitments and access only** — they never settle, cancel, or freeze a live hand and never move coins. Maintenance tiers compose most-restrictive-wins; an unknown value FAILS CLOSED to `full_maintenance`. See [../maintenance.md](../maintenance.md).
- **Privacy is absolute.** Hole cards / decks / seeds / tokens never appear in logs, audit, incident detail, or ops payloads (`scrubDetail`/`assertDetailClean`). `poker_admin_reveal_hole_cards` is the ONLY sanctioned reveal — TERMINAL hands only, fully audited.
- **Deploy model:** prod = commit+push to `main` (Vercel `chococfko`, git-linked). Never `vercel --prod` locally. Migrations are forward-only via the Supabase SQL editor; undo = a new compensating migration.

See also: [../incident-response.md](../incident-response.md) · [../refunds.md](../refunds.md) · [../maintenance.md](../maintenance.md) · dashboards [/admin/poker/metrics](/admin/poker/metrics), [/admin/poker/observability](/admin/poker/observability), [/admin/poker/incidents](/admin/poker/incidents), [/admin/poker/integrity](/admin/poker/integrity), [/admin/poker/hands](/admin/poker/hands), [/admin/poker/anti-abuse](/admin/poker/anti-abuse).

## Index

| Runbook | SEV | Summary |
|---|---|---|
| [stuck-hand.md](./stuck-hand.md) | SEV-3 | Hand idle / turn clock stalled but not formally frozen; force sit-out or freeze. |
| [frozen-hand.md](./frozen-hand.md) | SEV-2 | Hand in `PAUSED_FOR_REVIEW`; when to resume vs. refund. |
| [settlement-failure.md](./settlement-failure.md) | SEV-2 | `settlement_failure`: hand didn't settle / payout mismatch. |
| [duplicate-settlement.md](./duplicate-settlement.md) | SEV-2 | `DUPLICATE_SETTLEMENT`: duplicate settlement attempt vs. real double-pay (idempotency). |
| [coin-conservation-failure.md](./coin-conservation-failure.md) | SEV-1 | `CONSERVATION_MISMATCH` / `POT_CONSTRUCTION_MISMATCH` / `LEDGER_IMBALANCE`: freeze, preserve evidence, no auto-fix. |
| [cash-out-failure.md](./cash-out-failure.md) | SEV-2 | Player can't cash out / stack stuck; seat stack vs. wallet vs. ledger. |
| [realtime-outage.md](./realtime-outage.md) | SEV-2 | Widespread `reconnect_failure` / `realtime_subscription_error`. |
| [snapshot-failure.md](./snapshot-failure.md) | SEV-2 | Clients can't load snapshot; `stale_state` / `sequence_gap`. |
| [login-failure.md](./login-failure.md) | SEV-2 | Auth/session failures blocking poker access. |
| [private-table-access.md](./private-table-access.md) | SEV-3 | Password / private-join problems; `privateSeatAllowed` gate, suspected bypass. |
| [rls-incident.md](./rls-incident.md) | SEV-0 | `rls_denial` spike or suspected RLS hole / hole-card exposure. |
| [db-migration-failure.md](./db-migration-failure.md) | SEV-1 | Forward-only migration partially applied; compensating migration. |
| [feature-flag-rollback.md](./feature-flag-rollback.md) | SEV-2 | Turning gating off safely (`POKER_BLOCK_NEW_JOINS`, `POKER_MAINTENANCE_MODE`, `POKER_ENABLED`). |
| [bad-frontend-deploy.md](./bad-frontend-deploy.md) | SEV-2 | Broken build in prod; revert commit / promote previous Vercel deployment. |
| [supabase-degradation.md](./supabase-degradation.md) | SEV-1 | Supabase DB/Realtime/Auth degraded; graceful wind-down via maintenance mode. |
| [vercel-degradation.md](./vercel-degradation.md) | SEV-1 | Vercel edge/functions degraded; what still works, wind-down, manual integrity sweep. |

Severity guide: **SEV-0** confirmed data/privacy exposure · **SEV-1** money integrity or platform-wide outage · **SEV-2** significant degradation, contained · **SEV-3** localized / single-table.
