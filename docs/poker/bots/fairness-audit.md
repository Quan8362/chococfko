# Poker Bot Fairness & Authoritative-Path Audit (Prompt 27C-A)

Status: **AUDIT — no violation found.** Bots remain **disabled** in production (`POKER_BOT_ENABLED`
hard-off; `POKER_PRACTICE_BOTS_ENABLED` off). This document records the source-level audit of the
fairness boundary and the authoritative action path that a bot decision must pass through.

Companion to the pre-existing design doc [`fairness-boundary.md`](./fairness-boundary.md); this file
is the **audit evidence** for that design.

---

## 1. Data flow (as inspected in source)

```
authoritative state (HandState / BettingRound — NO opponent cards, NO undealt deck)
  → server observation builder (practice/observation.ts  |  bot/runner.ts buildObservation call)
      · receives ONLY: public state + the acting seat's OWN two hole cards (explicit argument)
      · slices the board to the current street (boardForStreet)
      · assertObservationClean() — defence-in-depth re-check
  → BotObservation  (bot/observation.ts — a CLOSED type; no field for hidden state)
  → BotPolicy (obs, rng) → BotDecision   (bot/policies.ts — pure; reads only the observation)
  → decideSafely()  — validates legality against obs.legal; illegal/throwing ⇒ safe fold/check
  → applyActionAuthoritative()  (practice/runtime.ts — the SAME core humans use)
      · phase == BETTING, turnSeat == seat, expectedSeq == actionSeq (idempotency / stale guard)
      · applyPlayerAction() (engine) validates + mutates; settlement conserved; markComplete
  → persistCas()  (practice-actions.ts — DB version compare-and-swap; duplicate write ⇒ no-op)
```

A policy is a **pure function of the observation**. It cannot read the clock, the network, the
database, or any other seat's state, because none of those are reachable from its two parameters
(`obs`, `rng`).

---

## 2. Fairness-boundary findings

| # | Forbidden input | Why a bot cannot receive it | Evidence |
|---|---|---|---|
| 1 | Opponent hole cards | `BotObservation` has no per-opponent card field; builders pass only `ownHole`; `ObservedSeat` has no card field | `observation.ts:36-63`, `practice/observation.ts:45-81` |
| 2 | Folded private cards | same — no card field exists on any observed seat | `observation.ts:36-43` |
| 3 | Future community cards | `boardForStreet()` slices the board to `revealedBoardCount(street)`; `assertObservationClean` re-checks board length == street | `observation.ts:67-85,166-174` |
| 4 | Remaining deck order | no `deck`/`deckOrder`/`remainingDeck` field; enumerated in `FORBIDDEN_OBSERVATION_KEYS` and rejected | `observation.ts:90-104` |
| 5 | Shuffle seed | no `seed`/`rng` field on the observation; the policy's `rng` is a seeded generator, **not** the deck seed, and is an *input to* the policy, never *read from* game state | `observation.ts:90-104`, `policy.ts:39` |
| 6 | Hidden evaluator output | equity is computed by the policy itself by sampling the **unknown** universe (full deck − visible cards); it never receives a precomputed result | `equity.ts:22-95` |
| 7 | Precomputed winner / premature settlement | no `winner`/`winnersByPot`/`showdown` field; settlement runs *after* betting and clears `holeBySeat` | `observation.ts:90-104`, `practice/runtime.ts:199-234` |
| 8 | Private spectator / admin metadata | admin metrics are integer counters + difficulty labels only; no cards | `practice/adminMetrics.ts` |
| 9 | Service-role credentials | the bot layer imports no Supabase client (proven structurally by `bot/isolation.test.ts`) | `bot/isolation.test.ts` |
| 10 | Another bot's private state | each decision is built from one seat's own hole cards; there is no cross-seat channel | `practice/runtime.ts:269-294` |
| 11 | Tournament-private state | the bot layer never imports the tournament domain, and vice-versa (structural test) | `bot/isolation.test.ts` |

**Logging / error reporting.** No `console.*`/logger call exists in the bot or practice runtime.
The admin incident log (`bot/admin.ts`) redacts any 2-char card token (`redactCards`) so a crash
detail can never leak cards. The client projection (`practice/view.ts`) scans the serialized view
for any foreign hole card and throws if one is present.

**Timing side-channel.** The user-facing think-delay is **strength-agnostic** — it depends only on
the live-opponent count + seeded jitter, never on the hand (`practice/worker.ts:31-46`,
`policy.ts:152-164`). Timing cannot tell a human what a bot holds.

