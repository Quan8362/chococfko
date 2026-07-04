# Poker Bot 27C-B — Strategy Implementation & Unit Validation

Implements the strategy calibration planned by 27C-A ([`calibration-plan.md`](./calibration-plan.md),
[`27c-a-baseline.md`](./27c-a-baseline.md)). Bots remain **disabled** (`bot`/`tournament` hard-off;
`practiceBots` off). No production SQL, no migration, no deploy.

## 1. 27C-A findings used

- **Primary:** the skill bots were **passive preflop** — VPIP 15–18% but **PFR 0.4–2.3%** (they
  limped/called, almost never raised). This is the headline fix.
- **Narrow sizing** clustered at ½–⅔ pot — a widen/mix target.
- **Bottleneck:** Monte-Carlo `evaluateHand` dominates; the plan's cheapest-risk fixes are a cached
  deck + bounded/early-terminating sampling (correctness never traded for speed).
- **Multiway discipline** to verify against measured multiway showdown rates.
- **Practice bots see no action history** (`buildServerObservation` defaults `history=[]`).
- **Seed discipline:** tune on `calibration`, generalize-check on `validation`, never touch `holdout`.

## 2. Strategy & performance changes

New pure modules (all fairness-bounded — own cards + public facts only):

| Module | Role |
|---|---|
| `strategyConfig.ts` | **Versioned** (`bot-strategy-2026-07-v1`) per-difficulty ranges/thresholds/sizing + capability toggles + optional personalities |
| `context.ts` | Cached public-state classification: position (HU..6-max), effective stack, SPR, pot situation, preflop aggressor, facing-all-in |
| `board.ts` | Board texture (paired/monotone/two-tone/rainbow/connected/wetness) + made-hand/draw class (tier, pair kind, flush/straight draws, overcards) |
| `sizing.ts` | Integer, legal, **raise-TO**, clamped-to-`[min,max]` bet/raise sizing with safe fallbacks |
| `strategy.ts` | The thin interpreter: `decidePreflop` + `decidePostflop`, explainable line labels |

`policies.ts` `easy`/`normal`/`hard` now assemble the context + injected equity and call
`decideStrategy`; `simulation` is unchanged. `equity.ts` gained a cached base deck + optional
bounded early-stop (backward compatible; no-options behaviour is bit-for-bit legacy).

Behavioural result: **PFR raised from ~1% into a real raising band, tracking VPIP** (raise-first-in,
not limp-first-in), position-aware ranges, value/bluff 3-bets, BB defense, blind-vs-blind + heads-up
widening, short-stack push/fold, and postflop value/protection/c-bet/semi-bluff/bluff/raise/fold with
mixed sizing. Details in the per-topic docs.

## 3. Tests & exact commands

New focused suites (pure, deterministic): `board.test.ts`, `sizing.test.ts`, `strategyConfig.test.ts`,
`context.test.ts`, `preflop.test.ts`, `postflop.test.ts`, `strategy.test.ts`, `equityPerf.test.ts`.
They cover: hidden-information boundary (existing `fairness.test.ts`/`observation.test.ts` unchanged),
determinism by policy seed, legal actions + integer sizing, raise-to semantics, safe fallback/timeout,
no duplicate/stuck hand, no negative/fractional stack, practice-chip conservation, main/side/split
pots + uncalled refund (via the calibration soak + existing `pot`/`showdown` suites), short all-in +
reopening, difficulty & personality configuration, no wallet access, no tournament-bot path, and
flags-off.

```
npx tsc --noEmit --skipLibCheck        # clean
npm run test:poker:bots                # full bot suite (node --test)
npm run poker:bots:baseline -- --group calibration --seeds 4 --hands 150
npm run poker:bots:bench -- --decisions 2000
```

Result: **all bot tests pass** (130 in the bot suite; practice suite unaffected).

## 4. Simulations & seeds

