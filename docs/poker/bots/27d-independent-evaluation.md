# Poker Bot — 27D Independent Evaluation & Difficulty Balancing (Final Report)

Independent evaluation of whether Easy / Normal / Hard are fair, distinct, progressively stronger,
non-repetitive, bounded, and suitable for their intended users — on a **fresh seed group**, **extended
archetypes**, and a **separate harness**, with the frozen strategy read but not tuned. Bots and
tournament features remain **disabled**; no production SQL, migration, or deploy.

Companion docs: [`evaluation-plan.md`](./evaluation-plan.md) ·
[`evaluation-results.md`](./evaluation-results.md) · [`difficulty-balance.md`](./difficulty-balance.md)
· [`exploitability-review.md`](./exploitability-review.md) ·
[`naturalness-review.md`](./naturalness-review.md) · [`human-playtest-plan.md`](./human-playtest-plan.md)
· machine-readable [`27d-results.json`](./27d-results.json). Prior phases:
[`27c-a-baseline.md`](./27c-a-baseline.md) · [`27c-b-implementation.md`](./27c-b-implementation.md) ·
[`27c-c-validation.md`](./27c-c-validation.md).

## 1. Frozen versions & independent seeds

| Item | Value |
|---|---|
| Source | `main` @ `e448a1f` + uncommitted 27C bot working tree |
| Strategy version | `bot-strategy-2026-07-v1` — **read-only in 27D (never edited)** |
| Policy / engine / practice / config | frozen; 27D adds **evaluation-only** tooling that enables nothing |
| Evaluator | Monte-Carlo `estimateEquity` over the unknown universe (own cards + revealed board) |
| Existing seed groups | calibration 24 · validation 16 · holdout 16 (unchanged) |
| **Fresh independent seeds** | **24 (`INDEPENDENT_SEEDS`, base `0x27D1DE00`) — proven disjoint from all three (`independent.test.ts`)** |
| Deck vs policy randomness | separated — shuffle seed derived in the runner, never a policy input |
| Flags | `bot` hard-off · `tournament` hard-off · `practiceBots` off |

**Independence:** fresh seeds the bots were never tuned or judged on; 4 extra extreme archetypes beyond
the 7 fixed benchmarks; a separate harness (`independent.ts`) reasoned about apart from `evaluate.ts`.

## 2. Actual matrix & hand count

Heads-up→6-max × short/standard/deep; easy/normal/hard self-play ladder + mixed field + simulation
fuzzer; 11 opponents (7 fixed + `over_aggressive`, `over_passive`, `tight_blind`, `loose_limp`);
unopened/limped/raised/3bet/blind-vs-blind/HU/multiway pots; main + multiple side pots, split pots,
uncalled refunds, short all-ins, multiple all-ins. **~150,000+ hands** (85,230 benchmark matrix +
10,800 self-play + 1,280 mixed soak + ~55,000 targeted deep-dive). **Pooled integrity: 0 defects, 0
stuck, 0 conservation failures, 0 illegal/stale/duplicate actions, 0 negative/fractional stacks.**

## 3. Metrics & difficulty ordering

- **Ladder (self-play, fresh seeds):** PFR monotone easy < normal < hard (6-max 4.9 → 8.3 → 11.8);
  3-bet monotone (~0 → 0.2–0.8 → 0.5–1.1); **all-in% flat & tiny (0.00–0.25%)** — skill scales, not
  shoving. The 27C-A passivity leak (PFR 0.4–2.3%) stays fixed independently.
- **Ordering vs fixed benchmarks:** **easy < normal < hard, monotone & positive** — 133 < 182 < 224
  bb/100 (all benchmarks); 90 < 134 < 212 heads-up (cleanest signal). 6-max normal≈hard within wide
  single-seat variance (HU carries the separation, per 27C-C).
- **Style contrast:** Easy loose-passive (high VPIP, low PFR, single-size, most predictable); Normal/
  Hard tight-aggressive (raise-or-fold, mixed sizing, disciplined folding). All six action types used.

## 4. Findings

- **Beginner safety (Easy)** ✅ — legal, understandable, loose-passive, bounded (all-in% ≤0.08%, never
  3-bets/bluffs), no chip-dumping; still beats the realistic field by the smallest margins.