**Conclusion:** the boundary is **structural**, not a convention — there is no field on the
observation through which hidden state could arrive, and two independent defence-in-depth guards
(`assertObservationClean`, `assertClientViewPrivacy`) re-check it at runtime. **No violation found.**

---

## 3. Authoritative action-path findings

| Requirement | Status | Evidence |
|---|---|---|
| Action derived from an approved observation | ✅ | `botActOnce` builds obs via `buildServerObservation` then runs the policy | 
| Uses server-provided legal actions & bounds | ✅ | `obs.legal`, `minRaiseTo`/`maxRaiseTo` from the engine; `isDecisionLegal` clamps bet/raise to `[min,max]` ints | 
| Carries state version / sequence | ✅ | `expectedSeq === state.actionSeq` in `applyActionAuthoritative`; DB `persistCas` on `version` |
| Idempotent (duplicate ⇒ one effect) | ✅ | stale `actionSeq` rejected; `botActionKey(handId, seat, stateVersion)` collapses retries; practice CAS returns `stale_state` on the loser |
| Rejected when stale / out-of-turn / illegal | ✅ | `stale_state`, `not_actor_turn`, engine validation ⇒ `res.ok === false` |
| Cannot execute twice after retry | ✅ | version CAS + actionSeq; `workerStep` idempotency test (CASE 27/CASE 9) |
| Cannot settle a hand twice | ✅ | `settle` runs once at `showdown`/`one_left`; `markComplete` moves phase to COMPLETED; conservation asserted |
| Legal safe fallback after policy failure | ✅ | `decideSafely` ⇒ check-if-free-else-fold on throw/illegal/unclean |
| Policy never writes game state | ✅ | a policy returns an `AppliedAction` value; only `applyPlayerAction` (engine) mutates |

**Conclusion:** every bot action is a *request* that passes through the identical authoritative
validation a human action does. **No direct state mutation and no illegal action can reach the
engine.**

---

## 4. Integrity (from simulation)

- **Coin conservation:** exact, checked after **every** hand and globally (`sim.ts`,
  `practice/economy.ts`). The pre-existing 25k-hand practice soak and the bot engine cross-check
  find **0 defects, 0 conservation failures**.
- **Integer / non-negative stacks:** enforced by the engine + `assertCoin`; the baseline run reports
  `negativeStacks = 0`, `fractionalStacks = 0`.
- **No stuck hands:** bounded by the runner action budget (`seats × 200`), `progress` guard (40),
  and `runBotsUntilHumanOrEnd` guard (400).

---

## 5. Tests added this phase

- `bot/isolation.test.ts` — bot layer imports no Supabase/economy symbol; **no tournament-bot path**
  (neither domain imports the other).
- `bot/metrics.test.ts`, `bot/seeds.test.ts`, `bot/baseline.test.ts` — reproducible measurement.

Existing boundary coverage retained: `bot/fairness.test.ts`, `bot/observation.test.ts`,
`practice/observation.test.ts` (CASE 1–5), `practice/isolation.test.ts`, `practice/view.test.ts`.

**Decision: no fairness or authoritative-path defect. Not a blocker.**

---

## 6. 27C-C re-audit (after 27C-B strategy modules + 27C-C tooling)

Re-verified that the boundary still holds after 27C-B added `context`/`board`/`sizing`/`strategy`/
`strategyConfig` and 27C-C added the evaluation-only `benchmarks`/`evaluate`:

- Every 27C-B strategy module and every 27C-C benchmark consumes **only** a `BotObservation`
  (own `holeCards`, public `board`/context, frozen config); `classifyHand(hole, board)` uses the bot's
  own hole + the public board only. No opponent cards / deck / seed / hidden evaluator / premature
  winner reachable.
- Source grep: `holeBySeat`/`fullBoard`/`seededShuffle`/deck-seed appear **only** in `observation.ts`
  (the boundary), `runner.ts` (driver), `equity.ts` (samples the *unknown* universe), and the CLI
  bench builder — never in a policy/strategy/benchmark module.
- `isolation.test.ts` scans every runtime bot file, so it **automatically covers the new modules**:
  no Supabase / economy / tournament import anywhere (no tournament-bot path, no wallet path).
- Integrity across ~693,600 holdout hands: exact conservation, 0 engine cross-check mismatches, 0
  illegal/stuck/negative/fractional. Full report: [`27c-c-validation.md`](./27c-c-validation.md) §5.

**27C-C re-audit: no violation. Still not a blocker.**
