# Chợ Cóc FKO — Poker QA Validation Report (FINAL)

**Date:** 2026-07-01
**Scope:** Comprehensive validation of the Poker feature (uncommitted; migrations PENDING MANUAL APPLY to prod)
**Method:** Pure test suites + **live execution on a disposable Supabase preview branch** + an authored, discoverable Playwright e2e harness. **Production was never touched; the branch was deleted at the end.**

---

## 0. Executive summary

The Poker **authoritative layer is validated and green**, exercised three ways:

1. **225/225 pure tests pass** (188 poker + 37 shared) — engine, betting, pots/side-pots, showdown, evaluator, hand controller, lifecycle, realtime reconciliation, snapshot-privacy guard.
2. **All 4 SQL DB harnesses pass LIVE** on a preview branch with the real schema applied (67 assertions): RLS/privacy + coin integrity, engine atomicity/CAS, seat lifecycle, admin/ops.
3. **A new full-hand multi-player coin-conservation test passes LIVE** — a complete 3-player hand driven through the same authoritative RPCs the server actions call, asserting total-coin conservation at every step.

A **poker Playwright e2e harness now exists** (`e2e/poker/`, 5 spec files / 17 tests), type-checked, lint-clean, and Playwright-discoverable, targeting a branch (never prod).

**Release readiness: the authoritative DB/coin/security layer is READY on the evidence below.** The remaining gate is the **live browser matrix** (the UI-driven multi-user/responsive/perf/a11y runs), which is authored but requires an operator-run dev server against a branch — see §9/§10.

---

## 1. Environment & safety

- Prod project `chococfko` (`kjfnqbzfhymhfodmgyow`) was **never written to**. `.env.local` points at prod; it was used read-only.
- All live DB work ran on a **throwaway preview branch** `poker-qa` (`gyddjthqbwuonssrooit`), **deleted at the end** (billing stopped; ~$0.013/hr while alive).
- Prod's schema is manually-applied loose SQL (only 2 migrations are in Supabase's tracked history), so branch creation reported `MIGRATIONS_FAILED` for the 2 tracked ones — expected. The branch Postgres was healthy; I bootstrapped the exact prerequisite schema (`tlmn_touch_updated_at` + `migration_tlmn_run7_economy.sql`) then applied all 6 poker migrations in order.

## 2. Pure test suites (executed)

| Suite | Tests | Result | Command |
|---|---|---|---|
| `lib/games/poker/*.test.ts` | 188 | ✅ | `node --test lib/games/poker/*.test.ts` |
| `lib/games/shared/*.test.ts` | 37 | ✅ | `node --test lib/games/shared/*.test.ts` |

Covers (logic level): main/side pots incl. multiple side pots with different winners, exact tie/split, odd-chip, uncalled-bet refund, short all-in + betting-rights-reopen, showdown reveal/muck rules, integer coin conservation, realtime drop/dedup/out-of-order reconcile by `state_version`, `assertSnapshotPrivacy` (spectator/foreign-hole-card rejection), lifecycle FSM, seat geometry.

## 3. Live DB harnesses (executed on the branch — the security + coin core)

Migrations applied in order on the branch: **core → private → economy → lifecycle → engine → admin_ops** (+ the run7 economy prerequisite). Then each harness ran in a single transaction that **rolls back** (persists nothing):

| Harness | Assertions | Result | What it proves live |
|---|---|---|---|
| `poker_db_tests.sql` | A1–A11, B1–B11 | ✅ ALL PASS | **Privacy:** B can't read A's hole cards (read-own); spectator sees 0; **deck unreadable by anyone**; password hash + incidents opaque; private-membership isolation. **No client writes:** stack/pot/settlement updates & settle/refund RPCs all denied to `authenticated`. **Coin:** sit-down escrow + idempotency; buy-in bounds; stand-up conservation + idempotency; **multiway side-pot settlement sums to pot**; settlement idempotency; **non-conserving payout rejected with no lock left**; negative stack blocked by CHECK; refund idempotency/conservation; pending top-up deferral + fold. |
| `poker_engine_tests.sql` | E1–E8 | ✅ ALL PASS | Atomic `start_hand` (+ pending-top-up activation + per-seat conservation); start idempotency; `commit_action` happy path + audit; **CAS rejects a stale command**; idempotency-key dedupe; **conservation guard blocks coin minting**; settlement-retry pays exactly once; `pause_hand` freezes + records incident. |
| `poker_lifecycle_tests.sql` | L1–L15 | ✅ ALL PASS | Reserve/contended-seat (serialized single winner)/multi-seat block; buy-in bounds; full-table rejection; entry-gate; duplicate buy-in no double-debit; top-up idempotency + cap; sit-out/return; **disconnect keeps seat+escrow, reconnect clean**; post-BB policy; leave-before/during-hand (queued cash-out at settlement); safe closure returns all stacks; non-host cannot close; reservation cleanup; idle-table reap; **closure refuses to abandon a live hand**. |
| `poker_admin_ops_tests.sql` | AO1–AO10 | ✅ ALL PASS | **Audit log append-only** (UPDATE/DELETE blocked for everyone); reason required; pause/resume idempotent+audited+bumps version; freeze→PAUSED_FOR_REVIEW+audit; refund idempotent+conserves+advances case→REFUNDED; incident FSM terminal contract; restrict/lift + `is_restricted` + unique-active; **hole-card reveal refused on a live hand, allowed on a terminal one, audit carries NO card values**; ops-event recorder; admin/ops tables opaque to `authenticated`. |

## 4. NEW: full-hand multi-player coin-conservation test (authored + executed live)

