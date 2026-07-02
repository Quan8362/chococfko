# Poker — Load-Test Results

> **Read this first.** Results are split into **MEASURED** (actually executed in this environment)
> and **TARGET / NOT-YET-MEASURED** (requires a provisioned staging branch + cost approval; the
> tooling is built and gated but the live 100-table/600-player run has **not** been executed). We
> never present a target as an achieved result.

---

## 1. MEASURED — authoritative-engine CPU microbenchmark

Tool: `scripts/poker-load/engine-bench.ts` (`npm run poker:load:bench`). Exercises the exact pure
functions the server runs per command (`initHand`, `applyPlayerAction`, `nextStep`, `enterStreet`,
`settleShowdown`, secure shuffle + `deal`). No DB/network.

Environment: Node v24.15.0, Windows 11, single core, 20 000 iterations/measure, 2 000-hand warmup.

### Full check/call-down hand (deal → all betting streets → showdown)

| Seat count | mean | p50 | p95 | p99 | hands/sec (1 core) |
|---|---|---|---|---|---|
| 2-handed | 0.087 ms | 0.079 | 0.146 | 0.228 | ~11,600 |
| 3-handed | 0.124 ms | 0.114 | 0.198 | 0.282 | ~8,100 |
| 6-handed | 0.242 ms | 0.227 | 0.365 | 0.478 | ~4,100 |

### Showdown evaluator only (heaviest per-hand term; scales with contenders)

| Contenders | mean | p95 | p99 | evals/sec (1 core) |
|---|---|---|---|---|
| 2 | 0.077 ms | 0.099 | 0.202 | ~12,900 |
| 3 | 0.154 ms | 0.188 | 0.324 | ~6,500 |
| 4 | 0.202 ms | 0.288 | 0.381 | ~5,000 |
| 5 | 0.336 ms | 0.556 | 0.799 | ~3,000 |
| 6 | 0.400 ms | 0.773 | 1.110 | ~2,500 |

### Secure shuffle + deal (per-hand setup)

| | mean | p95 | p99 | ops/sec |
|---|---|---|---|---|
| 6 seats | 0.0082 ms | 0.013 | 0.027 | ~121,000 |

**Interpretation.** The authoritative CPU work is **cheap**: a full 6-handed hand costs ~0.24 ms
of engine time, and a single committed action costs a small fraction of that (one betting
transition ≪ a whole hand). Even the heaviest event — a 6-way showdown — is ~0.4 ms (p95 0.77 ms).
At the target of 100 tables completing a hand roughly every ~30 s, hands settle at ~3–4/s
system-wide, i.e. **< 2 ms/s** of engine CPU — utterly negligible. **CPU in the pure engine is not
a scaling constraint.** The ceiling lives in DB round-trips, Realtime fan-out, and serverless
function concurrency (see bottlenecks.md / capacity-model.md).

## 2. MEASURED — guardrail / preflight tooling

`npm run test:poker:load` → **8/8 pass** (guardrail ceilings, never-prod safety gate incl. the
known prod project ref, profile coherence).

`POKER_LOAD_PROFILE=target npm run poker:load:preflight` correctly:
- computes the `target` budget: 100 tables, 600 seated, 930 total clients, est. **peak ≈ 482
  action RPS**, est. **≈ 7,000 realtime msgs/s** (postgres_changes fan-out);
- flags that peak RPS exceeds the default `maxActionsPerSec` (400) → driver must throttle;
- **blocks** the run when no throwaway branch is targeted (safety gate working).

The ~7,000 realtime-messages/s figure is the headline scaling signal — see bottlenecks.md §Realtime.

## 3. MEASURED — static analysis of the real paths

Full findings in bottlenecks.md. Summary of what the code review confirmed:

- ✅ **No N+1 in the lobby**: `listLobby` batches seats via a single `.in('table_id', ids)` query.
- ✅ **Realtime is correctly scoped** per-table (not overbroad); engine blob + hole cards are not
  published.
- ✅ **Commit path is atomic + idempotent + conservation-checked**; different tables don't contend.
- ✅ **Hot-write tables are well-indexed** for their lookups; the per-action `poker_tables`
  version bumps remain HOT-eligible.
