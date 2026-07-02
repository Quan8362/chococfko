# Poker Usability Test Script

_Moderated think-aloud script for Chợ Cóc FKO Poker (Alpha)._

## Before you start (facilitator checklist)

- [ ] Participant is on the `POKER_ALPHA_TESTERS` allowlist and `POKER_ENABLED` is on for them.
- [ ] Consent captured (recording, play-money, anonymous quotes). See `research-plan.md` §2.
- [ ] Note the participant's **experience level**, **device class**, **locale**, **orientation**.
- [ ] Remind them: think aloud, there are no wrong answers, we are testing the game not them.
- [ ] Do **not** teach. If they ask "what do I do?", reflect it back: "what would you try?"

Record for every task: the **primary metric**, any **hesitation/error**, and a **verbatim quote**.
"Success" = completed unaided. "Assisted" = needed a hint. "Fail" = could not complete.

---

## Tasks

> Phrase each as a goal, not an instruction. Say "Join a game you could play right now",
> not "Tap the green Join button".

### T1 — Enter the lobby
- **Prompt:** "Get yourself to a screen where you can pick a poker game to play."
- **Primary metric:** found the lobby unaided (Y/N); time to first meaningful action.
- **Watch for:** confusion between landing / lobby / quick-play.

### T2 — Join a public table
- **Prompt:** "Join a public table."
- **Metric:** joined the intended table (Y/N).
- **Watch for:** public vs private confusion; password tables; full tables.

### T3 — Understand the buy-in
- **Prompt (before confirming the buy-in):** "In your own words, what are you about to pay,
  and what do you get?"
- **Metric:** correctly distinguishes buy-in cost vs starting stack (Y/N).
- **Watch for:** min/max buy-in meaning; coin units.

### T4 — Identify the blinds
- **Prompt:** "Point to the small blind and the big blind. Who is posting them this hand?"
- **Metric:** correctly identifies SB/BB markers and the posting seats (Y/N).
- **Watch for:** dealer button vs blind confusion; marker legibility on small phones.

### T5 — Whose turn is it?
- **Prompt:** "Whose turn is it right now? How can you tell?"
- **Metric:** correctly identifies the current actor and the cue used (timer / highlight / label).
- **Watch for:** does the cue survive reduced-motion and colour-blindness? (Corroborate with audit.)

### T6 — Check
- **Prompt:** "It's your turn and you don't want to bet. Check."
- **Metric:** checked without hesitation (Y/N); `elapsedMs` signal.
- **Watch for:** Check vs Call confusion when nothing is owed.

### T7 — Call
- **Prompt:** "Match the current bet."
- **Metric:** called the correct amount (Y/N).
- **Watch for:** did they know the call size before committing?

### T8 — Raise
- **Prompt:** "Raise. Pick any amount you like and confirm it."
- **Metric:** completed a raise (Y/N); `raise_composer_opened` → submit vs `..._cancelled`.
- **Watch for:** finding the composer; understanding "raise TO" vs "raise BY".

### T9 — Minimum raise
- **Prompt:** "Make the smallest raise the game allows."
- **Metric:** used the **Min** preset or reached `minRaiseTo` (Y/N).

### T10 — Pot preset
- **Prompt:** "Bet about the size of the pot."
- **Metric:** used a pot-fraction preset (Y/N).
- **Watch for:** do preset labels (½ / ⅔ / ¾ / Pot) read clearly in their locale?

### T11 — Slider
- **Prompt:** "Set the bet to roughly [facilitator names a value between min and max]."
- **Metric:** landed within one big-blind step (Y/N); `invalid_amount_attempt` count.
- **Watch for:** slider precision on touch; the −/+ steppers; typing into the numeric field.

### T12 — All-in
- **Prompt:** "Put all your chips in."
- **Metric:** reached the all-in **confirm** step and completed it deliberately (Y/N);
  `allin_confirm_opened` vs `allin_confirm_cancelled`.
- **Watch for (Critical):** did all-in ever fire **without** a deliberate confirm? Any accidental
  trigger is a Critical finding.

### T13 — Understand a side pot
- **Setup:** engineer a hand with at least one short-stack all-in so a side pot forms.
- **Prompt:** "There's more than one pot here. Which chips can you win, and which can't you?"
- **Metric:** correctly reads main vs side pot and eligibility (Y/N).
- **Watch for:** the mobile collapsed summary — is eligibility discoverable?

### T14 — Reconnect
- **Setup:** with permission, toggle the device's network off for ~10 s mid-hand, then on.
- **Prompt:** "Your connection just dropped. What is the game telling you, and what do you do?"
- **Metric:** understood the reconnect state and recovered (Y/N); `reconnect_recovered.elapsedMs`.
- **Watch for (High):** was the state legible without colour alone? Did they fear losing coins?

### T15 — Sit out
- **Prompt:** "Take a break without leaving the table."
- **Metric:** sat out (Y/N); understood they keep their seat.

### T16 — Return
- **Prompt:** "Come back and start playing again."
- **Metric:** returned and posted correctly on the next hand (Y/N).

### T17 — Leave & cash out
- **Prompt:** "Leave this table and take your chips."
- **Metric:** left and understood the coin outcome (Y/N).
- **Watch for:** fear/uncertainty about losing the stack; mid-hand exit forfeit rules.

### T18 — Hand history
- **Prompt:** "Find the last hand you played and open it."
- **Metric:** located history and opened a hand (Y/N).

### T19 — Why did a hand win?
- **Prompt:** "Look at a finished hand. Why did the winner win?"
- **Metric:** correctly explains the winning reason from the UI (Y/N).
- **Watch for:** is the winning category/best-five communicated, or only the payout?

---

## Wrap-up (per session)

- Overall: "What was the most confusing moment?" / "What felt best?"
- Ask them to file one **UX feedback** report in-game (dogfoods the channel; category + 1–5 rating).
- Thank + close. Transfer observations into `findings-template.md` within 24 h while fresh.
