# Poker Bot — Tester Evaluation Form (Prompt 27F-B)

One form per tester **per session**. All ratings are anonymous — filed under a tester ID and group, never a name (see [`result-import-format.md`](./result-import-format.md)). This form is the superset of the 9-axis form in [`../../bots/human-playtest-plan.md`](../../bots/human-playtest-plan.md) §3; the extra axes below (decision quality, bluff credibility, river, multiway, action variety, enjoyment, mobile usability) are the Prompt 27F-B additions.

---

## Session header (fill first)

```
Tester ID (anon):      ____   (e.g. A1, B2, C1 — never your name)
Experience group:      A / B / C
Session ID:            ____   (from session-plan.md, e.g. S5)
Difficulty played:     Easy / Normal / Hard / Mixed
Table type:            Heads-up / 6-max multiway
Device + browser:      ____   (e.g. Android Chrome, iPad Safari)
App mode:              Browser / PWA
Hands actually played: ____
Session completed?     Yes / No — if No, reason: ____
```

## 1–5 ratings

Scale: **1 = poor, 5 = excellent. 5 is always the *good* end**, including for the reverse-scored items (marked ⤺), where "5" means "no problem at all." Leave blank only if a session genuinely couldn't exercise that axis (e.g. multiway quality in a heads-up-only session).

| # | Axis | What 5 means (best) | What 1 means (worst) | Your score (1–5) |
|---|---|---|---|---|
| 1 | **Fairness** | Felt completely fair; no sense the bot knew hidden info | Felt like the bot cheated / knew my cards | ☐ |
| 2 | **Difficulty suitability** | Difficulty matched what this level should be for me | Badly mismatched (way too easy or too hard for the label) | ☐ |
| 3 | **Decision quality** | Bot decisions looked sound and sensible | Frequently made clearly bad/nonsensical decisions | ☐ |
| 4 | **Bet-size naturalness** | Sizes looked like a real player's | Sizes were weird/robotic/implausible | ☐ |
| 5 | **Action variety** | Mixed its play; hard to predict | Did the same thing every time | ☐ |
| 6 | **Repetition** ⤺ | No noticeable repeated pattern | Blatant, exploitable repeating pattern | ☐ |
| 7 | **Bluff credibility** | Bluffs (where present) were believable and well-chosen | Bluffs were obvious, absent, or nonsensical | ☐ |
| 8 | **River quality** | River bets/folds/calls were disciplined and sensible | River play was loose, spewy, or exploitable | ☐ |
| 9 | **Multiway quality** | Handled 3+ way pots well | Fell apart in multiway pots | ☐ |
| 10 | **Timing naturalness** | Timing revealed nothing about hand strength | Timing clearly telegraphed strong/weak hands | ☐ |
| 11 | **UI clarity** | Always clear whose turn, amount to call, pot, actions | Confusing / hard to read state | ☐ |
| 12 | **Mobile usability** | Controls fully usable on this device/orientation | Controls cramped/unusable / hidden by notch | ☐ |
| 13 | **Frustration** ⤺ | Not frustrating at all | Constantly frustrating | ☐ |
| 14 | **Learning value** | I learned something / it'd help a learner | Taught nothing / actively misleading | ☐ |
| 15 | **Enjoyment** | I enjoyed it and would play again | Actively unpleasant | ☐ |

## Integrity check (not a 1–5 — required)

These map to stop-ship conditions in [`../../bots/human-playtest-plan.md`](../../bots/human-playtest-plan.md) §5 and [`stop-test-checklist.md`](./stop-test-checklist.md). Any "No" / "Yes" in the wrong direction should also be filed as a **blocker** bug.

```
Were the bots ALWAYS clearly labeled as bots?         Yes / No
Did you ever see cards you shouldn't be able to see?   No / Yes  ← "Yes" is a stop-ship
Did chips ever fail to add up / pay twice / go negative? No / Yes ← "Yes" is a stop-ship
Did any hand freeze unrecoverably?                      No / Yes
```

## Free-text questions

Short answers are fine. Don't include real cards, the deck, or any credential — describe in words and use hand/table IDs.

1. **Which single decision looked most unnatural?** (what the bot did, and why it looked wrong)
2. **Which repeated pattern did you notice**, if any?
3. **Was the difficulty too easy or too hard** for the level it claimed to be?
4. **Did you find a repeatable exploit** — something you could do every time to beat the bot?
5. **Did any bet size look unreasonable?** (which spot, roughly what size)
6. **Did timing reveal likely hand strength?** (did fast/slow tells give the bot away?)
7. **Did any UI, Realtime, reconnect, or integrity issue occur?** (link the bug report ID if you filed one)
8. **Would you voluntarily play another session?** Why or why not?

---

## How these feed the verdict

Aggregation happens in Prompt 27F-C from the [`result-import-format.md`](./result-import-format.md) file. The success bars already defined in [`../../bots/human-playtest-plan.md`](../../bots/human-playtest-plan.md) §5 apply: any credible "saw my cards / future" report is a stop-ship; median **difficulty suitability ≥ 4/5** per group; median **action variety ≥ 3.5/5**; no systemic **frustration** theme; and no device/layout that blocks a legal action or hides the bot label. Do not compute or invent medians here — that's 27F-C's job on real data.

---

**Related:** [result-import-format.md](./result-import-format.md) · [bug-report-template.md](./bug-report-template.md) · [stop-test-checklist.md](./stop-test-checklist.md) · [human-playtest-plan.md](../../bots/human-playtest-plan.md)
