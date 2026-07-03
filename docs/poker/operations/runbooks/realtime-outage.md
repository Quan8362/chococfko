# Runbook — Realtime Outage (widespread reconnect failure)

**Severity:** SEV-2 · **Owner:** Poker on-call · **Related:** [../incident-response.md](../incident-response.md), [snapshot-failure.md](./snapshot-failure.md), [supabase-degradation.md](./supabase-degradation.md), [../maintenance.md](../maintenance.md), [/admin/poker/observability](/admin/poker/observability)

> ⚠️ **Illustrative SQL.** The queries in this runbook use bind-style placeholders (e.g. `:hand_id`) and column names implied by each table's purpose. They are **not verified against the production schema** — confirm columns before use, run reads only, and **never** execute write/DDL against production. See [../reporting.md](../reporting.md) (support-tools) and [../incident-response.md](../incident-response.md).

## Symptoms
- Many players report tables not updating live; moves only appear on refresh.
- `poker_ops_events` kinds `reconnect_failure`, `realtime_subscription_error` spiking.
- `/admin/poker/observability` reconnect metric degraded across tables.

## Detect / Confirm
- Ops signal (volume + spread):
  ```sql
  select kind, count(*) from poker_ops_events
  where kind in ('reconnect_failure','realtime_subscription_error','stale_state')
    and created_at > now() - interval '15 minutes'
  group by kind;
  ```
- Dashboard [/admin/poker/observability](/admin/poker/observability) — reconnect SLO, subscription error rate.
- Confirm scope: single table vs. platform-wide. Platform-wide → suspect Supabase Realtime ([supabase-degradation.md](./supabase-degradation.md)).

## Immediate action (stop the bleeding)
1. The server/DB stays authoritative — no coins or state are at risk from a transport outage. Do NOT freeze or refund hands for a realtime blip.
2. Stop new commitments so fewer players enter a degraded experience: `POKER_BLOCK_NEW_JOINS=1`, or raise maintenance to `no_new_joins` (see [../maintenance.md](../maintenance.md)).
3. If severe and prolonged, `finish_active_hands` — lets running hands complete while blocking new create/join. It NEVER settles/cancels a live hand.
4. Post a status banner (`POKER_MAINTENANCE_MESSAGE` + `POKER_MAINTENANCE_ETA`).

## Diagnose (root cause)
- Check Supabase Realtime health / project status; correlate with `realtime_subscription_error` timing.
- Recall the client recovery design: PokerSyncController drops/reconciles by `state_version`; the hook has a watchdog and re-`setAuth` on `TOKEN_REFRESHED`. If reconnect fails despite this, transport is the fault, not the client.
- Rule out an auth token issue (mass `TOKEN_REFRESHED` failures look similar) → [login-failure.md](./login-failure.md).

## Recover
1. This is transport recovery, not coin recovery — no refunds unless a hand independently got stuck ([stuck-hand.md](./stuck-hand.md)).
2. When Realtime recovers, clients reconcile automatically by `state_version`; confirm subscriptions re-establish.
3. Lower the maintenance tier back to `normal` / clear `POKER_BLOCK_NEW_JOINS` once error rate is nominal.

## Verify
- `reconnect_failure` / `realtime_subscription_error` rates back to baseline on [/admin/poker/observability](/admin/poker/observability).
- Live tables update without refresh; `state_version` advances client-side.
- No lingering `stale_state`; SLO green.

## Communicate
- Banner explaining brief live-sync issues; reassure balances/results are safe and server-authoritative.
- Note timeline in an incident case if opened.

## Post-incident
- If a real bug in reconnect logic surfaced, open `poker_incident_cases`, preserve ops-event evidence, file follow-up. Close `RESOLVED` with note. Restore flags/maintenance to normal and record it.
