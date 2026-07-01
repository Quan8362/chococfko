# Poker — Pre-Prompt-15 Gate Validation Report (2nd attempt)

**Date:** 2026-07-01 (session B)
**Task:** Resolve/operationalize the two prior environmental blockers, run the full validation, decide CLEARED vs BLOCKED for Prompt 15.
**Production touched:** NO. **Migrations applied to prod:** NONE. **Committed / pushed / deployed:** NONE.

---

## GATE DECISION: **BLOCKED BEFORE PROMPT 15**

Reason: **Supabase preview-branch provisioning failed again** — two fresh branches (bounded max) both hung in `COMING_UP` and never accepted a Postgres connection, so the SQL harnesses (Phase D) and the browser E2E (Phase E) could not execute. A second, independent blocker remains: the **branch service-role key cannot be obtained securely** by this session (no MCP tool exposes it; none injected by the operator). Exact operator steps to clear both are in §C below. No product-code defect was found; local regression gates are green.

---

## A. Current-state inspection (re-checked, not assumed)

- `git status`: working tree unchanged from prior sessions — the poker feature + Prompt-14 flags (untracked/modified), plus the three prior poker reports and `docs/poker/release-migration-order.md`. No unrelated changes disturbed.
- **Env-var names (from source, not guessed)** — `e2e/poker/_env.ts:42-45`: `POKER_E2E_SUPABASE_URL`, `POKER_E2E_ANON_KEY`, `POKER_E2E_SERVICE_ROLE_KEY`, `POKER_E2E_BASE_URL` (+ optional `POKER_E2E_ALLOW_PROD`, `POKER_E2E_EMAIL_A..F`, `POKER_E2E_PASSWORD_A..F`). Write path hard-requires the service role at `e2e/poker/auth.setup.ts:72`.
- **Playwright + browsers installed** (chromium/firefox/webkit cached) — tooling is ready; the missing piece for E2E is only the branch service-role credential + a reachable branch.

## B. Migration order — re-verified from SQL source

| Step | File | Verified dependency |
|---|---|---|
| 0 (prereq) | `migration_tlmn_run7_economy.sql` | creates `game_wallets`/`coin_ledger`/`round_settlements`; needs fn `tlmn_touch_updated_at()` (`migration_tlmn.sql:45`) |
| 1 | `migration_poker_core.sql` | base tables |
| 2 | `migration_poker_private.sql` | FK → `poker_hands` (core) |
| 3 | `migration_poker_economy.sql` | `ALTER coin_ledger` + reads `game_wallets` → needs prereq; refs `poker_seats/hands` → needs core/private |
| 4 | `migration_poker_lifecycle.sql` | reads `game_wallets`/`coin_ledger`; after economy |
| 5 | `migration_poker_engine.sql` | after lifecycle; reuses economy settle/refund RPCs |
| 6 | `migration_poker_admin_ops.sql` | after engine (acts on live hand + settlement) |
| 7 | `migration_poker_social.sql` | refs only `poker_tables`+`auth.users` → needs core only |

**Discrepancy note vs the Prompt-15 brief:** the brief listed step 6 = `_social`, step 7 = `_admin_ops`; my prior doc listed 6 = `_admin_ops`, 7 = `_social`. **Both are correct** — `_social` and `_admin_ops` are mutually independent (social references no admin object; admin references no social object; social needs only core). Either relative order applies cleanly. Documented in `docs/poker/release-migration-order.md` §2 note. No rollback file is in the apply path. **7 poker production migrations + 1 prerequisite** — unchanged from the verified inventory.

## C. Preview-branch provisioning — FAILED (bounded, 2 attempts)

| Attempt | Branch name | project_ref | branch id | Waited | Final status | Postgres reachable? |
|---|---|---|---|---|---|---|
| 1 | `poker-gate-a` | `shkogjnfqiuiomofesrl` | `b0e167dd-d774-4374-ac01-9fc90a9bc470` | ~9 min | `CREATING_PROJECT` / `COMING_UP` | ❌ `execute_sql` → internal error throughout |
| 2 | `poker-gate-b` | `epcgyvtlthljklyyizhd` | `765d4a60-7c70-493b-a8d4-049afcdf5fc4` | ~9 min | `CREATING_PROJECT` / `COMING_UP` | ❌ same |

