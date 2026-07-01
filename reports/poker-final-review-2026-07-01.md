# Chợ Cóc FKO — Poker FINAL SENIOR REVIEW & Release Gate

**Date:** 2026-07-01
**Reviewer role:** Final senior reviewer for the realtime Poker (NLHE play-money "xu") release.
**Inputs:** All prior phase deliverables + the automated QA report (`reports/poker-qa-validation-2026-07-01.md`).
**Scope of this pass:** Verify remaining risks, fix only verified gaps, and prepare the release **feature-flag + rollout + rollback** machinery. No bots / tournaments / rake / ante / straddle / real-money / redesigns added.

> **Decision (bottom line): READY FOR LIMITED BETA** — conditional on the two operator gates in §12 (apply the 6 migrations in order, then run the browser matrix against a branch). The authoritative DB/coin/security core is validated; the feature now ships **dark behind flags** so it cannot leak to the public before those gates are cleared.

---

## 1. Final implemented scope

Play-money **No-Limit Texas Hold'em cash tables**, 2–6 seats, server-authoritative end to end:

- **Engine (pure):** deck/CSPRNG deal, betting rounds, min-raise/all-in/reopen rights, main + multiple side pots, odd-chip, uncalled-bet refund, showdown reveal/muck, 7-card evaluator. 188 pure tests.
- **Shared infra (pure):** integer coins, deadlines, idempotency envelopes, sequence/state-version reconcile, transport. 37 pure tests.
- **Persistence & security:** `poker_*` tables with RLS read-own hole cards, no-policy deck, opaque settlements/incidents; `SECURITY DEFINER` RPCs for escrow/settle/refund and the atomic CAS engine (`poker_start_hand` / `poker_commit_action` / `poker_settle_hand` / `poker_refund_hand`); direct client writes REVOKEd.
- **Lifecycle:** seat FSM, buy-in bounds, sit-out/return, post-BB, top-up idempotency, disconnect-keeps-seat, safe closure/reap.
- **Realtime:** recipient-aware snapshots, `assertSnapshotPrivacy`, drop/dedup/out-of-order reconcile by `state_version`, watchdog + visibility/online recovery, `TOKEN_REFRESHED` re-auth.
- **UI:** live table (2–6p × desktop/tablet/mobile landscape + portrait fallback), dark lounge theme, action bar from the **server** legal model, winners from **authoritative stack deltas**.
- **Ecosystem:** landing / lobby / quick-play / create / join / history+replay / profile / rules / glossary / settings / report+block.
- **Admin/ops:** immutable audit, incident FSM, restrictions, ops-events observability, terminal-only audited hole-card reveal.
- **NEW this pass:** the 7-flag rollout system + gated entry points (§9).

**Out of scope (confirmed absent / hard-off):** bots, tournaments, rake, ante, straddle, real money.

---

## 2. Test summary

| Suite | Count | Result | Command |
|---|---|---|---|
| Poker pure | 188 | ✅ | `node --test lib/games/poker/*.test.ts` |
| Shared pure | 37 | ✅ | `node --test lib/games/shared/*.test.ts` |
| **Feature-flag pure (new)** | **10** | ✅ | `node --test lib/games/poker/flags.test.ts` |
| **Combined re-run** | **235** | ✅ 0 fail | `node --test lib/games/poker/*.test.ts lib/games/shared/*.test.ts` |
| DB harness — RLS/privacy + coin | A1–A11, B1–B11 | ✅ (branch, prior) | `poker_db_tests.sql` |
| DB harness — engine CAS/idempotency | E1–E8 | ✅ (branch, prior) | `poker_engine_tests.sql` |
| DB harness — lifecycle | L1–L15 | ✅ (branch, prior) | `poker_lifecycle_tests.sql` |
| DB harness — admin/ops | AO1–AO10 | ✅ (branch, prior) | `poker_admin_ops_tests.sql` |
| Full-hand 3-player conservation | 1 | ✅ (branch, prior) | `poker_full_hand_conservation_test.sql` |
| Browser matrix (Playwright) | 17 authored | ⏳ authored, **not executed** | `npm run test:e2e:poker` |
| Type-check | — | ✅ 0 errors | `npx tsc --noEmit --skipLibCheck` |
| Type-check (e2e) | — | ✅ 0 errors | `npx tsc -p tsconfig.poker-e2e.json --noEmit` |
| Lint (changed files) | — | ✅ 0 errors | `npx eslint <changed>` |

