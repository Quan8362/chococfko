# Poker Tournament — E3A-4A local end-to-end validation report

Status: **PASS.** Disposable local validation of the internal-alpha tournament, creation-adjacent
state through live play, realtime, private-state seal, and chip/wallet economy. Tournament stays
**dark by default** (`POKER_TOURNAMENT_INTERNAL_ALPHA` unset in production). Nothing was pushed,
deployed, or applied to production. This report is privacy-safe: no keys, cookies, JWTs, hole cards,
deck order, or seeds.

## 1. Verified commit chain

HEAD = `main 308b70e`. Precondition chain present and unmodified:

- `045d590` — E3A-2 orchestration migration + SQL validation
- `9801654` — E3A-3A server actions, authorization, hand runner
- `a3bd6b6` — E3A-3B routes, UI, operator/participant flow, i18n
- `308b70e` — E3A-3C live table, realtime, privacy, recovery

## 2. Coherent local test environment (resolves the E3A-3C carry-forward blocker)

E3A-3C could not run the browser spec because the Windows app host and the WSL Supabase were not
mutually reachable. On this workstation that boundary is genuinely broken (corporate VPN + Hyper-V
firewall; WSL `eth0` on a different subnet than the Windows `vEthernet (WSL)` adapter; Windows→WSL
loopback and WSL-IP both refuse on the Supabase ports). **Resolution: run everything inside WSL**
(preferred approach 1) — app, Playwright/Chromium, and Supabase all share the WSL loopback, so no
Windows↔WSL crossing is needed.

- **Disposable DB:** local Supabase project `tnmtval` (WSL2 + Docker), API `http://127.0.0.1:54421`,
  DB `54422`, distinct from the non-disposable `poker-local` (ports `543xx`, left untouched).
- **Schema:** pure tournament domain — 9 `poker_tournament_*` tables + `game_wallets` + `coin_ledger`
  (11 public tables), 13 tournament RPCs. Realtime publication contains **only** the three
  non-secret tables (`poker_tournament_entries`, `_seats`, `_table_state`); the seed-bearing
  tournament + hand rows are not published.
- **App + tests:** disposable Linux checkout with its own `node_modules`, Chromium (headless),
  `.env.local` pointing app **and** `POKER_E2E_*` at `http://127.0.0.1:54421`. The production
  `.env.local` on the Windows working copy was never read or modified.
- **Safety proof:** every target is `127.0.0.1`/container-local; no production project ref; no
  `*.supabase.co` endpoint; only synthetic users and virtual balances; `poker-local` untouched.

## 3. Authoritative SQL suites vs `tnmtval` (transactional, `BEGIN … ROLLBACK`, persist nothing)

All three green (`psql` exit 0):

- `poker_tournament_tests.sql` — base registration / refund / wallet: **ALL ASSERTIONS PASSED**.
- `poker_tournament_orchestration_tests.sql` — **ORCH-001…010 PASS**: seat draw (seats=6, chip
  sum=30000, balanced), seat-draw idempotent, apply-hand conserves + settles, apply-hand idempotent,
  non-conserving deltas rejected, elimination once + finishing places + seat vacated, move-seat
  carries stack, level advance monotonic, orchestration RPCs denied to `authenticated` and `anon`,
  and **wallet isolation** (wallets + ledger untouched; chips conserved at 30000).
- `poker_tournament_realtime_tests.sql` — **RT-001…006 PASS**: touch bumps monotonically + mirrors
  non-secret state, pointer table has no secret column, seed + hand rows sealed while lobby + pointer
  are readable, pointer + touch are service-role only, only non-secret tables published, and the full
  live flow conserves chips while touching `game_wallets` / `coin_ledger` **zero** times.

## 4. Multi-context Playwright execution (the mandatory E3A-4A gate) — GREEN

`npx playwright test --config e2e/poker/poker.config.ts --project tournament` (auto-runs `setup`),
headless Chromium, landscape 1280×720, two independent authenticated `BrowserContext`s:

- `setup` — provisions the synthetic players via service role: **passed**.
- `tournament` — two seated players play a heads-up hand end-to-end: **passed (44.3s)**. `2 passed`,
  0 unexpected, 0 flaky.

