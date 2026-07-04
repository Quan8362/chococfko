# Poker Bot — Independent Evaluation Plan (Prompt 27D)

This is the **plan** an independent evaluator follows to decide whether Easy / Normal / Hard are
fair, distinct, progressively stronger, non-repetitive, bounded, and suitable for their intended
users. It is deliberately written to be reproducible and to **not** reuse anything the bots were
tuned or previously judged on. Results live in [`evaluation-results.md`](./evaluation-results.md);
the top-level narrative is [`27d-independent-evaluation.md`](./27d-independent-evaluation.md).

Prior phases (frozen inputs, not re-derived here): [`27c-a-baseline.md`](./27c-a-baseline.md),
[`27c-b-implementation.md`](./27c-b-implementation.md), [`27c-c-validation.md`](./27c-c-validation.md).

## 1. Freeze (provenance)

| Item | Value |
|---|---|
| Source revision | `main` @ `e448a1f` + the uncommitted 27C-A/B/C bot working tree |
| Strategy version | `bot-strategy-2026-07-v1` (`strategyConfig.ts`) — **read, never edited** during 27D |
| Policy / engine / practice code | frozen (evaluation adds only eval-only tooling) |
| Evaluator | Monte-Carlo `estimateEquity` over the *unknown* universe (own cards + revealed board only) |
| Equity budgets | preflop 0 (Chen `preflopStrength`) · postflop easy 80 / normal 140 / hard 220 · bounded early-stop on |
| Existing seed groups | calibration 24 · validation 16 · holdout 16 (`seeds.ts`) — **not reused as a 27D judging set** |
| **Fresh independent seeds** | **24 (`independent.ts` `INDEPENDENT_SEEDS`, base `0x27D1DE00`)** — proven disjoint from all three existing groups (`independent.test.ts`, `assertIndependentSeedsFresh`) |
| Player counts | heads-up (2) → 6-max |
| Stacks | short 20bb · standard 100bb · deep 250bb (`STACK_BB`) |
| Timeout budget | `decideSafely` (safe-fallback on throw/illegal/unclean) + driver action budget `seats × 200` |

**Randomness separation (invariant):** the per-hand deck shuffle seed is derived *inside* the runner
(`deriveHandSeed`) and is **never** handed to a policy; a policy's rng is the session rng. Deck
randomness and policy randomness stay strictly separate — a policy cannot read the shuffle.

**Freeze discipline:** the independent numbers are read on the fresh seeds with the strategy frozen.
Strategy is not tuned while reading them. Any targeted fix (if a material defect is *verified*) uses
*separate* remediation seeds and records before/after (see §7 of the prompt / results doc).

## 2. Independence from 27C

Three things make 27D an independent check rather than an echo of the calibration tooling:

1. **Fresh seeds** — a 4th disjoint group the bots were never tuned or judged on.
2. **Extra probing archetypes** — beyond the 7 fixed benchmarks (`random`, `always_call`, `passive`,
   `aggressive`, `min_raise`, `tight`, `loose`), 27D adds **over-aggressive**, **over-passive**,
   **tight-blind**, **loose-limp** (`independent.ts`) to widen the exploitability surface.
3. **Separate harness** — `independent.ts` seats the bot-under-test + opponent copies through the same
   authoritative `runEvalSession` primitive (which cross-checks every hand vs the scripted engine and
   asserts coin conservation), but is written and reasoned about independently of `evaluate.ts`.

## 3. Evaluation matrix

- **Shapes:** heads-up standard/short/deep, 3-max standard, 6-max standard/short (unopened, limped,
  raised, re-raised, blind-vs-blind, HU, and multiway pots all arise naturally within these).
- **Difficulties:** easy, normal, hard (self-play ladder), plus mixed tables and the simulation fuzzer
  (mixed soak) and the internal personalities (aggressive/tight overlays in the mixed field).