Behavior: created once, polled at intervals, waited a bounded max (~9 min each), confirmed both branch status **and** a real `select 1` (which never succeeded), collected status + logs (`branch-action` and `postgres` logs both returned empty), deleted the failed branch, waited, retried **once** with a new name, then stopped. **Both branches deleted.** Never fell back to production. This is the 3rd and 4th consecutive provisioning failure across the two sessions — a persistent platform/region issue (org `wymvoqbqazgebkekabmr`, region `ap-northeast-1`), not a repo problem.

**Platform error surfaced:** none beyond `preview_project_status` never leaving `COMING_UP`; MCP `execute_sql` returns `MCP error -32603: An internal error occurred` while the compute is not up; `get_logs` returns empty (compute never started emitting).

### Credential blocker (Phase C) + EXACT OPERATOR STEPS

Even with a reachable branch, the browser/write E2E needs the **branch service-role JWT**. This session **cannot** obtain it securely:
- MCP exposes only `get_publishable_keys` (anon/publishable) — **no** service-role retrieval tool.
- No local secret manager is available in this session.
- The operator injected **no** `POKER_E2E_*` variables (verified: all unset).

Per the rules I did **not** modify code to bypass the requirement and did **not** use the production key. To resume this validation, an operator must securely inject the branch credentials, then re-run:

```bash
# 1) Create/locate a healthy preview branch (Supabase dashboard → Branches, or MCP create_branch)
#    Wait until it is ACTIVE and a query succeeds.
# 2) Dashboard → the BRANCH project → Project Settings → API:
#      - Project URL            → POKER_E2E_SUPABASE_URL
#      - anon / publishable key → POKER_E2E_ANON_KEY
#      - service_role secret    → POKER_E2E_SERVICE_ROLE_KEY   (NEVER paste into chat/tracked files)
# 3) Export ONLY in the local terminal/process (not .env.local, which points at PROD):
export POKER_E2E_SUPABASE_URL="https://<branch-ref>.supabase.co"
export POKER_E2E_ANON_KEY="<branch anon/publishable key>"
export POKER_E2E_SERVICE_ROLE_KEY="<branch service_role secret>"
# 4) Confirm nothing secret is tracked:
git -C web status --porcelain            # must show no new .env* with secrets
git -C web check-ignore .env.local        # should print the path (ignored)
# 5) Do NOT put the service_role key in any NEXT_PUBLIC_* var. It is read server-side only
#    (e2e/poker/auth.setup.ts via SUPABASE client; _env.ts:44). Browser bundles never see it.
# 6) Resume: apply migrations 0→7 on the branch, run the 5 SQL harnesses, then:
cd web && node ../node_modules/@playwright/test/cli.js test --config e2e/poker/poker.config.ts
#    (root Playwright CLI — see §E dual-version note)
```

Note: `.gitignore` currently ignores `.env*.local` (✅) but **not** `e2e/poker/.auth/` or `e2e/poker/.artifacts/`. Before a real suite run writes session storageState there, add:
```
/e2e/poker/.auth/
/e2e/poker/.artifacts/
```
(This session did not run the suite, so nothing sensitive was written; flagged so a future run does not risk tracking session cookies.)

## D. Migrations applied + SQL harnesses — NOT EXECUTED

No reachable branch → **0 migrations applied**, **0 harnesses run** this session. Production was never a fallback. Harnesses that would run (all present in repo, each a single `BEGIN … ROLLBACK` txn): `poker_db_tests.sql`, `poker_lifecycle_tests.sql`, `poker_engine_tests.sql`, `poker_admin_ops_tests.sql`, `poker_full_hand_conservation_test.sql`. (These passed live on a healthy branch in the prior QA phase — prior evidence, not a claim of execution now.) No dedicated social-only harness exists; social RLS is self-scoped + covered structurally.

## E. Playwright suite — DISCOVERED, NOT EXECUTED

