# Poker Bot Seed Strategy (Prompt 27C-A)

Defines the separated randomness discipline for the calibration phases. Implemented in
[`lib/games/poker/bot/seeds.ts`](../../../lib/games/poker/bot/seeds.ts), enforced by
`bot/seeds.test.ts`.

## Two independent kinds of randomness (never mixed)

1. **Deck randomness** — the per-hand shuffle. Derived *inside* the sim from the session seed
   (`deriveHandSeed` in `sim.ts` / `practice/runtime.ts`) and consumed only by `seededShuffle`.
   **It is never exposed to a policy** — there is no `seed` field on a `BotObservation`
   (see [`fairness-audit.md`](./fairness-audit.md) finding #5).
2. **Policy randomness** — the seeded `rng` a policy uses for sampling / mixing. In the sim it is
   the session `rng` (`makeRng(seed)`); it is an *input parameter* to the policy, never read back
   out of authoritative state.

A shuffle seed becoming a policy input would be a fairness breach; the type system makes it
impossible (the policy signature is `(obs, rng)` and `obs` has no seed field).

## Three disjoint seed groups

| Group | Size | Purpose | Rule |
|---|---|---|---|
| `calibration` | 24 | The **only** seeds Prompt 27C-B may tune against | tune freely |
| `validation` | 16 | Check that a tuning generalizes | measure, never tune directly |
| `holdout` | 16 | The **final** 27C-C acceptance gate | **must stay unused** until 27C-C |

- Groups are generated from distinct integer bases via a pure xorshift expansion (no clock, no
  `Math.random`), so they are reproduced bit-for-bit on every machine.
- `assertSeedGroupsDisjoint()` proves at runtime + in CI that no seed appears in two groups and no
  group has internal duplicates.
- The CLI **refuses** `baseline --group holdout` to prevent accidental contamination of the final
  gate.

## Reproducibility

Any finding is reproducible from `(config, seed)`: `runBotSimulation(config, seed)` is bit-for-bit
deterministic (asserted by `sim.test.ts` "seeded replay"). A regression is replayed by re-running
the exact seed, never by "re-rolling".

## Usage in later phases

- **27C-B (calibration):** tune only against `calibration`; sanity-check each candidate on
  `validation`. Never look at `holdout`.
- **27C-C (final gate):** run the frozen candidate once against `holdout`. If it fails, the fix is
  a *new* candidate re-validated on calibration/validation — the holdout result must not be used to
  tune (that would turn it into a training set).
