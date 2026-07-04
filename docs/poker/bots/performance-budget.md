# Poker Bot Performance Budget (Prompt 27C-B)

The 27C-A baseline identified the Monte-Carlo hand-equity evaluator as the bottleneck (`evaluateHand`
~60 µs, called `samples × (opponents+1)` times per postflop decision — see
[`performance-baseline.md`](./performance-baseline.md)). 27C-B applies **only** the verified,
correctness-preserving fixes from that plan.

## Fixes applied (in [`equity.ts`](../../../lib/games/poker/bot/equity.ts))

1. **Hoist `makeDeck()` out of the hot path.** The 52-card base deck is a constant, built once
   (`BASE_DECK`) and filtered per call instead of rebuilt every `estimateEquity`. **Numerically
   identical** (same order, same filter) — a pure CPU win. `equity.test.ts` still passes unchanged.
2. **Bounded early-stopping.** `estimateEquity` gained an optional `EquityOptions` param. When
   `earlyStop` is on, the sampler stops once the 95% confidence half-width of the running equity mean
   drops below `ciTarget` (default 0.02), but **never before** `minSamples` (default 24) and **never
   after** the requested `samples` cap. This changes **variance, not the decision rule**, and is fully
   deterministic given the rng (same seed ⇒ same stop point) — so seeded replays stay bit-for-bit
   identical (`equityPerf.test.ts`). The skill policies opt in; `hard`/`normal`/`easy` cap samples at
   220 / 140 / 80.

## Bounded by design (no unbounded work)

- **Bounded equity iterations** — every equity call has a hard sample cap (per difficulty), and the
  early stop only lowers it.
- **Cached public-state classification** — `derivePublicContext` and `classifyBoard`/`classifyHand`
  run once per decision and are reused across branches (no re-walking the seat list or re-deriving
  texture per branch).
- **Reduced redundant calculation** — preflop uses the cheap Chen `preflopStrength` (no Monte-Carlo at
  all); postflop the board is fixed within a decision so the unknown universe is built once.
- **Safe early stopping** — floor + cap + CI target, never below a statistically meaningful floor.
- **Safe timeout fallback** — `decideSafely` is synchronous and cannot itself time out; a throwing or
  illegal policy degrades to a legal check/fold. Skill policies force **0** fallbacks in calibration.

## What is NOT cached (fairness / correctness)

- **No private opponent information is ever cached** — the sampler draws opponents' hands fresh from
  the unknown universe each sample; nothing hidden is memoized.
- **No validation is bypassed** — the authoritative engine still validates every action. Performance
  is never traded for correctness, fairness, or privacy.

## Live-play headroom

As in 27C-A: one decision at a time comfortably fits a normal action window (even `hard`'s cap), and
the server think-delay (400–5000 ms) dominates. The sample caps + early stop *lower* per-decision cost
versus an un-capped estimator, so the live-play budget only improves.

## Measured (bench)

`npm run poker:bots:bench -- --decisions 2000` on the audit machine (Windows, Node 24), `decideSafely`
path, µs per decision:

| Policy | samples (cap) | mean (µs) | p50 (µs) | p95 (µs) | max (µs) | 27C-A mean |
|---|---:|---:|---:|---:|---:|---:|
| `simulation` | 0 | 1 | 1 | 2 | 177 | 2 |
| `easy` | 80 | 8,197 | 7,484 | 21,105 | 29,769 | 7,007 (40 s.) |
| `normal` | 140 | 17,086 | 14,581 | 41,374 | 117,960 | 22,564 (120 s.) |
| `hard` | 220 | 22,658 | 19,468 | 56,217 | 74,412 | 69,370 (320 s.) |

**`hard` is ~3× faster than the 27C-A baseline** (69.4 ms → 22.7 ms mean) while playing *stronger* —
the disciplined sample cap (320 → 220) plus the bounded early stop and cached deck more than pay for
the richer decision logic. `normal` is also faster despite +20 samples. Every policy's p95/max sits
well inside a live action window (and far inside the 400–5000 ms server think-delay). `easy` rises
vs 27C-A only because its sample budget doubled (40 → 80) for a steadier estimate; still ~8 ms.

