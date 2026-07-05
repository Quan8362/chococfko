# Poker Bot — Human Session Matrix & Hand Targets (Prompt 27F-B)

**Status: PREPARED, NOT EXECUTED.** These are planned sessions with target hand counts. No session is real until it has real evidence (see [`result-import-format.md`](./result-import-format.md)). Do not mark a session complete without it.

Environment for every session is the **verified local stack only** (from [`../local-playtest-setup.md`](../local-playtest-setup.md)):

- App: `http://127.0.0.1:3000` (practice matrix at `/games/poker/practice`)
- Local Supabase: `http://127.0.0.1:64321`
- Local mail (Inbucket / Mailpit): `http://127.0.0.1:64324`
- Public poker **OFF**, cash bots **OFF**, tournaments **OFF**, practice-only economy. No production traffic, no production wallets.

---

## 1. Session matrix

Each row is one planned session. "App mode" = browser tab vs installed PWA. "Special" flags reconnect / install / orientation coverage. Bots fill non-human seats and are always labeled as bots.

| ID | Group | Difficulty | Table mode | Device | Orientation | App mode | Special coverage | Hand target | Min acceptable |
|---|---|---|---|---|---|---|---|---|---|
| **S1** | A | Easy | Heads-up (1 human vs 1 bot) | Desktop | Landscape | Browser | Baseline clarity | 40 | 25 |
| **S2** | A | Easy | Heads-up | Mobile | Landscape | **PWA** | PWA + mobile + safe-area | 40 | 25 |
| **S3** | B | Normal | Heads-up | Desktop | Landscape | Browser | Baseline challenge | 40 | 25 |
| **S4** | B | Normal | Heads-up | Tablet | Landscape | Browser | Tablet layout | 40 | 25 |
| **S5** | C | Hard | Heads-up | Desktop | Landscape | Browser | Exploit / sizing / river | 50 | 30 |
| **S6** | C | Hard | Heads-up | Mobile | Landscape | **PWA** | Mobile PWA + river on small screen | 40 | 25 |
| **S7** | B + C | Mixed multiway (6-max, mixed-difficulty bots) | 6-max | Desktop | Landscape | Browser | Multiway variety, **side-pot / split-pot** spots | 30 | 20 |
| **S8** | C | **Hard-weighted** multiway | 6-max | Tablet | Landscape | Browser | **Hard multiway** (27F-A gap: 0 hands) + side pots | 30 | 20 |
| **S9** | Any | Normal | Heads-up | Mobile | Landscape | PWA | **Refresh + reconnect** drill + background/resume | 20 | 12 (+ ≥2 reconnects) |
| **S10** | Any | Easy or Normal | Heads-up | Mobile **and** tablet | Portrait↔Landscape | **PWA** | **PWA install + resume**, orientation flips, safe-area | 15 | 10 |

## 2. Coverage this matrix guarantees

Cross-check against the Prompt 27F-B required coverage list:

- Easy heads-up → S1, S2
- Normal heads-up → S3, S4, S9
- Hard heads-up → S5, S6
- Mixed multiway table → S7, S8
- Desktop landscape → S1, S3, S5, S7
- Mobile landscape → S2, S6, S9, S10
- Tablet landscape → S4, S8, S10
- Browser mode → S1, S3, S4, S5, S7, S8
- PWA mode (where available) → S2, S6, S9, S10
- Refresh & reconnect → S9 (primary), plus opportunistic in every session

Deliberately-added coverage that 27F-A could not exercise: **Hard multiway** (S8), **side-pot / split-pot** opportunities (S7, S8), **PWA install & resume** (S10), **orientation & safe-area** (S2, S10), and **longer sessions** (the per-session targets below exceed 27F-A's 40 total).

## 3. Hand targets

Per-session targets are in the matrix. Rationale: heads-up plays fast, so 40–50 hands is a realistic single sitting; 6-max is slower, so 30; the reconnect and install drills are procedure-heavy, so fewer hands but mandatory special actions.

**Total target: ≈ 345 hands** across the ten sessions (40+40+40+40+50+40+30+30+20+15).

**Minimum acceptable coverage before 27F-C can consume results:**

- Total: **≥ 215 real hands** (sum of the per-session minimums).
- Per difficulty: **Easy ≥ 65**, **Normal ≥ 65**, **Hard ≥ 95** (Hard carries the heaviest scrutiny — exploitability, sizing, river).
- Multiway: **≥ 40 hands total, and ≥ 15 of them Hard-weighted** so the 27F-A "0 Hard multiway" gap is genuinely closed.
- At least **one full PWA install + resume** (S10) and **one reconnect/refresh drill with ≥ 2 forced reconnects** (S9) must actually happen, not just be planned.
- Every rating axis in [`evaluation-form.md`](./evaluation-form.md) must have real 1–5 input from **≥ 2 testers** in the relevant group.

If any difficulty falls below its minimum, that difficulty's verdict is **incomplete**, not "passed by default."

## 4. Scripted spots to seed (optional, within the hand counts)

Reuse the scripted-spot idea from [`../../bots/human-playtest-plan.md`](../../bots/human-playtest-plan.md) §4 so evaluators actually reach the interesting decisions rather than folding for an hour: blind-vs-blind steal/re-steal, a wet-board multiway pot, a short-stack all-in (to force **side-pot** creation), and a big river bet/over-bet (to test **river discipline** on Hard). These are prompts for discussion, not required outcomes — never steer a bot or fabricate the result.

## 5. Practicalities

- Two local accounts only (see [`tester-groups.md`](./tester-groups.md) §3). Sessions are scheduled individually; accounts are reused across separate sittings.
- One human seat per session is sufficient because bots fill the rest. A two-human table is only allowed if two-account Realtime is explicitly enabled in the safe local environment.
- Record the **build/commit** at session start (`git rev-parse --short HEAD`) into the result file — read-only, never commit or push.
- Stop immediately and file a blocker if any [`stop-test-checklist.md`](./stop-test-checklist.md) condition appears; a stopped session records its real partial hand count and the reason.

---

**Related:** [tester-groups.md](./tester-groups.md) · [evaluation-form.md](./evaluation-form.md) · [stop-test-checklist.md](./stop-test-checklist.md) · [local-playtest-setup.md](../local-playtest-setup.md) · [human-playtest-plan.md](../../bots/human-playtest-plan.md)
