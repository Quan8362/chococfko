# Poker Bot Preflop Calibration (Prompt 27C-B)

The preflop range model. Configuration lives in
[`lib/games/poker/bot/strategyConfig.ts`](../../../lib/games/poker/bot/strategyConfig.ts)
(`PreflopRanges` per difficulty); the interpreter is `decidePreflop` in
[`strategy.ts`](../../../lib/games/poker/bot/strategy.ts); the derived public facts come from
[`context.ts`](../../../lib/games/poker/bot/context.ts). Tested by `preflop.test.ts` + `context.test.ts`.

## Not one universal range

Thresholds are **per position × pot situation**, not a single number. A threshold is the minimum
*normalized preflop strength* (`preflopStrength`, Chen-derived, `[0,1]`) required to take an action in
that exact cell. Lower threshold = wider = looser.

Reference points on the scale: `AA≈1.00, KK≈0.81, QQ≈0.71, AKs≈0.62, AQs≈0.57, AKo/TT≈0.52,
KQs≈0.52, 99≈0.48, 88≈0.43, ATs≈0.43, 22≈0.29, 72o≈0.00`.

## The cells the model covers

- **Player count / position** — heads-up (`btn`=SB, `bb`), and 3–6-max (`ep`, `mp`, `co`, `btn`,
  `sb`, `bb`), derived from clockwise distance to the button (`context.ts` `positionFor`).
- **Pot situation** — `unopened`, `limped`, `raised` (single open), `threebet_plus` (re-raised),
  read from the public action history (with a coarse bet-level fallback when history is absent — see
  the practice-path note below).
- **Stack depth** — short (push/fold zone), standard, deep, via `effectiveStackBb`.
- **Special cases** — big-blind defense (looser: the BB closes the action and has a price),
  blind-vs-blind (widen when folded to the blinds), heads-up (widen everything — every hand is a
  blind battle), facing an all-in (call/fold by strength + price), short-stack open-shove and
  re-shove, and multiway entry.

## Actions by situation

| Situation | Actions considered (in order) |
|---|---|
| Short stack (≤ `reshoveMaxBb` eff.) facing action | jam (reshove) → priced call → fold |
| Short stack (≤ `openShoveMaxBb`) unopened | open-shove strong → else normal open |
| Facing all-in | call by strength (+ price discount) → fold |
| Re-raised pot (3-bet+) | 4-bet value → flat-call → fold |
| Single-raise pot | 3-bet value → (bounded ace-blocker 3-bet **bluff**, hard/normal) → flat-call (BB wider) → fold |
| Unopened / limped | open-raise → (EASY only: over-limp a wide range) → check/fold |

## The 27C-A fix, measured

The passivity leak is closed: PFR moves from the 27C-A baseline (0.4–2.3%) into a real raising band,
and PFR now tracks VPIP (raise-first-in, not limp-first-in). Representative 6-max self-play
(calibration seed, 200 hands/seat):

| Difficulty | VPIP% | PFR% | 3-bet% |
|---|---:|---:|---:|
| 27C-A baseline `easy`/`normal`/`hard` | 15–18 | **0.4–2.3** | ~0 |
| 27C-B `easy` | ~19 | ~5 | 0 (no 3-bet capability) |
| 27C-B `normal` | ~10–18 | ~8–12 | low, non-zero |
| 27C-B `hard` | ~16–22 | ~11–15 | low, non-zero |

(6-max full-ring self-play is naturally tight; heads-up ranges are far wider via `headsUpWiden`. Exact
per-cell numbers reproduce from the calibration baseline command in the implementation report.)

## Difficulty differences (preflop)

- **easy** — ignores position (one non-blind range + a wider BB), **over-limps** a wide weak range
  (the classic beginner leak), **never 3-bets**, defends the BB a little wider. Bounded — it raises
  its genuinely strong hands (no more near-zero PFR) and never randomly jams.
- **normal** — position-aware, raise-or-fold first-in (no limping), value 3-bets, defends the BB by a
  calibrated pot-odds bonus, sensible short-stack push/fold.
- **hard** — tightest-but-widest-aware ranges, value 3-bets **plus** a bounded ace-blocker 3-bet
  bluff, the widest heads-up / blind-vs-blind adjustment, and reads public 3-bet/4-bet aggression.

## Practice-path note (historyless fallback)

The sim runner supplies the public action history, so calibration uses the exact pot-situation count.
The server practice path currently passes no accumulated history to `buildServerObservation`, so
`context.ts` falls back to a **coarse** inference from the bet level (`currentBet` vs the big blind:
at the BB ⇒ unopened; one raise level ⇒ raised; larger ⇒ 3-bet+). Wiring the accumulated public
history through the practice runtime is a fairness-neutral follow-up (it is public information); it is
**not** done in 27C-B to avoid changing the persisted practice-game shape. The strategy degrades
gracefully either way.