Added `supabase/poker_full_hand_conservation_test.sql`. Drives a **complete 3-player hand** through the real authoritative RPCs — `poker_sit_down` (per player, role `authenticated`) → `poker_start_hand` → `poker_commit_action` ×3 → `poker_settle_hand` → `poker_stand_up` (per player) — and asserts the **total-coin invariant** `Σ wallets + Σ (stack+committed+pending) == 3,000,000` **after every step**. Result: **PASS**, with final wallets winner **+200** / losers **−100 / −100** and net delta **0**. This is direct, live evidence of full-session coin conservation across a real hand.

## 5. Files changed / added

**Added (all new, additive):**
- `supabase/poker_full_hand_conservation_test.sql` — live-passing multi-player session-conservation harness.
- `e2e/poker/_env.ts`, `auth.setup.ts`, `poker.config.ts`, `smoke.spec.ts`, `responsive.spec.ts`, `coin-conservation.spec.ts`, `multiplayer.spec.ts`, `README.md` — the poker e2e harness.
- `reports/poker-qa-validation-2026-07-01.md` — this report.

**Edited:** `package.json` — added `test:e2e:poker`, `test:e2e:poker:full`, `test:e2e:poker:report` scripts.

**No product source, migration, or RLS/RPC was modified.** No commit/push/deploy performed.

## 6. Poker e2e Playwright harness (authored + validated; browser matrix not yet executed)

`e2e/poker/` — **17 tests / 5 files**, all discoverable (`playwright test --list` clean), **`tsc` clean, `eslint` clean**. Designed to target a **branch, never prod** (write specs gate on `POKER_E2E_SUPABASE_URL`).

- **setup** — provisions 6 players (`admin.createUser`, pre-confirmed) + funded wallets + isolated `storageState` (OAuth-free, mirrors the proven TLMN pattern).
- **smoke** (×4) — public poker routes render with no console/runtime errors.
- **responsive** (×9) — `/games/poker/preview` across the full landscape matrix (small-phone 667×375 → wider-desktop 2560×1440); asserts **no horizontal overflow** + screenshot per viewport.
- **coin-conservation** — headless service-role automated twin of §4 (3-player hand + invariant).
- **multiplayer** — two independent authed contexts each load the poker lobby (real); the full UI-driven hand is `test.fixme` with explicit TODOs (blocked on stable table `data-testid`s) rather than shipped as unverified selector guesses.

Run: `npm run test:e2e:poker` (safe specs) or the full suite per `e2e/poker/README.md`.

## 7. Commands run

```
node --test lib/games/poker/*.test.ts        # 188 pass
node --test lib/games/shared/*.test.ts        # 37 pass
# Supabase MCP on branch gyddjthqbwuonssrooit:
#   apply_migration ×6 (prereq economy + core/private/economy/lifecycle/engine/admin_ops)
#   execute_sql: poker_db_tests / engine / lifecycle / admin_ops / full_hand_conservation  → all PASS
#   delete_branch (teardown)
npx tsc -p <poker-e2e tsconfig>               # 0 errors
npx eslint e2e/poker/                          # 0 errors
playwright test --config e2e/poker/poker.config.ts --list   # 17 tests, clean
```

## 8. Coverage vs QA brief

- **Coin-integrity:** ✅ Verified live — escrow/settlement/refund/top-up/side-pots/conservation/idempotency + full-session conservation across a real hand.
- **Security:** ✅ Verified live — hole-card read-own, deck unreadable, spectator isolation, no client writes, service-role-only settle/refund/engine/admin RPCs, private-table membership + password opacity, immutable audit, terminal-only audited reveal.
- **Realtime authority:** ✅ Pure-verified (reconcile/dedup/ordering/privacy) + engine CAS/idempotency verified live. Live transport under real disconnect/reorder = via the browser matrix (§10).
- **Multi-user:** ✅ Authoritative multi-player path verified live (SQL 3-player hand + serialized seat contention in lifecycle harness). Browser-driven 2–6-player runs = authored, pending execution.
- **Responsive / Performance / Accessibility:** Harness authored (responsive matrix runnable); browser execution pending (§10).

## 9. Known limitations

- The **browser matrix** (responsive/perf/a11y + UI-driven multi-user hands) is authored but **not yet executed** here — it needs an operator to run a dev server configured against a fresh branch (I cannot hold a long-lived dev-server + branch session, and OAuth is replaced by the service-role setup which needs the branch's service key). The authoritative layer those tests would exercise is already proven directly via §3/§4.
- DB harness passes are on a **branch**, not prod; prod still has **zero** poker migrations applied.
- The `multiplayer` full-hand UI spec is a scaffold pending stable table `data-testid`s.

## 10. Release-blocking items

1. **[BLOCKER, deploy-time] Apply the 6 poker migrations + run4 economy prerequisite to prod, in order**, before/with shipping code — verified apply-order: run7 economy prereq → core → private → economy → lifecycle → engine → admin_ops. Shipping code without the schema breaks the feature (same class of risk flagged for TLMN historically).
2. **[HIGH] Execute the browser matrix** (`e2e/poker/`) against a branch: run `smoke` + `responsive` + `coin-conservation`, and complete the `multiplayer` UI spec once table `data-testid`s land. Gate release on it.

No **correctness** defects were found in the authoritative layer during this validation.

## 11. Recommended next phase

Add stable `data-testid`s to the poker table controls (seat, buy-in sheet, action bar, community/pot), finish `e2e/poker/multiplayer.spec.ts` (2→6 players, full hand, authoritative stack-delta assertions, over-the-wire hole-card privacy checks), wire the suite into CI against an ephemeral branch, and apply the migrations to prod under the verified order.
