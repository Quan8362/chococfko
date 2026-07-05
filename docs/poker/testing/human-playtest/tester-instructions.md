# Poker Bot — Tester Instructions (Prompt 27F-B)

Welcome, and thank you for helping test the practice poker bots. Please read this once before you start. It takes two minutes and it keeps the test safe and useful. Wording here reuses the tone of the closed-beta [`../../beta/tester-guide.md`](../../beta/tester-guide.md), adapted for the isolated, practice-only bot test.

---

## What this is

- **This is an internal, local test.** Everything runs on a machine at `http://127.0.0.1:3000` against a local database. There is no public server involved and no other real players. A banner on screen should read **"LOCAL TEST — NOT PRODUCTION."** If it says anything else (amber "staging", red "unverified"), stop and tell the coordinator before playing.
- **You are playing against bots, and they are labeled as bots.** Every non-human seat is marked as a bot in the UI. You should never be tricked into thinking a bot is a human. If a seat's bot label is ever missing or unclear, that itself is a finding — please report it.
- **The chips are practice chips ("xu") with no cash value.** Nothing you win or lose is real money. There is no wallet, no payment, no cash-out. Play freely and take risks you would never take with real stakes.
- **No production data or wallets are involved.** This build cannot touch the live site, live accounts, or any real balance. If you ever see anything that looks like real money or a live production screen, stop immediately.
- **This local test does not validate real Google login (OAuth).** You sign in locally with a pre-set email and password. "Sign in with Google" is *not* what we're testing here and may not work locally — that's expected. (Real Google login is validated separately in the staging environment, not in this session.)

## Signing in

- Use the account and password your coordinator gives you, entered as **email + password**. The two local test accounts are `tester-a@example.com` and `tester-b@example.com`.
- **Keep the login credentials private.** Do not share, screenshot, paste, type into chat, or write down the password anywhere — not in a bug report, not in the results, nowhere. If you think a credential has been exposed, stop and tell the coordinator.
- Play in the browser profile / device the coordinator assigns for your session (see [`session-plan.md`](./session-plan.md)).

## While you play

- **Play naturally, the way you normally would** at your experience level. Don't try to "help" the bot or dump chips — we want a realistic read on how the bots feel to a real player.
- **Watch for hands that feel off** and jot them down: a bot decision that looked unnatural, a bet size that made no sense, a pattern the bot repeats every time, timing that seemed to telegraph the bot's hand, or anything that felt unfair. The rating form ([`evaluation-form.md`](./evaluation-form.md)) asks about exactly these, so a few notes as you go will make it easy.
- **Record unusual hands with enough detail to find them again** — the table/hand ID if visible, roughly when it happened, and what the bot did. If something looks like a real defect, file it with the [`bug-report-template.md`](./bug-report-template.md).
- **Never include real cards, the deck, or any credential in your notes or reports.** Describe what happened in words and use IDs and chip amounts; the system deliberately never logs hole cards, and neither should you.

## Stop the session immediately if you see any of these

These are hard stops. Don't keep playing "to see if it happens again" — stop and tell the coordinator (full list and definitions in [`stop-test-checklist.md`](./stop-test-checklist.md)):

- You can see another player's or the bot's **hidden cards**, or any card you shouldn't be able to see.
- Any sign the **bot is cheating** (playing as if it knows your cards or future cards).
- Anything touching a **real wallet or real money**.
- **Chips don't add up** — a pot pays out wrong, a stack goes **negative** or shows a fraction, or a hand appears to **pay out twice**.
- A hand **freezes** and cannot recover, or you're allowed to act **out of turn** or make an illegal move.
- Any **privacy or authorization** problem — you can access something you shouldn't, or you suspect data is leaking.
- Anything that looks like it's hitting the **real production** site, or a **tournament** turning on.

You will never be blamed for stopping. A false alarm costs a minute; a missed integrity bug is the whole point of the test.

## When you finish

- Fill in the [`evaluation-form.md`](./evaluation-form.md) (1–5 ratings + the short free-text questions) for the session you played.
- File any [`bug-report-template.md`](./bug-report-template.md) reports for issues you hit.
- Hand your notes to the coordinator, who records them in the anonymous result format for the next phase. Your name is **not** stored with your ratings — only an anonymous tester ID.

Have fun, play honestly, and try to break things — respectfully. That's exactly what helps.

---

**Related:** [evaluation-form.md](./evaluation-form.md) · [bug-report-template.md](./bug-report-template.md) · [stop-test-checklist.md](./stop-test-checklist.md) · [session-plan.md](./session-plan.md) · [beta/tester-guide.md](../../beta/tester-guide.md)
