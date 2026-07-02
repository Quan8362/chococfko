# Chợ Cóc FKO — Poker Load & Scalability Validation Report (Prompt 23B)

**Date:** 2026-07-02
**Scope:** Execute the Prompt 23 load-test plan against an **isolated non-production** database; fill the
missing real measurements; determine a conservative Closed-Beta capacity.
**Method:** Local Supabase stack (Docker) inside WSL2 Ubuntu — `~/poker-local`. **Production was never
contacted; every endpoint was `127.0.0.1`.** No commit / push / deploy / production SQL.

---

## 0. Executive summary

- **Correctness gates: ALL GREEN** on non-prod at the real authoritative-RPC level — 6/6 SQL harnesses
  pass (coin-conservation, RLS read-own hole cards / opaque deck, engine CAS + idempotency, admin, economy).
- **Perf-index migration validated** end-to-end: additive, idempotent, HOT-compatible, pure `CREATE INDEX`,
  with **measured before/after query plans** (seq-scan+sort → index-scan, 3–5× faster; lobby now scales
  O(live tables)).
- **The binding ceiling is Supabase Realtime `postgres_changes` fan-out**, exactly as Prompt 23 predicted
  (bottleneck W1). Measured local tenant limit `max_events_per_second = 100`; each authoritative action
  emits ~3 change events (seat+hand+table) ⇒ ~33 actions/s saturates it, after which delivery collapses.
- **The DB write path is NOT the ceiling:** measured ~2,000 actions/s at its optimum (c=30), 0 failed
  txns, 0 negative/non-integer stacks — ~60× more headroom than Realtime.
- **Privacy held under load:** 0 hole-card/deck leaks across all realtime payloads; 0 duplicates, 0 out-of-order
  per client (up to 120 delivered channels).
- **Not executed:** the full browser gameplay fleet (Playwright at 20–30 tables) and real Vercel
  function-concurrency measurement — these require a running staging app + worker fleet. Capacity is therefore
  reported at the **DB + Realtime tiers that were measured**, with a conservative recommendation.

---

## 1. Environment used

- Windows 11 + **WSL2 Ubuntu** (reused from the Prompt-15B local validation).
- **Docker 29.1.3**, **Supabase CLI 2.109.0**, **psql/pgbench 18.4**, **Node v22.22.1** (WSL) / v24.15.0 (Win).
- Local stack `~/poker-local` (`supabase start`): DB `127.0.0.1:54322`, API `127.0.0.1:54321`, realtime, auth,
  rest, studio. Legacy anon/service keys read to `~/poker-local.env` (never the repo, never printed).

## 2. Confirmation production was not contacted

- Every URL used = `http://127.0.0.1:54321` / `postgresql://…@127.0.0.1:54322`. A hard guard rejected any
  host containing the prod ref `kjfnqbzfhymhfodmgyow` or `supabase.co` (verified: "OK — all hosts local").
  The realtime driver also aborts unless `API_URL` matches `127.0.0.1|localhost`.
- No `.env.local`, no preview branch, no remote project. **Zero production contact.**

## 3. Migration inventory applied to non-production

Base set (poker 1–7 + prereqs) was already present from the prior local run (persisted Docker volume,
18 poker tables). Newly applied this phase, via the faithful `supabase_admin` path, all clean:

| Migration | Result |
|---|---|
| `migration_poker_economy_config.sql` | ✅ applied clean |
| `migration_poker_seat_departures.sql` | ✅ applied clean |
| `migration_poker_integrity.sql` | ✅ applied clean |
| `migration_poker_alpha_bug_reports.sql` | ✅ applied clean |
| `migration_poker_perf_indexes.sql` | ✅ applied clean (see §4) |

Not applied (correctly excluded): rollback files, `*_tests.sql` harnesses as migrations, fixtures.

## 4. Status of `migration_poker_perf_indexes.sql`

**VALIDATED — additive, idempotent, HOT-compatible, non-destructive, pure `CREATE INDEX`.**

- 2nd apply → `NOTICE: … already exists, skipping`, exit 0 ⇒ **idempotent**.
- Purity: file contains only `CREATE INDEX` (no INSERT/UPDATE/DELETE/ALTER/DROP/GRANT) ⇒ **no wallet/ledger/
  settlement mutation**.
