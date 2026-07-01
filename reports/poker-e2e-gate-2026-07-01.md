# Chợ Cóc FKO — Poker E2E Gate Report

**Date:** 2026-07-01
**Scope:** Full Poker Playwright E2E + complete regression against the **reused isolated local Supabase stack** (WSL2 + Docker Engine). **Production never touched; nothing committed/pushed/deployed.**

---

## 0. Decision

**FINAL GATE DECISION: CLEARED FOR PROMPT 15** — every required check is green after fixing 3 real bugs the E2E surfaced (all fixes uncommitted in the working tree).

## 1. Environment (reused, non-production)

- Reused the local Supabase stack from the prior prompt (`~/poker-local`, db `127.0.0.1:54322`, API `127.0.0.1:54321`). **No recreate / reset / cloud** — schema (18 poker tables) confirmed present, `authenticated` retains SELECT on the 5 read-own tables.
- **All effective Supabase URLs = localhost** before the app started: `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, `POKER_E2E_SUPABASE_URL=http://127.0.0.1:54321`; asserted no `supabase.co`/prod URL in the app env. The prod `.env.local` was never modified.
- Service-role key handled securely: only ever in an **untracked** local `.env.local` + a temp key file (both deleted afterward), never in browser code, tracked files, logs, or chat (only key *lengths* were printed).
- The app + Playwright ran **inside WSL** (the Windows↔WSL2 localhost relay was flaky — 0/10 from Windows; native WSL localhost is stable). Missing `game_wallets`/`coin_ledger` RPCs (`ensure_wallet`, `settle_round`) were applied to the local DB for the write specs.

## 2. Poker Playwright suite — 17/17 PASS (against a production build)

| Project | Tests | Result |
|---|---|---|
| setup (provision 6 players) | 1 | ✅ |
| smoke (public routes render, no console errors) | 4 | ✅ |
| responsive (landscape matrix, no h-overflow) | 9 | ✅ |
| coin-conservation (headless 3-player full hand) | 1 | ✅ |
| multiplayer (2 independent authed contexts) | 2 | ✅ |

Validated end-to-end: two independent authenticated players, buy-in, a full dealt hand, realtime sync, mid-session refresh re-sync, duplicate-action (double-fold) protection, hole-card privacy (exactly the viewer's own 2 cards face-up), authoritative settlement stack deltas (SB 9950 / BB 10050, conserved = 2×buy-in), full-hand coin conservation, and the responsive layout matrix. Ran against `next start` (prod build) for deterministic results — the dev server has transient Next chunk-404 flakiness (different pages fail each run; not an app defect).

## 3. Verified failures fixed (no weakened assertions, no mock gameplay)

1. **Table covered by the site header** — `PokerTable.tsx` root `fixed inset-0 z-[60]` sat *under* the global `Nav` (`sticky z-[100]`); the header intercepted the top seat's "sit here" click. → `z-[110]`.
2. **Every hand emptied the table** — `settleHand()` calls `poker_resolve_closing` after each hand, but that RPC cashed out & vacated **all** seats with no `status='closing'` guard. → new `migration_poker_resolve_closing_fix.sql` (no-op unless the table is actually closing). Proven with a per-second DB seat-watch (seats went NULL post-settle before the fix; retained with correct deltas after). Harness `poker_lifecycle_tests.sql` L15 precondition corrected (open→closing) to match the fixed contract.
3. **rules/glossary 404 in production** — both pages were `dynamic='force-static'` under the auth-gating poker layout, so the flags-OFF build baked a `notFound()`→404 permanently (breaks admin visibility + the flag-flip rollout). → `force-dynamic` (consistent with every other poker route). Only reproducible on a prod build.

## 4. Full regression — ALL GREEN

| Check | Result |
|---|---|
| TypeScript (`tsc --noEmit`) | ✅ |
| E2E TypeScript (`tsconfig.poker-e2e.json`) | ✅ |
| ESLint (`next lint`) | ✅ (warnings only) |
| i18n parity (5 languages) | ✅ 5048 keys × 5 |
| Unit tests (`node --test lib`) | ✅ (TLMN AI 400ms micro-benchmark is load-sensitive: 86ms idle) |
| SQL harnesses (5, clean DB) | ✅ 127 assertions |
| Playwright (prod build) | ✅ 17/17 |
| Next.js build (`next build`) | ✅ (Linux/WSL, mirrors Vercel) |

## 5. Cleanup

Deleted: the temp WSL app copy, the extracted key file, the local `.env.local`, helper scripts, Playwright browser cache, and the ephemeral E2E test users/wallets in the local DB. The reusable local Supabase stack was left running (stop with `supabase stop` if desired). No production contact; no commit/push/deploy (HEAD unchanged at `65a75d1`).