Observed and asserted authoritatively (server-rendered `data-*`, never client-computed): both
contexts load the live table; hand 1 auto-opens (server-authoritative next-hand); each page shows
exactly its own two face-up cards while the opponent is face-down and the board is empty preflop;
cross-context agreement on the current turn seat; mid-hand refresh recovery restores identity, seat,
own cards, and hand number with no stale action replay; the SB folds with a double-click that
exercises the in-flight duplicate-submit guard (exactly one intent accepted, no crash); hand 2
auto-opens for **both** clients (idempotent next-hand); chip conservation holds; hole-card privacy
persists into the new hand.

## 5. Defect found and fixed (test-harness, not product)

`e2e/poker/tournament-realtime.spec.ts:140` asserted the two hero stacks alone sum to `2×START`
(10000) but read 9925 immediately after hand 2's blinds posted. The 75-chip difference (SB 25 + BB
50) sits in the **pot**, not lost: `tnmt-hero` `data-stack` is the *live behind-stack* and
`tnmt-pot` `data-amount` (= `potTotal`) holds the committed chips. Conservation actually holds
(`9925 stacks + 75 pot = 10000`) — corroborated by SQL `RT-006`/`ORCH-003`, which prove the engine
conserves with zero wallet touches. Fix: count the pot in the conservation assertion
(`stackA2 + stackB2 + pot2 === 2×START`); the folder-cannot-gain check is unchanged. Re-run: green.

## 6. Regression

| Check | Command | Result |
|---|---|---|
| Tournament unit / state-machine / hand-runner / payout / elimination / registration / tableView / uiModel | `node --test lib/games/poker/tournament/**/*.test.ts` | **80/80 pass** |
| Full poker lib (engine, betting, bot, practice, tournament) | `node --test lib/games/poker/**/*.test.ts` | **855/855 pass** |
| Orchestration + realtime + base SQL harnesses | `psql < …_tests.sql` | **all green (exit 0)** |
| Multi-context tournament E2E | `playwright … --project tournament` | **2 passed** |
| Public poker smoke + responsive | `playwright … --project smoke --project responsive` | **12 passed, 1 pre-existing** |
| TypeScript | `tsc --noEmit --skipLibCheck` | **exit 0** |
| ESLint (changed file) | `eslint e2e/poker/tournament-realtime.spec.ts` | **exit 0** |
| i18n parity | `node scripts/check-i18n-parity.mjs` | **OK — 5739 keys × 5 locales** |
| Production build | `npm run build` | **exit 0** (warnings only) |

Realtime is notification-only (a change bumps the non-secret pointer → each client re-reads one
viewer-safe snapshot), so correctness never depends on latency; propagation of hand transitions and
turn agreement completed well within the spec's assertion windows on the WSL loopback. No dedicated
latency counter is emitted by the authored spec.

## 7. Scope notes (honest coverage boundaries)

- The authored browser spec is a **heads-up (2-player), winner-take-all** playthrough covering
  seating→live play→realtime→privacy→refresh recovery→duplicate-submit→next-hand→chip conservation.
- Multi-table balancing, N>2 elimination ladder to a final table, blind-level progression across
  levels, unregister/refund, and full completion→payout→wallet reconciliation are validated at the
  **authoritative SQL layer** (`ORCH-001…010`, `RT-001…006`, base suite) and the **pure engine unit
  layer** (payout, prizePool, elimination, blinds, stateMachine, registration, balancing, simulation)
  rather than driven through a 4+-player browser session. Tournament chips are wallet-isolated by
  design, so tournament economy reconciliation is **chip conservation** (sum of stacks + pot constant;
  payout total = prize pool; wallets/ledger untouched during hands), which the SQL suites assert.

## 8. Pre-existing / out-of-scope finding

- `smoke` › `/games/poker/glossary`: a sub-resource returned 404 (a console error), on a public,
  non-tournament page. Not introduced by this change (only the tournament spec was edited) and
  unrelated to tournament gameplay, realtime, privacy, or economy. **Low severity; does not block
  the tournament E2E validation.** Worth a separate look at the glossary page's asset/metadata refs.

## 9. Isolation confirmation

`poker-local` and production were not modified, reset, stopped, or connected to. No production SQL,
flags, cohorts, roles, or data changed. Tournament remains OFF by default. Only the disposable
`tnmtval` (kept for E3A-4B, volume preserved) and a disposable WSL checkout were used.

**Decision: READY FOR E3A-4B FINAL REGRESSION AND RELEASE GATE.**
