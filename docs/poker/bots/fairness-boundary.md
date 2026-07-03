# Poker bots — the fairness (information) boundary

**Status: pure lib complete, live play HARD-OFF.** The bot layer lives in `lib/games/poker/bot/`
and is exercised only by the simulation harness + unit tests. No production seat runs a bot: the
`bot` feature flag is hard-off in `lib/games/poker/flags.ts` and there is no server wiring for
bot seats yet. Nothing here can enable a bot on its own.

## The rule

> A bot may use **only** the information a human sitting in that seat can see. Never more.

A human at the table can see: their **own two hole cards**, the **revealed** community cards for
the current street, every seat's **public stack / contribution**, the **pot**, whose turn it is,
their own **legal actions** (call amount, min/max raise-to), and the **public action history**.

A human **cannot** see: another player's hole cards, undealt board cards, the remaining deck
order, the shuffle seed, or any pre-showdown winner calculation. Neither can a bot.

## How the boundary is made *structural*, not promised

The rule is enforced by the **shape of the only input a policy receives**, not by asking the bot
to behave. See `lib/games/poker/bot/observation.ts`.

- A `BotPolicy` is `(obs: BotObservation, rng) => BotDecision`. Those two parameters are the
  **entire** world a policy can read.
- `BotObservation` is a **closed** type. It has fields for the bot's own cards, the revealed
  board, public seat facts, pot, legal actions, and public history — **and no field for anything
  hidden**. There is simply nowhere on the object to read an opponent's cards, a future card, the
  deck, or the seed. A policy cannot read what does not exist.
- `buildObservation(...)` is the single constructor. Its parameters accept only public facts plus
  **one** seat's own hole cards — there is no parameter through which another seat's private cards
  could arrive. The full board it is given is **sliced to the street** (`boardForStreet`) before it
  is stored, so future cards are removed *before* any policy runs.
- `assertObservationClean(obs)` is defence-in-depth. Before a policy runs (`decideSafely`) it
  re-checks that the projection carries none of the `FORBIDDEN_OBSERVATION_KEYS`
  (`holeBySeat`, `seed`, `deck`, `winner`, …), that the board length matches the street, and that
  the bot's own cards are disjoint from the board. A future refactor that accidentally widens the
  projection fails loudly in CI instead of silently leaking.

## What the tests prove

`lib/games/poker/bot/fairness.test.ts`:

- From a **full real deal** (all seats' hole cards known to the test), it builds the observation a
  bot at one seat would receive and asserts — by scanning both the visible-card set **and** the
  full JSON serialization — that **no opponent hole card** appears anywhere in it.
- On the flop, only 3 board cards are present; the **turn and river are structurally absent**.
- The bot's **own** two cards *are* present (a bot must see its own hand).
- `assertObservationClean` rejects every forbidden hidden-info key and a street/board mismatch.

## Action interface parity

A bot submits the **same** canonical actions a human does — `fold / check / call / bet / raise /
all_in` (`AppliedAction` in `betting.ts`). In the harness these go through the **same**
`applyAction` legality gate a human action goes through; when this is wired to the server, bot
commands must traverse the identical authoritative validation path (no privileged bot endpoint).

## Where randomness comes from

Bots never call `Math.random`. Every stochastic choice (equity sampling, sizing mix, bluff
frequency) routes through a **seeded** rng (`makeRng`), so a decision, a hand, or a whole
simulation is bit-for-bit reproducible. The equity sampler draws opponents' hands and the runout
from the **unknown-card universe** (full deck minus what the bot can see) — never from the real
deck — so sampling cannot smuggle in the actual cards.
