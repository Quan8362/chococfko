# Runbook — Duplicate Settlement (DUPLICATE_SETTLEMENT)

**Severity:** SEV-2 · **Owner:** Poker on-call · **Related:** [../incident-response.md](../incident-response.md), [settlement-failure.md](./settlement-failure.md), [coin-conservation-failure.md](./coin-conservation-failure.md), [../refunds.md](../refunds.md), [/admin/poker/integrity](/admin/poker/integrity)

> ⚠️ **Illustrative SQL.** The queries in this runbook use bind-style placeholders (e.g. `:hand_id`) and column names implied by each table's purpose. They are **not verified against the production schema** — confirm columns before use, run reads only, and **never** execute write/DDL against production. See [../reporting.md](../reporting.md) (support-tools) and [../incident-response.md](../incident-response.md).

## Symptoms
- Integrity code `DUPLICATE_SETTLEMENT` on [/admin/poker/integrity](/admin/poker/integrity).
- A player appears paid twice, or a settlement/refund was attempted more than once.
- `poker_ops_events` kind `duplicate_action` or `settlement_failure` around a hand end.

## Detect / Confirm
- Integrity check (cron `/api/cron/poker-integrity` also emits a redacted `[poker-alert]` line):
  ```sql
  select * from poker_hand_settlements where hand_id = :hand_id order by created_at;
  ```
  More than one effective payout set for the same hand/seat is the signal.
- Cross-check ledger for double credit:
  ```sql
  select wallet_id, amount, created_at from coin_ledger
  where hand_id = :hand_id order by created_at;
  ```
- Understand the design: `poker_refund_hand` and settlement are **idempotent via a settlement lock**. A duplicate *attempt* is normal and should be a no-op. A duplicate *effect* (coins moved twice) is the real incident.

## Immediate action (stop the bleeding)
1. If integrity shows only a duplicate attempt with no double coin movement → idempotency held; log and move on, no correction needed.
2. If coins actually moved twice → freeze the hand `poker_admin_freeze_hand(...)`, open an incident case `poker_admin_open_incident(...)`. Do NOT hand-adjust wallets.
3. Halt further processing: if a retry loop is firing, stop new joins with `POKER_BLOCK_NEW_JOINS=1` while you contain.

## Diagnose (root cause)
- Confirm whether the settlement lock was bypassed or the duplicate predates the lock.
- Replay `poker_actions` + `poker_admin_audit` to see whether an admin refund and an auto-settlement both landed on the same hand.
- Check for a `sequence_gap` / `transaction_retry` storm in `poker_ops_events` that could have driven a double-commit.

## Recover
1. All corrections flow through an idempotent, audited RPC tied to the incident. Do NOT manually debit the overpaid wallet.
2. To reverse a genuine double payout, use `poker_admin_refund_hand` (idempotent; settlement lock ensures a second call is a no-op) tied to the case → `REFUNDED`, and reconcile per [../refunds.md](../refunds.md).
3. If reconciliation crosses conservation, escalate to [coin-conservation-failure.md](./coin-conservation-failure.md).

## Verify
- Exactly one effective settlement per hand/seat in `poker_hand_settlements`.
- `coin_ledger` for the hand nets to the correct zero-sum / refund total; integrity code cleared.
- Re-running the correcting RPC is a no-op (idempotency proven).

## Communicate
- If a player was told they were paid twice, correct gently via support; note in the incident case.
- Cohort-wide banner only if the bug is systemic (`POKER_MAINTENANCE_MESSAGE`).

## Post-incident
- Close `poker_incident_cases` `RESOLVED` with a resolution note (or terminal `REFUNDED`). Preserve settlement + ledger rows as evidence. File a follow-up to strengthen the idempotency guard if it was bypassed.
