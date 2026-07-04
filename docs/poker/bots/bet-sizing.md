# Poker Bot Bet Sizing (Prompt 27C-B)

All sizing goes through [`sizing.ts`](../../../lib/games/poker/bot/sizing.ts). Menus (pot fractions /
bb multiples) live in [`strategyConfig.ts`](../../../lib/games/poker/bot/strategyConfig.ts)
(`SizingMenu` per difficulty). Tested by `sizing.test.ts`.

## The invariants (every amount, always)

Every amount `sizing.ts` produces is:

1. **an integer** — `clampTo` rounds to the nearest integer (chips are integers);
2. **a raise-TO total**, never a raise-BY delta — the vocabulary `applyAction` expects;
3. **clamped into the server-provided legal band** `[min, max]` from the observation's legal action;
4. **never zero, negative, fractional, or above the seat's stack** (the band's `max` = own committed +
   own stack, so a clamped value can never exceed the stack);
5. **one of the legal actions** in `obs.legal` — if the requested aggressive action is not offered,
   the helper returns `null` and the caller falls back to call/check/fold;
6. **re-validated** by `decideSafely` against the same legal set before it can reach the engine.

Belt (`sizing.ts` clamps) **and** braces (`decideSafely` re-checks): a sizing bug cannot put an
illegal amount on the table.

## Raise-TO vs raise-BY (the classic bug this avoids)

Facing a bet, a pot-sized raise is sized as:

```
raiseTo = currentBet + fraction × (potTotal + toCall)     // raisePotFraction()
```

i.e. it adds `fraction` of the post-call pot **on top of matching** — a raise-**to** total. Example
(`sizing.test.ts`): `currentBet 300`, `toCall 300`, `pot 500`, `fraction 1.0` ⇒ `raiseTo = 300 + 800 =
1100` (not a raise-*by* of 800). An opening bet with nothing owed is `round(potTotal × fraction)`,
clamped to the bet band.

## The menus

`SizingMenu` (per difficulty):

| Field | Meaning |
|---|---|
| `openBb` | preflop open raise-to, in big blinds |
| `perLimperBb` | added bb per limper already in the pot |
| `threeBetMult` / `fourBetMult` | 3-bet / 4-bet raise-to as a multiple of the raise being faced |
| `cbet` / `value` / `bluff` | pot-fraction options for each postflop line |

`easy` uses a **single** predictable size per line (`mixesSizing = false`); `normal` and `hard`
**mix** among the menu entries via the seeded rng, so their sizing is harder to read (deterministic
given the rng, so still replayable). A personality's `sizingBias` shifts every fraction by a small,
bounded amount.

## Fallback ladder

`raisePotFraction` / `betPotFraction` fall back to `all_in` when raising/betting is closed but a shove
is legal; `aggressiveToAmount` returns `null` when no aggressive action is legal at all, and the
strategy then takes `passiveContinue` (call/check) or `checkOrFold`. Short-stack jams request
`raiseToChips(obs, maxRaiseTo)`, which clamps to the top of the legal band (or falls back to `all_in`).