- HOT: indexed columns are `poker_tables(created_at)` + partial `WHERE status<>'closed'`; the per-action
  `state_version` bump touches neither ⇒ gameplay writes stay HOT-eligible (no index maintenance).
- **Measured query plans (6,001 tables incl. 5,800 closed; 4,000 hole-cards; 4,000 members):**

| Query | BEFORE | AFTER |
|---|---|---|
| Lobby (`status<>'closed'` order created_at) | Seq Scan + top-N sort, **1.18 ms** | Index Scan `poker_tables_live_created_idx`, **0.21 ms**, no sort |
| Hand-history hole_cards (user, recent 500) | Seq Scan 4000 + sort, **1.03 ms** | Index Scan `poker_hole_cards_user_recent_idx`, **0.63 ms**, no sort |
| Recent tables (member, recent 60) | Seq Scan + sort, **1.03 ms** | Index Scan `poker_members_user_recent_idx`, **0.18 ms**, no sort |

The lobby index is partial over **live** tables, so its cost stays flat as closed tables accumulate.

## 5. Load profiles executed

| Profile | Tool | What ran | Result |
|---|---|---|---|
| Correctness / authoritative RPC | SQL harnesses (`supabase_admin`) | sit_down→start_hand→commit_action×N→settle_hand→stand_up + CAS/idempotency/conservation | **6/6 PASS** |
| Realtime moderate | node + supabase-js | 20 tables × 6 subs = **120 channels**, 25 s | **delivered clean** (below limit) |
| Realtime soft-launch target | node + supabase-js | 30 tables × 6 subs = **180 channels**, 25 s | **rate-limit tripped → 0 delivery** (see §13) |
| DB write-path load | pgbench | commit-shaped txn, c=1/10/30/60, 10 s each | **~2,000 actions/s peak** (see §12) |
| Engine CPU (Prompt 23, re-confirmed) | engine-bench | full hands + showdown | ~0.24 ms / 6-max hand (negligible) |

Browser gameplay fleet (Playwright at scale) and Vercel concurrency: **not executed** (needs staging app + fleet).

## 6–8. Concurrency achieved & durations

- **Max concurrent realtime channels with clean delivery: 120** (= 20 tables × 6 subscribers). At 180
  channels the tenant event-rate limit tripped and delivery went to 0 (not a connection failure —
  `max_concurrent_users=200` was not exceeded).
- **DB write path: 60 concurrent clients** sustained with 0 failures; **optimum throughput at c≈30**.
- Durations: realtime runs 25 s each; pgbench 10 s per concurrency step; harnesses sub-second each.

## 9. RPS and Realtime messages per second

- **DB actions/s (measured):** c=1 → 490; c=10 → 1,364; **c=30 → 2,015 (peak)**; c=60 → 1,677 (past optimum).
- **Realtime (measured):** moderate run delivered **283 msgs/s** across 120 channels (≈15.3 delivered
  msgs/action after ×6 fan-out; ≈3 source events/action). Source-event ceiling = **100 events/s**
  (tenant `max_events_per_second`) ⇒ **~33 authoritative actions/s** before saturation.

## 10. Latency percentiles (measured)

- **DB write-path latency (avg):** 2.0 ms (c=1), 7.3 ms (c=10), 14.9 ms (c=30), 35.8 ms (c=60). 0 failed txns.
- **Realtime delivery latency (120 channels, local):** p50 **495 ms**, p95 **1,132 ms**, p99 **1,247 ms**
  (n=2,520). Local realtime adds a replication/poll interval; treat as a local upper bound, not a prod SLA.
- **Engine CPU:** full 6-max hand ~0.24 ms; 6-way showdown p95 ~0.77 ms.

## 11. Error and timeout rates

- DB load: **0 failed transactions** at every concurrency level.
- Harnesses: **0 hard errors** (6/6 pass).
- Realtime: 0 errors at 120 channels; at 180 channels the tenant emitted
  `MessagePerSecondRateLimitReached` and shed delivery (a rate-limit, not a crash/timeout).

