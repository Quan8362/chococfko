# Runbook — Stuck Hand (not progressing, not frozen)

**Severity:** SEV-3 (SEV-2 if many tables) · **Owner:** Poker on-call · **Related:** [../incident-response.md](../incident-response.md), [frozen-hand.md](./frozen-hand.md), [snapshot-failure.md](./snapshot-failure.md), [/admin/poker/hands](/admin/poker/hands)

> ⚠️ **Illustrative SQL.** The queries in this runbook use bind-style placeholders (e.g. `:hand_id`) and column names implied by each table's purpose. They are **not verified against the production schema** — confirm columns before use, run reads only, and **never** execute write/DDL against production. See [../reporting.md](../reporting.md) (support-tools) and [../incident-response.md](../incident-response.md).

## Symptoms
- Players report the turn clock stalled; no one can act; "waiting for player" never resolves.
- `poker_ops_events` kind `long_running_hand` or `stale_state` appearing for a `table_id`.
- `/admin/poker/observability` shows a hand whose `state_version` is not advancing.

## Detect / Confirm
- Dashboard: [/admin/poker/hands](/admin/poker/hands) → open the table; confirm hand is live but idle. Replay at `/admin/poker/hands/[handId]`.
- Confirm the hand is genuinely live (not terminal):
  ```sql
  select id, table_id, phase, updated_at
  from poker_hands
  where table_id = :table_id
    and phase not in ('COMPLETED','CANCELLED');
  ```
- Ops signal:
  ```sql
  select kind, severity, created_at from poker_ops_events
  where table_id = :table_id
    and kind in ('long_running_hand','stale_state','failed_action','sequence_gap')
  order by created_at desc limit 50;
  ```
- Distinguish from a **frozen** hand: a frozen hand is in `PAUSED_FOR_REVIEW` (see [frozen-hand.md](./frozen-hand.md)). A stuck hand is NOT — it is just idle.

## Immediate action (stop the bleeding)
1. If it is a single table and a player is simply AFK, let the server turn-clock time them out / force sit-out naturally — do nothing destructive.
2. If the clock itself is stalled, force the seated player to sit out (reversible, no coin move):
   `poker_admin_force_sit_out(p_actor, p_table_id, p_seat, p_reason)` — audited.
3. If many tables are affected, treat as a platform issue → suspect realtime ([realtime-outage.md](./realtime-outage.md)) or Supabase ([supabase-degradation.md](./supabase-degradation.md)) and consider `POKER_BLOCK_NEW_JOINS=1` to stop new tables while you investigate.

## Diagnose (root cause)
- Replay the action log to see the last accepted move and whose turn it is:
  ```sql
  select seat, action_type, created_at from poker_actions
  where hand_id = :hand_id order by created_at desc limit 20;
  ```
- Check `poker_ops_events` for `failed_action` / `transaction_retry` / `duplicate_action` around the stall time — these point at a rejected write loop vs. a pure client stall.
- Review `poker_admin_audit` to confirm no admin action already touched this hand.
- If deltas or pot look wrong, escalate to coin integrity: [coin-conservation-failure.md](./coin-conservation-failure.md).

## Recover
1. Preferred: force sit-out the stalling seat (step 2 above); the server advances the hand authoritatively. Never hand-edit `poker_hands` or `poker_seats`.
2. If the hand cannot advance safely (engine wedged / suspected bug), **freeze** it: `poker_admin_freeze_hand(...)` → `PAUSED_FOR_REVIEW`, then follow [frozen-hand.md](./frozen-hand.md).
3. If the hand must be voided, refund via the idempotent path only — `poker_admin_refund_hand` tied to an incident case. See [../refunds.md](../refunds.md). Never move coins by hand.

## Verify
- `state_version` advances on the next action; players can act again.
- `poker_hands.phase` progresses toward `COMPLETED`.
- No new `long_running_hand`/`stale_state` events for the table; SLO panel green on [/admin/poker/metrics](/admin/poker/metrics).

## Communicate
- If user-facing, set `POKER_MAINTENANCE_MESSAGE` / status banner only if multiple tables are affected. A single stuck table needs no global banner.
- Add a note to the incident case (if one was opened) via `poker_admin_add_incident_note`.

## Post-incident
- If a bug was found, open `poker_incident_cases` (`poker_admin_open_incident`), preserve the `handId` and action replay as evidence, file a follow-up. Close as `RESOLVED` with a resolution note once fixed.
