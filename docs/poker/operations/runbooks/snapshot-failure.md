# Runbook — Snapshot Failure (stale_state / sequence_gap)

**Severity:** SEV-2 · **Owner:** Poker on-call · **Related:** [../incident-response.md](../incident-response.md), [realtime-outage.md](./realtime-outage.md), [supabase-degradation.md](./supabase-degradation.md), [/admin/poker/observability](/admin/poker/observability)

> ⚠️ **Illustrative SQL.** The queries in this runbook use bind-style placeholders (e.g. `:hand_id`) and column names implied by each table's purpose. They are **not verified against the production schema** — confirm columns before use, run reads only, and **never** execute write/DDL against production. See [../reporting.md](../reporting.md) (support-tools) and [../incident-response.md](../incident-response.md).

## Symptoms
- Clients can't load an authoritative table snapshot; table renders blank/loading or shows stale data.
- `poker_ops_events` kinds `stale_state`, `sequence_gap`.
- Players report the board is "behind" or frozen visually while the server has moved on.

## Detect / Confirm
- Ops signal:
  ```sql
  select kind, table_id, count(*) from poker_ops_events
  where kind in ('stale_state','sequence_gap')
    and created_at > now() - interval '15 minutes'
  group by kind, table_id order by 3 desc;
  ```
- Dashboard [/admin/poker/observability](/admin/poker/observability) — snapshot load + `state_version` progression.
- Confirm the server truly advanced (so it is a client-view gap, not a stuck hand):
  ```sql
  select id, table_id, phase from poker_hands where table_id = :table_id
    and phase not in ('COMPLETED','CANCELLED');
  ```

## Immediate action (stop the bleeding)
1. No coin risk — the snapshot is a read/view concern; the DB remains authoritative. Do NOT freeze or refund.
2. If snapshot reads are failing broadly, suspect DB/read path → [supabase-degradation.md](./supabase-degradation.md); consider `read_only_lobby` or `no_new_joins` maintenance tier to reduce load (see [../maintenance.md](../maintenance.md)).
3. Post a brief status banner if user-facing (`POKER_MAINTENANCE_MESSAGE`).

## Diagnose (root cause)
- `sequence_gap` = the client saw a `state_version` jump / missed events → reconciliation should re-fetch the snapshot. If it can't, the snapshot endpoint or DB read is failing.
- `stale_state` = client holds an old version and isn't catching up → check whether it stems from a realtime transport outage ([realtime-outage.md](./realtime-outage.md)).
- Verify the recovery layer (PokerSyncController drops/reconciles by `state_version`; watchdog) is engaging — if it is and still failing, the authoritative snapshot fetch is the fault.
- Check for DB read latency / errors in Supabase logs.

## Recover
1. Restore the snapshot read path (DB/health). Once healthy, clients reconcile by `state_version` automatically.
2. If a specific hand is genuinely stuck (server not advancing), switch to [stuck-hand.md](./stuck-hand.md).
3. No coin correction unless a hand independently corrupted.

## Verify
- `state_version` advances client-side and matches the server; tables render current state.
- `stale_state` / `sequence_gap` back to baseline on [/admin/poker/observability](/admin/poker/observability); SLO green.

## Communicate
- Banner reassuring that game results are safe and server-authoritative while sync recovers.
- Incident case note if one was opened.

## Post-incident
- If a snapshot/reconciliation defect is found, open `poker_incident_cases`, preserve ops-event evidence, file follow-up, close `RESOLVED` with note. Restore maintenance tier to `normal`.
