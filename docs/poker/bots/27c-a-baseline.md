# Poker Bot Baseline (Prompt 27C-A)

**Purpose:** establish a trustworthy, reproducible baseline of the **existing** bot policies before
any strategy calibration (27C-B). This phase does **no** strategy tuning. Bots stay **disabled**
(`POKER_BOT_ENABLED` hard-off, `POKER_PRACTICE_BOTS_ENABLED` off).

Related: [`fairness-audit.md`](./fairness-audit.md) · [`performance-baseline.md`](./performance-baseline.md)
· [`seed-strategy.md`](./seed-strategy.md) · [`calibration-plan.md`](./calibration-plan.md) ·
machine-readable summary: [`baseline-27c-a.json`](./baseline-27c-a.json).

## Architecture inspected

- **Boundary:** `lib/games/poker/bot/observation.ts` (`BotObservation`, `FORBIDDEN_OBSERVATION_KEYS`,
  `assertObservationClean`).
- **Equity:** `bot/equity.ts` (Monte-Carlo over the unknown universe; Chen-style preflop).
- **Policies:** `bot/policies.ts` (`simulation`, `easy`, `normal`, `hard`) + `bot/policy.ts`
  (`decideSafely`, safe fallback, idempotency key, natural delay).
- **Drivers:** `bot/runner.ts` (pure hand driver + engine cross-check), `bot/sim.ts` (session /
  conservation harness).
- **Server-wired practice:** `lib/games/poker/practice/*` (`runtime.ts` shared authoritative core,
  `observation.ts` server observation builder, `economy.ts` isolated chips, `worker.ts` timing/
  eligibility, `view.ts` client projection) + `app/games/poker/practice-actions.ts` (`'use server'`,
  version CAS).
- **Admin / config:** `bot/admin.ts`, `practice/adminMetrics.ts`, `app/admin/poker/practice/page.tsx`.
- **Flags:** `lib/games/poker/flags.ts` (`bot`/`tournament` hard-off; `practiceBots` env, default off).

Data flow (authoritative): see [`fairness-audit.md`](./fairness-audit.md) §1.

## What was added for measurement (instrumentation, not strategy)

- `bot/metrics.ts` — pure per-difficulty behavioural metrics from **public** action history.
- `bot/seeds.ts` — disjoint calibration / validation / holdout seed groups + benchmark matrix.
- `bot/baseline.ts` + CLI `baseline` / `bench` — reproducible baseline + decision-time percentiles.
- `runner.ts` now returns the public `history` (additive); `sim.ts` report gained a `metrics` field
  (additive — a seeded replay is still bit-for-bit identical).

Run it: `npm run poker:bots:baseline -- --group calibration --seeds 4 --hands 200` and
`npm run poker:bots:bench -- --decisions 3000`.

## Metric definitions (read the caveats)

- **VPIP** — % of hands dealt-in where the seat voluntarily put chips in **preflop** (call/bet/raise/
  all-in; a blind check is not VPIP).
- **PFR** — % of hands with a preflop bet/raise/all-in.
- **3bet** — % of hands with a preflop **re-**raise (the 2nd+ aggressive preflop action in the hand;
  the big blind is the "1-bet", the first raise a "2-bet").
- **AI%** — % of hands with ≥1 all-in action. **SD%** — % of hands that reached showdown.
- **SDwin%** — of showdowns reached, % finished with a **positive** net chip delta. Coarse: a chopped
  pot with a net-positive delta counts as a win; use as a signal, not a precise equity.
- **topAct** — the single most-frequent action's share of all decisions (crude repetitiveness).
- **sizing** — aggressive-action size vs the pot **before** the action, reconstructed by walking the
  hand from posted blinds (approximate).

> These are a **behavioural fingerprint**, not a strength proof. Winrate is `netBbPer100` from
> `sim.ts`; do **not** read a strength ordering out of style metrics alone, nor out of the audit's
> bounded sample sizes.

## Distortions / caveats in these baseline numbers

- **Auto-rebuy** (sim default) tops busted seats back to the starting stack — winrate uses TRUE P&L
  (independent of rebuy), but showdown/all-in *frequencies* reflect a rebuy world, not a bust-out one.
- **Bounded samples** — the audit uses a few seeds × tens–hundreds of hands per cell (heavy `hard`
  Monte-Carlo caps the hand count). VPIP/PFR stabilize quickly; `netBbPer100` and SDwin% do **not**
  at this sample size and are **not** reported as strength here.
- **Self-play** — homogeneous tables measure a policy against copies of itself; style differs vs a
  mixed field.
- **Practice bots see no action history** — `buildServerObservation` defaults `history=[]`, so the
  server (practice) path fingerprint can differ slightly from the sim runner (which passes history).

## Baseline — behaviour by policy

Source: `calibration` seeds `[3618026224, 1055847308]`. Light policies (sim/easy/normal) = broad
matrix (HU-std, HU-short, 4max-std, 6max-std, 6max-short) × 2 seeds × 80 hands; `hard` = {HU, 4max,
6max}-standard × 2 seeds × 40 hands (Monte-Carlo cost — see caveats). Full JSON:
[`baseline-27c-a.json`](./baseline-27c-a.json).

