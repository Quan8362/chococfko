# Runbook — Supabase Degradation (DB / Realtime / Auth down or slow)

**Severity:** SEV-1 (platform dependency) · **Owner:** Incident lead + Poker on-call · **Related:** [../incident-response.md](../incident-response.md), [realtime-outage.md](./realtime-outage.md), [snapshot-failure.md](./snapshot-failure.md), [login-failure.md](./login-failure.md), [../maintenance.md](../maintenance.md)

> ⚠️ **Illustrative SQL.** The queries in this runbook use bind-style placeholders (e.g. `:hand_id`) and column names implied by each table's purpose. They are **not verified against the production schema** — confirm columns before use, run reads only, and **never** execute write/DDL against production. See [../reporting.md](../reporting.md) (support-tools) and [../incident-response.md](../incident-response.md).

## Symptoms
- Broad failures across poker: writes error, snapshots won't load, realtime dead, sign-in fails.
- `poker_ops_events` `transaction_retry`, `failed_action`, `stale_state`, `reconnect_failure`, `realtime_subscription_error` all elevated at once.
- Supabase status/health degraded for project `kjfnqbzfhymhfodmgyow`.

## Detect / Confirm
- Check Supabase project health (`get_logs`, `get_advisors`, status page). Correlate onset with the ops-event surge:
  ```sql
  select kind, count(*) from poker_ops_events
  where created_at > now() - interval '15 minutes' group by kind order by 2 desc;
  ```
- Distinguish which subsystem: DB (writes/reads), Realtime ([realtime-outage.md](./realtime-outage.md)), or Auth ([login-failure.md](./login-failure.md)). Often multiple.

## Immediate action (stop the bleeding)
1. **Graceful wind-down** — the DB is authoritative and safe even when slow; the risk is players starting new hands into a failing backend. Raise `POKER_MAINTENANCE_MODE`:
   - Partial slowness → `no_new_joins` (existing hands continue).
   - Severe → `finish_active_hands` (block new create/join, let live hands complete — never settles/cancels them).
   - Full outage → `full_maintenance` or `emergency_shutdown` to cut new access. See [../maintenance.md](../maintenance.md).
2. Do NOT freeze/refund hands en masse for a transport/DB blip — coins are not lost, just unreachable.
3. Post `POKER_MAINTENANCE_MESSAGE` + `POKER_MAINTENANCE_ETA`.

## Diagnose (root cause)
- Confirm it's Supabase-side vs. our code (a bad deploy can mimic this — see [bad-frontend-deploy.md](./bad-frontend-deploy.md)).
- Watch `transaction_retry` volume — the engine's CAS retries indicate contention/DB stress, not corruption.
- Note any `coin_conservation_failure` — if one appears, that specific hand escalates to [coin-conservation-failure.md](./coin-conservation-failure.md); a general slowdown does not.

## Recover
1. Wait out / track Supabase recovery; there is no local fix for their outage.
2. As health returns, step the maintenance tier down gradually (`full_maintenance` → `no_new_joins` → `normal`), watching SLOs.
3. Only after recovery, address any individual hand that got genuinely stuck ([stuck-hand.md](./stuck-hand.md)) or a specific integrity code.

## Verify
- Reads/writes succeed; realtime reconnects; sign-in works.
- Ops-event kinds back to baseline; `state_version` advancing; integrity + SLO green.
- Coin conservation intact (spot-check integrity dashboard).

## Communicate
- Banner + ETA throughout; reassure balances and results are safe and server-authoritative.
- Timeline in the incident case note.

## Post-incident
- Open `poker_incident_cases` for the outage window; preserve ops-event + Supabase status evidence; close `RESOLVED` with a note. Review whether tier thresholds were right. Restore to `normal`.
