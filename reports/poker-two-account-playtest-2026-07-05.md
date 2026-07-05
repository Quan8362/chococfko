# Chợ Cóc FKO — Poker Two-Account Local Playtest Report (Prompt 27F-B3)

**Date:** 2026-07-05
**Scope:** Deterministic **two isolated browser context** Playwright regression of the ISOLATED practice-bot mode, driven through the **real local login UI** for two different accounts against the **local stack only** (`app 127.0.0.1:3000`, Supabase `127.0.0.1:64321`). Replaces the abandoned Claude-for-Chrome two-browser test that was **BLOCKED — TWO ISOLATED BROWSER SESSIONS UNAVAILABLE** (27F-B2). **Production never touched; `game_wallets`/`coin_ledger`/migrations never touched; nothing committed/pushed/deployed.**

**Commit under test:** `c0df5ebf52cba48266b49888b28062020e60161d`

---

## 0. Final Decision

**TWO-ACCOUNT TECHNICAL PLAYTEST PASSED** — all 6 suite tests green, 30 real hands completed across two concurrent isolated sessions, zero safety/economy/authorization/private-card/settlement defects. No product behavior changed.

---

## 1. Environment and build

- **App:** `http://127.0.0.1:3000` — `/api/health` = **200**; `LOCAL TEST — NOT PRODUCTION` banner present (`NEXT_PUBLIC_APP_ENV=local`).
- **Supabase (local):** `http://127.0.0.1:64321` — Auth / Realtime / REST healthy.
- Practice route fails closed anonymously (**404**); practice table denies anon REST (**401**); tournament tables absent (**404**, `POKER_TOURNAMENT_ENABLED=0`).
- Public poker, cash bots, tournaments, and push all OFF; practice is the only enabled poker capability.
- **Production build:** `npm run build` → **exit 0**.
- All traffic loopback-only; every non-loopback host is aborted + recorded by a per-context network guard (fonts allowlisted).

Pre-check note: the standing `local-ready-check.mjs` flags `game_wallets`/`coin_ledger` at count=1 — pre-existing **local** residue from earlier local runs (not production data); practice never reads/writes those tables, so it is not part of this precondition gate and does not block.

## 2. Browser contexts created

Two fully-isolated Playwright contexts via `browser.newContext()`:

- **Distinct cookie jars, storage, and Supabase sessions; no shared `storageState`; independent pages.**
- Each authenticated through the **real local login UI** (email/password Server Action).
- Tester password read from `.env.playtest.local` only; never logged, serialized, screenshotted, or committed.

## 3. Accounts verified

| Ctx | Email | userId | Auth proof |
|---|---|---|---|
| A | `tester-a@example.com` | `db90f96e-…8263` | `/profile` authed + owner-scoped `poker_practice_games` row |
| B | `tester-b@example.com` | `f5f7b846-…073fd` | `/profile` authed + owner-scoped `poker_practice_games` row |

Owners are distinct; every practice row is `kind='practice'` and attributed to exactly one tester.

## 4. Session-isolation result — **PASS**

Independent auth; refresh A leaves B unchanged; **logout A does not log out B**; re-login A; A/B games are distinct owner rows; an action in A never mutates B and vice-versa; no card/stack/pot/actionSeq/version crossover observed. Practice table RLS is deny-all (`REVOKE` from anon + authenticated) — verified live that anon REST is denied.

## 5. Hands completed by account and difficulty

| | easy | normal | hard |
|---|---|---|---|
| **A** | 5 | 5 | 5 |
| **B** | 5 | 5 | 5 |

## 6. Total completed hands — **30**

Minimum 5/account/difficulty met. Bounded at the 5-hand floor (30 total), not the 60 stretch target (see §15). Exact counts reported, not fabricated. 0 hands aborted / non-terminating.

## 7. Concurrent-action result — **PASS**

A and B ran their full easy→normal→hard matrices **concurrently** (`Promise.all`). Alternating actions, rapid double-clicks, and interleaved play showed: no duplicate action, no duplicate settlement, no stale action accepted, no hand-ID collision, no shared practice-chip state.

- Duplicate-action guard: rapid double-click on an action applies at most once; conservation intact, no error surfaced.
- Duplicate-next-hand guard: double-clicking "next hand" advances **exactly one** hand (`h0+1`), never double-settles.

## 8. Private-state isolation — **PASS**

Every live hand asserted: the viewer sees **exactly its own 2 hole cards**, and **0 opponent cards before showdown**. Screenshots mask all card faces (magenta boxes, verified visually). Traces + video disabled so no private hole card is ever recorded to any artifact.

## 9. Economy and settlement — **PASS**

Chip-conservation invariant asserted on **every observed state**:

- Integer stacks only, no negatives, integer non-negative pot.
- During betting: `sum(stacks) + pot == seatCount × 10000`.
- At completion: `sum(stacks) == seatCount × 10000` (pot awarded exactly once, into stacks).