All tuning used **calibration** seeds; generalization was checked on **validation** seeds. Commands
are the CLI `run` / `baseline` / `bench` above (bit-for-bit reproducible from `(config, seed)`).

**Passivity fix (the headline).** PFR moved from the 27C-A baseline (0.4–2.3%) into a real raising
band that tracks VPIP, and it **generalizes to validation seeds** (6-max self-play, 200 hands):

| | easy | normal | hard |
|---|---:|---:|---:|
| VPIP% (validation) | ~18 | ~11 | ~16 |
| PFR% (validation) | ~5.0 | ~9.0 | ~11.9 |
| conserved / defects | ✅ / 0 | ✅ / 0 | ✅ / 0 |

**Strength ordering (clean signal).** Measuring each skill bot against a **common fixed reference**
(the `simulation` random-legal bot) heads-up avoids the intransitivity/variance traps of noisy
skill-vs-skill duels. Over 3 seeds × 2000 hands the ordering is decisive and monotonic:

| Bot vs `simulation` (HU) | bb/100 (per seed) | mean |
|---|---|---:|
| `hard` | 780 / 692 / 737 | **~736** |
| `normal` | 640 / 652 / 649 | **~647** |
| `easy` | 574 / 556 / 588 | **~573** |

⇒ `hard > normal > easy > simulation`, with tight within-difficulty variance. Direct skill-vs-skill
HU duels (8 seeds × 1500 hands) put the pairwise edges *below* the noise floor (means ≈ 1, −2, 3
bb/100 with SEM ≈ 22–35) — the bots are close and HU variance is ±100+ bb/100 per session, so those
edges are for the 27C-C large-sample paired-CI gate to resolve, not this phase. The vs-reference
ordering above is the defensible 27C-B direction check.

**Integrity.** Every simulation run conserved coins exactly with **0** defects, **0** forced
fallbacks, integer non-negative stacks, and no stuck/duplicate hands — including a short-stack 6-max
soak that exercises layered side pots (`strategy.test.ts`). Seeded replay is bit-for-bit identical.

**Performance.** `hard` mean dropped 69.4 ms → 22.7 ms/decision vs 27C-A (cached deck + bounded early
stop + a disciplined 320→220 sample cap) — faster *and* stronger. See
[`performance-budget.md`](./performance-budget.md).

## 5. Holdout

The `holdout` seed group was **NOT used**. All tuning used `calibration`; generalization was checked
on `validation`. The CLI still refuses `baseline --group holdout`, and `seeds.test.ts` proves the
three groups are disjoint. The final holdout gate is 27C-C.

## 6. Files changed

New: `bot/strategyConfig.ts`, `bot/context.ts`, `bot/board.ts`, `bot/sizing.ts`, `bot/strategy.ts` +
their `.test.ts`, `bot/equityPerf.test.ts`, and `docs/poker/bots/{strategy-model,preflop-calibration,
postflop-calibration,bet-sizing,difficulty-definitions,performance-budget,27c-b-implementation}.md`.
Modified: `bot/policies.ts` (compose the strategy; `simulation` unchanged), `bot/equity.ts` (cached
deck + optional early stop), `bot/index.ts` (export new modules). No engine/practice/server/migration
change.

## 7. Migration & flag status

`migration_poker_practice_bots.sql` — applied to production (untouched). `migration_poker_tournament.sql`
— pending, **not** applied (untouched). Flags: `bot` hard-off, `tournament` hard-off, `practiceBots`
off. 27C-B enables nothing.

## 8. Limitations & risks

- Bounded sample sizes: winrate ordering is directional at these samples, not a proof — the
  statistically-final confirmation is 27C-C on holdout.
- Practice path uses a coarse historyless pot-situation fallback until the public history is wired
  through the practice runtime (fairness-neutral follow-up).
- Thresholds are heuristic (Chen-normalized preflop, Monte-Carlo postflop) — believable and ordered,
  **not** GTO.
