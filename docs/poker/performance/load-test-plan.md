# Poker — Load-Test Plan

**Status:** prepared + partially executed (CPU + static analysis done; live target-scale run
requires a provisioned staging branch and is documented, not yet run — see §9).
**Owner:** performance / scalability.
**Scope:** Chợ Cóc FKO Poker (`/games/poker`), initial target ≈ **100 tables / 600 seated
players** + spectators, settlements, realtime actions, lobby, reconnects.

> Safety rules honoured throughout: no destructive load against production; no unexpected paid
> usage without approval; no bypass of game validation to fake throughput; no direct mutation of
> authoritative game state. Every driver is gated to a throwaway Supabase branch by default.

---

## 1. System under test (as it really is)

Authoritative path (verified in code):

- **Commands** are Next.js `'use server'` actions in `app/games/poker/actions.ts`. The browser
  sends *intent only*; identity is `auth.uid()` from the session cookie. The server runs the pure
  engine (`lib/games/poker/*`) and hands a pre-computed, conservation-checked patch to atomic
  service-role RPCs.
- **Atomic RPCs** (`migration_poker_engine.sql`): `poker_start_hand`, `poker_commit_action`
  (compare-and-swap on `action_seq` + idempotency key + per-seat coin conservation), `poker_pause_hand`.
  Settlement reuses `poker_settle_hand` / `poker_refund_hand` (economy migration).
- **Concurrency model:** each command takes `FOR UPDATE` row locks on `poker_tables` →
  `poker_hands` → `poker_seats`. Actions on **different tables are independent**; actions on the
  **same table serialize** on the hand-row lock (correct — only one seat acts at a time anyway).
- **Realtime is NOTIFICATION-only** (`usePokerRealtime.ts`): each client subscribes to a
  per-table channel `poker:{tableId}` with `postgres_changes` filters on `poker_hands`,
  `poker_seats` (`table_id=eq.{id}`) and `poker_tables` (`id=eq.{id}`), then re-reads authoritative
  state. The engine blob (`poker_hand_state`) and hole cards are **not** published.
- **Server-side latency is already instrumented**: `lib/games/poker/perf.ts` writes
  `poker_perf {op, ms}` rows to `analytics_events` for `action, snapshot, settlement, lobby,
  buy_in, cash_out, hand_history`, and reconnect signals as `poker_reconnect_*`. The metrics
  loader (`lib/games/poker/metrics.ts`) reads these back. **A load run can therefore be measured
  from the app's own telemetry**, not just the driver.

## 2. Test environment

| Item | Choice |
|---|---|
| Target | Throwaway **Supabase preview branch** (never prod). Enforced by `assertSafeTarget`. |
| App | A staging Next deployment (or local `next start`) pointed at the branch, with poker flags ON. |
| Test users | Provisioned by `e2e/poker/auth.setup.ts` (service role, branch only). |
| Synthetic wallets | Seeded via the existing signup grant / economy RPCs on the branch. |
| Feature flags | `POKER_ENABLED=true` + capability flags (see `poker.config.ts` webServer env). |
| Rate-limit exceptions | Only if the app enforces one on the command path; grant on the branch only. |
| Cost guardrails | `scripts/poker-load/config.ts` `GUARDRAILS` (tables/players/clients/duration/RPS). |
| Stop switch | `scripts/poker-load/.STOP` file or SIGINT (`shouldStop()`), polled by every driver loop. |
| Cleanup | Delete the branch after the run (`supabase branches delete`). |

## 3. Load generator (three faithful drivers, no state faking)

1. **`scripts/poker-load/engine-bench.ts`** — CPU microbenchmark of the authoritative engine
   (deal → betting → showdown) on the exact `lib/games/poker` functions the server calls. Runs
   offline; anchors the "engine time per hand/action" term of the capacity model. **Executed —
   see results.md.**
2. **`e2e/poker/multiplayer.spec.ts` (Playwright)** — the **gameplay WRITE path**: real browser
   sessions authenticate as test users, join through the real server actions, take **legal**
   actions (respecting `state_version`, action sequence, idempotency), reach settlement, and
   cash out. This is the correctness-faithful driver for baseline/moderate scale on one box.
3. **`scripts/poker-load/readload.ts`** — the **realtime + read-scale** driver: opens one
   realtime channel per simulated client (same filters as the app) and drives lobby / snapshot /
   history reads at the profile cadence. Fans out to hundreds of clients cheaply where Playwright
   cannot. Read-only; never calls service-role RPCs.

