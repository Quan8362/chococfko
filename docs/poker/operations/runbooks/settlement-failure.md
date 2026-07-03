# Runbook — Settlement Failure

**Severity:** SEV-2 (SEV-1 if coins moved incorrectly) · **Owner:** Poker on-call + Incident lead · **Related:** [../incident-response.md](../incident-response.md), [duplicate-settlement.md](./duplicate-settlement.md), [coin-conservation-failure.md](./coin-conservation-failure.md), [../refunds.md](../refunds.md), [/admin/poker/integrity](/admin/poker/integrity)

> ⚠️ **Illustrative SQL.** The queries in this runbook use bind-style placeholders (e.g. `:hand_id`) and column names implied by each table's purpose. They are **not verified against the production schema** — confirm columns before use, run reads only, and **never** execute write/DDL against production. See [../reporting.md](../reporting.md) (support-tools) and [../incident-response.md](../incident-response.md).

## Symptoms
- Hand reached showdown/end but no payout landed; stacks not updated.
- `poker_ops_events` kind `settlement_failure`.
- Player reports "I won but didn't get paid" / pot disappeared.

## Detect / Confirm
- Ops signal:
  ```sql
  select id, table_id, hand_id, severity, created_at from poker_ops_events
  where kind = 'settlement_failure' order by created_at desc limit 50;
  ```
- Hand vs settlement:
  ```sql
  select h.id, h.phase from poker_hands h where h.id = :hand_id;
  select * from poker_hand_settlements where hand_id = :hand_id;
  ```
- Integrity view [/admin/poker/integrity](/admin/poker/integrity): look for `SETTLEMENT_RECONCILE_MISMATCH`, `PAYOUT_TO_INELIGIBLE_SEAT`, `DUPLICATE_SETTLEMENT`.

## Immediate action (stop the bleeding)
1. Do NOT retry settlement by editing rows or crediting wallets by hand.
2. Freeze the hand to stop any further attempts and preserve state: `poker_admin_freeze_hand(...)` → `PAUSED_FOR_REVIEW`.
3. Open an incident case: `poker_admin_open_incident(...)`; tie the `handId`.
4. If a systemic pattern (many hands), stop new commitments: `POKER_BLOCK_NEW_JOINS=1` or raise maintenance tier (see [../maintenance.md](../maintenance.md)).

## Diagnose (root cause)
- Reconcile the three sources of truth:
  - `poker_actions` (what was wagered) → pot construction.
  - `poker_hand_settlements` (intended payouts).
  - `coin_ledger` (what actually moved) filtered to the hand.
- Determine the failure class:
  - No settlement row at all → settlement never ran (retry via the authoritative path, not manual).
  - Settlement row but no ledger movement → payout crashed mid-way.
  - Amounts disagree → `SETTLEMENT_RECONCILE_MISMATCH` / `PAYOUT_TO_INELIGIBLE_SEAT` → treat as coin integrity, do NOT auto-fix.
- Check `poker_admin_audit` for any prior admin touch.

## Recover
1. If settlement simply did not run and pot construction is provably correct, re-drive settlement through the authoritative RPC path (idempotent) — never a manual credit.
2. If reconciliation is ambiguous or coins moved wrong, **refund the hand**: `poker_admin_refund_hand(p_actor, p_hand_id, p_reason, p_case_id)` (idempotent via settlement lock; advances case → `REFUNDED`). See [../refunds.md](../refunds.md).
3. If integrity codes indicate conservation break, escalate to [coin-conservation-failure.md](./coin-conservation-failure.md) (SEV-1) before any correction.

## Verify
- `poker_hand_settlements` present and reconciles with `coin_ledger` for the hand.
- Coin conservation holds across involved `game_wallets` (sum unchanged for a refund; zero-sum for a settlement).
- Integrity view clean; no new `settlement_failure` events; SLO green.

## Communicate
- Notify affected players via the table banner / status; use `POKER_MAINTENANCE_MESSAGE` if cohort-wide.
- Record the diagnosis + remedy in the incident case note (`poker_admin_add_incident_note`).

## Post-incident
- Close `poker_incident_cases` `RESOLVED` (with note) or leave `REFUNDED` (terminal). Preserve replay + ledger diff as evidence. File a code follow-up if settlement logic was at fault.