- **Opponents:** the 7 fixed benchmarks + the 4 extra probes (11 total).
- **Pots exercised:** main pot, multiple side pots, split pots, uncalled refunds, minimum raises,
  short all-ins, action-not-reopened, multiple all-ins — surfaced by the multiway short-stack tables
  and cross-checked hand-by-hand against the canonical engine inside the runner.

## 4. Metrics (by difficulty × player count × stack)

Hands; VPIP / PFR / 3-bet; per-action frequencies (fold/check/call/bet/raise/all-in); all-in %,
showdown %, coarse showdown-win %; bet-size distribution; top-action share (repetition); win rate vs
each fixed benchmark with a cross-seed 95% CI (`winrateStats`, small-sample t); decision-time mean /
P50 / P95 / max (`bench`); exceptions, timeouts, forced fallbacks, illegal/stale/duplicate actions,
stuck hands, conservation failures, negative/fractional stacks.

Distortions are stated, not hidden: auto-rebuy inflates all-in/showdown *frequencies* (winrate uses
true rebuy-independent P&L); homogeneous self-play measures style, not field strength; HU winrate
variance is ±100+ bb/100 per session, so short-run winrate is never the sole strength proof.

## 5. Difficulty, exploitability, naturalness, fairness, performance, economy

- **Difficulty review** — Easy legal/understandable/bounded (no spew, no chip-dumping); Normal uses
  position/equity/pot-odds/SPR/texture/several sizes/limited semi-bluff/folding; Hard uses only
  approved public info + own-card blockers, varied sizing, river discipline; ordering Easy < Normal <
  Hard judged **against fixed benchmarks**, not only self-play.
- **Exploitability** — probe for calling-station / fold-everything / one-size / over-fold / spew /
  all-in / min-raise / permanent-limp / mechanical-street patterns; require that **no benchmark prints
  a profit** against a difficulty (opponent net < 0) and no probe reveals a profitable counter.
- **Naturalness** — action diversity, repetition (top-action share), timing distribution; the bots
  are **not** disguised as humans.
- **Fairness/authority/economy** — re-prove structurally (types, observation builder, serialization,
  logs, metrics, fixtures, errors, reconnect, practice runtime) that a bot receives only human-visible
  info; every bot action uses server legal actions + sizing, carries version/sequence + idempotency,
  is rejected when stale/illegal/duplicate/out-of-turn, cannot settle twice, and only a legal fallback
  follows a failure; practice bots never touch wallets/cash/tournaments/rankings/achievements/
  missions/human stats.
- **Performance** — latency, equity cost, throughput, timeouts, fallbacks; no unbounded loop, no
  event-loop block, no leak, no cross-table private-state cache, no settlement/realtime regression.

## 6. Regression

TypeScript, lint, build; bot fairness/observation/policy/strategy/simulation/performance/practice
suites; poker engine / legal-actions / betting / heads-up / pots / showdown / settlement / timeout /
reconnect / idempotency; shared multiplayer; tournament foundation + isolation; RLS/SQL where safely
available; i18n where relevant; Tiến Lên + critical existing-game smoke. Report pass/fail/skipped/
blocked/N-A/warnings honestly.

## 7. Exact commands

```
# fresh-seed independent matrix (JSON → docs/poker/bots/27d-results.json)
node lib/games/poker/bot/cli.ts independent --seeds 24 --matchup-seeds 12 --hands 200 --json

# decision-time percentiles (decideSafely path)
node lib/games/poker/bot/cli.ts bench --decisions 6000

# harness self-tests (fresh-seed disjointness, probe legality, conservation)
node --test lib/games/poker/bot/independent.test.ts

# fairness / isolation (scans every runtime bot file, incl. independent.ts)
node --test lib/games/poker/bot/isolation.test.ts lib/games/poker/bot/fairness.test.ts lib/games/poker/bot/observation.test.ts
```

All runs are bit-for-bit reproducible from `(config, seed)`. No production SQL, no migration, no
deploy; `bot`/`tournament` hard-off, `practiceBots` off throughout.
