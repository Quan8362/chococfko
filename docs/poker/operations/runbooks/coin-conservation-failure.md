# Runbook — Coin Conservation Failure (SEV-1)

**Severity:** SEV-1 · **Owner:** Incident lead (page immediately) · **Related:** [../incident-response.md](../incident-response.md), [settlement-failure.md](./settlement-failure.md), [duplicate-settlement.md](./duplicate-settlement.md), [../refunds.md](../refunds.md), [/admin/poker/integrity](/admin/poker/integrity)

> ⚠️ **Illustrative SQL.** The queries in this runbook use bind-style placeholders (e.g. `:hand_id`) and column names implied by each table's purpose. They are **not verified against the production schema** — confirm columns before use, run reads only, and **never** execute write/DDL against production. See [../reporting.md](../reporting.md) (support-tools) and [../incident-response.md](../incident-response.md).

Codes in scope: `CONSERVATION_MISMATCH`, `POT_CONSTRUCTION_MISMATCH`, `LEDGER_IMBALANCE` (also watch `SETTLEMENT_RECONCILE_MISMATCH`, `PAYOUT_TO_INELIGIBLE_SEAT`, `NEGATIVE_VALUE`, `NON_INTEGER_VALUE`). Coins may be miscreated or destroyed — this is the highest-priority money bug. **No auto-fix. Preserve evidence first.**

## Symptoms
- `[poker-alert]` log line from cron `/api/cron/poker-integrity` (runs every 15 min).
- Integrity dashboard [/admin/poker/integrity](/admin/poker/integrity) shows a conservation/pot/ledger code.
- `poker_ops_events` kind `coin_conservation_failure`.

## Detect / Confirm
- Confirm the code and the affected `hand_id` / `table_id` on [/admin/poker/integrity](/admin/poker/integrity).
- Cross-check the three sources:
  ```sql
  select seat, action_type from poker_actions where hand_id = :hand_id;          -- wagered
  select * from poker_hand_settlements where hand_id = :hand_id;                  -- intended payout
  select wallet_id, amount from coin_ledger where hand_id = :hand_id;             -- actual movement
  ```
- `POT_CONSTRUCTION_MISMATCH` = pot built ≠ contributions. `CONSERVATION_MISMATCH` = total coins before ≠ after. `LEDGER_IMBALANCE` = `coin_ledger` does not net to zero for the movement.

## Immediate action (stop the bleeding)
1. **Freeze the hand immediately:** `poker_admin_freeze_hand(...)` → `PAUSED_FOR_REVIEW`. Never let it settle further.
2. **Preserve evidence before any change** — snapshot `poker_actions`, `poker_hand_settlements`, `coin_ledger`, and the integrity output for the hand.
3. Open a SEV-1 incident: `poker_admin_open_incident(...)`; page the incident lead per [../incident-response.md](../incident-response.md).
4. Contain blast radius: raise maintenance to at least `no_new_joins` (or `POKER_BLOCK_NEW_JOINS=1`); if widespread, `finish_active_hands` / `full_maintenance` (see [../maintenance.md](../maintenance.md)). Kill switch `POKER_ENABLED=0` only as last resort — it takes the feature dark.
5. Do NOT edit balances, `poker_hands`, or `coin_ledger` by hand. Ever.

## Diagnose (root cause)
- Replay the hand end-to-end from `poker_actions`; rebuild the pot manually and compare to the settlement.
- Determine whether coins were created (payout > pot) or destroyed (payout < pot) and which wallet(s) diverged in `game_wallets` / `coin_ledger`.
- Check `poker_admin_audit` for concurrent admin actions and `poker_ops_events` for `transaction_retry` / `duplicate_action` that could double-commit.

## Recover
1. Correction flows ONLY through the idempotent, audited, incident-tied RPC path — `poker_admin_refund_hand(p_actor, p_hand_id, p_reason, p_case_id)` to void the corrupt hand and restore pre-hand balances. See [../refunds.md](../refunds.md).
2. If a duplicate caused it, follow [duplicate-settlement.md](./duplicate-settlement.md).
3. Verify the refund is idempotent (settlement lock) before and after applying.

## Verify
- Total coins across all involved `game_wallets` equal the pre-hand total (conservation restored).
- `coin_ledger` for the hand nets to zero / correct total; integrity dashboard clean on next cron run.
- No repeat `coin_conservation_failure` events; SLO green.

## Communicate
- Cohort/global banner via `POKER_MAINTENANCE_MESSAGE` + `POKER_MAINTENANCE_ETA` while contained.
- Detailed timeline + reconciliation in the incident case note (`poker_admin_add_incident_note`) — privacy-safe (no cards/decks/seeds).

## Post-incident
- Keep the case open (`INVESTIGATING`) until root cause fixed via a NEW forward migration / code fix; close `RESOLVED` with resolution note, or terminal `REFUNDED`.
- Preserve all evidence. Mandatory root-cause writeup for any conservation break.
