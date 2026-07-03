# Poker bots — economy policy

How virtual coins interact (or deliberately do **not** interact) with bots.

## Principles

1. **Bots create and destroy no coins.** A poker hand is zero-sum (no rake, no ante), so
   settlement only *moves* chips between seats. A bot at a table is just another seat in that
   zero-sum exchange — it is never a coin faucet or sink. This is verified continuously by the
   simulation's per-hand `Σ deltas == 0` and supply-accounting invariants
   (`docs/poker/bots/simulation.md`).
2. **Conservative first rollout: separate / controlled economy.** `BotTableConfig.separateEconomy`
   defaults **true**. The intent for any first live bot surface is that bot tables use a **separate
   or capped** coin context rather than the main shared wallet, so a bug or an exploit at a bot
   table cannot drain real balances. Sharing the main wallet is an explicit later decision, not the
   default.
3. **No coin manipulation via bots.** Bots must never be used to steer coin loss/gain — they are
   not a house edge and not a payout dial. They play the same legal actions a human does, decided
   only from public information.

## Why "separate economy" matters even though play is zero-sum

Zero-sum guarantees the *table* conserves, but it does not by itself protect against **collusion /
chip-dumping** patterns (a bot deliberately losing to a target). Keeping bot tables on a separate
or capped economy structurally removes the incentive: chips won from bots at a sandboxed table do
not enrich a main-wallet balance. The existing anti-collusion work
(`lib/games/poker/integrity/`) still applies to any human seats present.

## Simulation vs production

- The **simulation harness** uses an auto-**rebuy** faucet purely so the fuzzer can run many hands
  without stopping at the first bust. This faucet is a *test* device: every injected chip is
  tracked and asserted, and it exists only inside `sim.ts`. It is **not** a production economy and
  moves nothing real.
- No production coin path touches bots in this phase. The wallet RPCs (SECURITY DEFINER, ledgered)
  remain the only authority for real coin movement, exactly as for human play.

## Statistics

Bot-table results default to **excluded** from public stats/ranking (`affectsStats: false`) so the
economy visible to players (leaderboards, rank tiers) reflects human competition. See
`docs/poker/bots/user-disclosure.md`.

## Open decisions (future phases)

- Whether/when practice bot tables use the shared wallet at capped stakes vs a fully separate
  practice-coin balance.
- Whether any bot-table results ever count toward stats (currently: no).
- Reward interaction: this phase adds **no** reward and **no** new coin source tied to bots.