## 12. Database connection & query findings

- Peak connections during pgbench: ~20 (well within local limits). No deadlocks, no failed txns.
- Optimum throughput at c≈30; beyond that, row-lock contention on the shared per-table rows increases
  latency and reduces tps (c=60 slower than c=30) — expected for the FOR-UPDATE hand-row design.
- Perf indexes convert the three hot reads from seq-scan+sort to index-scan (§4). Coin invariants held:
  0 negative stacks, 0 non-integer stacks after the load.

## 13. Realtime fan-out findings (the headline)

- **Confirmed bottleneck W1.** Each authoritative action fans out on `poker_seats` + `poker_hands` +
  `poker_tables` = ~3 source change events. The local tenant caps at **100 events/s**
  (`_realtime.tenants.max_events_per_second`); at ~33 actions/s this is hit and **all** postgres_changes
  delivery is dropped (log: `MessagePerSecondRateLimitReached`). Bursty settlement (all tables acting at
  once) trips it soonest — matching the "settlement burst" risk.
- **Mitigation is arithmetic and correctness-preserving:** collapsing to fewer change events per action
  (bottleneck **W4** — the hand's progression is already tracked by `poker_hands.state_version`, so the
  per-action `poker_tables` bump is redundant for in-hand sync) would cut 3→2 events/action ⇒ **+50%
  action headroom**; a Broadcast-based single-event notification (W1 option) would cut it further. These
  are recommended for Prompt 24 (see §18 — deliberately **not** applied here to avoid an under-validated
  change to the coin-moving settlement RPC during a read-only validation phase).
- Privacy/ordering: **0 hole-card or deck leaks** in any payload; **0 per-client duplicates; 0 out-of-order**
  (state_version monotonic per client) up to 120 channels.

## 14. Reconnect & recovery findings

- Architecture verified by code + harness (not a fresh browser run this phase): clients treat realtime as
  notification-only and re-read the authoritative snapshot; `state_version` monotonicity means a missed or
  duplicate event cannot mis-apply. The DB CAS (`poker_commit_action` stale/idempotency handling) is proven
  by `poker_engine_tests.sql` (CAS rejects stale, idempotency-key dedupes). **Full browser reconnect-storm
  timing was not measured this phase** and is carried to Prompt 24.

## 15. Settlement & coin-conservation findings

- **`poker_full_hand_conservation_test.sql` PASS** — a complete multi-player hand through the real RPCs with
  total-coin conservation asserted at every step.
- **`poker_engine_tests.sql` PASS** — conservation guard blocks coin-minting; settlement-retry pays once
  (no duplicate payout); CAS rejects stale commands; idempotency-key dedupes duplicates.
- Under DB load: 0 negative stacks, 0 non-integer coin values. **No duplicate debit/payout/settlement observed.**

## 16. Security & privacy findings

- RLS read-own hole cards, no-policy (opaque) deck, opaque table secrets/admin tables — **`poker_db_tests.sql`
  + `poker_admin_ops_tests.sql` PASS**.
- `poker_hole_cards` / `poker_deck` are **not** in the realtime publication (verified: only
  hands/seats/tables/actions are) ⇒ no card/seed path over the wire; confirmed by 0 leaks under load.
- Integrity scoring remains review-only (`poker_integrity` applied; `actionMovesCoins` always false) — no
  automatic punishment/coin movement. Service-role keys stayed server-only (WSL env file, never printed/committed).

## 17. Bottlenecks found

1. **W1 — Realtime `postgres_changes` event-rate saturation** (binding ceiling; measured).
2. **W4 — redundant per-action write amplification** (~3 change events/action; the `poker_tables` bump is
   redundant for in-hand sync) — amplifies W1.
3. Minor: hot-read query plans (lobby / history / recent-tables) — **already fixed** by the perf indexes (§4).

## 18. Fixes implemented

- **Perf-index migration (`migration_poker_perf_indexes.sql`)** — validated on non-prod with before/after
  plans (§4). PENDING production apply (not applied to prod in this phase).
