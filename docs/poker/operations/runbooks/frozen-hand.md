# Runbook — Frozen Hand (PAUSED_FOR_REVIEW)

**Severity:** SEV-2 · **Owner:** Poker on-call + Incident lead · **Related:** [../incident-response.md](../incident-response.md), [stuck-hand.md](./stuck-hand.md), [../refunds.md](../refunds.md), [/admin/poker/incidents](/admin/poker/incidents), [/admin/poker/hands](/admin/poker/hands)

> ⚠️ **Illustrative SQL.** The queries in this runbook use bind-style placeholders (e.g. `:hand_id`) and column names implied by each table's purpose. They are **not verified against the production schema** — confirm columns before use, run reads only, and **never** execute write/DDL against production. See [../reporting.md](../reporting.md) (support-tools) and [../incident-response.md](../incident-response.md).

## Symptoms
- A hand is in `PAUSED_FOR_REVIEW`; players see the table paused / "under review".
- `poker_ops_events` kind `frozen_hand` recorded.
- Reached either via admin action (`poker_admin_freeze_hand`) or an automatic freeze from an integrity/engine guard.

## Detect / Confirm
- Dashboard: [/admin/poker/hands/[handId]](/admin/poker/hands) replay + [/admin/poker/incidents](/admin/poker/incidents).
- Confirm state:
  ```sql
  select id, table_id, phase from poker_hands where id = :hand_id;
  -- phase = 'PAUSED_FOR_REVIEW'
  ```
- Find the audit trail of the freeze:
  ```sql
  select actor, action, created_at from poker_admin_audit
  where hand_id = :hand_id order by created_at desc;
  ```
- Check whether an incident case is already tied:
  ```sql
  select id, status from poker_incident_cases order by created_at desc limit 20;
  ```

## Immediate action (stop the bleeding)
1. A frozen hand is already safe — no coins have moved, no state advances. Do NOT rush to unfreeze.
2. Ensure an incident case exists: `poker_admin_open_incident(...)` if not, and note the `handId`.
3. Record what triggered the freeze with `poker_admin_add_incident_note`.

## Diagnose (root cause)
- Replay `poker_actions` for the hand; compare against the engine expectation.
- Review `poker_ops_events` (`coin_conservation_failure`, `settlement_failure`, `failed_action`) around freeze time.
- Run the coin-integrity view: [/admin/poker/integrity](/admin/poker/integrity). If any of `CONSERVATION_MISMATCH`, `POT_CONSTRUCTION_MISMATCH`, `LEDGER_IMBALANCE` fire → escalate to [coin-conservation-failure.md](./coin-conservation-failure.md) (SEV-1) and do NOT resume.
- If the pause was purely operational (AFK / manual), resume is safe once confirmed.

## Recover
Two sanctioned exits — both authoritative, both audited:
1. **Resume** (state is sound): `poker_admin_resume_table(...)` after transitioning the incident case appropriately. The engine continues the hand; no coin adjustment.
2. **Refund / void** (state is unsound or unrecoverable): `poker_admin_refund_hand(p_actor, p_hand_id, p_reason, p_case_id)` — idempotent (settlement lock), advances the tied case to `REFUNDED`. Follow [../refunds.md](../refunds.md). Never edit balances or `poker_hands` by hand.
3. `poker_admin_reveal_hole_cards` is available ONLY if the hand is TERMINAL and you need cards as evidence — audited, sole sanctioned reveal.

## Verify
- After resume: `state_version` advances, `phase` progresses; no repeat `frozen_hand` event.
- After refund: coin conservation holds (integrity view clean); `poker_incident_cases.status = 'REFUNDED'`; refund is idempotent (re-running the RPC is a no-op).

## Communicate
- Set `POKER_MAINTENANCE_MESSAGE` only if a table cohort is affected. For one table, message via the table's paused banner.
- Log the resolution in the incident case note.

## Post-incident
- Close `poker_incident_cases` as `RESOLVED` (resume) with a resolution note, or it is already `REFUNDED` (refund path — terminal).
- Preserve action replay + integrity output as evidence. File follow-up bug if a code defect caused the freeze.
