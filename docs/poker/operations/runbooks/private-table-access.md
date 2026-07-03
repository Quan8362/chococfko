# Runbook — Private Table Access (password / join problems)

**Severity:** SEV-3 (SEV-2 if a security bypass is suspected) · **Owner:** Poker on-call · **Related:** [../incident-response.md](../incident-response.md), [rls-incident.md](./rls-incident.md), [login-failure.md](./login-failure.md), [feature-flag-rollback.md](./feature-flag-rollback.md)

> ⚠️ **Illustrative SQL.** The queries in this runbook use bind-style placeholders (e.g. `:hand_id`) and column names implied by each table's purpose. They are **not verified against the production schema** — confirm columns before use, run reads only, and **never** execute write/DDL against production. See [../reporting.md](../reporting.md) (support-tools) and [../incident-response.md](../incident-response.md).

## Symptoms
- Players can't join a private table despite the correct password, or a table 404s / rejects seating.
- Suspected bypass: a player seated at a private table without supplying the password (SEV-2 — treat as security).
- `poker_ops_events` kind `failed_action` or `rls_denial` on join.

## Detect / Confirm
- Confirm the private-table flag is on: env `POKER_PRIVATE_TABLE_ENABLED` must be `1/true/on/yes`. If off, private join is intentionally blocked.
- Check the table:
  ```sql
  select id, table_id, phase from poker_hands where table_id = :table_id
    and phase not in ('COMPLETED','CANCELLED');
  select seat from poker_seats where table_id = :table_id;
  ```
- Recall the access design: seating goes through `joinTable` and the `privateSeatAllowed` gate (a seat-via-URL that skipped `joinTable` was the historic bypass bug — now fixed). A join must satisfy the private-seat gate.

## Immediate action (stop the bleeding)
1. **Legit access problem (can't join with correct password):** verify `POKER_PRIVATE_TABLE_ENABLED` is on and the table isn't in a maintenance tier blocking joins (`no_new_joins` / `finish_active_hands` / `full_maintenance` — see [../maintenance.md](../maintenance.md)). No coin risk; do not freeze.
2. **Suspected bypass (seated without password):** treat as a security incident — open `poker_incident_cases` (`poker_admin_open_incident`), and if it looks systemic, block new joins immediately with `POKER_BLOCK_NEW_JOINS=1` and/or turn `POKER_PRIVATE_TABLE_ENABLED` off. Escalate toward [rls-incident.md](./rls-incident.md).

## Diagnose (root cause)
- For join failures: check whether the request failed the `privateSeatAllowed` gate vs. an RLS denial (`rls_denial` in `poker_ops_events`) vs. a flag being off.
- For a suspected bypass: replay how the seat was created — did it go through `joinTable`? Inspect `poker_seats` provenance and `poker_admin_audit`.
- Distinguish auth loop ([login-failure.md](./login-failure.md)) from a genuine gate failure.

## Recover
1. Legit case: enable the flag / lower the maintenance tier; the player retries the normal `joinTable` flow.
2. Bypass case: force the improperly seated player out with `poker_admin_force_sit_out(...)` (audited), keep the flag/joins blocked until patched, and ship the fix via commit+push to `main`.
3. Any coin exposure from a bypassed table → refund via the idempotent audited path ([../refunds.md](../refunds.md)).

## Verify
- Legit players join with the correct password; no `failed_action`/`rls_denial` on the join path.
- No seat exists without a valid `joinTable`/`privateSeatAllowed` provenance.

## Communicate
- For outages: banner via `POKER_MAINTENANCE_MESSAGE`. For a bypass: keep comms internal until patched; note in incident case.

## Post-incident
- Close `poker_incident_cases` `RESOLVED`/`DISMISSED` with a resolution note. For a bypass, preserve evidence and file a security follow-up; re-enable `POKER_PRIVATE_TABLE_ENABLED` only after the fix ships.
