# Poker — Pre-Prompt-15 Gate Validation Report

**Date:** 2026-07-01
**Task:** Clear the two remaining gates before Prompt 15 — (1) execute the full Poker browser E2E against an isolated Supabase preview branch; (2) determine + verify the exact production migration dependency order.
**Production DB touched:** NO. **Migrations applied to prod:** NONE. **Committed / pushed / deployed:** NONE.

---

## GATE DECISION: **BLOCKED BEFORE PROMPT 15**

Two independent blockers prevent clearing the gate this session:

- **B1 — Browser E2E (capability gap):** the write specs hard-require a **branch service-role JWT** (`POKER_E2E_SERVICE_ROLE_KEY`), and **no available MCP tool returns a service-role key** for any project or branch. Cannot be satisfied without using the production service-role key, which the rules and the suite's own safety gate forbid.
- **B2 — SQL harness live-run (infrastructure failure):** Supabase **preview-branch provisioning failed** this session. Two branches were created and both hung in `COMING_UP` (18 min, then 9+ min) and never accepted a Postgres connection. Both were deleted. The DB harnesses therefore could not be executed live this session.

Neither is a product-code defect. The migration order (Gate 2) is fully determined + statically verified.

---

## 1. Capability check (performed first, as required)

| Capability | Result |
|---|---|
| List projects / branches | ✅ `list_projects` → project `chococfko` (`kjfnqbzfhymhfodmgyow`), org `wymvoqbqazgebkekabmr` |
| Create / delete preview branch | ✅ tool-capable (`create_branch`/`delete_branch` succeeded) — **but** compute never came up (B2) |
| Apply migrations / execute SQL on a branch | ⚠️ tool-capable (`apply_migration`/`execute_sql`) but **unusable** — branch Postgres never reachable (`execute_sql` returned internal error throughout) |
| Obtain branch **service-role key** for the E2E suite | ❌ **NO** — only `get_publishable_keys` (anon/publishable) exists; no service-role retrieval tool |
| Run the Next.js app against the branch | ❌ moot — no branch DB + no branch service key |

Per the instruction ("If the branch service-role credential cannot be obtained securely, stop before changing code and report the precise missing capability"): **no code was changed for the E2E gate.**

Evidence for B1: `e2e/poker/auth.setup.ts:72` — `if (!SERVICE_ROLE_KEY) throw new Error('POKER_E2E_SERVICE_ROLE_KEY … required to provision test users')`; `e2e/poker/_env.ts:44` reads `POKER_E2E_SERVICE_ROLE_KEY`. `admin.auth.admin.createUser` (setup) and the coin-conservation headless twin both require the service role.

---

## 2. Migration inventory (exact)

15 poker-related SQL files. Full table in `docs/poker/release-migration-order.md`. Summary:

- **Prerequisite (1):** `migration_tlmn_run7_economy.sql` (already in prod) — needs fn `tlmn_touch_updated_at()` (from `migration_tlmn.sql`, already in prod).
- **Production migrations (7):** `migration_poker_core`, `_private`, `_economy`, `_lifecycle`, `_engine`, `_admin_ops`, `_social`.
- **Rollback-only (2, NEVER apply):** `migration_poker_rollback.sql`, `migration_poker_admin_ops_rollback.sql`.
- **Test harnesses (5):** `poker_db_tests`, `poker_lifecycle_tests`, `poker_engine_tests`, `poker_admin_ops_tests`, `poker_full_hand_conservation_test`.
- **Obsolete/superseded:** none. **Newer poker migration since prior reports:** none — the Prompt-14 flag work added no SQL.

This resolves the "inconsistent counts": the accurate figure is **7 poker production migrations** (prior reports often said 6, omitting `_social`) **+ 1 prerequisite**.

## 3. Verified dependency order

```
0. migration_tlmn_run7_economy.sql   (PREREQUISITE; already in prod)
1. migration_poker_core.sql
2. migration_poker_private.sql
3. migration_poker_economy.sql
4. migration_poker_lifecycle.sql
5. migration_poker_engine.sql
6. migration_poker_admin_ops.sql
7. migration_poker_social.sql
```

**Verification basis (source evidence, not prior reports):**
- `migration_poker_economy.sql:27-28` `ALTER TABLE public.coin_ledger … reason_check` + reads `game_wallets` → run7 economy MUST precede (creates those, `migration_tlmn_run7_economy.sql:22/31`).
- `migration_tlmn_run7_economy.sql:56` `EXECUTE FUNCTION public.tlmn_touch_updated_at()` → needs `migration_tlmn.sql:45`.
- economy/lifecycle reference `poker_seats`/`poker_hands` → need core (+ private) first.
- engine header "AFTER core→private→economy→lifecycle"; admin_ops header "AFTER …→engine"; social references only `poker_tables` + `auth.users` (safe last).

## 4. Prerequisites required before poker migrations

`tlmn_touch_updated_at()` function + `migration_tlmn_run7_economy.sql` (`game_wallets`, `coin_ledger`, `round_settlements`, wallet RPCs). Both already present in production from the TLMN release; on a fresh branch they must be bootstrapped first.

## 5. Test-only / rollback-only files

- Test-only: `poker_db_tests.sql`, `poker_lifecycle_tests.sql`, `poker_engine_tests.sql`, `poker_admin_ops_tests.sql`, `poker_full_hand_conservation_test.sql`.
- Rollback-only (must NOT be applied as migrations): `migration_poker_rollback.sql`, `migration_poker_admin_ops_rollback.sql`.

