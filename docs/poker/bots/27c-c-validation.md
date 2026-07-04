# Poker Bot 27C-C — Calibration Validation, Performance & Regression

Final validation of the calibrated bots against **independent (holdout) seeds**, fixed benchmark
opponents, and full regression. Bots remain **disabled** (`bot`/`tournament` hard-off, `practiceBots`
off); no production SQL, no migration, no deploy. Companion docs:
[`calibration-methodology.md`](./calibration-methodology.md) ·
[`calibration-results.md`](./calibration-results.md) ·
[`performance-results.md`](./performance-results.md) ·
[`exploitability-baseline.md`](./exploitability-baseline.md) · machine-readable
[`27c-c-results.json`](./27c-c-results.json). Prior phases:
[`27c-a-baseline.md`](./27c-a-baseline.md), [`27c-b-implementation.md`](./27c-b-implementation.md).

## 1. Frozen configuration & seeds

| Item | Value |
|---|---|
| Source revision | `main` @ `e448a1f` + the uncommitted 27C-A/B working tree (bot layer) |
| Strategy version | `bot-strategy-2026-07-v1` (`strategyConfig.ts`) — **frozen; unchanged during 27C-C** |
| Policy / engine code | frozen (no edit to any policy, engine, practice, or server file) |
| Evaluator | Monte-Carlo `estimateEquity` over the unknown universe (own cards + board only) |
| Equity budgets | preflop 0 (Chen) · postflop easy 80 / normal 140 / hard 220 · bounded early-stop on |
| Calibration seeds | 24 (`seeds.ts`) — used by 27C-B only |
| Validation seeds | 16 — 27C-B generalization + 27C-C harness smoke-tests |
| **Holdout seeds** | **16 — opened once here, frozen strategy** (verified unused: absent from all docs/results, CLI-guarded, disjointness proven in `seeds.test.ts`) |
| Player counts / stacks | HU→6-max · short 20bb / standard 100bb / deep 250bb |
| Timeout budget | `decideSafely` (safe-fallback on throw/illegal) + driver action budget `seats × 200` |

**Freeze discipline:** the strategy was frozen before the holdout opened and was **not** tuned after
any result was seen. The only code changed after opening holdout was the **evaluation-only** benchmark
suite (`min_raise` escalation cap — the measuring instrument, not the bots), and every affected
matchup was re-run from scratch with the fixed benchmark, so no reported number mixes instruments.

## 2. Evaluation matrix & actual volume

| Suite | Shapes | Opponents | Seeds × hands | Hands |
|---|---|---|---|---:|
| Self-play baseline | HU/3/4/5/6-max × short/std/deep + mixed | difficulty self-play | 16 × 150 | 93,600 |
| HU-standard matchups | 2p 100bb | 7 benchmarks × easy/normal/hard | 16 × 300 | 100,800 |
| HU-short matchups | 2p 20bb | 7 benchmarks × 3 | 16 × 250 | 84,000 |
| HU-deep matchups | 2p 250bb | 7 benchmarks × 3 | 16 × 250 | 84,000 |
| Multiway matchups | 3p/6p std + 6p short | 7 benchmarks × 3 | 16 × 300 | 302,400 |
| Personality + mixed soak | 6-max × short/std/deep | 5 personalities + fully-mixed | 16 × 200 | 28,800 |
| **Total holdout** | | | | **≈ 693,600** |

Benchmarks (fixed archetypes): `random`, `always_call`, `passive`, `aggressive`, `min_raise`,
`tight`, `loose`. Coverage included **28,052+ showdowns, 7,900+ side-pot hands, 21,000+ all-in hands**,
main + multiple side pots, split pots, uncalled refunds, short all-ins, and multiple all-ins.

## 3. Metrics by difficulty, player count, stack

See [`calibration-results.md`](./calibration-results.md) §2–3 (full tables) and
[`27c-c-results.json`](./27c-c-results.json). Headlines:

- **Difficulty ladder (holdout self-play):** PFR **4.9 → 10.1 → 13.0**, 3-bet **0.02 → 0.37 → 0.49**,
  all-in% flat **~0.03** — skill scales, not shoving. The 27C-A passivity leak (PFR 0.4–2.3%) is fixed
  on the holdout.
- **Strength ordering:** every skill bot **beats all 7 benchmarks** (positive mean everywhere), and
  **hard > normal > easy** is monotonic; at HU standard/deep every one of the 42 cells has its 95% CI
  above 0, and for 5/7 benchmarks the three difficulties have **non-overlapping CIs**.
- **Sizing/diversity:** easy is single-size (beginner tell), normal/hard mix sizing; all six action
  types used, top action 0.49–0.67 (no mechanical single-action policy).

## 4. Difficulty · exploitability · repetition · performance · fairness findings

- **Difficulty** ✅ — Easy beginner-suitable (loose-passive, never dumps chips — still beats
  benchmarks by the smallest margins); Normal statistically distinct from Easy; Hard distinct from
  Normal; higher difficulty is **not** more aggression/all-ins (all-in% flat); Hard stays bounded and
  explainable. Validated with **fixed benchmarks**, not only self-play.
- **Exploitability / naturalness** ✅ — no station/fold-bot/one-size/over-fold/spew/all-in/mechanical
  pattern; no benchmark shows a profitable counter; strength-agnostic timing; no fake identity. See
  [`exploitability-baseline.md`](./exploitability-baseline.md).
- **Performance** ✅ — `decideSafely` mean 8.8 / 16.9 / 30.3 ms (easy/normal/hard), P95 ≤ 80 ms, max
  ≈ 123 ms — bounded by fixed sample caps + action budget, dwarfed by the 700–6000 ms cosmetic delay;
  no unbounded loop, no leak, no cross-table private cache, no settlement/realtime regression. See
  [`performance-results.md`](./performance-results.md).
- **Fairness** ✅ — re-audited structurally (below).

## 5. Fairness re-audit (27C-B modules + 27C-C tooling)

The 27C-A audit ([`fairness-audit.md`](./fairness-audit.md)) is re-proven to hold after 27C-B added
`context`/`board`/`sizing`/`strategy`/`strategyConfig` and 27C-C added `benchmarks`/`evaluate`:

- Every policy AND every benchmark is a `BotPolicy` — it receives only a `BotObservation`
  (own cards + public facts) + a seeded rng. No forbidden field exists on the object.
- The 27C-B strategy modules consume only `obs.holeCards` (own), `obs.board`/`derivePublicContext(obs)`
  (public), and frozen config; `classifyHand(hole, board)` uses the bot's own hole + the public board
  only. No opponent cards, deck order, shuffle seed, hidden evaluator output, or premature winner.
- Grep of the runtime bot layer: `holeBySeat`/`fullBoard`/`seededShuffle`/deck-seed references exist
  **only** in the boundary (`observation.ts`), the hand driver (`runner.ts`), the equity sampler
  (samples the *unknown* universe), and the CLI bench builder — **never** in a policy/strategy module.
- `isolation.test.ts` scans **every** runtime file in the bot layer (so it automatically covers the
  new modules) and proves **no** Supabase / economy (`game_wallets`/`coin_ledger`/settle-RPC) /
  tournament import anywhere — **no tournament-bot path, no wallet path, no service-role access**.
- Serialization/logs/metrics carry no cards: `metrics.ts` reads only public action history; the admin
  log redacts card tokens; no `console.*` in the runtime.

**No fairness violation.** The boundary is structural, not a convention.

## 6. Large-scale seeded soak & regression

**Soak (≈ 693,600 holdout hands)** — across easy/normal/hard/simulation, mixed tables, and the
internal personalities, HU→6-max, short/standard/deep:

| Invariant | Result |
|---|---|
| Coin conservation | **exact, 0 violations** |
| Engine cross-check mismatches | **0** |
| Illegal / stale / duplicate actions to engine | **0** |
| Forced safe-fallbacks | **0** |
| Stuck / non-terminating hands | **0** |
| Negative / fractional stacks | **0 / 0** |