Discovery (not execution) via the **root** Playwright CLI (`node ../node_modules/@playwright/test/cli.js test --config e2e/poker/poker.config.ts --list`, cwd=`web`):

```
Total: 17 tests in 5 files
  setup: 1   smoke: 4   responsive: 9   coin-conservation: 1   multiplayer: 2
```

Matches the expected count exactly. **Executed: 0 / passed 0 / failed 0 / skipped 0** — blocked by no branch (Phases B/C).

**Dual-version note (resolved for discovery):** `npx playwright` resolved from `web/` throws *"did not expect test() to be called here / two different versions of @playwright/test."* The working invocation is the **repo-root** CLI `node ../node_modules/@playwright/test/cli.js …` with cwd=`web` (only one real `@playwright/test@1.61.0`, hoisted to root). The E2E runner must use this form.

## F. Findings (privacy / coin / realtime / responsive)

No **new live** findings this session (no branch to exercise). Static posture re-confirmed (RLS read-own hole cards, no-policy deck, public-projection reads, `assertSnapshotPrivacy`; integer-only coins) — all previously live-validated. Realtime/reconnect/responsive not exercised over the wire (needs Phase E).

## G. Defects found + files changed this session

- **Defects:** none (no product-code defect; the blockers are platform provisioning + credential availability).
- **Files changed:** documentation only — `docs/poker/release-migration-order.md` (added the social/admin_ops independence note) and this report. No product/test/migration code modified.

## H. Regression gates (executed this session)

| Gate | Result |
|---|---|
| TypeScript (`tsc --noEmit --skipLibCheck`) | ✅ PASS |
| Poker E2E tsconfig (`tsc -p tsconfig.poker-e2e.json`) | ✅ PASS |
| ESLint (poker/shared/changed) | ✅ PASS |
| i18n parity | ✅ 5192 keys × 5 identical; `games.poker` 487 each |
| Unit tests (poker+shared+flags) | ✅ 235 passed / 0 failed / 0 skipped |
| Next.js production build (`npm run build`) | ✅ PASS — exit 0, "Compiled successfully", 120/120 pages, all poker routes compiled |
| Full Playwright suite | ⛔ not executed (Phases B/C) |
| SQL harnesses | ⛔ not executed (Phase B) |

## I. Feature-flag safety

All seven default OFF (`lib/games/poker/flags.ts`): `poker_enabled`, `poker_create_table_enabled`, `poker_public_lobby_enabled`, `poker_private_table_enabled`, `poker_spectator_enabled` = false; `poker_bot_enabled`, `poker_tournament_enabled` = false + **hard-locked in code**. `.env.local.example` documents all as `false`. No production flag enabled.

## J. Cleanup + production-unchanged + no-commit confirmation

- Both preview branches **deleted**; `list_branches` shows only the default `main` (the prod project).
- No dev server / Playwright web server was started (Phase E never reached).
- No temporary secret/env files created (the branch service-role key was never obtained; nothing to remove).
- No secret in any git diff / log / report (only anon-safe identifiers like project refs appear).
- Production DB **unchanged** — no migration applied, `merge_branch` never called.
- **No commit, push, or deploy.**

## K. Remaining blockers (to clear before Prompt 15)

1. **[PLATFORM] Supabase preview-branch provisioning** must actually come up (retry when org/region compute is healthy, or use a local Supabase stack / dedicated staging project). 4/4 branch creations have hung in `COMING_UP` across two sessions.
2. **[CREDENTIAL] Branch service-role key** must be injected securely by the operator (steps in §C) — no MCP/secret-manager path exists in-session.

Both are environment prerequisites, not code changes.

---

### FINAL GATE DECISION: **BLOCKED BEFORE PROMPT 15**

Migration order is verified from source and documented; the Playwright inventory is confirmed at 17/5; local regression gates (tsc, e2e-tsc, eslint, i18n, 235 unit tests, build) are green; feature flags are safely OFF; production is untouched and nothing was committed. The gate is blocked solely by (1) repeated Supabase branch-provisioning failure and (2) the unavailable branch service-role credential — both required to actually execute the SQL harnesses and browser E2E that the CLEARED criteria mandate.
