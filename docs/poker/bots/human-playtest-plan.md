# Poker Bot — Human Playtest Plan (Prompt 27D)

**Status: PREPARED, NOT EXECUTED.** No testers are invited and no flag is enabled. This plan is a
deliverable to be run in a later phase (before any bot enablement), not an action taken in 27D. The
automated evaluation ([`evaluation-results.md`](./evaluation-results.md)) is statistical and
structural; a human playtest adds the subjective axis (feel, frustration, learning value, timing
naturalness on real latency) that a simulation cannot measure.

Gating reality: `POKER_BOT_ENABLED` is hard-off; `POKER_PRACTICE_BOTS_ENABLED` is off. Practice bots
run in the ISOLATED practice runtime (chips never touch `game_wallets`/`coin_ledger`; results feed no
ranking/achievement/mission/human-stat). A playtest requires ops to flip `POKER_PRACTICE_BOTS_ENABLED`
for the allowlisted testers **only** — never `POKER_BOT_ENABLED`.

## 1. Cohorts × difficulty (the intended-user match)

| Tester profile | Table | What we are checking |
|---|---|---|
| Complete beginner | vs **Easy**, heads-up | Not overwhelmed; can win some pots; Easy never spews or traps cruelly |
| Beginner | vs **Easy**, 6-max | Multiway is legible; Easy's limping/over-calling reads as "a loose beginner", not a bot |
| Casual player | vs **Normal**, heads-up | A fair, "solid regular" feel; loses/wins believably; no obvious leak to abuse |
| Casual player | vs **Normal**, 6-max | Positional play + c-bets feel human; sizing not robotic |
| Experienced player | vs **Hard**, heads-up | Real resistance; river discipline noticeable; still beatable, not a solver wall |
| Experienced player | vs **Hard**, 6-max | Handles multiway risk; does not spew; 3-bet/blocker bluffs feel deliberate |
| Any | **Mixed** table (easy+normal+hard) | Difficulties feel distinct at one table |

## 2. Devices / layouts

Run each cohort on: **desktop**, **tablet landscape**, **mobile landscape**. (Poker table UI is
landscape-first.) Confirm action controls, bet-sizing slider, timers, and bot action pacing are
usable and legible on each; no layout blocks a legal action.

## 3. What each tester rates (1–5 + free text)

1. **Fairness** — did it ever feel like the bot "knew" your cards or the future? (Any *yes* is a
   stop-ship; cross-check against the structural fairness proof — it should be impossible.)
2. **Difficulty match** — was Easy/Normal/Hard appropriately easy/medium/hard for you?
3. **Distinctness** — could you tell Easy from Normal from Hard?
4. **Repetition** — did the bot feel mechanical / do the same thing every street?
5. **Sizing** — did bet sizes feel sensible, or weird/robotic?
6. **Timing** — did the action delay feel natural (not instant, not laggy) on your real connection?
7. **Labeling** — was it always clear you were playing bots (never deceived into thinking human)?
8. **Frustration** — anything rage-inducing (endless min-raises, constant all-ins, cooler-farming)?
9. **Learning value** — for beginners: did playing the bot teach you anything?

## 4. Structured hands to seed discussion (optional scripted spots)

- A blind-vs-blind steal spot (does Normal/Hard defend/attack believably?).
- A wet-board multiway pot (does Hard tighten / protect, does Easy over-call?).
- A short-stack all-in spot (push/fold feels correct, not random).
- A river over-bet from the bot (is it value-heavy, not a wild bluff?).

## 5. Success criteria (before recommending enablement)

- **Zero** credible "it saw my cards / the future" reports.
- Median difficulty-match ≥ 4/5 for each cohort's intended difficulty.
- Median distinctness ≥ 3.5/5.
- No systemic frustration theme (e.g. "Hard just shoves every hand" — which the automated all-in%
  flatness already contradicts, but human perception is the final check).
- No device/layout blocks a legal action or hides the bot-vs-human labeling.

## 6. Explicitly out of scope for 27D

Inviting testers, enabling any flag, collecting real user data, or touching production. This document
is the runbook only.