The DB/live-branch results are carried from the QA phase (branch created, validated, deleted — prod never touched). This pass re-ran the pure suites + the new flag suite and the type/lint gates locally; all green.

---

## 3. Security summary

- **Server authority:** the browser sends intent only; identity resolved from the session cookie (`auth.uid()`). Cards, order, legality, pots, stacks, settlement are all server/RPC-decided. Verified in `actions.ts` (engine via CAS RPCs) — no client mutation path exists (direct writes REVOKEd).
- **Private cards:** `poker_hole_cards` = RLS `SELECT … USING (user_id = auth.uid())`, `authenticated` only; `poker_deck` = RLS-on with **zero policies** (unreadable by anyone but service role); settlements/incidents opaque. `fetchTableState` selects a public column set only; own cards flow **only** through `fetchMyHoleCards`. `assertSnapshotPrivacy` is a runtime defense-in-depth check that a snapshot never carries a foreign/deck card. ✅
- **RLS correctness:** read-own + no-policy + REVOKE INSERT/UPDATE/DELETE from `anon, authenticated` on secret tables; verified live in the DB harness (B can't read A's cards; spectator sees 0; deck unreadable). ✅
- **Admin actions audited:** append-only `poker_admin_audit` (UPDATE/DELETE blocked for everyone), reason required, reveal terminal-only and carries no card values. ✅
- **Auth/RLS bypass:** service-role key is confined to server actions (`createAdminClient` in `'use server'` files); no `NEXT_PUBLIC` service key. Feature flags are also **server-resolved** (a hand-crafted POST to `createTable`/`quickPlay` hits `checkPokerCapability` server-side).

---

## 4. Coin-integrity summary

- Integer-only coins throughout (`lib/games/shared/coins`, engine, RPCs). No floats in the coin path.
- Escrow on sit-down, conserved settlement (payouts+refunds sum to the pot), refund on abort — each **idempotent** and **conservation-guarded** (a non-conserving payout is rejected with no lock consumed). Verified live (B-series) + the **full 3-player hand** invariant `Σ wallets + Σ (stack+committed+pending) == constant` after every step. ✅
- Duplicate commands are safe: CAS on `state_version` + idempotency keys dedupe start/commit/settle/refund/top-up. ✅

---

## 5. Realtime summary

- Recipient-aware snapshots; reconcile drops stale/duplicate/out-of-order by `state_version`; watchdog + visibility/online + `TOKEN_REFRESHED` recovery. Pure-verified (reconcile/dedup/order/privacy) + engine CAS/idempotency live-verified.
- **Gap (unchanged):** live transport under *real* disconnect/reorder across browsers is exercised only by the authored-but-unrun browser matrix. The authoritative layer it would stress is already proven directly. Treated as a **beta monitoring item**, not a blocker for *limited* beta.

---

## 6. UI & responsive summary

- Pure `seatLayout` (2–6p × desktop/tablet/mobile, viewer→bottom) with 15 tests; landscape matrix + portrait fallback authored in `responsive.spec.ts` (9 viewports, no-horizontal-overflow assertion + screenshots).
- Action bar derives strictly from the server legal model with a double-submit guard; winner rendering uses authoritative stack deltas, not client guesses.
- **Execution gap:** the browser matrix has not been run here (needs an operator dev-server + branch). This is release-gate item §12.2.

---

## 7. Accessibility summary

- Semantic buttons/links, `aria-hidden` on decorative art, focus-visible affordances inherited from the design system. No dedicated automated a11y run yet (authored under the browser matrix). **Known limitation** — acceptable for limited beta; schedule an axe pass before public beta.

---

## 8. Performance summary

- Reads are RLS-guarded projections; realtime is postgres_changes + a lightweight watchdog (no polling storms). Idempotency/CAS prevent retry amplification. No load test executed — **known limitation**; add a small concurrent-table soak before public beta.

---

## 9. Feature flags (prepared this pass)

Seven server-only flags, **all default OFF**. A fresh production deploy therefore shows poker to **nobody but admins** — the admin-only visibility stage — with no extra config. Admins bypass the public gates so they can validate on prod; `bot`/`tournament` are **hard-off in code** even if the env sets them true.

