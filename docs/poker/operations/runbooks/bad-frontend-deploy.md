# Runbook — Bad Frontend Deploy (broken build reached prod)

**Severity:** SEV-2 (SEV-1 if it corrupts game/coin flow) · **Owner:** Poker on-call · **Related:** [../incident-response.md](../incident-response.md), [feature-flag-rollback.md](./feature-flag-rollback.md), [db-migration-failure.md](./db-migration-failure.md), [rls-incident.md](./rls-incident.md)

## Background (deploy model — do not violate)
Git repo root = `web/` (remote `Quan8362/chococfko`). The ONLY path to prod is **commit + push to `main`** — Vercel project `chococfko` is git-linked and auto-deploys. **NEVER `vercel --prod` locally** (that shipped a 404 before). Rollback = revert the commit and push, OR use Vercel "Promote previous deployment".

## Symptoms
- Poker pages error / white-screen / 404 immediately after a deploy to `main`.
- Client error reports spike; users can't load tables.
- New `failed_action` / `rls_denial` only if the deploy also changed server/data behavior.

## Detect / Confirm
- Confirm the last deploy on Vercel `chococfko` corresponds to the regression (compare git SHA / deploy time to symptom onset).
- Reproduce on prod; check the browser console + any client-error reporting.
- Determine scope: pure UI break (safe to revert) vs. a deploy that also touched server routes / RLS / coin flow (check [rls-incident.md](./rls-incident.md) / [coin-conservation-failure.md](./coin-conservation-failure.md)).

## Immediate action (stop the bleeding)
1. **Preserve active tables** — a frontend revert does not touch the DB, so live hands and balances are safe (server is authoritative). Do NOT freeze/refund for a UI bug.
2. If the break is disruptive, gate access while you roll back: `POKER_BLOCK_NEW_JOINS=1` or a maintenance tier (`finish_active_hands` keeps live hands going). See [feature-flag-rollback.md](./feature-flag-rollback.md).
3. Roll back the code:
   - Fastest: Vercel → **Promote previous (known-good) deployment**.
   - Durable: `git revert <bad-sha>` in `web/` and push to `main` (auto-deploys the revert). Never `vercel --prod` locally.

## Diagnose (root cause)
- Identify the offending commit/diff. Was it purely client, or did it also change API routes / access gating / RLS-adjacent code?
- If it changed data behavior, verify no coin/state corruption occurred while it was live (integrity dashboard, `poker_ops_events`).

## Recover
1. After promote/revert, confirm prod serves the known-good build.
2. Lower any maintenance gating back toward `normal` gradually.
3. If the bad build caused coin/state damage, resolve via the relevant runbook + idempotent audited refund ([../refunds.md](../refunds.md)) — never manual edits.

## Verify
- Poker pages load; tables render; no client-error spike.
- Live tables from before the incident still function; `state_version` advancing.
- Integrity + SLO green.

## Communicate
- Brief banner (`POKER_MAINTENANCE_MESSAGE`) during rollback; clear once healthy.
- Note the bad SHA + rollback method in the incident case.

## Post-incident
- Open `poker_incident_cases` if there was user impact; preserve the bad SHA + error evidence; file a follow-up (test/CI gap). Close `RESOLVED` with a resolution note. Re-land the fix forward via commit+push once corrected.
