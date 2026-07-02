# Poker Integrity — Review Workflow

The human side of the system. A scored subject becomes a **review case** that moves through a
lifecycle; admins investigate and take explicit, audited actions. The state machine and validation
live in `lib/games/poker/integrity/review.ts` and are mirrored by the SQL RPCs in
`migration_poker_integrity.sql`.

## The review queue

- **Source (today):** `app/admin/poker/integrity-data.ts` → `loadRiskReviewQueue()` derives
  candidate cases **live** from recent hand history. This works before the migration is applied.
- **Persistence (after migration):** a scheduled job calls `poker_risk_upsert_case` (idempotent on
  `dedup_key`) to store scores + the signal snapshot in `poker_risk_cases` / `poker_risk_signals`.
- **UI:** `/admin/poker/integrity` (admin-gated, read-only in this phase). Each row shows score,
  band, confidence, subject accounts, signal categories, and the contributing-signal breakdown.

Each case carries: risk score · signal summary · related accounts · value transferred (advisory) ·
table/hand history · hand-replay links (`/admin/poker/hands/[handId]`) · timeline · evidence ·
prior reviews · admin notes · resolution.

## Statuses

```
NEW → TRIAGED → INVESTIGATING → MONITORING → ACTION_REQUIRED → DISMISSED | RESOLVED
```

| Status | Meaning |
|---|---|
| `NEW` | freshly surfaced by the scoring job, untouched |
| `TRIAGED` | an admin has looked and set priority |
| `INVESTIGATING` | active investigation underway |
| `MONITORING` | not actioned; being watched for more evidence |
| `ACTION_REQUIRED` | investigation concluded an action is warranted |
| `DISMISSED` | **terminal** — no abuse / false positive |
| `RESOLVED` | **terminal** — handled with a decision |

### Legal transitions (`canTransitionReview`)

| From | Allowed to |
|---|---|
| `NEW` | TRIAGED, INVESTIGATING, MONITORING, DISMISSED |
| `TRIAGED` | INVESTIGATING, MONITORING, DISMISSED, RESOLVED |
| `INVESTIGATING` | MONITORING, ACTION_REQUIRED, DISMISSED, RESOLVED |
| `MONITORING` | INVESTIGATING, ACTION_REQUIRED, DISMISSED, RESOLVED |
| `ACTION_REQUIRED` | INVESTIGATING, RESOLVED, DISMISSED |
| `DISMISSED` / `RESOLVED` | *(terminal — none)* |

- Every transition requires a **reason**.
- `RESOLVED` / `DISMISSED` additionally require a **resolution note** (`validateReviewTransition`).
- Terminal cases cannot be reopened; re-scoring opens a fresh version-scoped case instead.

## Timeline (immutable)

`poker_risk_case_events` is append-only (UPDATE/DELETE blocked by trigger). It records status
changes, notes, admin actions, and rescores — each with actor identity + timestamp. Every admin RPC
also writes an immutable `poker_admin_audit` row in the same transaction.

## Principles

- **No automatic bans on one weak signal.** Cases surface evidence; a human decides.
- **Corroboration first.** The scorer requires independent signals to reach `high`; a single
  identifier match cannot.
- **Everything is reversible** except the audit trail. Restrictions can be lifted
  (`poker_admin_lift_restriction`); no coins are ever confiscated in this version.

## Server actions + scheduled scoring (wired)

- **Server actions** (`app/admin/poker/integrity-actions.ts`, `'use server'`): `transitionRiskCase`,
  `addRiskNote`, `recordRiskAction`. Each re-checks `checkIsAdmin()`, resolves the actor from the
  session, validates with the pure `review.ts` rules, then calls the `service_role`-only RPC.
  A restriction-type action is applied **only after explicit human confirmation** (`confirm: true`)
  and delegates to the existing audited `poker_admin_restrict_player` (no coins move).
- **Scheduled scoring** (`app/api/cron/poker-risk-scoring`, hourly; `integrity-score-job.ts`):
  deterministic + idempotent. UPSERTs versioned scores + redacted evidence via
  `poker_risk_upsert_case` (dedup-keyed). Degrade-safe — no-ops until the migration is applied.

These paths require `migration_poker_integrity.sql` to be applied (validated on an isolated
non-production Postgres; **not** applied to production in this phase). Until then the actions return
the RPC's "missing object" error and the cron reports `dbAvailable: false`.
