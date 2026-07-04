# Poker Bot Calibration Plan (for Prompt 27C-B / 27C-C)

Scope note: this plan is produced by the **27C-A audit**. Prompt 27C-A performs **no** strategy
tuning. The plan below is the design that 27C-B should follow.

## Objective

Calibrate the `easy` / `normal` / `hard` policies to a **defensible strength ordering** and a
believable style, **without** weakening rules, settlement, information isolation, or the
authoritative action path. `simulation` stays a test-only uniform-random policy and is **not**
calibrated.

## Benchmark matrix (`BENCHMARK_MATRIX` in `seeds.ts`)

| Axis | Values |
|---|---|
| Player count | heads-up, 3, 4, 5, 6-max |
| Stack (big blinds) | short = 20 bb, standard = 100 bb, deep = 250 bb |
| Environment | self-play per difficulty, mixed table (`hard/normal/normal/easy/easy/simulation`) |

**Opponent archetypes NOT yet in the repo:** passive / aggressive / tight / loose *fixed* policies
do **not** exist today (only `simulation`, `easy`, `normal`, `hard`). Adding them as small,
pure, **non-adaptive** reference policies is a proposed **bounded** 27C-B deliverable so strength can
be measured against known styles, not only against the tunable policies themselves. `simulation`
already serves as the random-legal reference.

## Metric of record

- **Winrate:** `netBbPer100` (big blinds won per 100 hands) per difficulty, from `sim.ts`.
- **Style:** VPIP / PFR / 3-bet / action-mix / sizing / showdown from `bot/metrics.ts`.
- **Acceptance direction (to be finalized in 27C-B):** across the matrix, expected ordering is
  `hard ≥ normal ≥ easy ≥ simulation` in `netBbPer100` at a meaningful sample, with each policy's
  style within a documented sane band (e.g. no policy folding or shoving pathologically).

## Sampling

- **Tuning** runs use the `calibration` seed group only.
- **Generalization** checks use `validation`.
- **Final gate** (27C-C) uses `holdout` **once**.
- Sample size per cell is bounded in the audit (a few seeds × a few hundred hands). 27C-B should
  raise this to a statistically meaningful size (paired seeds, confidence intervals — mirror the
  TLMN `sim` paired-CI approach) **before** claiming a strength ordering.

## Guardrails during calibration

Any tuning change must keep **all** of the following green (they are the acceptance invariants,
not optional):

- coin conservation exact (per-hand + global);
- 0 engine cross-check defects;
- 0 illegal actions reaching the engine (0 forced fallbacks for skill policies);
- integer, non-negative stacks;
- the fairness boundary tests (`fairness.test.ts`, `isolation.test.ts`, practice CASE 1–5) unchanged
  and passing;
- feature flags remain OFF.

## Proposed strategy work for 27C-B (from the baseline — see `27c-a-baseline.md`)

1. **Performance first (enables everything):** the Monte-Carlo equity evaluator is the bottleneck
   (see `performance-baseline.md`). A faster 7-card evaluator or a bounded/early-terminating sampler
   lets `hard` use more samples per unit CPU — improving strength *and* throughput without changing
   the decision rule. **Correctness must not be traded for speed.**
2. **Preflop ranges:** replace the coarse Chen-style `preflopStrength` thresholds with calibrated
   open/defend ranges per position & player count.
3. **Bet sizing:** the baseline sizing distribution is narrow; widen and calibrate value/bluff
   sizings (still integer, still clamped to legal bounds).
4. **Multiway discipline:** verify the multiway tightening (`valueBar`, `continueBar`) against the
   measured multiway showdown win-rates.
5. **Give practice bots the public action history:** `buildServerObservation` currently defaults
   `history = []`, so practice bots ignore betting-line context that the sim runner provides. Wiring
   the accumulated public history through is a *fairness-neutral* strength improvement (it is public
   information a human sees).
