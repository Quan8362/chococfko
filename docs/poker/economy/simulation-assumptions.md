# Simulation Assumptions

Tool: [`lib/games/poker/sim/economySim.ts`](../../../lib/games/poker/sim/economySim.ts) (pure,
deterministic) + CLI `lib/games/poker/sim/cli.ts`
(`npm run poker:economy:list | :run | :sweep`).

> **This is a modeling tool, not a prediction.** It makes deliberately simple, transparent
> assumptions so we can reason about *directions* (does inflation runaway? does dumping
> concentrate coins? are busted players locked out?) before enabling anything in production. It
> does **not** claim to forecast real player behaviour.

## 1. What is modeled

- A growing population of players, each with a starting wallet, an archetype (activity, skill,
  variance), and an optional "dumper" flag.
- **Faucets:** signup grants for the initial cohort + daily new players, and busted-wallet
  recovery on the real cooldown/eligibility.
- **Gameplay as zero-sum pairwise exchange.** Each day, active players are grouped by their
  recommended tier, shuffled (seeded), and paired. Each pair exchanges chips based on the skill
  edge difference plus zero-mean noise scaled by √hands, in big blinds, converted to chips at
  the tier BB. Transfers are clamped to each player's table exposure (`min(balance, max
  buy-in)`) so nobody loses more than they could bring — an exact per-pair conservation.
- **Chip dumping:** each dumper funnels a fixed daily amount to **one persistent collector**
  (a real farm funnels to a fixed account), a pure transfer.
- **Metrics per day:** total supply, faucet coins minted, recovery claims, busts, median
  balance, Gini coefficient, and top-1% / top-10% coin share.

## 2. Key structural facts the model proves

- **Supply == faucet output, exactly.** Gameplay and dumping are transfers, so
  `finalTotalCoins == totalFaucetCoins` every run (asserted in `economySim.test.ts`). Inflation
  is therefore driven **only** by faucets — mainly new signups.
- **Determinism.** Given a seed, a run is bit-for-bit reproducible (shared `mulberry32` RNG),
  so scenarios are comparable and tests are stable.
- **No negative balances, integer throughout.**

## 3. Assumptions & simplifications (be honest about these)

1. **Pairwise, not 6-max.** Real hands are up to 6 players; the sim pairs players. This
   captures redistribution and variance direction but understates multiway pot dynamics.
2. **Static archetypes.** Players don't learn, tilt, change stakes strategically, or quit after
   losses. Activity is an i.i.d. daily coin-flip.
3. **Skill edges are exogenous constants** (bb/100), not emergent from the actual hand engine.
   The real edge distribution is unknown; values are guesses.
4. **One "session" per active day**, exposure capped at one max buy-in/day. Real players may
   rebuy repeatedly; this bounds daily swings conservatively.
5. **Dumping is frictionless and undetected** in the model — an upper bound on its impact. In
   production the one-seat rule, concurrent-seat cap, and `collusionRiskScore` review make it
   costlier and observable.
6. **No cosmetic sinks, no achievements.** Only the two live faucets are modeled.
7. **Population only grows** (no account deletion / churn), which *overstates* inflation vs. a
   population that also loses users.

## 4. Built-in scenarios

| Scenario | Days | Init | +/day | Dumpers | Purpose |
|---|---:|---:|---:|---:|---|
| `baseline` | 90 | 1,000 | 20 | 2% | healthy mixed population |
| `heavy_growth` | 90 | 500 | 80 | 2% | stress faucet-driven inflation |
| `abuse_farm` | 60 | 1,000 | 30 | 15% | stress coin concentration |

Archetype mix (share / active-prob / hands-per-day / skill bb100 / variance) is defined inline
in `SCENARIOS`. Change them, or pass your own `EconomyScenario` to `runEconomySimulation`.

## 5. Indicative results (seed-dependent, directional only)

- **baseline** (seed 42): ~185% total inflation over 90 days, final Gini ≈ 0.40, top-1% share
  ≈ 8%, hundreds of recovery claims — i.e. a normal social-casino distribution; inflation is
  signup-dominated, concentration moderate.
- **abuse_farm** (seeds 1–3): higher Gini (≈ 0.59) and top-1% share (≈ 14%), confirming that
  **dumping — not gameplay — is the concentration driver**, which is exactly what the anti-abuse
  controls target.

Reproduce: `npm run poker:economy:run -- --scenario baseline --seed 42` and
`npm run poker:economy:sweep -- --scenario abuse_farm --seeds 1,2,3`.

## 6. How to use the outputs

- Treat trends (rising Gini, runaway inflation) as **flags to investigate**, not forecasts.
- Use `sweep` across seeds to see variance before drawing any conclusion from a single run.
- Before publishing a new economy version, run the sim with the proposed config to sanity-check
  inflation and concentration direction — it is a design aid, not an approval gate.
