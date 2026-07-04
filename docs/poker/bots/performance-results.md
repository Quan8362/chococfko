# Poker Bot Performance Results (Prompt 27C-C)

Decision latency, throughput, and bounded-computation proof for the frozen policies. Bots stay
**disabled**; this is measurement only. Prior budget: [`performance-budget.md`](./performance-budget.md).
Machine-readable: [`27c-c-results.json`](./27c-c-results.json) (`latencyUs`).

## 1. Decision latency (`decideSafely` path, µs/decision)

Measured by `bot/cli.ts bench` (the only layer allowed a clock), 4,000 decisions per difficulty over
a spread of seat counts (2–6) and streets (preflop→river), **isolated** (no competing load):

| Difficulty | mean | P50 | P95 | max |
|---|---:|---:|---:|---:|
| `simulation` | 2 µs | 1 µs | 3 µs | 224 µs |
| `easy` | 8.8 ms | 7.8 ms | 22.3 ms | 34.0 ms |
| `normal` | 16.9 ms | 14.3 ms | 40.5 ms | 69.5 ms |
| `hard` | 30.3 ms | 28.8 ms | 79.8 ms | **122.7 ms** |

- Latency scales with the Monte-Carlo equity sample cap (`easy` 80 / `normal` 140 / `hard` 220
  postflop; **0** preflop — Chen heuristic). The `evaluateHand` 7-card evaluator over the sampled
  runouts dominates, as identified in 27C-A/B. This bench probes a broad street/seat mix (including
  the expensive multi-opponent postflop node), so its mean sits above the amortized per-hand mean a
  real session shows (many hands fold cheaply preflop at 0 samples).
- **Worst case ≈ 123 ms** for a single `hard` decision. A live poker turn budget is measured in
  seconds, and the user-facing think-delay is a jittered **700–6000 ms** anyway
  (`policy.ts` `naturalActionDelayMs`), so even the max is invisible to a player and leaves ample head-
  room. No decision approaches an event-loop-blocking duration for a one-at-a-time practice table.

## 2. Throughput (session hands/second)

From the holdout runs (Node 24, single core per process):

| Shape | approx hands/s |
|---|---:|
| HU `hard` (100bb) | ~100 |
| HU `normal` | ~170 |
| HU `easy` | ~300 |
| 6-max (folds resolve most seats preflop) | ~1000+ |

Heads-up is the slowest because both seats reach more postflop equity nodes per hand; multiway is
faster because most seats fold preflop (0 samples). Total holdout volume of **664,800 hands** completed
across the parallel jobs in minutes.

## 3. Bounded computation (no unbounded work, no leak)

- **Equity sampling is hard-capped** per difficulty (`equitySamples`), and the bounded early-stop only
  ever *reduces* samples (never increases) — it changes variance, not the decision, and is
  deterministic given the rng (a seeded replay is bit-for-bit identical). Confirmed by
  `equityPerf.test.ts` and the bit-for-bit replay tests.
- **The hand driver has an action budget** (`seats × 200`) that guarantees termination; across 664,800
  holdout hands it fired **0 times** for the skill bots (the only place it can fire is a pathological
  all-mechanical-benchmark raise war — see [`exploitability-baseline.md`](./exploitability-baseline.md) §5).
- **No memory growth / no cross-table cache** — policies are pure functions of `(observation, rng)`
  with no module-level mutable state that accumulates; the base deck is a single hoisted constant
  (`equity.ts BASE_DECK`) filtered per call, not a per-table cache of private state. `isolation.test.ts`
  proves no Supabase/economy/tournament import anywhere in the layer.
- **No settlement / realtime regression** — the driver re-verifies every hand against the canonical
  `engine.playHand` (0 mismatches over 664,800 hands); the practice runtime and realtime paths are
  unchanged by 27C-B/27C-C (no engine/practice/server edit).

## 4. Verdict

Latency is bounded and small relative to the turn budget; throughput is ample; computation is
hard-bounded with no leak, no unbounded loop, no cross-table private-state cache, and no settlement or
realtime regression. **No performance blocker.**
