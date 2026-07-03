# Runbook — RLS Incident (rls_denial spike / suspected RLS hole) — SEV-0 path

**Severity:** SEV-0 if hole-card / private-data exposure is suspected; SEV-2 for a benign `rls_denial` spike · **Owner:** Incident lead + Security (page immediately for SEV-0) · **Related:** [../incident-response.md](../incident-response.md), [private-table-access.md](./private-table-access.md), [feature-flag-rollback.md](./feature-flag-rollback.md), [db-migration-failure.md](./db-migration-failure.md), [/admin/poker/anti-abuse](/admin/poker/anti-abuse)

> ⚠️ **Illustrative SQL.** The queries in this runbook use bind-style placeholders (e.g. `:hand_id`) and column names implied by each table's purpose. They are **not verified against the production schema** — confirm columns before use, run reads only, and **never** execute write/DDL against production. See [../reporting.md](../reporting.md) (support-tools) and [../incident-response.md](../incident-response.md).

## Symptoms
- `poker_ops_events` kind `rls_denial` spiking.
- Any sign that hole cards / decks / seeds / tokens are visible to a non-owner (the SEV-0 trigger).
- Reports of players seeing other players' cards, or a query returning rows it shouldn't.

## Detect / Confirm
- Spike volume + spread:
  ```sql
  select table_id, count(*) from poker_ops_events
  where kind = 'rls_denial' and created_at > now() - interval '30 minutes'
  group by table_id order by 2 desc;
  ```
- **A `rls_denial` spike is usually RLS WORKING** (denying bad access). The SEV-0 case is the opposite: data leaking WITHOUT a denial. Confirm which you have.
- Recall the privacy invariant: hole cards are RLS read-own; `poker_admin_reveal_hole_cards` (TERMINAL hands only, audited) is the ONLY sanctioned reveal. `scrubDetail`/`assertDetailClean` keep cards/seeds/tokens out of logs, audit, incident detail, ops payloads.

## Immediate action (stop the bleeding)
1. **Suspected exposure (SEV-0):** contain immediately — raise maintenance to `full_maintenance` or hit the kill switch `POKER_ENABLED=0` (ships dark) to cut access while you assess. Do NOT wait.
2. Open a SEV-0 `poker_incident_cases` (`poker_admin_open_incident`) and page Security per [../incident-response.md](../incident-response.md).
3. **Benign spike (SEV-2):** no exposure — likely an auth/token issue ([login-failure.md](./login-failure.md)) or clients hitting denied paths. No kill switch needed; investigate.
4. Never move coins; no game-state edits.

## Diagnose (root cause)
- For exposure: identify the exact policy / view / RPC that returned private data. Was a recent migration or code deploy the cause? ([db-migration-failure.md](./db-migration-failure.md), [bad-frontend-deploy.md](./bad-frontend-deploy.md)).
- Confirm whether any leaked field violates the privacy rule (cards/decks/seeds/tokens). Check that `scrubDetail`/`assertDetailClean` are still applied on the affected path.
- For a spike: correlate `rls_denial` timing with auth failures or a client bug hammering denied endpoints.

## Recover
1. Exposure: ship the RLS/policy fix as a NEW forward-only migration (via Supabase SQL editor, supabase_admin path — never raw psql, never a destructive down-migration) and/or revert the offending deploy. Keep access gated (`full_maintenance` / `POKER_ENABLED=0`) until verified.
2. Spike-only: fix the client/auth cause; RLS was already protecting data.
3. No coin action unless a bypass enabled cheating → refund via idempotent audited path ([../refunds.md](../refunds.md)).

## Verify
- Attempt the exposing query as a non-owner: it is now denied.
- `rls_denial` returns to baseline for the benign case; SLO/anti-abuse dashboards clean.
- Logs/audit/incident detail contain NO cards/seeds/tokens (privacy invariant holds).

## Communicate
- SEV-0 exposure: coordinated disclosure per policy; banner via `POKER_MAINTENANCE_MESSAGE`. Keep card data OUT of all notes.
- Incident case note with the policy fix (privacy-safe).

## Post-incident
- Keep the case `INVESTIGATING` until the fix is verified in prod; close `RESOLVED` with a resolution note. Preserve evidence (redacted). Mandatory writeup for any privacy exposure.