- **Hand-history bounded/recency read** (`ecosystem.ts`, from Prompt 23) — confirmed served by the new index.
- **W1/W4 realtime reduction: NOT implemented this phase (deliberate).** It modifies the authoritative
  commit/settlement RPC; changing a coin-moving `SECURITY DEFINER` function is out of scope for a read-only
  validation run and should be done with the full browser E2E gate. **Recommended as the first Prompt-24
  task**, with the measured justification above (+50% headroom from 3→2 events/action; more via Broadcast).

## 19. Before-and-after results

- Perf indexes: seq-scan+sort → index-scan; lobby 1.18→0.21 ms, history 1.03→0.63 ms, members 1.03→0.18 ms (§4).
- No other code fix was required by the measurements (DB and correctness were already healthy).

## 20. Exact regression-test results

| Gate | Result |
|---|---|
| 1. TypeScript typecheck (`tsc --noEmit`) | ✅ exit 0 |
| 2. Poker E2E TypeScript (`tsconfig.poker-e2e.json`) | ✅ exit 0 |
| 3. ESLint (`npm run lint`) | ✅ exit 0 (pre-existing warnings only; none from changed files) |
| 4. i18n parity (5 locales) | ✅ 5397 keys × 5 locales |
| 5+6. Full repo test suite (`npm test`) | ✅ **1268 pass / 0 fail / 0 skipped** |
| 7. SQL migration/RLS harnesses (non-prod) | ✅ **6/6 pass** (db, lifecycle, engine, admin_ops, conservation, economy_config) |
| 8. Poker Playwright browser tests | ⏭️ **not run** (needs running app + browser; carried to Prompt 24) |
| 9. Next.js production build | ✅ exit 0 |
| 10. Baseline + Closed-Beta load profiles | ✅ realtime (20t/120ch) + DB (c≤60) executed; browser fleet not |

## 21. Conservative Closed-Beta capacity recommendation

- **Verified working (measured):** clean realtime delivery at **20 tables / ~120 concurrent subscribers**
  and DB write-path headroom of **~2,000 actions/s** — both with full coin/privacy integrity.
- **Binding constraint:** Realtime source-event rate. On the local default (100 evt/s) the safe steady rate
  is **~33 actions/s (~3 events/action)**. The hosted limit is plan-dependent and higher, but **must be
  confirmed before launch.**
- **Recommendation: soft-launch at ≤ 20 concurrent tables (~120 players)**, contingent on (a) confirming the
  hosted Supabase realtime `max_events_per_second` for the plan, and ideally (b) applying the W4 realtime
  reduction (+50% headroom). **Do NOT claim the 100-table / 600-player target** — it was not executed and is
  gated on the realtime event-rate limit + a browser-fleet run.

## 22. Remaining provider / architecture limits

- Supabase Realtime `max_events_per_second` (100 local; plan-dependent hosted) — the pivot; raise and/or
  apply W1/W4.
- `max_concurrent_users` (200 local) — a second realtime ceiling for total subscribers.
- Vercel function concurrency + cold starts — **not measured** (no staging app run); the DB proves the
  work behind each action is cheap (2–15 ms), so this is the remaining unknown for end-to-end action p99.
- Browser client convergence / reconnect-storm timing — **not measured** this phase.

## 23. Cleanup confirmation

- All synthetic data removed: `LOADTEST_*`, `RTLOAD_*`, `DBLOAD_*` tables and the `lt_map` helper dropped
  (verified 0 remaining). Temporary `web/rt-loadtest.local.mjs` deleted. No test users left in `auth.users`.
- No load generators running (`pgrep` clean). Local stack left up as the reusable dev environment (idle;
  volume persists, no traffic). Temporary local keys live only in `~/poker-local.env` (WSL, git-ignored path,
  never printed/committed). **Production never contacted.**

## 24. Can Prompt 24 safely begin?

**Yes** — the correctness, coin-conservation, privacy, and migration gates are green on non-prod; the perf-index
migration is validated; and the scaling ceiling is identified and quantified. Prompt 24 should begin with the
W1/W4 realtime reduction (highest-leverage, measured) and, if a staging app is provisioned, the browser-fleet
gameplay + Vercel-concurrency measurements that this phase could not execute.