| Env var | Flag | Default | Gate |
|---|---|---|---|
| `POKER_ENABLED` | master | **false** | route layout + games-hub card |
| `POKER_CREATE_TABLE_ENABLED` | createTable | **false** | `/create` page + `createTable` action + landing CTA |
| `POKER_PUBLIC_LOBBY_ENABLED` | publicLobby | **false** | `/lobby` page + `quickPlay` action + landing CTAs |
| `POKER_PRIVATE_TABLE_ENABLED` | privateTable | **false** | `createTable` (private path) |
| `POKER_SPECTATOR_ENABLED` | spectator | **false** | capability layer (see limitation §11) |
| `POKER_BOT_ENABLED` | bot | **false (locked)** | never on — out of scope |
| `POKER_TOURNAMENT_ENABLED` | tournament | **false (locked)** | never on — out of scope |

**Resolution:** `lib/games/poker/flags.ts` (pure, 10 tests) → `resolvePokerFlags(env)` + `pokerCan(flags, viewer, capability)`. Server wrapper: `app/games/poker/access.ts` → `getPokerAccess()` / `checkPokerCapability()`. Enforcement is **server-side** at the route layout and inside the mutating server actions, so a disabled feature can't be reached by a direct request. Public access is **NOT** enabled automatically.

---

## 10. Rollout plan

1. **Local validation** — pure suites (235 ✅) + type/lint (✅). All flags off by default.
2. **Staging** — apply migrations to a staging/branch DB (order in §14); run the browser matrix (`e2e/poker/`, which sets the flags on for its app-under-test). Gate on green.
3. **Admin-only production visibility** — deploy code with **all flags off**; apply migrations to prod (§14). Only `ADMIN_EMAILS` users can reach poker (layout/actions admin-bypass). Admins smoke a real hand on prod.
4. **Limited tester beta** — set `POKER_ENABLED=1`, `POKER_PUBLIC_LOBBY_ENABLED=1`, `POKER_CREATE_TABLE_ENABLED=1` (add `PRIVATE_TABLE`/`SPECTATOR` if desired). Announce to a small tester allowlist; watch the ops-events dashboard (§13).
5. **Public beta** — after a clean limited-beta window (no rollback triggers), keep the flags on for everyone; complete the a11y + perf passes.
6. **General availability** — remove the "beta" framing once monitored stable; flags remain as kill-switches.

---

## 11. Known limitations

- **Browser matrix not executed here** — responsive/perf/a11y + UI-driven multi-user hands are authored (`e2e/poker/`, 17 tests) but need an operator dev-server against a branch. The `multiplayer` full-hand spec still needs stable table `data-testid`s to leave scaffold state.
- **Global spectator kill-switch not wired into the live `[tableId]` page for non-seated viewers.** `quickPlay`/lobby honor the `spectator`/`public_lobby` capabilities, and each table already has a per-table `allow_spectators` setting, but a *visible* user opening a table URL they aren't seated at is governed by `allow_spectators`, not by the global `POKER_SPECTATOR_ENABLED`. Deliberately not wired to avoid risking seated-player lockout; **follow-up before public beta.**
- **Prod has zero poker migrations applied** — the whole feature is inert until §14 runs.
- **No load/a11y automation run yet** (see §7/§8).
- **`next build` can crash in the Windows ESLint worker** (environment issue, not code — noted historically for TLMN); CI/Vercel Linux build is the source of truth.

---

## 12. Release-blocking gates (must clear before flags flip public)

1. **[BLOCKER — deploy-time] Apply the 6 poker migrations + the run7 economy prerequisite to prod, in order** (§14). Shipping code without the schema breaks the feature.
2. **[HIGH] Execute the browser matrix** against a branch: `smoke` + `responsive` + `coin-conservation`, and finish `multiplayer` once table `data-testid`s land. Gate limited beta on it being green.

No correctness defects were found in the authoritative layer during this review.

---

## 13. Monitoring plan

- **Surface:** `/admin/poker/observability` — 7-day counts by ops-event kind + severity (info/warn/error/critical), backed by `poker_ops_events`.
- **Signals that matter (already recorded):** `coin_conservation_failure`, `settlement_failure`, `rls_denial`, `duplicate_action`, `stale_state`, `sequence_gap`, `reconnect_failure`, `realtime_subscription_error`, `frozen_hand`, `long_running_hand`, `abandoned_table`.
- **During beta:** watch daily; any `critical`/`error` on the coin/privacy/RLS kinds → invoke §15 immediately. Pair with the incident FSM (`/admin/poker/incidents`) for triage.

---

## 14. Migration list (apply to prod IN THIS ORDER — none applied yet)

