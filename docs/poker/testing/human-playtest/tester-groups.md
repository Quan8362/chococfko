# Poker Bot — Human Tester Groups (Prompt 27F-B)

**Status: PREPARED, NOT EXECUTED.** No tester has been invited, scheduled, or run. This document only defines *who* would test *what*. Inviting testers, enabling flags, and running sessions are explicitly out of scope here (same boundary as [`../../bots/human-playtest-plan.md`](../../bots/human-playtest-plan.md) §6).

This extends the cohort table already in [`human-playtest-plan.md`](../../bots/human-playtest-plan.md) §1. It does not replace it — it adds tester-count guidance, the two-account reality, and the exploitability focus for Prompt 27F-B.

---

## 1. Groups

| Group | Experience profile | Primarily tests | Evaluates |
|---|---|---|---|
| **A — Beginner** | New or near-new to poker; may not know hand rankings cold | **Easy** heads-up (and Easy 6-max) | Clarity, learning value, difficulty *suitability* for a beginner (is Easy actually beginner-friendly, not secretly punishing?) |
| **B — Casual / Intermediate** | Plays occasionally; knows rankings, position, pot odds | **Normal** heads-up (and mixed multiway) | Challenge level, action *variety*, predictability / repetition, whether Normal feels like "a straightforward reg" |
| **C — Experienced** | Regular / strong player; understands ranges, sizing, board texture | **Hard** heads-up and **Hard-weighted multiway** | Exploitability, bet-sizing sanity, **river discipline**, blind-vs-blind adjustment, and **multiway** quality (a 27F-A coverage gap — 0 Hard multiway hands ran) |

Difficulty definitions the groups are judging against live in [`../../bots/difficulty-definitions.md`](../../bots/difficulty-definitions.md): Easy = loose-passive beginner with *bounded* weaknesses (never 3-bets, never bluffs, value-only); Normal = solid tight-aggressive reg; Hard = strongest approved legal-information strategy with the strictest river discipline (not GTO, not solved).

## 2. Recommended tester count

Recommend **at least two testers per group** (six sessions-worth of humans minimum) so that no single person's taste drives a verdict, and so the rating medians in [`../../bots/human-playtest-plan.md`](../../bots/human-playtest-plan.md) §5 are meaningful rather than a single data point.

A tester may belong to more than one group if their experience genuinely spans it (e.g. a Casual player can also give useful Easy feedback), but each *rating* is filed under the group for the difficulty they actually played.

## 3. Initial local accounts (the real constraint)

Only **two** pre-provisioned local identities exist. They are defined and confirmed by the local setup in [`../local-playtest-setup.md`](../local-playtest-setup.md):

- `tester-a@example.com`
- `tester-b@example.com`

Rules for these accounts:

- They log in with **email + password** locally. The password lives only in the git-ignored `.env.playtest.local` (`PLAYTEST_TESTER_PASSWORD`). **Never** request, reveal, copy, paste, screenshot, or write that password into any doc, report, or result file.
- They **may be reused** across separate, individually-scheduled sessions (e.g. account 2002 runs an Easy session Monday and a Hard session Wednesday with different human testers at the keyboard).
- **Do not create or invite additional accounts automatically.** Provisioning more testers is a human decision made outside this preparation step.
- Because bots fill the other seats, a heads-up-vs-bots or multiway-vs-bots session needs **only one human seat**, so one account is enough per running session. The second account exists for a second parallel tester in a separate session.
- A **two-human table** (both accounts seated together) is **only** permissible if two-account Realtime is *explicitly enabled* in the safe local/isolated environment. It is off by default and must not be auto-enabled here.

## 4. Group → session mapping

Detailed per-session schedule, devices, and hand targets are in [`session-plan.md`](./session-plan.md). At a glance:

| Group | Owns these sessions |
|---|---|
| A — Beginner | Easy heads-up (desktop), Easy heads-up (mobile PWA) |
| B — Casual | Normal heads-up (desktop), Normal heads-up (tablet), shares mixed multiway |
| C — Experienced | Hard heads-up (desktop), Hard heads-up (mobile PWA), Hard-weighted multiway (tablet), shares mixed multiway |
| Any group | Reconnect/refresh drill, PWA install & resume drill |

---

**Related:** [human-playtest-plan.md](../../bots/human-playtest-plan.md) · [difficulty-definitions.md](../../bots/difficulty-definitions.md) · [session-plan.md](./session-plan.md) · [tester-instructions.md](./tester-instructions.md)
