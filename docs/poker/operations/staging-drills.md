# Poker Staging Drills

Controlled rehearsals of the incident + recovery procedures, run on **staging / a throwaway
Supabase project** — never against production data. A runbook you have never executed is a
hypothesis, not a capability.

## Ground rules

- **Never on prod.** Use a throwaway Supabase project / preview DB and a non-production Vercel
  deployment (or local `next dev`).
- **Follow the real runbook.** A drill exercises the actual doc so gaps surface. If reality differs
  from the doc, fix the doc.
- **Measure.** Record time-to-detect, time-to-mitigate, time-to-recover, and whether coin
  conservation held. File follow-ups.
- **Verify coins every time.** After any drill that touched coins, confirm
  `balance == starting + ledgerDelta` per wallet and per-hand conservation.

## Drill catalog

### 1. Realtime outage (SEV-2)
- **Inject:** disable/point the Realtime channel at a dead endpoint, or block the WS in the browser.
- **Expect:** clients show reconnecting; the recovery watchdog + `state_version` reconcile on
  restore; turn clock keeps hands progressing server-side.
- **Practice:** confirm scope on metrics, set `POKER_MAINTENANCE_MODE=no_new_joins` if worsening,
  restore, verify reconnect success rate recovers. Runbook: [runbooks/realtime-outage.md](./runbooks/realtime-outage.md).

### 2. Settlement failure (SEV-1)
- **Inject:** force a `settlement_failure` (e.g. a test hand that raises during settlement on staging).
- **Expect:** the hand does not silently mis-pay; an ops event + alert fire.
- **Practice:** freeze the hand, inspect the replay + integrity report, refund via
  `poker_admin_refund_hand`, verify conservation. Runbook: [runbooks/settlement-failure.md](./runbooks/settlement-failure.md).

### 3. Feature-flag shutdown
- **Inject:** flip `POKER_MAINTENANCE_MODE` through `no_new_joins → full_maintenance`, then
  `POKER_ENABLED=0`.
- **Expect:** new create/join blocked with `poker_joins_frozen`; running hands drain; kill switch
  makes the feature dark for non-admins. Admin `/admin/poker/*` still reachable.
- **Practice:** step back down to `normal` and confirm play resumes. Runbook:
  [runbooks/feature-flag-rollback.md](./runbooks/feature-flag-rollback.md).

### 4. Stuck / frozen table
- **Inject:** freeze a live hand with `poker_admin_freeze_hand`; also simulate a table with all
  humans gone (abandoned).
- **Expect:** frozen hand sits in `PAUSED_FOR_REVIEW` without mutating; the reaper handles the
  abandoned table.
- **Practice:** resume or refund the frozen hand; confirm `poker_admin_close_table` refuses while a
  live hand exists and succeeds once settled/refunded. Runbooks:
  [runbooks/stuck-hand.md](./runbooks/stuck-hand.md), [runbooks/frozen-hand.md](./runbooks/frozen-hand.md).

### 5. Controlled refund
- **Inject:** a hand that fails conservation on staging.
- **Expect:** integrity checker flags it; refund is idempotent.
- **Practice:** run the full [refunds.md](./refunds.md) workflow — incident → freeze → preview →
  approve → `poker_admin_refund_hand` (call it **twice** to prove no double-refund) → verify → case
  auto-`REFUNDED`.

### 6. Bad deployment rollback
- **Inject:** deploy a deliberately broken build to a staging deployment.
- **Expect:** you can promote the previous deployment / `git revert` without stranding tables.
- **Practice:** full [deployment-rollback.md](./deployment-rollback.md) checklist; verify wallets +
  realtime after. Runbook: [runbooks/bad-frontend-deploy.md](./runbooks/bad-frontend-deploy.md).

### 7. Restore procedure
- **Inject:** nothing — this is a recovery rehearsal.
- **Practice:** the staging restore drill in [backup-and-restore.md](./backup-and-restore.md):
  restore a backup into a throwaway project, apply migrations in
  [release-migration-order](../release-migration-order.md), run the DB test harnesses, and **gate on
  coin conservation**. Record measured RPO/RTO.

## Drill log

Keep a dated record (append-only) of each drill: date, scenario, who ran it, measured times,
pass/fail, and follow-ups. A scenario with no dated entry is considered **unrehearsed** — do not
rely on its RPO/RTO or "capability" claims until it has one.

### Verification-status legend

