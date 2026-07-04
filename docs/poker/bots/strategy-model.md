# Poker Bot Strategy Model (Prompt 27C-B)

How the `easy` / `normal` / `hard` bots decide, and the guarantees that make the decision safe. This
is the design overview; the numbers live in [`preflop-calibration.md`](./preflop-calibration.md),
[`postflop-calibration.md`](./postflop-calibration.md), and [`bet-sizing.md`](./bet-sizing.md), and the
per-difficulty definitions in [`difficulty-definitions.md`](./difficulty-definitions.md).

Builds directly on the 27C-A audit ([`27c-a-baseline.md`](./27c-a-baseline.md)). The single clearest
finding there — the skill bots were **passive preflop** (VPIP 15–18% but **PFR 0.4–2.3%**: they
limped/called and almost never raised) — is the primary target 27C-B fixes.

## Architecture: config + interpreter (data, not logic)

```
BotObservation (fairness boundary — own cards + public facts ONLY)
  → derivePublicContext(obs)          context.ts   — position, effective stack, SPR, pot situation
  → classifyBoard / classifyHand      board.ts     — texture + made-hand/draw class (own+public only)
  → estimateEquity(samples)           equity.ts    — Monte-Carlo equity vs the field (bounded)
  → decideStrategy(obs, ctx, deps)    strategy.ts  — thin, explainable interpreter of…
      · DifficultyStrategy + Personality  strategyConfig.ts  — the VERSIONED numbers
      · sizing helpers                    sizing.ts          — integer, legal, raise-TO, clamped
  → BotDecision { action, note }      (note = a human line label: Value Bet / Semi-Bluff / Fold / …)
  → decideSafely()                    policy.ts    — re-validates legality; illegal/throw ⇒ safe fold
  → applyActionAuthoritative()        (the SAME engine path a human action takes)
```

The decision **logic** is identical across difficulties — only the **config** differs
(`strategyConfig.ts`, `STRATEGY_VERSION = bot-strategy-2026-07-v1`). That is what makes the strength
ordering auditable: a calibration change is a data diff, not a rewrite. `simulation` is untouched —
still a uniform-random-legal engine fuzzer, never user-facing.

## What a bot may use (unchanged fairness boundary)

Only the fairness-bounded `BotObservation`: own two hole cards, the revealed board, public per-seat
facts (stacks, committed chips, status), the button, blinds, pot, current bet, amount to call,
server-provided legal actions + raise bounds, opponent count, and the public action history. It never
sees opponent cards, undealt cards, the deck order, the shuffle seed, a precomputed evaluator result,
or premature settlement. The boundary is **structural** (`observation.ts` is a closed type) and
re-checked at runtime by `assertObservationClean` — 27C-B adds NO field to the observation, so the
27C-A fairness audit ([`fairness-audit.md`](./fairness-audit.md)) still holds verbatim.

`board.ts` and `context.ts` derive *only* from that observation (own cards + public state). Equity is
still computed by the bot itself by Monte-Carlo sampling of the **unknown** universe (full deck minus
the cards it can see) — it is never handed a hidden result.

## The decision, in one paragraph

Preflop, the bot reads its **position**, **effective stack**, and the **pot situation**
(unopened / limped / raised / 3-bet+ / facing all-in / short-stack push-fold) and compares its
normalized preflop strength (Chen, `equity.ts`) against the config threshold for that exact cell —
so it opens, 3-bets, flat-calls, defends its big blind wider, widens blind-vs-blind and heads-up, and
short-stack jams appropriately. Postflop, it estimates bounded Monte-Carlo equity, classifies the
board texture and its own made-hand/draw, and chooses an explainable line — value bet, protection
bet, (delayed) c-bet, semi-bluff, controlled bluff, value raise, check-raise, call, or fold — sized
from the legal bounds. Every amount is an integer raise-**to** clamped into the server's `[min,max]`,
and `decideSafely` re-validates it before it can reach the engine.

## Safety invariants (all preserved by 27C-B)

- **Legal by construction, safe by validation.** Sizing (`sizing.ts`) only ever returns an action
  from the observation's legal set with an integer amount clamped to `[min,max]`; `decideSafely`
  re-checks and degrades any illegal/throwing decision to a legal check/fold. Skill policies force
  **0** fallbacks across the calibration runs.
- **No engine change.** The authoritative engine, betting rules, settlement, idempotency, and
  sequencing are untouched. A bot still only *requests* an action through the human path.
- **Determinism.** Every decision is a pure function of `(observation, rng)`. A seeded simulation
  replay is bit-for-bit identical (`strategy.test.ts` "seeded replay").
- **Coin integrity.** Conservation, integer non-negative stacks, side pots, and no stuck/duplicate
  hands are re-verified under the new strategy (`strategy.test.ts`, calibration soak).
- **Isolation.** The bot layer imports no Supabase/economy symbol and no tournament domain
  (`isolation.test.ts` scans every bot file, including the new modules). Chips stay isolated:
  wallet ≠ cash stack ≠ practice chips ≠ tournament chips.
- **Flags stay OFF.** `bot` and `tournament` are hard-off; `practiceBots` defaults off. 27C-B enables
  nothing.

## Not GTO

These are heuristic, intentionally beatable strategies. `hard` is *less exploitable* than `normal`,
which is less exploitable than `easy` — a defensible ordering, **not** a solve. No equilibrium claim
is made anywhere.
