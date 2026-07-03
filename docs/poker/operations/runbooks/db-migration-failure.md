# Runbook — DB Migration Failure (partial / failed forward migration)

**Severity:** SEV-1 (DB integrity at risk) · **Owner:** Incident lead + DB owner · **Related:** [../incident-response.md](../incident-response.md), [coin-conservation-failure.md](./coin-conservation-failure.md), [rls-incident.md](./rls-incident.md), [feature-flag-rollback.md](./feature-flag-rollback.md), [supabase-degradation.md](./supabase-degradation.md)

## Background (deploy model — do not violate)
Migrations are **forward-only**, applied via the **Supabase SQL editor (supabase_admin path)** — never raw psql. There is NO destructive down-migration on prod. To undo, you write a **NEW compensating forward migration**. Code rollback is a separate concern ([bad-frontend-deploy.md](./bad-frontend-deploy.md)).

## Symptoms
- A migration errored partway; some objects created, others not.
- Poker features error broadly after a schema change (missing table/column/RPC, RLS gaps).
- `poker_ops_events` `failed_action` / `rls_denial` spike right after a schema change.

## Detect / Confirm
- Confirm which statements applied vs. failed from the SQL editor error output.
- Inspect current state with `list_tables` / `list_migrations`; verify expected tables (poker_tables, poker_hands, poker_seats, poker_actions, poker_hand_settlements, poker_ops_events, poker_admin_audit, poker_incident_cases, poker_incidents, poker_bug_reports, poker_beta_acknowledgements) and RPCs exist.
- Check `get_advisors` for new RLS/security warnings introduced by the partial apply.

## Immediate action (stop the bleeding)
1. **Stop new commitments** so no player state depends on a half-applied schema: raise maintenance to `full_maintenance` (or `POKER_ENABLED=0` if features are broken). See [../maintenance.md](../maintenance.md).
2. Do NOT re-run the same migration blindly and do NOT hand-patch tables/rows in the SQL editor outside a tracked migration.
3. Open a SEV-1 `poker_incident_cases` (`poker_admin_open_incident`).

## Diagnose (root cause)
- Identify exactly which objects exist vs. missing; determine if the partial state is internally consistent or leaves dangling references.
- Critical checks: did it touch RLS (→ possible exposure, see [rls-incident.md](./rls-incident.md)) or coin RPCs/ledger (→ conservation risk, see [coin-conservation-failure.md](./coin-conservation-failure.md))?
- Establish whether the safest path is to complete-forward (finish the remaining statements idempotently) or compensate (new migration to reconcile).

## Recover
1. Write a **new forward migration** that is idempotent (`if not exists` / guarded) to bring the schema to the intended state — apply via Supabase SQL editor (supabase_admin path).
2. If the partial apply created an unsafe object, the compensating migration removes/replaces it — additively and safely, never a raw destructive drop on live data without a preserved copy.
3. If any coin/RLS integrity was affected, resolve those runbooks first before lifting maintenance.

## Verify
- `list_migrations` shows the intended migration set applied; `list_tables` confirms schema.
- `get_advisors` clean (no new RLS/security regressions).
- Poker features work end-to-end on a smoke test; `failed_action`/`rls_denial` back to baseline.

## Communicate
- Banner via `POKER_MAINTENANCE_MESSAGE` + `POKER_MAINTENANCE_ETA` during the window.
- Migration timeline + compensating migration id in the incident case note.

## Post-incident
- Close `poker_incident_cases` `RESOLVED` with a resolution note documenting the compensating migration. Preserve the failed output as evidence. Lower maintenance to `normal` only after verification.