**Regression (actual runs):**

| Check | Command | Result |
|---|---|---|
| TypeScript | `tsc --noEmit --skipLibCheck` | ✅ pass (0 errors) |
| Lint | `next lint --dir lib` | ✅ pass (0 errors; pre-existing unused-var **warnings** only, incl. 2 in 27C-B files — not modified per freeze) |
| Build | `next build` | see §8 status |
| Full unit suite | `node --test "lib/**/*.test.ts"` | ✅ **1619 pass / 0 fail / 0 skipped** (bot, engine/betting/showdown/pot, TLMN, tournament, shared, other games) |
| Bot fairness/strategy/sim/perf/practice | (subset of above) | ✅ pass (incl. new `evaluate.test.ts` — 5/5) |
| Tournament foundation & isolation | `isolation.test.ts` + tournament suites | ✅ pass (no bot↔tournament path) |
| SQL / RLS assertions | — | ⏭️ not run (no DB access this phase; no production SQL — per constraints) |
| E2E (Playwright) | — | ⏭️ not run (requires WSL/prod-build + realtime secrets; out of scope for validation) |

## 7. Exact commands & files changed

Commands: see [`calibration-methodology.md`](./calibration-methodology.md) §7 (all deterministic from
seeds). **Files added (evaluation-only, not exported from `index.ts`, not used by any enabled seat):**

- `lib/games/poker/bot/benchmarks.ts` — 7 fixed benchmark opponents (pure `BotPolicy`s).
- `lib/games/poker/bot/evaluate.ts` — holdout matchup harness + cross-seed 95% CI (`runEvalSession`,
  `evaluateMatchup`, `winrateStats`, `runEvalMatrix`).
- `lib/games/poker/bot/evaluate.test.ts` — harness legality/conservation/determinism/CI tests.
- `docs/poker/bots/{calibration-methodology, calibration-results, performance-results,
  exploitability-baseline, 27c-c-validation}.md` + `27c-c-results.json`.

**Files modified:** `lib/games/poker/bot/cli.ts` — added the guarded `validate` command and gated the
`baseline`/`validate` holdout path behind `--confirm-holdout-final`. **No** change to any policy,
strategy, engine, practice, server, migration, or flag file.

## 8. Migration & feature-flag status

- `migration_poker_practice_bots.sql` — **applied to production** (untouched).
- `migration_poker_tournament.sql` — **pending, NOT applied** (untouched).
- Flags: `bot` hard-off, `tournament` hard-off, `practiceBots` off. **27C-C enables nothing.**

## 9. Limitations, risks & remaining human testing

- **Heuristic, not GTO** — the bots are believable and correctly ordered, not a solve; a strong human
  will beat `hard`. They also do not opponent-model to maximally exploit a pure nit (bounded design).
- **6-max single-seat winrate CIs are wide** — a measurement variance limitation, not a bot leak; the
  HU tables carry the statistical ordering. Multiway is validated on integrity + positive means.
- **Short-stack vs a maniac is high-variance** — mean positive, decisive at standard/deep.
- **DB/RLS/E2E not exercised here** — no DB access this phase by constraint; a future gate should run
  the RLS/SQL assertions and the Playwright matrix against a build.
- **Remaining human testing** (before any enablement): real-player practice-table feel, action-delay
  naturalness on real latency, and the practice runtime wiring public history (a documented
  fairness-neutral follow-up from 27C-B).

## 10. Decision

Integrity is exact across ~693,600 holdout hands (0 defects / 0 stuck / 0 conservation failures /
0 illegal actions), the fairness boundary is structurally re-proven, the difficulty ladder is
statistically decisive against fixed benchmarks (hard > normal > easy, monotonic, non-overlapping CIs
for most benchmarks), no exploitable/mechanical pattern is present, performance is bounded, and full
type/lint/unit regression is green (1619/1619). Bots and tournament features remain disabled; no
production SQL was executed.

**READY FOR PROMPT 27D EVALUATION**