- **Exploitability** ✅ (bounded) — no benchmark, including the 4 new extreme probes, prints a profit
  against any difficulty at meaningful sample, **except** heads-up 20bb vs an *any-two-cards* all-in
  jammer (`over_aggressive`), ~−82 bb/100 rebuy-on — a bounded, opponent-specific, rebuy-amplified
  artifact (rebuy-off not significant), **documented rather than fixed** (fixing it would over-fit vs
  the real field). The lean-run min-raise/aggressive "losses" were small-sample flukes (positive at
  16 seeds; strongly positive rebuy-off).
- **Naturalness** ✅ — varied (top-action share 0.24–0.80, mixed sizing, flat all-in%), non-mechanical,
  strength-agnostic timing under the 700–6000 ms cosmetic delay; **not disguised as human** (bot
  occupants carry no `userId`; feed no ranking/achievement/mission/stat).
- **Fairness** ✅ — re-proven structurally (see §5).
- **Performance** ✅ — 8–33 ms mean/decision (P95 ≤ 80 ms, max ≈ 140 ms; contended upper bound),
  bounded by fixed sample caps + action budget; no unbounded loop, no leak (stable ~270 MB), no
  cross-table private cache, no settlement/realtime regression.

## 5. Fairness, authority & economy (re-proven)

- **Information boundary is structural.** Every policy AND every benchmark/probe is a `BotPolicy`
  receiving only a `BotObservation` (own cards + public facts) + a seeded rng. Grep of the runtime bot
  layer confirms hidden-state symbols (`holeBySeat`/`fullBoard`/`seededShuffle`/deck-seed) appear
  **only** in the boundary (`observation.ts`), the hand driver (`runner.ts`), the equity sampler (the
  *unknown* universe), and the CLI/sim builders — **never** in a policy/strategy module **nor in the
  new `independent.ts`**. `assertObservationClean` re-checks at runtime.
- **Isolation tests green** — `isolation.test.ts` scans every runtime bot file (auto-covering
  `independent.ts`) and proves **no** Supabase / economy (`game_wallets`/`coin_ledger`/settle-RPC) /
  tournament import: **no tournament-bot path, no wallet path, no service-role access.**
- **Authority & idempotency** — bots request actions through the same server-side authoritative core
  (`runBotsUntilHumanOrEnd`); every action goes through `decideSafely` (re-validates legality → safe
  fallback), uses server-provided legal actions + sizing, and is re-checked against the canonical
  engine hand-for-hand (0 cross-check mismatches). The practice server action carries a sequence
  (`expectedSeq` via `humanActionAuthoritative`) and persists with an **optimistic version CAS**
  (`.eq('version', expected)`) so a stale/duplicate writer collapses to `stale_state` and cannot
  double-apply / double-settle. A bot carries a `botId`, never a `userId`.
- **Economy separation** — practice bots never touch wallets/cash/tournaments/rankings/achievements/
  missions/human stats (practice `isolation.test.ts` CASE 15–21; forbidden-symbol scan).

## 6. Targeted fixes & before/after

**None.** No material defect was verified. The single persistent negative (short-stack heads-up
any-two-shove) is a bounded, non-realistic, rebuy-amplified artifact whose "fix" would over-fit the
bots against a non-existent opponent and regress them vs the real field — the exact tuning 27D forbids.
Per the targeted-balancing rule ("if no material defect exists, do not change code unnecessarily"),
the frozen strategy is **unchanged**; the finding is logged as a human-playtest watch item. Therefore
there is no before/after remediation table.

## 7. Regression (actual runs)

| Check | Command | Result |
|---|---|---|
| TypeScript | `tsc --noEmit --skipLibCheck` | ✅ pass (0 errors) |
| Lint | `next lint --dir lib` | ✅ pass (pre-existing unused-var **warnings** only) |
| Build | `next build` | ✅ pass (132/132 static pages) |
| Full unit suite | `node --test "lib/**/*.test.ts"` | ✅ **1626 pass / 0 fail / 0 skipped** |
| Bot fairness/observation/policy/strategy/sim/perf/practice | (subset) | ✅ pass |
| New independent harness | `node --test independent.test.ts` | ✅ **7/7** (fresh-seed disjointness, probe legality, conservation) |
| Poker engine / betting / heads-up / pots / showdown / settlement / timeout / reconnect / idempotency | (subset) | ✅ pass |
| Tournament foundation & isolation | `isolation.test.ts` + tournament suites | ✅ pass (no bot↔tournament path) |
| Tiến Lên + shared multiplayer | (subset of full suite) | ✅ pass |
| SQL / RLS assertions | — | ⏭️ not run (no DB access this phase; no production SQL — per constraints) |
| E2E (Playwright) | — | ⏭️ not run (requires WSL/prod-build + realtime secrets; out of scope) |
| i18n | — | ⏭️ N/A (no user-facing strings added; evaluation tooling + docs only) |