Showdown hands: **10** · Uncontested wins: **20** · Turn reached (board ≥ 4): **11** · River reached (board ≥ 5): **10**. No wallet / ledger / ranking / achievement / mission / tournament / cash-game effect.

## 10. Recovery result — **PASS**

Reload → clean startable state, session preserved, no stale replay; simulated offline→online recovers; leave/return works; **no auth swap** on either side; the other context is unaffected throughout. (Practice does not persist the client-side gameId, so reload intentionally returns to a fresh startable table rather than resuming the same hand — expected behavior, not a defect.)

## 11. Network-guard result — **PASS**

0 forbidden requests in either context. Only external hosts touched: `fonts.googleapis.com`, `fonts.gstatic.com` (static fonts; carry no poker/auth data). No `*.supabase.co`, no `chococfko.com`, no non-loopback poker/wallet/ledger/tournament/push endpoint.

## 12. Tests and exact commands

Run from `web/`:

```bash
# Two-context suite (6 tests: gate, session isolation, concurrent bot matrix,
# concurrency+dedup, recovery, network guard) — reuses the running local dev server
npx playwright test --config e2e/poker/two-account/playtest.config.ts        # 6/6 PASS

# Relevant poker practice + flags + bot unit tests
node --test "lib/games/poker/practice/*.test.ts" "lib/games/poker/flags.test.ts"  # 95 PASS

# Lint the new test files (force, since e2e is ignore-listed by default)
npx eslint --no-ignore e2e/poker/two-account/two-account.spec.ts \
  e2e/poker/two-account/_playtest-env.ts e2e/poker/two-account/playtest.config.ts   # clean

# TypeScript
npx tsc -p tsconfig.poker-e2e.json --noEmit                                  # exit 0 (e2e)
npx tsc --noEmit --skipLibCheck                                              # exit 0 (product)

# Production build
npm run build                                                               # exit 0
```

**Result counts:** Playwright **6/6 PASS** · practice+flags+bot unit **95/95 PASS** · ESLint **clean (0 errors)** · tsc e2e **exit 0** · tsc product **exit 0** · build **exit 0**.

**Action coverage exercised** (where legal): `fold, check, call, bet, raise, all_in, showdown, uncontested win, turn decision, river decision`.

**i18n parity:** no locale files touched → no parity check required.

## 13. Files created or changed

**Created (this phase):**

- `e2e/poker/two-account/two-account.spec.ts` — the 6-test suite (gate, session isolation, concurrent bot matrix + coverage + economy + private-state, concurrency + dedup, recovery, network guard + isolation summary).
- `e2e/poker/two-account/playtest.config.ts` — loopback-only Playwright config; trace/video/screenshot disabled and managed for privacy; reuses the running local dev server.
- `e2e/poker/two-account/_playtest-env.ts` — env loader + fail-closed loopback safety gate + host classifier.

**Changed:**

- `.gitignore` — added `/e2e/poker/two-account/.artifacts/` (keeps generated screenshots/summary out of version control, matching the existing poker E2E artifact convention).

**No product code, i18n, migrations, or existing tests were modified.** Other modified files visible in `git status` are pre-existing uncommitted 27F work and were left untouched.

**Privacy-safe artifacts produced** under `e2e/poker/two-account/.artifacts/` (git-ignored): `summary.json` (pass/fail, counts, coverage, route statuses, scenario results — no secrets/cards), and masked screenshots `A-01-banner-home.png`, `A-02-profile.png`, `A-03-table-A.png`, `B-03-table-B.png`.

## 14. Defects by severity

**None.** No safety, economy, authorization, private-card, or settlement defect found. Product source unchanged.

## 15. NOT RUN items and exact reasons

- **60-hand stretch target** — not run. Bounded at the 5/account/difficulty floor (30 total) to keep runtime within the test window. Exact counts reported, not fabricated.
- **Re-raise (3-bet) and explicit uncalled-bet-refund line detection** — not deterministically forced/observed. A 3-bet spot and a refund line require specific bot re-raise/fold-to-bet behavior the safe strategy did not always induce; the conservation invariant already proves any refund is applied exactly once. Reported honestly rather than asserted.
- **Stale-`actionSeq` submit via UI** — not directly forced (the client's `inFlight` + disabled-button guard prevents crafting one through the UI). Covered by the observable **duplicate-action** and **duplicate-next-hand** guards instead; the server-side `actionSeq` + version-CAS is exercised on every action.

## 16. Credentials & private-card confirmation

Confirmed **not recorded**: tester password never logged/serialized (trace + video disabled; verified absent from `summary.json`); no JWTs or card tokens present in any artifact; screenshots mask every hole/showdown card face.

## 17. Production / infrastructure confirmation

Confirmed **untouched**: production database and domain, `game_wallets`, `coin_ledger`, all migrations, GitHub, Vercel, and feature flags. No commit / push / PR / deploy performed. All reads against `poker_practice_games` + Auth admin were **read-only**, local, service-role, for verification only.

---

## Final Decision

**TWO-ACCOUNT TECHNICAL PLAYTEST PASSED**
