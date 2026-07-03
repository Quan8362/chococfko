# Runbook — Vercel Degradation (edge / functions degraded)

**Severity:** SEV-1 (hosting dependency) · **Owner:** Incident lead + Poker on-call · **Related:** [../incident-response.md](../incident-response.md), [supabase-degradation.md](./supabase-degradation.md), [bad-frontend-deploy.md](./bad-frontend-deploy.md), [feature-flag-rollback.md](./feature-flag-rollback.md), [../maintenance.md](../maintenance.md)

> ⚠️ **Illustrative SQL.** The queries in this runbook use bind-style placeholders (e.g. `:hand_id`) and column names implied by each table's purpose. They are **not verified against the production schema** — confirm columns before use, run reads only, and **never** execute write/DDL against production. See [../reporting.md](../reporting.md) (support-tools) and [../incident-response.md](../incident-response.md).

## Symptoms
- Poker pages / API routes on Vercel `chococfko` are slow, 500, or timing out; cron may not fire.
- `/api/cron/poker-integrity` (every 15 min) and `/api/cron/poker-risk-scoring` miss runs → integrity/SLO alerts go quiet (absence of `[poker-alert]` lines is itself a signal).
- Users can't load poker even though the DB is healthy.

## Detect / Confirm
- Check Vercel status / project `chococfko` deployment + function health. Confirm it is Vercel-side, not a bad deploy ([bad-frontend-deploy.md](./bad-frontend-deploy.md)) and not Supabase ([supabase-degradation.md](./supabase-degradation.md)).
- Verify the integrity cron actually ran recently:
  ```sql
  select kind, max(created_at) from poker_ops_events group by kind;
  ```
  Stale timestamps on server-emitted kinds hint the functions aren't executing.

## What still works vs. what doesn't
- **Still safe:** the DB is authoritative. Committed hands, balances, `coin_ledger`, and `poker_hand_settlements` are intact regardless of Vercel.
- **Impaired:** page rendering, API routes (create/join/act), cron jobs (integrity audit + risk scoring pause), realtime auth refresh if it rides through our routes.
- **Blind spot:** while cron is down, the 15-min coin-integrity audit isn't running — do a manual integrity check once service returns.

## Immediate action (stop the bleeding)
1. If routes are partially up, wind down new commitments to reduce failed actions: `POKER_MAINTENANCE_MODE=finish_active_hands` (live hands still complete server-side) or `no_new_joins`. See [../maintenance.md](../maintenance.md). Note: a full function outage may prevent env changes from taking effect until Vercel recovers.
2. Do NOT freeze/refund hands for a hosting blip — no coins are at risk.
3. Post `POKER_MAINTENANCE_MESSAGE` + `POKER_MAINTENANCE_ETA` if reachable.

## Diagnose (root cause)
- Confirm scope: single region/edge vs. global; functions vs. static.
- Rule out our own bad deploy (revert/promote path in [bad-frontend-deploy.md](./bad-frontend-deploy.md)).
- Track missed cron windows to know how large a manual integrity sweep is needed on recovery.

## Recover
1. Wait out / track Vercel recovery (no local `vercel --prod` — that is never the fix and is prohibited).
2. On recovery, **manually run the integrity check** ([/admin/poker/integrity](/admin/poker/integrity)) to cover the window cron missed; the next scheduled `/api/cron/poker-integrity` should resume automatically.
3. Step maintenance down gradually to `normal`.

## Verify
- Poker pages + API routes respond; cron resumes (fresh `[poker-alert]` cadence, ops-event timestamps current).
- Manual integrity sweep clean for the outage window; SLO green.

## Communicate
- Banner + ETA; reassure balances/results are safe and server-authoritative.
- Timeline in the incident case note.

## Post-incident
- Open `poker_incident_cases` for the window; note missed cron runs and the manual integrity result as evidence; close `RESOLVED` with a note. Restore to `normal`.