Rationale for the split: server actions cannot be invoked faithfully from a bare script (they
require the Next runtime + cookies), so the write path is driven through the real UI (Playwright)
and the high-fan-out realtime/read pressure is driven by the lightweight client. Both keep every
command on its real, validated route.

## 4. Load profiles

Defined in `scripts/poker-load/config.ts` (`POKER_LOAD_PROFILE=<name>`):

| Profile | Tables | Seated | Spectators | Lobby | History | Notes |
|---|---|---|---|---|---|---|
| `baseline` | 10 | 60 | 0 | 5 | 0 | pipeline smoke |
| `moderate` | 30 | 180 | 30 | 20 | 5 | first scaling point |
| `target` | 100 | 600 | 200 | 100 | 30 | launch target |
| `burst` | 100 | 600 | 0 | 200 | 0 | simultaneous table starts |
| `settlement` | 100 | 600 | 0 | 0 | 0 | many all-ins settling fast |
| `reconnect` | 60 | 360 | 120 | 0 | 0 | 60% resubscribe storm |
| `lobby` | 100 | 400 | 0 | 500 | 0 | lobby refresh/filter pressure |
| `history` | 50 | 300 | 0 | 0 | 300 | history browsing during play |

Dry-run any profile with `POKER_LOAD_PROFILE=<name> npm run poker:load:preflight` — it prints the
client/command/realtime budget and the guardrail + safety verdict **without touching a DB**.

## 5. What we measure

- **Application** (from `analytics_events` telemetry + driver timings): action P50/P95/P99,
  snapshot P95, buy-in / cash-out / settlement / lobby / hand-history latency, error rate, retry rate.
- **Database** (Supabase dashboard + `pg_stat_statements`): connection usage, query latency, lock
  wait, deadlocks, slow queries, index usage (`EXPLAIN`), transaction duration, row contention,
  storage growth.
- **Realtime** (Supabase Realtime inspector): active channels, subscribers, delivery delay,
  disconnects, presence churn, sequence gaps (via `state_version` monotonicity), recovery requests.
- **Frontend** (Playwright + browser perf): CPU, memory growth, realtime-event processing, timer
  drift.
- **Infrastructure** (Vercel): function duration, concurrency, region placement, bandwidth, log
  volume, and the resulting **cost estimate** (cost-estimate.md).

## 6. Performance budgets

See capacity-model.md §Budgets. Target vs measured is tracked explicitly in results.md.

## 7. Procedure

1. `npm run poker:load:bench` (offline CPU baseline).
2. Create a preview branch; apply poker migrations **in order** (release-migration-order.md) +
   `migration_poker_perf_indexes.sql`.
3. Deploy staging app against the branch with poker flags ON; provision users
   (`npm run test:e2e:poker:full` seeds users + open tables).
4. `POKER_LOAD_PROFILE=baseline npm run poker:load:preflight` → must print **PREFLIGHT OK**.
5. Run `baseline`: Playwright multiplayer (write path) + `poker:load:read` (realtime/read).
   Capture telemetry + dashboard metrics into results.md.
6. Gate: all baseline budgets green → step up to `moderate`, then targeted profiles
   (`settlement`, `reconnect`, `lobby`, `history`, `burst`), then `target`.
7. Soak: run `reconnect`/`moderate` for the extended window (§8) watching for leaks.
8. Tear down the branch.

## 8. Soak test

Extended controlled run on the branch (recommended ≥ 2–4 h at `moderate`). Watch: memory leaks
(app + browser), subscription leaks (Realtime channel count must return to baseline after clients
leave), abandoned tables (reaper `poker_reap_idle_table` / `poker_resolve_closing`), reservation
& timer cleanup, connection growth, storage growth, log growth, and **coin conservation** (sum of
wallet + escrow constant except faucets — the engine settlement is zero-sum).

## 9. Honest status of execution

| Component | Status |
|---|---|
| Engine CPU microbenchmark | ✅ executed locally (results.md §1) |
| Static bottleneck analysis of the real command/query/realtime paths | ✅ done (bottlenecks.md) |
| Guardrails / profiles / stop-switch / preflight tooling | ✅ built + unit-tested |
| Read/realtime driver | ✅ built, runnable against a branch; **not yet run at scale** |
| Playwright gameplay write-path driver | ✅ exists (`multiplayer.spec.ts`); scaling it is a fleet exercise |
| Live 100-table / 600-player run | ⛔ **not executed** — needs a provisioned staging branch + cost approval + a worker fleet for target-scale write load |

The capacity model (capacity-model.md) is therefore **derived**: measured CPU term + measured DB
concurrency structure + documented Supabase Realtime/Postgres limits, with the live end-to-end run
called out as the required next step before a public launch above the "soft-launch" cap.
