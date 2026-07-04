# Poker Bot Performance Baseline (Prompt 27C-A)

Measured with `npm run poker:bots:bench -- --decisions 3000` (the `decideSafely` path — the exact
safety-wrapped path production uses), on the audit machine (Windows, Node 20). Numbers are
per-decision latency in **microseconds**, over a spread of streets (preflop→river) and seat counts
(2–6). Absolute values are machine-relative; the **ratios** and the identified bottleneck are what
matter.

## Decision-time by policy

| Policy | Equity samples | mean (µs) | p50 (µs) | p95 (µs) | max (µs) |
|---|---:|---:|---:|---:|---:|
| `simulation` | 0 (no equity) | 2 | 1 | 2 | 222 |
| `easy` | 40 | 7,007 | 6,642 | 16,719 | 25,220 |
| `normal` | 120 | 22,564 | 23,127 | 50,507 | 111,168 |
| `hard` | 320 | 69,370 | 70,000 | 159,238 | 305,209 |

## The bottleneck: Monte-Carlo hand-equity

Latency scales **linearly with the Monte-Carlo sample count** (40 → 120 → 320 tracks
~7ms → ~22ms → ~69ms). Decomposition of a postflop decision:

```
estimateEquity(hole, board, opponents, samples, rng):
    for each of `samples`:
        draw (opponents*2 + boardNeed) cards from the unknown universe
        evaluateHand(hole, fullBoard)                     ← 7-card eval
        for each opponent: evaluateHand(oppHole, fullBoard) ← 7-card eval
```

Cost ≈ `samples × (opponents + 1) × cost(evaluateHand)`. Working back from the measurements, a
single `evaluateHand` call is on the order of **~60 µs** — that is the dominant term. `hard` at a
full 6-max table does `320 × 6 ≈ 1,920` evaluations **per decision**.

Contributing factors (all in `bot/equity.ts`):
- `evaluateHand` (`lib/games/poker/evaluator.ts`) is the hot function; it is called fresh for every
  sample with no memoization.
- `unknownCards()` rebuilds `makeDeck()` (52 cards) once per `estimateEquity` call — minor vs the
  eval loop, but avoidable.
- No early termination and no sample-count adaptation to pot size / street.

## Implications

- **Live practice play: not a problem.** One decision at a time; even `hard`'s p95 (~159 ms) and max
  (~305 ms) sit comfortably inside a normal action window, and the server think-delay
  (400–5000 ms) dominates anyway.
- **Large simulation: this is the throughput ceiling.** A `hard` 6-max session spends essentially
  all its wall-clock inside `evaluateHand`. This is why the baseline matrix uses **bounded** hand
  counts for `hard` (recorded in `27c-a-baseline.md`).

## Bounded improvements proposed for 27C-B (NOT done here)

Do **not** trade correctness for speed. Candidates, cheapest-risk first:

1. **Faster 7-card evaluator.** Replacing/optimizing `evaluateHand` speeds up *every* equity-based
   policy proportionally — the single highest-leverage change. Must be validated bit-for-bit against
   the current evaluator on an exhaustive/large fuzz set before adoption.
2. **Hoist `makeDeck()`** out of the per-call path (build the unknown universe from a cached full
   deck). Small, safe.
3. **Adaptive / early-terminating sampling.** Stop sampling once the equity confidence interval is
   tight enough for the decision at hand (bounded max samples). Changes variance, not the decision
   rule — measure on `calibration` seeds.
4. **Cache within a decision.** The board is fixed within one `estimateEquity` call; opponent-hand
   evaluations dominate and cannot be cached across samples, but the hero's board-dependent
   sub-evaluation can be partially reused.

## Resource notes

- **Memory:** the sampler works in a single reused `work` array (`pool.slice()` once per
  `estimateEquity`); no per-sample allocation growth. No leak observed across the 25k-hand practice
  soak or the baseline runs.
- **Event-loop blocking:** the pure decision is synchronous. In the server (practice) path each bot
  acts once per request and yields; there is no long synchronous batch on a request thread. A future
  live-cash bot fleet would need to consider this, but that path is hard-off.
- **Timeouts / fallbacks:** `decideSafely` cannot itself time out (it is synchronous); a throwing or
  illegal policy degrades to a safe fold/check. Skill policies force **0** fallbacks in the baseline.