## 6. Preview branch(es) used + deletion confirmation

| Branch | project_ref | Outcome |
|---|---|---|
| `poker-final-gate` | `xchoiszvkmzmeibwbnzz` | Stuck `COMING_UP` ~18 min; never reachable; **DELETED** |
| `poker-gate-2` | `ngheifihlxvkmoouadoi` | Stuck `COMING_UP` ~9 min; never reachable; **DELETED** |

Post-cleanup `list_branches` shows **only** the default `main` (the production project). No orphan preview resources remain.

## 7. SQL harness pass/fail counts

**Not executed this session** (B2 — branch DB never reachable). 0 run. For reference, the same five harnesses (67+ assertions) passed live on a healthy branch in the prior QA phase (`reports/poker-qa-validation-2026-07-01.md`); that is prior evidence, **not** a claim of execution now.

## 8. Playwright totals + per-project + multiplayer scenarios

**Not executed** (B1 + B2). 0 run / 0 passed / 0 failed / 0 skipped. No project executed; no multiplayer scenario executed. Per the rules, `--list`/compile/discovery do not count as execution, so none is reported as run.

## 9. Privacy / RLS / security findings

No new live findings this session. Static re-confirmation only: `migration_poker_private.sql` — `poker_hole_cards` RLS read-own (`authenticated`), `poker_deck` RLS-enabled with **no policy**, secret tables REVOKE writes from `anon, authenticated`; `app/games/poker/actions.ts` `fetchTableState` is a public-column projection and own cards flow only via `fetchMyHoleCards`; `assertSnapshotPrivacy` runtime guard present. These were live-validated in the prior QA phase.

## 10. Coin-conservation / settlement findings

No new live findings this session. The conservation/idempotency/side-pot invariants are covered by `poker_db_tests.sql` (B-series) + `poker_full_hand_conservation_test.sql`, previously validated live. Integer-only coin handling confirmed statically (bigint throughout economy RPCs; no floats).

## 11. Realtime / refresh / reconnect findings

Not exercised over the wire this session (needs the browser matrix, B1/B2). Pure-layer reconcile/dedup/ordering + watchdog recovery remain covered by unit tests (below).

## 12. Desktop / tablet / mobile-landscape / portrait findings

Not exercised this session (browser matrix blocked). `responsive.spec.ts` (9 viewports) remains authored and unrun.

## 13. Issues fixed + files changed this session

**None.** The capability check identified the E2E blocker before any code change (as instructed), and the branch infra failure was external. No product/test code was modified. New files added are **documentation only**:
- `docs/poker/release-migration-order.md` (the required release document).
- `reports/poker-gate-validation-2026-07-01.md` (this report).

## 14. Local regression gate results (executed)

| Gate | Command | Result |
|---|---|---|
| TypeScript | `npx tsc --noEmit --skipLibCheck` | ✅ 0 errors |
| ESLint (poker/shared/changed) | `npx eslint app/games/poker app/admin/poker lib/games/poker lib/games/shared app/games/page.tsx` | ✅ 0 errors |
| i18n parity | key-count diff across 5 files | ✅ 5192 keys × 5 identical; `games.poker` 487 each; `poker_feature_off` in all 5 |
| Unit tests (poker+shared+flags) | `node --test lib/games/poker/*.test.ts lib/games/shared/*.test.ts` | ✅ 235 passed, 0 failed, 0 skipped |
| Production build | `npm run build` | ✅ exit 0 — "Compiled successfully", 120/120 pages, all poker routes compiled (flag gating intact) |

Full-repository Playwright/E2E suites were **not** run (blocked). The unit + build gates are green.

## 15. Feature-flag safety (confirmed)

All seven default to OFF (server-only, `lib/games/poker/flags.ts`): `poker_enabled`, `poker_create_table_enabled`, `poker_public_lobby_enabled`, `poker_private_table_enabled`, `poker_spectator_enabled` = false; `poker_bot_enabled`, `poker_tournament_enabled` = false and hard-locked in code. `.env.local.example` documents them all as `false`. **No production flag enabled.**

## 16. Remaining blockers (to clear before Prompt 15)

1. **B1** — Provide a secure way to obtain a **branch service-role key** (e.g., operator injects `POKER_E2E_SERVICE_ROLE_KEY` for a branch out-of-band), then run the full Playwright suite (17 tests / 5 projects) against that branch.
2. **B2** — Supabase preview-branch provisioning must succeed (retry when the org/region compute is healthy), then apply migrations 0→7 in the verified order and run all five SQL harnesses + an idempotency re-apply.

Both are environment/infra prerequisites, not code changes.

## 17. Production unchanged — confirmation

- No migration applied to prod; no `merge_branch` ever called. Both preview branches were isolated and are deleted.
- `.env.local` untouched (prod creds read-only, never copied into any file). No preview-credential files created.
- Only the default `main` branch remains in `list_branches`.

## 18. Commit / push / deploy — confirmation

None performed. No git commit, no push, no Vercel deploy. Working tree changes are the pre-existing (Prompt-14) poker + flag work plus two new documentation files added this session.

---

### Final gate decision: **BLOCKED BEFORE PROMPT 15**

Migration order is verified and documented; local regression gates are green; feature flags are safely OFF. The gate is blocked solely by (B1) the unavailable branch service-role credential and (B2) the failed Supabase preview-branch provisioning — both required to actually execute the SQL harnesses and the browser E2E, which the CLEARED criteria mandate be run and pass.
