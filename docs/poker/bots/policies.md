# Poker bots — policies

Four difficulty policies live in `lib/games/poker/bot/policies.ts`. Each is a pure function
`(BotObservation, rng) => BotDecision`. They read **only** the observation (the fairness boundary),
so none can use hidden information. `decideSafely` validates every decision against the
authoritative legal-action set before it is used, so a policy that ever slips is corrected to a
safe fold rather than producing an illegal action.

> **No claim of optimality.** These are heuristic and intentionally beatable. "Hard" is *less
> exploitable* than "easy" — it is **not** game-theory-optimal, and we do not claim it is.

## Shared building blocks

- **Equity** (`equity.ts`) — Monte-Carlo hand equity vs *N* unknown opponents on the current
  board, sampling from the unknown-card universe. Deterministic given the rng; the caller trades
  samples for CPU by difficulty (easy 40, normal 120, hard 320).
- **Preflop strength** — a cheap Chen-style heuristic in `[0,1]` used when the board is empty so
  the lighter bots skip Monte-Carlo preflop.
- **Pot odds** — `toCall / (pot + toCall)`; a call is +EV when equity beats it.
- **Position proxy** — button-relative seat distance in `[0,1]` (acts-later ≈ better), all public.

## The four policies

| Policy | Uses | Style | User-facing? |
|---|---|---|---|
| `simulation` | legal set only | **uniform random** legal action (random legal size for bet/raise) | **No — TEST ONLY** |
| `easy` | coarse strength (40 samples), minimal position | bets only when strong, **calls too much** (a beginner leak), no bluffs | Yes |
| `normal` | equity vs pot-odds (120), position, stack | calls on odds, value-bets strong hands, **light capped bluff** in position | Yes |
| `hard` | equity (320), multiway-aware bars, stack | tighter multiway, **varied sizing** (½/⅔/pot), short-stack shove/fold, **controlled** bluffing | Yes |

### `simulation` — the engine fuzzer
Picks a legal action uniformly and, for bet/raise, a uniform legal integer size. It has no notion
of hand strength (needs no equity CPU), so it is fast and produces **unpredictable but always
legal** lines — ideal for driving the engine into rare states. It is never shown to users
(`admin.ts` rejects it for any user-facing table).

### `easy`
Coarse strength thresholds. Bets/continues with strong holdings, folds trash, but **over-calls**
medium hands — the classic understandable beginner mistake. It knows one positional idea (open a
touch wider when last to act preflop) and never bluffs.

### `normal`
Calls when equity beats pot odds (small cushion), value-bets strong hands sized to the pot,
tightens its value range multiway, and stabs as a **low-frequency, capped** bluff only in position
with a weak hand.

### `hard`
Same public inputs, used more carefully: a larger equity sample, opponent-count-aware value and
continue thresholds, **stack-aware** shove/fold when short (< 12 bb), several bet sizings chosen by
a seeded weighting (harder to read), and a **capped** bluff frequency weighted by position. Still
purely heuristic — no solver, no hidden info.

## Safety contract (`policy.ts`)

Every decision passes through `decideSafely`, which guarantees a table can never be frozen or
crashed by a bot:

- **Throws** → safe fallback (check if free, else fold).
- **Illegal action** (e.g. raise above max, non-integer size) → safe fallback.
- **Unclean observation** (boundary violation) → safe fold, never a guess.
- **No legal actions** → fold.

So a broken, adversarial, or timed-out policy degrades to a safe legal action instead of wedging
the game. The simulation reports how often this happened (`fallbacks`); the skill policies are
tested to require **zero** forced fallbacks in normal play.

## Idempotency & natural delay

- `botActionKey(handId, seat, stateVersion)` — a deterministic key so a retried/duplicated bot
  submission collapses to one authoritative effect (mirrors the human `(hand_id, action_seq)`
  dedupe). Two submissions at the same state version produce the same key.
- `naturalActionDelayMs(...)` — a jittered, action-dependent think-time for **user-facing** tables
  so bots don't act inhumanly fast. **Presentation only**: it never gates or reorders authoritative
  state, and the simulation ignores it entirely (delay 0).