- ⚠️ **Hand-history** grabbed an *arbitrary* 500 hole-card rows → **fixed** (order by recency +
  new index).
- ⚠️ **Lobby scan** degrades as closed tables accumulate → **fixed** (partial live-tables index).
- ⚠️ **Realtime fan-out** (≈7k msgs/s at target) is the primary risk and must be validated on a
  branch against the Supabase Realtime quota before public launch.

## 4. MEASURED (Prompt 23B) — executed on an isolated local Supabase stack

Executed 2026-07-02 on local Supabase (WSL2/Docker), non-prod. Full report:
`reports/poker-load-validation-2026-07-02.md`.

**DB write-path (pgbench, commit-shaped txn against a 60-table pool):**

| Concurrency | actions/s | latency avg | failed txns |
|---|---|---|---|
| c=1 | 490 | 2.0 ms | 0 |
| c=10 | 1,364 | 7.3 ms | 0 |
| c=30 (optimum) | **2,015** | 14.9 ms | 0 |
| c=60 | 1,677 | 35.8 ms | 0 |

0 negative stacks, 0 non-integer coins after load. Peak ~20 connections. **DB is not the ceiling.**

**Realtime fan-out (node + supabase-js, app-identical channels):**

| Profile | Channels | Result |
|---|---|---|
| moderate (20t × 6) | 120 | delivered clean: 283 msgs/s, delivery p50 495 ms / p95 1,132 ms; 0 dup, 0 out-of-order, **0 hole-card leaks** |
| soft-launch (30t × 6) | 180 | **rate-limit tripped → 0 delivery** (`MessagePerSecondRateLimitReached`) |

Binding limit = tenant `max_events_per_second = 100` (local default). ~3 change events/action ⇒
**~33 actions/s** saturates it. This is the confirmed ceiling (bottleneck W1); hosted limit is
plan-dependent and must be confirmed.

**Correctness gates (SQL harnesses on non-prod): 6/6 PASS** — coin conservation, RLS read-own
hole cards / opaque deck, engine CAS + idempotency (no duplicate settlement), admin, economy.

**Not executed:** browser gameplay fleet (Playwright at 20–30 tables) + real Vercel
function-concurrency. Carried to Prompt 24.

### Budgets vs measured

| Metric | Target | Measured (local) |
|---|---|---|
| DB action write path | < 400 ms P95 | 2–15 ms avg to c=30 ✅ (huge headroom) |
| Coin conservation | exact | exact ✅ (0 violations) |
| Realtime privacy (hole cards) | 0 leaks | 0 leaks ✅ |
| Realtime delivery P95 | < 1 s | 1.13 s local (incl. local replication interval) ⚠️ verify on hosted |
| Realtime sustainable action rate | — | ~33/s at default 100 evt/s; **raise limit / apply W4** |

## 5. Coin-integrity result

- **Design-level:** settlement is zero-sum (no rake/ante); `poker_commit_action` and
  `poker_start_hand` enforce per-seat conservation in-RPC; `lib/games/poker/coinIntegrity.ts` +
  `poker_full_hand_conservation_test.sql` assert it. The only supply sources are faucets
  (signup grant + daily recovery).
- **Load-run check (pending):** during the `settlement` + soak profiles, assert
  `Σ(wallets + escrow)` changes only by the faucet amount. Wiring exists; run pending.

## 6. Bottlenecks fixed in this phase

1. Hand-history now reads the **most-recent** hands (bounded) instead of an arbitrary 500
   (`ecosystem.ts` + `poker_hole_cards_user_recent_idx`).
2. Lobby listing gets a **partial index over live tables** so its scan stays small as closed
   tables accumulate (`poker_tables_live_created_idx`).
3. "Recent tables" order-by served directly by `poker_members_user_recent_idx`.

All three are additive/idempotent (`migration_poker_perf_indexes.sql`) and HOT-compatible.

## 7. Remaining limits / risks

See bottlenecks.md §Remaining and capacity-model.md §Limits. Headline: **Supabase Realtime
`postgres_changes` fan-out** and **Vercel function concurrency** are the two ceilings to validate
before scaling past the soft-launch cap.
