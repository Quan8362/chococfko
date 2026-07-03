# Poker bots — simulation harness

The harness (`lib/games/poker/bot/sim.ts` + `runner.ts`, CLI `bot/cli.ts`) plays large numbers of
full hands with bot policies to **surface engine defects** and to continuously **verify coin
integrity**. Its primary objective is testing, not gameplay.

> **Not a statistical proof.** The harness is a deterministic **fuzzer + invariant checker**. A
> clean run is strong evidence, not a certificate of correctness. We make **no** claim of
> statistical completeness.

## How a hand is driven (`runner.ts`)

`playBotHand` is the interactive counterpart of the scripted `engine.playHand`. It shares **all**
the engine's pure primitives (deck / betting / order / showdown / pot) and, instead of reading a
pre-written script, asks each seat's policy for a decision as the hand unfolds:

1. Deal from the seed (identical to the engine).
2. For each actor: build the fairness-bounded `BotObservation`, call `decideSafely(policy, obs)`,
   and apply the chosen action through the **same** `applyAction` a human action uses.
3. Record the action into a replayable log.
4. Settle via `settleShowdown` (same as the engine).

### Built-in defect detectors (per hand)

- **`not_conserved`** — `Σ payouts + refund ≠ Σ contributions` (a coin leak or creation).
- **`illegal_applied`** — a policy action that passed the legality check was rejected by
  `applyAction` (a genuine `legalActions` ↔ `applyAction` inconsistency in the engine).
- **`nonterminating`** — the per-hand action budget (`seats × 200`) tripped (possible infinite
  loop). The hand is aborted safely and flagged.
- **`engine_crosscheck` / `crosscheck_threw`** — the driver **re-runs its own recorded action log
  through the canonical `engine.playHand`** and asserts an identical board + settlement. Any
  divergence between the interactive driver and the scripted engine is surfaced. This is the
  strongest check: two independent code paths must agree on every hand.

## The session (`sim.ts`)

`runBotSimulation(config, seed)` carries stacks across hands, rotates the button, and aggregates:

- **Per-hand zero-sum** — `Σ stack deltas == 0` after every hand.
- **Supply accounting** — `final supply == initial supply + injected`. Play money uses an
  auto-**rebuy** faucet (a busted seat is topped back to the starting stack) so the fuzzer can run
  the full hand count instead of stopping at the first bust; every injected chip is tracked, so
  conservation stays **exact**. `rebuy: false` models a real bust-out session (may terminate early)
  and injects nothing.
- **Coverage counters** — showdowns, all-in hands, **side-pot** hands, safe fallbacks.
- **True P&L** — each seat's cumulative delta (independent of rebuys) → net bb/100 by difficulty. A
  rough winrate signal only; this is a fuzzer, **not** a balance benchmark.

Determinism: same `config + seed` ⇒ **bit-for-bit identical** report (asserted in `sim.test.ts`).

## Running it

```bash
npm run poker:bots:list                       # list built-in profiles
npm run poker:bots:run  -- --profile six_mixed --seed 42
npm run poker:bots:run  -- --seats 6 --hands 5000 --mix simulation --seed 7
npm run poker:bots:soak -- --profile six_sim --seeds 1,2,3,4,5
npm run test:poker:bots                        # the unit + fairness + invariant suite
```

`run`/`soak` exit non-zero if conservation is violated or any defect is found (CI-friendly).

Built-in profiles (`BOT_SIM_PROFILES`): `hu_sim` (heads-up fuzz), `six_sim` (6-max side-pot
coverage), `six_mixed` (mixed skills), `short_stacks` (all-in / layered side-pot stress).

## What has been run

Development soaks of ~13k+ hands across profiles (heads-up, 6-max, short-stack) produced **0
defects** and **exact conservation**, with thousands of all-in and side-pot hands exercised and
the canonical cross-check passing on every hand. Re-run any time with the commands above; increase
`--hands` and vary `--seed` for deeper fuzzing.