**Exact evaluation commands** (bit-for-bit reproducible from seeds):
```
node lib/games/poker/bot/cli.ts independent --seeds 24 --matchup-seeds 12 --hands 200 --json   # full
node lib/games/poker/bot/cli.ts independent --seeds 8 --selfplay-hands 50 --matchup-seeds 5 --hands 120 --mixed-hands 80 --json  # the recorded lean pass
node lib/games/poker/bot/cli.ts bench --decisions 6000
node --test lib/games/poker/bot/independent.test.ts
node --test lib/games/poker/bot/isolation.test.ts lib/games/poker/bot/fairness.test.ts lib/games/poker/bot/observation.test.ts
```

## 8. Files changed

**Added (evaluation-only; NOT exported from `index.ts`; enables nothing; no strategy/engine/practice
change):**
- `lib/games/poker/bot/independent.ts` — 27D independent harness: fresh disjoint seed group, 4 extra
  extreme archetypes, generic matchup/self-play/mixed-soak runners over the authoritative
  `runEvalSession`, optional progress sink.
- `lib/games/poker/bot/independent.test.ts` — fresh-seed disjointness, probe legality-by-construction,
  conservation.
- `docs/poker/bots/{evaluation-plan, evaluation-results, difficulty-balance, exploitability-review,
  naturalness-review, human-playtest-plan, 27d-independent-evaluation}.md` + `27d-results.json`.

**Modified (evaluation tooling only):**
- `lib/games/poker/bot/cli.ts` — added the `independent` command (+ stderr progress).

**Unchanged:** every policy / strategy / config / engine / practice / server / migration / flag file.

## 9. Migration & flag status

- `supabase/migration_poker_practice_bots.sql` — **applied to production** (untouched).
- `supabase/migration_poker_tournament.sql` — **pending, NOT applied** (untouched).
- Flags: `bot` hard-off, `tournament` hard-off, `practiceBots` off. **27D enables nothing.**

## 10. Limitations, risks & remaining human testing

- **Heuristic, not GTO** — believable and correctly ordered, not a solve; a strong human beats Hard,
  and the bots do not opponent-model to maximally exploit a pure nit (bounded by design).
- **Bounded independent sample** — 27D confirms *direction* on fresh seeds + adds harder probes; the
  large-sample significance ("beats all 7") is 27C-C's. 6-max single-seat winrate CIs stay wide.
- **Short-stack any-two-shove** — a documented bounded limitation (see §4/§6); a human-playtest watch
  item, not a code change.
- **DB/RLS/E2E not exercised** — no DB access by constraint; a future gate should run RLS/SQL
  assertions + the Playwright matrix against a build.
- **Remaining human testing** (before any enablement) — the prepared, unexecuted
  [`human-playtest-plan.md`](./human-playtest-plan.md): real-player feel, action-delay naturalness on
  real latency, difficulty distinctness, short-stack-foldiness, and the fairness gut-check.

## 11. Decision

Integrity is exact across ~150,000+ independent (fresh-seed) hands (0 defects / 0 stuck / 0
conservation failures / 0 illegal actions); the fairness/authority/economy boundary is re-proven
structurally (including the new tooling); the difficulty ladder is monotone and positive against fixed
benchmarks (easy < normal < hard, all-in% flat) with the cleanest separation heads-up; no
exploitable/mechanical pattern warrants a change (the one bounded negative is a non-realistic,
rebuy-amplified artifact whose "fix" would over-fit); performance is bounded; and TypeScript / lint /
build / full unit regression (1626/1626) is green. No material defect was verified, so the frozen
strategy is unchanged. Bots and tournament features remain disabled; no production SQL was executed.

**READY FOR PROMPT 27E FINAL REGRESSION**