- **TESTED** — exercised against the real code and asserted (automated evidence).
- **DOC-ONLY** — the procedure is written and reviewed but not executed end-to-end (needs a live
  table / DB / realtime to run for real).
- **BLOCKED** — cannot run without a missing external dependency (named).
- **PROD-PROHIBITED** — must never be run against production.

### Prompt 25B run — 2026-07-03 (isolated local environment)

The maintenance-tier drills were executed against the **real** pure resolver + capability
composition (`lib/games/poker/maintenance.access.verify.test.ts`, 9/9 pass) — the same functions
the server runs in `checkPokerCapability`. No DB, no coins, no cards were touched (structurally
impossible in those modules). The incident-triage drills are decision-flow walkthroughs of the
runbooks and are **not** executed end-to-end here because they require a live poker table / DB /
realtime, which is production-prohibited and not available in this isolated run.

| # | Drill | Status | Evidence | Notes |
|---|---|---|---|---|
| 1 | no-new-joins maintenance | **TESTED** | `25B-TIER-no_new_joins-001` | create/join → `poker_joins_frozen`; enter/lobby/spectate open; running hands untouched. |
| 2 | full-maintenance | **TESTED** | `25B-TIER-full_maintenance-001` | only `enter` allowed; gameplay routes `poker_feature_off`; admin ops separate. |
| 3 | emergency-shutdown | **TESTED** | `25B-TIER-emergency_shutdown-001` | every capability `poker_feature_off` incl. `enter`. |
| — | read_only_lobby + invalid-fail-closed + recovery | **TESTED** | `25B-TIER-read_only_lobby-001`, `-invalid-001`, `25B-RECOVERY-001` | invalid mode → `full_maintenance`; `normal` fully recovers. |
| 4 | stuck-hand triage | DOC-ONLY | [runbooks/stuck-hand.md](./runbooks/stuck-hand.md) | needs a live stalled hand. |
| 5 | frozen-hand triage | DOC-ONLY | [runbooks/frozen-hand.md](./runbooks/frozen-hand.md) | needs `poker_admin_freeze_hand` on a real hand. |
| 6 | settlement-failure flow | DOC-ONLY | [runbooks/settlement-failure.md](./runbooks/settlement-failure.md) | integrity checker itself is unit-tested. |
| 7 | duplicate-settlement flow | DOC-ONLY | [runbooks/duplicate-settlement.md](./runbooks/duplicate-settlement.md) | idempotency guaranteed by settlement lock (DB). |
| 8 | coin-conservation incident | DOC-ONLY (checker **TESTED**) | `coinIntegrity.test.ts` | invariant checker verified; end-to-end freeze→refund needs DB. |
| 9 | cash-out failure | DOC-ONLY | [runbooks/cash-out-failure.md](./runbooks/cash-out-failure.md) | needs a live seated stack. |
| 10 | realtime outage | DOC-ONLY | [runbooks/realtime-outage.md](./runbooks/realtime-outage.md) | needs live Supabase Realtime. |
| 11 | snapshot / login failure | DOC-ONLY | [runbooks/snapshot-failure.md](./runbooks/snapshot-failure.md), [runbooks/login-failure.md](./runbooks/login-failure.md) | needs live auth/session + table. |
| 12 | private-table access incident | DOC-ONLY | [runbooks/private-table-access.md](./runbooks/private-table-access.md) | needs a live private table. |
| 13 | restricted-player incident | DOC-ONLY | [runbooks/rls-incident.md](./runbooks/rls-incident.md) | `poker_admin_restrict_player` on real user. |
| 14 | rollback decision + command review | **REVIEWED** (execution DOC-ONLY) | [deployment-rollback.md](./deployment-rollback.md) | commands reviewed for safety; execution needs a real bad deploy. |
| 15 | backup / restore | **BLOCKED** | [backup-and-restore.md](./backup-and-restore.md) | no isolated disposable DB target available; RPO/RTO remain **unverified**. |
| 16 | post-incident reporting | DOC-ONLY (builders **TESTED**) | `opsReport.test.ts` | report shaping + health classification verified; live-data assembly needs DB. |

**Follow-up before public launch:** execute drills 4–16 against a staging/preview DB, and run the
backup/restore drill against a disposable Supabase project to obtain measured RPO/RTO.

## Related

- [incident-response.md](./incident-response.md) · [runbooks/](./runbooks/README.md) ·
  [backup-and-restore.md](./backup-and-restore.md) · [deployment-rollback.md](./deployment-rollback.md)
