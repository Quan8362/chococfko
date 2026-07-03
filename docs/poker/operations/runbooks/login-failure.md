# Runbook — Login / Session Failure blocking Poker

**Severity:** SEV-2 · **Owner:** Poker on-call + Platform auth · **Related:** [../incident-response.md](../incident-response.md), [realtime-outage.md](./realtime-outage.md), [private-table-access.md](./private-table-access.md), [/admin/poker/observability](/admin/poker/observability)

> ⚠️ **Illustrative SQL.** The queries in this runbook use bind-style placeholders (e.g. `:hand_id`) and column names implied by each table's purpose. They are **not verified against the production schema** — confirm columns before use, run reads only, and **never** execute write/DDL against production. See [../reporting.md](../reporting.md) (support-tools) and [../incident-response.md](../incident-response.md).

## Symptoms
- Players repeatedly asked to "sign in again"; poker pages redirect to login.
- Realtime auth failures alongside sign-in loops (`TOKEN_REFRESHED` not applying).
- `poker_ops_events` kind `rls_denial` if requests arrive unauthenticated.

## Detect / Confirm
- Reproduce: load a poker page while signed in; watch for redirect to login / auth error codes on the login page (stable `?authError=` codes).
- Ops signal for unauthenticated access reaching the DB:
  ```sql
  select table_id, count(*) from poker_ops_events
  where kind = 'rls_denial' and created_at > now() - interval '15 minutes'
  group by table_id;
  ```
- Dashboard [/admin/poker/observability](/admin/poker/observability). Correlate with any platform auth incident.
- Background: known auth behavior is documented in the platform's auth-session-persistence work — middleware cookie handling via `@supabase/ssr`, `AuthSync` for mobile/BFCache resume + cross-tab sync. A poker-specific loop usually rides on top of that.

## Immediate action (stop the bleeding)
1. No coin/game-state risk from an auth outage — the DB stays authoritative and RLS keeps denying unauthenticated access. Do NOT freeze/refund.
2. Confirm scope: poker-only vs. site-wide auth. Site-wide → hand to platform auth on-call; poker inherits the fix.
3. If poker access is broadly broken, gate new commitments with maintenance (`no_new_joins`) and post a banner (`POKER_MAINTENANCE_MESSAGE`). Kill switch `POKER_ENABLED=0` only if poker must be fully hidden.

## Diagnose (root cause)
- Determine failure class: token refresh race (cookie rotation), OAuth callback error (check `?authError=` code), or Supabase Auth degradation ([supabase-degradation.md](./supabase-degradation.md)).
- If realtime also fails on auth, it's a token propagation issue — the hook should re-`setAuth` on `TOKEN_REFRESHED`; if it isn't, that's the poker-side bug.
- Check middleware / cookie handling if `sb-*` cookies are being dropped on refresh.

## Recover
1. If platform auth: apply the platform fix; poker recovers automatically.
2. If poker-specific token propagation: revert the offending deploy ([bad-frontend-deploy.md](./bad-frontend-deploy.md)) or ship a fix via commit+push to `main` (never `vercel --prod` locally).
3. Clear maintenance gating once sign-in is stable.

## Verify
- Signed-in players reach poker without redirect loops; realtime authenticates.
- `rls_denial` rate back to baseline; SLO green.

## Communicate
- Banner explaining sign-in issues; reassure balances are safe.
- Note in incident case if opened.

## Post-incident
- If a poker-side auth regression, open `poker_incident_cases`, preserve evidence (no tokens in logs — privacy rule), file follow-up, close `RESOLVED` with note.
