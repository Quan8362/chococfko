# Closed Beta — Safety Controls & Rollback

Every control below already exists as an admin server action or an env flag. All env changes
take effect on the **next request** (no deploy needed if the platform reloads env on restart).
Prefer the **least-destructive** control that contains the problem.

---

## Safety controls (least → most disruptive)

| Need | Control | Effect |
|---|---|---|
| Freeze a single hand for investigation | `freezeHand(tableId, handId, reason)` | Hand paused; stacks preserved |
| Pause / resume one table | `pauseTable` / `resumeTable` | Table stops/starts new hands |
| Force a player to sit out | `forceSitOut(tableId, seatIndex, reason)` | Seat sits out; stack preserved |
| Close one table safely | `markTableClosing` → `closeTable` | Table drains, then closes; cash-out normal |
| Disable spectators | `POKER_SPECTATOR_ENABLED=0` | No new spectators |
| Disable private tables | `POKER_PRIVATE_TABLE_ENABLED=0` | No new private tables |
| Disable new table creation | `POKER_CREATE_TABLE_ENABLED=0` | No new tables; existing continue |
| **Block ALL new joins (freeze)** | `POKER_BLOCK_NEW_JOINS=1` | Running hands & stacks preserved; no new creates/joins/sits |
| Suspend one tester (access) | add email to `POKER_BETA_SUSPENDED` | Locked out next request |
| Restrict one player (gameplay) | `restrictPlayer(...)` | Can view, cannot sit |
| Maintenance mode | `POKER_BETA_MAINTENANCE=1` (+ `POKER_BETA_STATUS_MESSAGE`) | **Blocks new create/join** (running hands preserved) AND shows the maintenance strip |
| Start an incident review | `openIncident(...)` → `/admin/poker/incidents` | Tracked case + notes + FSM |

**The freeze (`POKER_BLOCK_NEW_JOINS=1`) is the safe pause for the whole Beta:** existing hands
finish and players cash out normally; no new coins are committed. It overrides create/join for
everyone, including admins.

---

## Pausing the entire Beta (reversible, no coins stranded)

1. Set `POKER_BLOCK_NEW_JOINS=1` — new creates/joins/sits stop; running hands finish.
2. (Optional) `POKER_BETA_MAINTENANCE=1` + a `POKER_BETA_STATUS_MESSAGE` so testers see why.
3. Let tables empty naturally; use `markTableClosing`/`closeTable` for stragglers.
4. To resume: `POKER_BLOCK_NEW_JOINS=0` and clear the maintenance flag.

---

## Controlled rollback

Order from least to most disruptive. Choose the lowest rung that resolves the issue.

### Rung 1 — Contain (seconds)
- `POKER_BLOCK_NEW_JOINS=1` to stop new commitments while you assess.
- Freeze/pause the specific hand or table if localised.

### Rung 2 — Close the Beta to testers (keep admins in)
- `POKER_CLOSED_BETA_ENABLED=0` → cohort members lose access; **admins still in** (they bypass
  the gate) so they can validate fixes on the same environment.
- Public stays dark because `POKER_ENABLED` was never turned on.

### Rung 3 — Hard off (everyone but admins, or fully dark)
- `POKER_CLOSED_BETA_ENABLED=0` **and** `POKER_ENABLED=0` → only admins can reach poker.
- The `/games/poker` layout `notFound()`s for everyone else — the feature stops advertising
  its existence.

### Rung 4 — Code rollback (last resort)
- Revert the deploy on Vercel (git-linked project `chococfko`). See
  [deploy-infrastructure memory] — deploy is a commit+push to `main`, **never** `vercel --prod`.
- Migrations are **additive and non-destructive**; no down-migration is required for a code
  revert. `migration_poker_beta.sql` only adds `poker_beta_acknowledgements` (no coin move).

---

## What rollback never does

- Never edits balances directly. Coin corrections go through the audited RPCs (see
  support-process.md § coin-correction).
- Never deletes gameplay data. Tables are closed, not dropped; acknowledgements are retained.
- Never strands coins mid-hand — the freeze preserves running hands; close only drained tables.

---

## Pre-flight before enabling the first cohort

1. Apply `migration_poker_beta.sql` (+ confirm `poker_bug_reports` from Alpha is applied).
2. Set the closed-beta env baseline (see closed-beta-plan.md §3), public flag OFF.
3. Load `/admin/poker/beta` — confirm roster, flags, and "Not measured" success rows render.
4. Add ONLY the internal_admin cohort emails. Do not add later cohorts yet.
