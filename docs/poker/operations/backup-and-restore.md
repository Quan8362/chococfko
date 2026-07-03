# Poker Backup & Recovery

How poker data is backed up, what our recovery objectives are, and — honestly — what is and is not
yet **tested**. Do not claim a restore capability we have not exercised on staging.

> **STATUS (as of Prompt 25B, 2026-07-03): RESTORE UNVERIFIED.** No isolated disposable database
> target was available during release, so the timed restore drill was **not** run. Measured RPO/RTO
> are therefore **empty** and the figures below are provisional targets only. This is a tracked
> release risk — see [staging-drills.md](./staging-drills.md) drill #15. Operator prerequisites to
> clear it are listed under "Restore testing" below.

## What must survive an incident

| Class | Where | Why it's critical |
|---|---|---|
| Wallets & ledger | `game_wallets`, `coin_ledger` | The economic source of truth. A ledger loss is unrecoverable value. |
| Game state | `poker_tables`, `poker_seats`, `poker_hands`, `poker_actions`, `poker_hand_settlements` | Reconstructs any hand + reconciles coins. |
| Audit & incidents | `poker_admin_audit`, `poker_incident_cases`, `poker_incidents`, `poker_ops_events` | Legal/operational record; must be append-only and preserved. |
| Config | Vercel env (flags, `POKER_MAINTENANCE_*`), `vercel.json` crons | Reproduces the exact runtime posture. |
| Schema | `web/supabase/migration_poker_*.sql` (in git) | Forward-only migration history. |

## Database backup approach

- **Managed backups:** Supabase provides automated daily backups + point-in-time recovery (PITR)
  depending on plan tier. Treat the Supabase project's backup settings as the primary mechanism —
  confirm the retention window and PITR availability for the `chococfko` project in the Supabase
  dashboard and record it here once verified.
- **Migration history is in git:** every schema change is a forward-only `migration_poker_*.sql`
  committed under `web/supabase/`. The schema can always be rebuilt from git; **data** relies on the
  managed backup.
- **Audit/ledger are append-only by design:** `coin_ledger` and `poker_admin_audit` are never
  updated in place, which makes them safe to snapshot and reason about.

## Recovery objectives (targets — confirm against the Supabase plan)

| Objective | Target | Status |
|---|---|---|
| **RPO** (max acceptable data loss) | ≤ 24 h via daily backup; ≤ minutes if PITR is enabled | ⚠️ **UNVERIFIED — measured value: (empty)**. Confirm PITR is enabled before relying on the minutes figure. |
| **RTO** (max time to restore) | ≤ 2 h to a working read-only restore | ⚠️ **UNVERIFIED — measured value: (empty)**. No timed staging restore has been run. |

Both numbers are **provisional targets, not measured capability**, until a staging restore drill
(below) measures them. Do not cite them as achieved.

## Configuration & flag backup

- **Export the poker env set** (names only; never values into git): `POKER_ENABLED`,
  `POKER_CREATE_TABLE_ENABLED`, `POKER_PUBLIC_LOBBY_ENABLED`, `POKER_PRIVATE_TABLE_ENABLED`,
  `POKER_SPECTATOR_ENABLED`, `POKER_ALPHA_MODE`, `POKER_ALPHA_TESTERS`, `POKER_BLOCK_NEW_JOINS`,
  `POKER_CLOSED_BETA_ENABLED`, `POKER_BETA_MAINTENANCE`, `POKER_BETA_STATUS_MESSAGE`,
  `POKER_MAINTENANCE_MODE`, `POKER_MAINTENANCE_MESSAGE`, `POKER_MAINTENANCE_ETA`, `CRON_SECRET`.
- Keep a **record of the intended production values** in the team secret store (1Password/Vault),
  not in the repo. `.env.local.example` documents the shape.
- `vercel.json` (crons: `poker-integrity`, `poker-risk-scoring`) is versioned in git.

## Restore testing (the honest part)

> **We do not claim restore capability we have not tested.** The procedure below is what a staging
> restore drill MUST look like; until it has been run and timed, RPO/RTO above are provisional.

**Operator prerequisites to run this drill (all currently unmet in the release environment):**

- A **disposable** Supabase project or preview/branch DB the operator can create + destroy (never prod).
- Access to the `chococfko` project's latest backup / PITR snapshot.
- The Supabase SQL editor path to apply migrations (`supabase_admin`), not raw `psql`.
- Roughly 1–2 h of maintenance window to restore, verify, time, and tear down.

Staging restore drill:

1. Create a **throwaway** Supabase project (or a branch/preview DB) — never restore over prod.
2. Restore the latest backup (or PITR to a chosen timestamp) into it.
3. Apply the forward-only `migration_poker_*.sql` set in [release-migration-order](../release-migration-order.md)
   order if the restore predates any migration.
4. Run the existing DB test harnesses against the restore:
   `poker_db_tests.sql`, `poker_engine_tests.sql`, `poker_lifecycle_tests.sql`,
   `poker_admin_ops_tests.sql`, `poker_economy_config_tests.sql`,
   `poker_full_hand_conservation_test.sql`.
5. **Coin-conservation gate:** every wallet must satisfy `balance == starting + ledgerDelta` and the
   per-hand conservation test must pass. A restore that fails conservation is not a valid restore.
6. **Time it.** Record wall-clock restore + verify time → that is your measured RTO. Record the
   backup's timestamp gap → that is your measured RPO.
7. Tear the throwaway project down.

Record the date, measured RPO/RTO, and pass/fail here after each drill.

## Evidence & audit preservation during recovery

- A restore is **additive to the investigation**, not a replacement for it. Preserve the original
  `poker_ops_events` / `poker_admin_audit` / `poker_incident_cases` rows first (they are your
  evidence) before any restore that could overwrite them.
- If a restore is used to recover coins, still drive the correction through the audited refund
  workflow ([refunds.md](./refunds.md)) so the ledger stays internally consistent.

## Related

- [staging-drills.md](./staging-drills.md) → "Restore procedure" · [deployment-rollback.md](./deployment-rollback.md)
  · [runbooks/db-migration-failure.md](./runbooks/db-migration-failure.md) · [runbooks/supabase-degradation.md](./runbooks/supabase-degradation.md)
