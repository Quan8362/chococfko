# Poker Deployment Rollback

How to safely back out a bad poker deployment **without stranding active tables or coins**. The
deploy model is git-linked: the repo root is `web/`, and the only path to production is
commit + push to `main`, which the Vercel `chococfko` project auto-deploys. **Never** `vercel --prod`
locally.

## Key facts

- **Frontend + server logic** roll back together (it's one Next.js app) by reverting the commit or
  promoting a previous Vercel deployment.
- **Database migrations are forward-only.** There is no destructive down-migration on prod. To undo
  a schema change you write a **new compensating migration**.
- **Maintenance mode + flags are env-driven** and take effect on redeploy — they are your fastest,
  safest lever and they never move coins or force hand state.

## Rollback checklist

1. **Identify the bad build.** Confirm the regression is deploy-caused: check the Vercel deployment
   history + `/admin/poker/metrics` + `[poker-alert]`/`[poker-telemetry]` logs. Note the last-known-good
   commit/deployment.
2. **Stop new exposure — do NOT nuke running tables.** Set `POKER_MAINTENANCE_MODE=no_new_joins`
   (or `POKER_BLOCK_NEW_JOINS=1`). New tables/joins freeze; running hands keep draining through the
   authoritative engine. Add a `POKER_MAINTENANCE_MESSAGE`.
3. **Preserve active tables.** Verify live hands are still progressing (turn clock is
   server-authoritative; a client refresh reconciles via `state_version`). Do not close tables
   reflexively.
4. **Decide finish vs. freeze per table.**
   - *Finish:* leave tables to drain, then escalate to `full_maintenance` once
     `poker_hands.phase NOT IN ('COMPLETED','CANCELLED')` count hits zero.
   - *Freeze:* if the bug corrupts in-hand behavior, `poker_admin_freeze_hand` the affected hands
     (→ `PAUSED_FOR_REVIEW`) so they stop mutating; refund later if they can't settle correctly.
5. **Roll back the frontend + server logic.** Promote the last-known-good deployment in Vercel, **or**
   `git revert <bad-commit>` on `main` and push (git-linked auto-deploy). Prefer promote for speed;
   prefer revert when you need the code history clean.
6. **Handle the database.** If the bad build shipped a migration:
   - The migration stays applied (forward-only). Ensure the rolled-back code is **compatible** with
     the already-applied schema (additive migrations usually are).
   - If the schema itself is the problem, write a **compensating** migration
     (`migration_poker_<fix>.sql`) and apply it via the Supabase SQL editor — never a raw destructive
     drop on prod. See [runbooks/db-migration-failure.md](./runbooks/db-migration-failure.md).
7. **Verify wallets and table stacks.** Run the coin-conservation check: seat stacks + escrow +
   wallets reconcile against `coin_ledger`; the 15-min integrity cron reports clean. Any breach →
   SEV-1 path ([incident-response.md](./incident-response.md), [refunds.md](./refunds.md)).
8. **Verify realtime.** Reconnect success rate recovers on `/admin/poker/metrics`; no sustained
   `realtime_subscription_error` / `sequence_gap`.
9. **Re-enable gradually.** Step the maintenance ladder back down: `no_new_joins` →
   `no_new_tables` → `normal`. Watch metrics between steps. Clear `POKER_MAINTENANCE_MESSAGE`.

## Fast levers (in order of blast radius)

| Lever | Effect | Reversible? |
|---|---|---|
| `POKER_MAINTENANCE_MODE=no_new_joins` | Freeze new commitments, keep hands running | ✅ instant on redeploy |
| Promote previous Vercel deployment | Roll back all app code | ✅ |
| `git revert` + push | Roll back all app code, clean history | ✅ |
| `POKER_MAINTENANCE_MODE=full_maintenance` | Paused; players see status screen | ✅ |
| `POKER_ENABLED=0` (kill switch) | Feature dark for everyone but admins | ✅ |
| Compensating migration | Undo a schema change forward-only | ⚠️ forward-only, write carefully |

## What NOT to do

- ❌ `vercel --prod` from a laptop (bypasses the git-linked pipeline; has caused a prod 404 before).
- ❌ Destructive down-migration / manual `DROP`/`UPDATE` on prod tables.
- ❌ Closing tables or editing balances to "clean up" — drain, freeze, or refund through the RPCs.

## Related

- [maintenance.md](./maintenance.md) · [backup-and-restore.md](./backup-and-restore.md) ·
  [runbooks/bad-frontend-deploy.md](./runbooks/bad-frontend-deploy.md) ·
  [runbooks/feature-flag-rollback.md](./runbooks/feature-flag-rollback.md) ·
  [runbooks/db-migration-failure.md](./runbooks/db-migration-failure.md)
