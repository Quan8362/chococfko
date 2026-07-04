# Poker Bot Difficulty Definitions (Prompt 27C-B)

Difficulty is defined by BOTH the config thresholds AND the capability toggles in
[`strategyConfig.ts`](../../../lib/games/poker/bot/strategyConfig.ts) (`Capabilities`). Two difficulties
run the *same* decision code (`strategy.ts`); the config makes them play differently. `simulation` is
not a skill difficulty — it is the untouched uniform-random engine fuzzer.

## Capability matrix

| Capability | easy | normal | hard |
|---|:--:|:--:|:--:|
| `usesPosition` (position-aware preflop ranges) | ✗ | ✓ | ✓ |
| `usesEquityPostflop` (Monte-Carlo equity) | ✓ (low) | ✓ | ✓ (high) |
| `threeBets` (re-raise preflop for value) | ✗ | ✓ | ✓ |
| `semiBluffs` (bet/raise a draw) | ✗ | ✓ | ✓ |
| `bluffs` (pure bluff with air) | ✗ | ✓ | ✓ |
| `protects` (protection-bet a vulnerable made hand) | ✗ | ✓ | ✓ |
| `mixesSizing` (vary bet size) | ✗ | ✓ | ✓ |
| `readsAction` (tighten vs observed aggression) | ✗ | ✗ | ✓ |
| Equity sample budget (postflop) | 80 | 140 | 220 |

## EASY — loose-passive beginner (bounded weaknesses)

Basic ranges, hand strength, and pot odds with only **limited** position awareness (one non-blind
range + a wider big blind). Raises its genuinely strong hands preflop — **fixing the 27C-A passivity
leak** — but over-limps and over-calls a wide, weak range, never 3-bets, never bluffs, value-bets only.
Its weaknesses are real but **bounded**: no chip-dumping, no excessive random all-ins (it only jams in
the short-stack push/fold zone with a genuine range).

## NORMAL — solid tight-aggressive

Uses position, equity vs pot odds, stack depth, stack-to-pot ratio, and board texture. Value-bets,
value-3-bets, semi-bluffs and positional-bluffs at capped frequencies, c-bets as the aggressor,
protection-bets vulnerable hands on wet boards, folds appropriately, and uses multiple legal sizes. A
straightforward reg — clearly stronger than easy, no pretension to solve.

## HARD — strongest approved legal-information strategy

Everything normal does, calibrated tighter-and-more-aggressive, plus: better-bounded equity (largest
sample budget), public-action reading, wider heads-up / blind-vs-blind adjustment, bounded
ace-blocker 3-bet bluffs, draw-based semi-bluffs, texture-aware c-bet/protection sizing, varied
(mixed) sizing that is harder to read, and the strictest river discipline (folds medium hands to big
rivers). Explainable and bounded. **Not GTO** — less exploitable than normal, not solved.

## Strength ordering (acceptance direction)

The design target is `hard ≥ normal ≥ easy ≥ simulation` in `netBbPer100`. Measured via head-to-head
heads-up duels and mixed tables on the calibration/validation seeds (see
[`27c-b-implementation.md`](./27c-b-implementation.md)). `simulation` (random) loses heavily to every
skill bot; among skill bots the ordering holds within the noise of the sample sizes used. A final,
larger-sample paired-CI confirmation on the **holdout** seeds is the 27C-C gate — 27C-B does **not**
touch holdout.

## Personalities (optional, separate axis)

An optional, bounded **style** overlay (`Personality`: `balanced`/`aggressive`/`passive`/`tight`/
`loose`), applied on top of a difficulty. It nudges entry/aggression/bluff/sizing within
`PERSONALITY_BOUNDS` but **never widens a capability** — an `aggressive` easy bot still cannot 3-bet
(`strategy.test.ts` proves it). `balanced` is the neutral default. Personalities are **not exposed
publicly** (no flag, no UI) — an internal knob for field variety in simulation. Difficulty and
personality are orthogonal.