1. `migration_tlmn_run7_economy.sql` — **prerequisite** (wallets/ledger; already needed by TLMN economy).
2. `migration_poker_core.sql`
3. `migration_poker_private.sql`
4. `migration_poker_economy.sql`
5. `migration_poker_lifecycle.sql`
6. `migration_poker_engine.sql`
7. `migration_poker_admin_ops.sql`
8. `migration_poker_social.sql` — degrade-safe; social/ecosystem extras.

Rollbacks available: `migration_poker_rollback.sql`, `migration_poker_admin_ops_rollback.sql`. All additive (`CREATE TABLE IF NOT EXISTS`, new RPCs) — **no destructive change to existing tables**; TLMN and other features untouched.

---

## 15. Rollback plan & triggers

**Fastest lever (no redeploy): set `POKER_ENABLED=false` in Vercel env → poker vanishes for everyone (admins included).** Per-capability flags (`POKER_PUBLIC_LOBBY_ENABLED=false`, `POKER_CREATE_TABLE_ENABLED=false`) narrow the blast radius without a full kill.

Invoke immediately on any of:

| Trigger | Immediate action |
|---|---|
| **Coin-conservation failure** (`coin_conservation_failure` / settlement mismatch) | `POKER_ENABLED=false`; freeze affected hands (admin freeze); investigate before re-enable. |
| **Private-card exposure** (any hole/deck card off-owner) | `POKER_ENABLED=false` immediately; treat as security incident. |
| **Repeated realtime desync** (`sequence_gap`/`reconnect_failure` spikes) | `POKER_PUBLIC_LOBBY_ENABLED=false` + `POKER_CREATE_TABLE_ENABLED=false` to stop new tables; investigate. |
| **Duplicate settlement** | `POKER_ENABLED=false`; audit `poker_hand_settlements` idempotency lock. |
| **Authentication bypass** | `POKER_ENABLED=false`; rotate keys if service-role suspected. |
| **RLS bypass** (`rls_denial` anomalies / off-owner reads) | `POKER_ENABLED=false`; review policies before re-enable. |
| **Critical mobile control failure** | `POKER_PUBLIC_LOBBY_ENABLED=false` (stop new joins); hotfix UI; keep admins on to validate the fix. |

DB rollback (last resort, coin/schema corruption only): run `migration_poker_rollback.sql` + `migration_poker_admin_ops_rollback.sql` after flags are off and no live hands remain.

---

## 16. Feature-flag state at ship

All seven flags OFF (dark). `POKER_BOT_ENABLED` and `POKER_TOURNAMENT_ENABLED` OFF and **locked in code**. Public access **not** enabled.

---

## 17. Files changed / added this pass

**Added:**
- `lib/games/poker/flags.ts` — pure flag resolver + capability layer.
- `lib/games/poker/flags.test.ts` — 10 tests (defaults, hard-off, capability/admin-override).
- `app/games/poker/access.ts` — server wrapper (`getPokerAccess`, `checkPokerCapability`, `pokerAccessCan`).
- `app/games/poker/layout.tsx` — master route gate (404 when not visible).
- `reports/poker-final-review-2026-07-01.md` — this report.

**Edited (feature-flag gating only):**
- `app/games/page.tsx` — hub card behind `pokerVisible`.
- `app/games/poker/page.tsx` — capability-aware landing CTAs.
- `app/games/poker/create/page.tsx` — `create` capability gate.
- `app/games/poker/lobby/page.tsx` — `public_lobby` capability gate.
- `app/games/poker/actions.ts` — `createTable` gated (create + private).
- `app/games/poker/ecosystem.ts` — `quickPlay` gated (public_lobby).
- `e2e/poker/poker.config.ts` — dev-server env turns flags on for the app-under-test.
- `messages/{vi,en,ja,ko,zh}.json` — `games.poker.error.poker_feature_off` (5 langs).
- `.env.local.example` — documented the 7 flags (default false).

**No migration, RLS, RPC, engine, or coin-path logic was changed this pass.** No commit / push / deploy performed.

---

## 18. FINAL DECISION

### ✅ READY FOR LIMITED BETA

…gated on the two operator actions in §12 (apply migrations in order; run the browser matrix green). Until those clear, the feature is correctly **READY FOR ADMIN TEST** on production — it ships dark, visible only to admins, with a one-env-var kill switch. Bots, tournaments, rake, ante, straddle, and real money remain out of scope and off.
