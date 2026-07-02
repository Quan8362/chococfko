# Poker — Capacity Model

A **derived** model (not a live target-scale measurement — see load-test-plan.md §9). It combines:
measured engine CPU (results.md §1), the measured command/realtime budget from `preflight`, the
verified concurrency structure (bottlenecks.md), and documented Supabase/Vercel limits. Use it to
set a safe soft-launch cap and to know which quota to watch as usage grows.

---

## 1. Workload arithmetic (target = 100 tables / 600 seated)

Assumptions (tunable in `scripts/poker-load/config.ts`): 6 players/table, ~30 s/hand, human think
time 0.5–2.0 s, ~5 engine transitions (streets + settlement) per hand.

| Quantity | Estimate | Basis |
|---|---|---|
| Hands completing system-wide | ~3–4 / s | 100 tables ÷ 30 s/hand |
| Player actions | **steady ~220/s, peak ~480/s** | preflight model (half of seats idle/folded) |
| Engine CPU per action | ≪ 0.24 ms | measured (a transition is a fraction of a full hand) |
| **Total engine CPU** | **< 2 ms per wall-second** | actions × per-action CPU |
| Realtime messages | **~7,000 / s** | ~4 row-changes/action × (players+spectators) fan-out |
| DB writes | ~1k–2k rows/s | seats+hands+tables+actions per action, batched per RPC |
| Authenticated reads | ~hundreds/s | snapshots + lobby(100 viewers) + history(30) |

**Governing term:** not CPU, not raw DB writes — it's **realtime fan-out** and **serverless
concurrency**. Everything else has large headroom.

## 2. Resource model per tier

| Tier | Tables | Seated | Engine CPU | Realtime msgs/s | Action RPS (peak) | Confidence |
|---|---|---|---|---|---|---|
| soft-launch | 10 | 60 | ~0.2 ms/s | ~700 | ~50 | **high** (baseline profile) |
| moderate | 30 | 180 | ~0.6 ms/s | ~2,100 | ~150 | medium |
| target | 100 | 600 | ~2 ms/s | ~7,000 | ~480 | **derived — verify** |
| stretch | 200 | 1,200 | ~4 ms/s | ~14,000 | ~960 | needs fan-out redesign (W1/W4) |

Engine CPU stays trivial across all tiers — confirming the scaling limit is I/O/fan-out, not
compute. The stretch tier is **not** advisable on `postgres_changes` fan-out without the Broadcast
redesign (bottlenecks.md W1) and the version-bump collapse (W4).

## 3. Performance budgets (targets — verify on branch)

| Metric | Target | Rationale |
|---|---|---|
| Action P50 | < 150 ms | one RPC round-trip in-region + engine ≪ 1 ms |
| Action P95 | < 400 ms | includes retry/CAS re-read tail |
| Action P99 | < 800 ms | cold-start / contention tail |
| Snapshot P95 | < 250 ms | indexed reads, small rows |
| Settlement P95 | < 600 ms | multi-row payout + conservation checks |
| Lobby P95 | < 400 ms | partial-index scan + one batched seats read |
| Reconnect (snapshot-after) P95 | < 700 ms | resubscribe + authoritative re-read |
| Error rate | < 0.5% | excludes intended CAS "stale" no-ops |
| Sequence-gap rate (applied) | 0 | `state_version` monotonic; gaps trigger re-read, never mis-apply |
| Hand-completion rate | > 99% | remainder → `PAUSED_FOR_REVIEW`, never a wrong payout |

"Stale"/idempotent RPC responses are **correct** outcomes (a duplicate or refreshed command),
counted as retries, not errors.

## 4. Scaling levers (in preference order, all correctness-preserving)

1. **Region colocation** — app functions in the same region as the Supabase project (removes
   per-RPC cross-region RTT; biggest single latency win).
2. **Connection pooler** — transaction-mode PgBouncer for app connections (protects DB under
   serverless fan-out).
3. **Realtime payload shrink** — clients already re-read state on any signal, so notifications can
   become a single compact "changed" event per action (Broadcast) instead of N `postgres_changes`
   rows. Cuts fan-out several-fold (bottlenecks.md W1).
4. **Single version bump per action** (W4) — halves the hottest-row write + its realtime delta.
5. **Read caching for lobby** — short-TTL cache / `state_version`-keyed conditional fetch for the
   lobby list under heavy `lobby` load.
6. **Compute upgrade** — larger Supabase compute raises the Realtime + connection ceilings if the
   above levers are exhausted.

## 5. Known limits

- **Realtime `postgres_changes` throughput** is the first ceiling; the exact number is
  plan/compute-dependent and **must be measured** on a branch at `moderate`→`target`.
- **Vercel function concurrency** caps simultaneous in-flight actions; p99 includes cold starts.
- **DB connection count** under serverless bursts — mitigated by the pooler.
- **Model confidence:** soft-launch tier is backed by a runnable baseline profile; the target tier
  is arithmetic + documented limits and is the explicit gate for the live run.

## 6. Recommended initial cap

**Updated with Prompt 23B measured evidence** (local Supabase run — reports/poker-load-validation-2026-07-02.md):

- DB write path measured at **~2,000 actions/s** (c=30, 0 failures) and engine CPU is negligible —
  both have large headroom.
- The **binding ceiling is Realtime source-event rate**: measured tenant `max_events_per_second = 100`
  ⇒ ~33 actions/s at ~3 events/action. Clean realtime delivery + full privacy verified at **20 tables /
  120 subscribers**; **180 subscribers tripped the event-rate limit** and delivery collapsed.

**Recommendation: soft-launch at ≤ 20 concurrent tables (~120 players)**, contingent on (a) confirming
the *hosted* Supabase realtime `max_events_per_second` for the plan in use, and ideally (b) applying the
W4 realtime reduction (3→2 events/action, +50% headroom; bottlenecks.md). **Do not claim the 100-table /
600-player target** — it was not executed and is gated on the realtime event-rate limit plus a
browser-fleet + Vercel-concurrency run.
