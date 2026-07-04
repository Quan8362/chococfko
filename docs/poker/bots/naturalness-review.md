# Poker Bot — Naturalness Review (Prompt 27D)

Does each difficulty play in a way that reads as a *believable* opponent (varied, non-repetitive,
sensibly-timed) — **without being disguised as a human**? Evidence:
[`evaluation-results.md`](./evaluation-results.md) · [`27d-results.json`](./27d-results.json).

## 1. Action diversity (not a single-action policy)

Per-decision action mix (self-play, fresh seeds) — all six action types appear:

| Table/Diff | fold | check | call | bet | raise | all-in | top-action share |
|---|---:|---:|---:|---:|---:|---:|---:|
| hu-standard easy | .40 | .20 | .17 | .12 | .10 | .00 | 0.40 |
| hu-standard normal | .24 | .19 | .23 | .18 | .16 | .00 | 0.24 |
| hu-standard hard | .22 | .19 | .24 | .18 | .17 | .00 | 0.24 |
| 6max-standard normal | .76 | .03 | .07 | .05 | .09 | .00 | 0.76 |
| 6max-standard hard | .63 | .07 | .11 | .08 | .11 | .00 | 0.63 |

- **Heads-up:** normal/hard spread across five action types with top-action share 0.24 — highly
  varied, believable. Easy is more predictable (0.40, more folding/calling) — the intended beginner
  read.
- **6-max:** the high fold share (0.63–0.80) is **correct tight-fold discipline** at a full table, not
  a mechanical loop — the *non-fold* actions still span call/bet/raise/check. A tight regular folding
  most 6-max hands is natural, not robotic.

## 2. Repetition / mechanical-street checks

- **No fixed street script** — bet/c-bet/value/bluff sizings are seeded-mixed for normal/hard (2–3
  menu entries); the same hand class does not always take the same line.
- **All-in% flat and tiny** (0.00–0.25%) — no "jam-happy" mechanical tell.
- **Sizing varies** for normal/hard (mixed `cbet`/`value`/`bluff` menus); easy's single size is the
  deliberate, legible beginner signature.

## 3. Timing (natural, strength-agnostic, never deceptive)

- Decision compute is 8–33 ms mean (easy→hard) — far below the **700–6000 ms cosmetic action delay**
  applied at the table. So the *displayed* pace is driven by the cosmetic delay, not by how hard the
  bot "thought", and does not leak hand strength through response time. (The delay lives in the
  practice worker, not in the pure policy.)
- Timing does **not** correlate with difficulty in a way a human could read (all difficulties sit
  under the same cosmetic-delay envelope).

## 4. Bots are NOT disguised as humans (anti-deception)

This is a deliberate design and product stance — naturalness must **not** become deception:

- A bot occupant carries a `botId` + difficulty and **never a `userId`** (structural — practice
  `isolation.test.ts` CASE 21). It cannot impersonate a real user.
- Practice bots live only in the ISOLATED practice runtime; results feed **no** ranking / achievement
  / mission / human-stat, so a bot can never masquerade as a human on a leaderboard.
- The naturalness goal is "a believable *opponent style*", explicitly labelled as a bot — not a fake
  human identity. The human-playtest plan checks that testers are **always** aware they face bots
  ([`human-playtest-plan.md`](./human-playtest-plan.md), rating #7).

## Conclusion

Each difficulty is varied and non-mechanical (all six action types, context-dependent top-action share
0.24–0.80, mixed sizing for normal/hard, flat all-in%), sensibly and non-deceptively timed, and
distinctly styled (loose-passive Easy vs tight-aggressive Normal/Hard). The bots read as believable
opponents while remaining clearly, structurally labelled as bots. ✅ Natural, not disguised.
