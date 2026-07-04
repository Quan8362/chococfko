# Poker Bot Postflop Calibration (Prompt 27C-B)

The flop/turn/river decision model. Config in
[`strategyConfig.ts`](../../../lib/games/poker/bot/strategyConfig.ts) (`PostflopRules` per
difficulty); interpreter `decidePostflop` in [`strategy.ts`](../../../lib/games/poker/bot/strategy.ts);
board & hand classification in [`board.ts`](../../../lib/games/poker/bot/board.ts). Tested by
`postflop.test.ts` + `board.test.ts`.

## Inputs (own + public only)

- **Bounded equity** — Monte-Carlo vs the field (`estimateEquity`, difficulty-capped samples + early
  stop). The continuous strength signal.
- **Board texture** (`classifyBoard`) — paired / monotone / two-tone / rainbow / connected, plus a
  `wetness` ∈ `[0,1]` blend of suitedness + connectedness. Cached once per decision.
- **Made-hand / draw class** (`classifyHand`) — made tier (`nutlike`/`strong`/`medium`/`weak`/`air`),
  pair kind (over/top/middle/bottom), flush draw, open-ended vs gutshot, overcards, and a
  `drawStrength` ∈ `[0,1]`. This lets the bot *semi-bluff a draw* and *protection-bet a vulnerable
  made hand* — decisions equity alone cannot express.
- **Pot odds, SPR, position, opponent count** (`context.ts`).

Board/hand classification uses only the bot's own cards + the revealed board — a human in the seat
sees exactly the same.

## Thresholds (per street), against equity `[0,1]`

- `valueBet[street]` — bet/lead a made hand for value when checked to.
- `raiseValue[street]` — raise a made hand for value facing a bet.
- `continueMargin[street]` — equity margin **above** pot odds required to call. River margins are
  larger for `hard` (river discipline — it folds medium hands to big rivers).
- `multiwayTighten` — added to the value/continue bars per **extra** opponent (>1). Tighten as the
  field grows.
- `semiBluffMinDraw`, `semiBluffFreq`, `bluffFreq`, `cbetFreq`, `protectionWetness` — the frequency /
  gating knobs for the non-value lines.

## Lines the bot can take (all explainable)

Facing no bet (checked to): **Value Bet** → **Protection Bet** (a `medium` made hand on a board wetter
than `protectionWetness`, to deny equity) → **C-Bet / Delayed C-Bet** (as the preflop aggressor on a
heads-up or dry board, capped by `cbetFreq`) → **Semi-Bluff** (a draw ≥ `semiBluffMinDraw`, capped by
`semiBluffFreq`) → **Controlled Bluff** (air, heads-up, in position, capped by `bluffFreq`) →
**Check**.

Facing a bet: **Value Raise** (equity ≥ `raiseValue`) → **Check-Raise (semi-bluff)** (a strong draw,
capped) → **Call** (equity beats pot odds + margin, with a small implied-odds allowance for strong
draws when deep) → **Fold**.

## Board-texture coverage

The model reacts to paired, monotone, two-tone, rainbow, dry, wet, and connected boards through
`wetness` (protection sizing / bluff gating) and `drawStrength` (semi-bluff eligibility), and to
heads-up vs multiway through `multiwayTighten` and the heads-up-only bluff gate.

## Difficulty differences (postflop)

- **easy** — value-only. Low equity sample budget, no semi-bluff, no pure bluff, no protection, one
  predictable size, folds without a real edge but calls a touch too wide overall. A calling-station-
  ish beginner that still value-bets its strong hands.
- **normal** — value + protection + capped semi-bluff + capped positional bluff, multiple sizes,
  sensible folding, c-bets as the aggressor.
- **hard** — the full line set with the largest equity budget, texture-aware c-bet/protection, varied
  sizing, action reading, and the strictest river discipline. Still heuristic and beatable.

## Directional sanity (tests)

`postflop.test.ts` pins the qualitative behaviour: a set value-bets when checked to and never folds
facing a bet; pure air folds to a pot-sized bet; `normal`/`hard` can semi-bluff a nut draw while
`easy` never bluffs a marginal one; top-pair continues against a priced bet. `equity` noise is handled
by asserting *existence over seeds* for frequency-based lines and using clearly strong/weak hands for
the deterministic ones.
