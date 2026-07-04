# Poker Bot Calibration & Validation Methodology (Prompt 27C-C)

How the calibrated bots are evaluated, and why the method is trustworthy. This is the **fixed
protocol**; the numbers it produces live in [`calibration-results.md`](./calibration-results.md),
[`performance-results.md`](./performance-results.md),
[`exploitability-baseline.md`](./exploitability-baseline.md), and the machine-readable
[`27c-c-validation.md`](./27c-c-validation.md). Bots stay **disabled** throughout (`bot`/`tournament`
hard-off, `practiceBots` off); nothing here enables a seat or runs production SQL.

Prior phases: [`27c-a-baseline.md`](./27c-a-baseline.md) (baseline of the *existing* policies),
[`27c-b-implementation.md`](./27c-b-implementation.md) (the strategy calibration under test here).

## 1. Freeze discipline (no tuning on the number you are judged on)

The whole point of the seed split (`bot/seeds.ts`, [`seed-strategy.md`](./seed-strategy.md)) is that
the strategy is judged on seeds it was never tuned against:

- **calibration** (24 seeds) — the ONLY seeds 27C-B tuned against.
- **validation** (16 seeds) — used by 27C-B to check a tuning generalizes; used here only for harness
  smoke-tests, never to change strategy.
- **holdout** (16 seeds) — reserved for THIS gate. Opened exactly once, with a frozen strategy.

The three groups are disjoint by construction (`assertSeedGroupsDisjoint`, proven in
`seeds.test.ts`). The CLI refuses `baseline`/`validate` on the holdout group unless
`--confirm-holdout-final` is passed, so the reserved seeds cannot be touched casually.

**Freeze rule (followed here):** the strategy config (`strategyConfig.ts`,
`STRATEGY_VERSION = bot-strategy-2026-07-v1`) and all policy/engine code are frozen BEFORE the holdout
is opened, and are **not** edited afterward. If a blocking defect had required a code change, every
holdout result computed before the change would have been invalidated and re-run on a fresh unused
sevenset — the holdout is single-use.

## 2. What is measured, and against what

The skill bots (`easy`/`normal`/`hard`) are measured against a suite of **fixed benchmark opponents**
(`bot/benchmarks.ts`) — the classic exploitable archetypes:

| Benchmark | Behaviour | What it probes |
|---|---|---|
| `random` | uniform over the legal set (= the `simulation` policy) | a common, transitive reference for the strength ordering |
| `always_call` | never folds, never raises (calling station) | thin value-betting; must NOT bluff a station |
| `passive` | check-call, folds to bets > ~⅔ pot | value + fold-equity balance |
| `aggressive` | bet/raise at every opportunity (maniac) | discipline vs over-aggression (call down / trap, don't spew) |
| `min_raise` | always the minimum legal raise/bet | engine reopening rules + response to a one-size pattern |
| `tight` | continues only with strong OWN hands, else folds; passive | punishing over-folding (steals, relentless small bets) |
| `loose` | calls very wide, passive | value-betting a wide, weak continuing range |

Measuring every skill bot against a **common fixed reference** (rather than only skill-vs-skill
self-play) avoids the intransitivity and huge-variance traps of noisy mirror matches — the same
reason 27C-B used the `simulation` bot as the yardstick. The benchmarks are `BotPolicy` values, so
they see ONLY a `BotObservation` (own cards + public facts); they are evaluation-only and are never
exported to the app or seated in production.

## 3. Harness (authoritative, deterministic)

`bot/evaluate.ts` seats one bot-under-test (seat 0) plus benchmark copies, and plays full seeded
sessions with `playBotHand` — the SAME interactive driver the sim uses, which for **every hand**:

1. builds each decision from the fairness-bounded `BotObservation`,
2. runs the policy through `decideSafely` (re-validates legality; illegal/throw ⇒ safe fold),
3. applies actions through the authoritative `applyAction`,
4. re-runs the recorded action log through the canonical scripted `engine.playHand` and asserts an
   **identical board + settlement** (any divergence = a `canonicalMismatch` defect),
5. asserts per-hand coin conservation.

Sessions carry stacks across hands, rotate the button (`nextButton`), and auto-rebuy busted seats as
a **tracked faucet** (conservation stays exact; the winrate uses TRUE per-hand P&L, which is
rebuy-independent). Given `(seats, config, seed)` a session is **bit-for-bit reproducible** — the
policy rng is the session rng, and the deck seed is derived per hand and never exposed to a policy.

## 4. Metrics

Per difficulty × player count × stack, from **public** action history only (`bot/metrics.ts` — reads
no cards): hands, VPIP, PFR, 3-bet, per-action frequencies (fold/check/call/bet/raise/all-in),
all-in %, showdown % and (coarse) showdown-win %, a bet-sizing distribution, `topActionShare`
(repetition), and an action-mix diversity. Winrate is **bb/100 of the bot-under-test**, computed
**per seed** (each seed is one independent session mean) so the spread across seeds gives an honest
uncertainty.

## 5. Winrate uncertainty (cross-seed CI)

For each matchup the per-seed bb/100 values (k = 16 on holdout) yield mean, sample SD, SEM, and a
two-sided **95% t-confidence interval** (`winrateStats`, small-sample t critical values, df = k−1).
A matchup "beats" a benchmark only when the **entire CI is above 0**. Heads-up bb/100 variance is
large per session, so the CI — not a point estimate — is the claim. The difficulty ordering is read
off the **common `random` reference** (hard ≥ normal ≥ easy, each with its CI).

## 6. Difficulty validation, exploitability, performance, fairness, soak

- **Difficulty** — Easy beginner-suitable (loose-passive, bounded, no chip-dumping); Normal measurably
  distinct from Easy; Hard distinct from Normal; higher difficulty is not merely more aggression /
  all-ins (checked against the metric fingerprint + the vs-reference winrate, using fixed benchmarks
  not only self-play).
- **Exploitability & naturalness** — screened for calling every small bet, folding every river, one
  fixed size / min-raise only, over-folding or over-defending blinds, over-shoving, and fold-only /
  call-only / mechanical street patterns; repetition = `topActionShare`, diversity = the action mix.
- **Performance** — `decideSafely` latency (mean/P50/P95/max per difficulty, µs) via the CLI `bench`
  (the only layer allowed a clock), plus session throughput (hands/s). Bounded compute is proven by
  the fixed equity sample caps (80 / 140 / 220) + the action budget (`seats × 200`).
- **Fairness** — re-audited structurally: every policy + benchmark consumes only a `BotObservation`;
  the 27C-B strategy modules (`context`/`board`/`sizing`/`strategy`) take only own cards + public
  board + config; `isolation.test.ts` proves no Supabase / economy / tournament import anywhere in the
  bot layer (it scans every runtime file, so it covers the new modules automatically).
- **Soak** — the highest practical safe volume across Easy/Normal/Hard/Simulation, mixed tables, and
  the (internal, off-by-default) personalities, heads-up→6-max, short/standard/deep, recording every
  invariant.

## 7. Exact commands (reproducible)

```
# Frozen strategy check + unit suites
npx tsc --noEmit --skipLibCheck
npm run test:poker:bots

# Holdout gate — vs fixed benchmarks (opens the reserved seeds; frozen config)
node lib/games/poker/bot/cli.ts validate --confirm-holdout-final --group holdout \
  --seeds 16 --hands 300 --tables hu-standard --json
node lib/games/poker/bot/cli.ts validate --confirm-holdout-final --group holdout \
  --seeds 16 --hands 250 --tables hu-short --json
node lib/games/poker/bot/cli.ts validate --confirm-holdout-final --group holdout \
  --seeds 16 --hands 250 --tables hu-deep --json
node lib/games/poker/bot/cli.ts validate --confirm-holdout-final --group holdout \
  --seeds 16 --hands 300 --tables 6max-standard,6max-short,3max-standard --json

# Holdout self-play metrics + integrity across player count × stack
node lib/games/poker/bot/cli.ts baseline --group holdout --confirm-holdout-final \
  --seeds 16 --hands 150 --json

# Decision-time latency
node lib/games/poker/bot/cli.ts bench --decisions 6000 --json
```

Every command is deterministic from its seeds; re-running reproduces the numbers bit-for-bit.