| Policy | hands | VPIP% | PFR% | 3bet% | AI% | SD% | SDwin% | fold | check | call | bet | raise | all-in | topAct |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `simulation` | 3200 | 64.8 | 34.3 | 13.5 | 21.6 | 52.8 | 39.9 | .32 | .02 | .34 | .01 | .13 | .17 | .34 |
| `easy` | 3200 | 18.3 | 0.8 | 0.0 | 0.8 | 16.3 | 41.8 | .39 | .30 | .19 | .09 | .03 | .01 | .39 |
| `normal` | 3200 | 15.1 | 0.4 | 0.0 | 0.5 | 19.2 | 45.0 | .38 | .31 | .18 | .11 | .02 | .00 | .38 |
| `hard` | 960 | 16.8 | 2.3 | 0.0 | 1.9 | 17.2 | 46.1 | .40 | .26 | .18 | .11 | .04 | .01 | .40 |

**Reading it:**
- `simulation` is uniform-random-legal: it enters ~65% of pots, shoves 22% of hands, and its sizing
  is mostly `>2×pot` (83% of bets) — exactly the chaotic engine-fuzzer it is meant to be. It is a
  reference/stress policy, **not** a skill policy.
- `easy`/`normal`/`hard` are **passive preflop**: VPIP 15–18% but **PFR 0.4–2.3%** — they almost
  never raise preflop, they limp/call. This is the single clearest calibration target for 27C-B
  (real tight-aggressive PFR is ~15–25%). The near-zero 3-bet follows directly.
- Aggressive sizing clusters around ½–⅔ pot for the skill policies (`easy`/`normal`/`hard`), with a
  secondary 1–2× pot mode — narrow, and a widen/mix target for 27C-B.
- SDwin% sits at 40–46% (self-play, multiway — winning among N seats is naturally sub-50%; coarse
  metric). **Not** a strength ordering.

## Baseline — integrity by scenario (player count × stack)

Coverage shown for the `simulation` environment (the harshest engine fuzzer — random legal lines
maximize all-ins and layered side pots); 2 seeds × 80 hands each. **Every** environment (incl.
easy/normal/hard) at every scenario conserved with 0 defects.

| Scenario | seats | stack | hands | showdowns | side-pot hands | all-in hands | conserved | defects |
|---|---:|---:|---:|---:|---:|---:|:--:|:--:|
| hu-standard | 2 | standard | 160 | 62 | 0 | 84 | ✅ | 0 |
| hu-short | 2 | short | 160 | 62 | 0 | 82 | ✅ | 0 |
| 4max-standard | 4 | standard | 160 | 135 | 72 | 121 | ✅ | 0 |
| 6max-standard | 6 | standard | 160 | 154 | 117 | 128 | ✅ | 0 |
| 6max-short | 6 | short | 160 | 154 | 113 | 129 | ✅ | 0 |

Heads-up produces **0** side pots (correct — no side pot exists in a 2-player all-in); 4- and 6-max
produce heavy multi-way side pots (72–117 per 160 hands), so **layered side-pot construction +
settlement is exercised and conserves**. `hard` 6-max also produced side-pot hands at its smaller
sample. **Multiple all-ins, main pot + multiple side pots, and short all-ins are all covered.**
Split pots and uncalled-bet refunds are covered by the pre-existing `pot.test.ts` / `showdown.test.ts`
unit suites and the practice CASE 23–26 settlement tests.

## Integrity summary

Across **36 runs / 2,640 hands** (both calibration seeds, all environments):

| Invariant | Result |
|---|---|
| Coin conservation (per-hand + global) | **OK** (0 violations) |
| Engine cross-check defects | **0** |
| Forced safe-fallbacks (skill policies) | **0** |
| Illegal actions reaching the engine | **0** |
| Negative stacks | **0** |
| Fractional (non-integer) stacks | **0** |
| Stuck / non-terminating hands | **0** |

Plus the pre-existing 25,000-hand practice soak and the bot engine cross-check suite: **0 defects,
exact conservation** (unchanged by this phase).

## Decision-time

See [`performance-baseline.md`](./performance-baseline.md). Summary: latency scales linearly with the
Monte-Carlo sample count — `simulation` ~1 µs, `easy` ~7 ms, `normal` ~23 ms, `hard` ~69 ms mean per
decision. The `evaluateHand` 7-card evaluator is the dominant cost and the primary 27C-B target.

## Acceptance

- No hidden-information violation (source + tests). ✅
- No direct bot game-state mutation. ✅
- No illegal action reaches the engine (safe fallback + engine validation). ✅
- Coin conservation exact; no stuck hands; integer, non-negative stacks. ✅
- Baseline reproducible; calibration/validation/holdout seeds separated. ✅
- Performance bottleneck identified. ✅
- Feature flags remain disabled. ✅

**Decision: READY FOR PROMPT 27C-B STRATEGY CALIBRATION.**
