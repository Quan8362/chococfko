# Poker UX Research Plan

_Chợ Cóc FKO — NLHE play-money Poker. Status: Alpha (feature-flagged, dark-shipped)._

> **Honesty contract.** This plan describes research that is **not yet run**. No user
> interviews, usability sessions, or tester feedback exist at the time of writing. Any
> section below that would normally hold results is marked **`[AWAITING HUMAN RESEARCH]`**.
> The only evidence available today is (a) a code-level heuristic audit
> (`accessibility-audit.md`) and (b) the privacy-safe instrumentation described in
> "Signals" below, which produces data **only once real people play**. Do not treat this
> plan's existence as a substitute for that data.

---

## 1. Goal

Identify and fix the real usability problems that stop:

- **New players** from understanding the available actions.
- **Experienced players** from acting quickly.
- **Mobile users** from controlling bet amounts accurately.
- **All players** from understanding pot / side-pot outcomes.
- **All players** from recognising reconnect, sit-out, and timeout states.
- The visual design from feeling premium and consistent.

We are **not** redesigning the game on taste. Every change must trace to evidence
(`design-decision-log.md`).

---

## 2. Tester groups

Recruit a spread across three independent axes. Aim for ≥ 2 testers per experience level
and coverage of every device class and locale. Small n is fine for Alpha — we are looking
for **qualitative blockers**, not statistically significant metrics.

| Axis | Segments |
|---|---|
| Poker experience | complete beginner · casual · experienced |
| Device | desktop · tablet · small phone (≤ 390 CSS px wide) · large phone |
| Locale | `vi` (default) · `en` · `ja` · `ko` · `zh` |

Recruitment source: the existing Alpha allowlist (`POKER_ALPHA_TESTERS`). Nothing here
requires opening the game to the public.

### Consent

Every session begins with verbal/written consent covering: screen recording (if any),
that play-money only is involved, and that quotes may be used anonymously. No session is
recorded without consent. Record **observations**, never account credentials or personal data.

---

## 3. Tasks under test

Each task maps to a moment where the audit or the taxonomy flagged risk. The full,
step-by-step wording lives in `usability-test-script.md`.

1. Enter the Poker lobby.
2. Join a public table.
3. Understand the buy-in (what am I paying, what stack do I get).
4. Identify the blinds (small / big) and who posts them.
5. Understand whose turn it is.
6. Check.
7. Call.
8. Raise (open the composer, pick an amount, confirm).
9. Use the **minimum** raise.
10. Use a **pot-fraction preset**.
11. Use the **slider** to hit a specific amount.
12. Go **all-in** (and understand it is irreversible).
13. Understand a **side pot** (who is eligible, how much).
14. Reconnect after a network interruption.
15. Sit out.
16. Return from sit-out.
17. Leave the table and cash out.
18. Review hand history.
19. Understand **why** a hand won.

---

## 4. Method

- **Moderated think-aloud**, remote or in person, ~30–40 min per session.
- The facilitator gives the task, stays silent, and records where the participant hesitates,
  backtracks, asks a question, or takes the wrong path.
- One **primary metric per task** (see the script), captured by observation, corroborated by
  the instrumentation signals where they exist.
- Severity is assigned with the **priority rubric** in §6, not by facilitator mood.

---

## 5. Signals (privacy-safe instrumentation)

Two independent, already-shipped, privacy-safe data sources back up the moderated sessions.
Neither can carry hole cards, the deck, tokens, or free text about other players.

### 5a. Server / DB operational telemetry — `lib/games/poker/telemetry.ts`
Already live. Failure-shaped events an operator can join to a cause:
`action_rejected`, `action_stale`, `timeout_applied`, `sequence_gap`, `reconnect_failed`,
`hand_frozen`, coin-integrity failures. These tell us when the **system** failed the player.

### 5b. Client usability signals — `lib/games/poker/uxSignals.ts` (new this phase)
A pure, numbers-only taxonomy the browser records about the **interaction**:

| Signal | Research question |
|---|---|
| `turn_started` / `action_submitted` (`elapsedMs`) | Time from turn start to action. |
| `action_changed_before_submit` | Did the player change their mind mid-decision? |
| `invalid_amount_attempt` | Did a typed/dragged amount fall outside the legal bounds? |
| `stale_action_rejected` | Did the player act on stale state? |
| `raise_composer_opened` / `raise_composer_cancelled` | Raise-control abandonment. |
| `allin_confirm_opened` / `allin_confirm_cancelled` | All-in confirmation cancellation. |
| `device_rotated` | How often small-phone players hit the orientation wall. |
| `chat_opened_on_turn` | Distraction / social pull during a decision. |
| `reconnect_recovered` (`elapsedMs`) | Reconnect recovery duration. |
| `help_opened_in_hand` / `why_cant_i_raise_opened` | Help-seeking during a live hand. |

**Privacy by construction:** a signal's `detail` may hold only finite numbers, so card ranks
(strings), hole cards (arrays), and ids cannot be represented. The recent trail is attachable
to a feedback report only as a bounded `name:count` string.

> **Do not treat normal thoughtful play as a UX failure.** A long `elapsedMs` on a hard river
> decision is good poker, not a defect. Signals are inputs to interpretation, never verdicts.

### 5c. In-game feedback — `ReportProblemButton` (extended this phase)
Testers can file a **UX feedback** report (distinct from a bug) with a category
(confusing action / layout / visual / terminology / sound-animation / other) and an optional
1–5 usability rating. The recent signal trail rides along automatically.

---

## 6. Priority rubric

| Priority | Definition |
|---|---|
| **Critical** | Cannot act · wrong action submitted · all-in triggered accidentally · cards/controls hidden · landscape safe-area failure. |
| **High** | Call/raise amounts unclear · current actor unclear · side pot unreadable · reconnect state confusing · long names break layout. |
| **Medium** | Animation pacing · minor spacing · sound balance · secondary visual polish. |

---

## 7. Analysis & output

- Log every observation in a copy of `findings-template.md`.
- Cluster findings; a problem reported by ≥ 2 independent testers **or** corroborated by a
  signal is promoted to a tracked issue.
- Each tracked issue follows the evidence-based fix process (§8) and lands in
  `design-decision-log.md`.

## 8. Evidence-based fix process (per change)

1. Identify the evidence. 2. Describe the user problem. 3. Describe current behaviour.
4. Propose the **smallest effective** change. 5. Define acceptance criteria. 6. Implement.
7. Regression test. 8. Record the result. Never make unrelated visual changes.

---

## 9. Current status

- Heuristic audit: **done** (`accessibility-audit.md`).
- Instrumentation + feedback channel: **shipped** (this phase).
- Moderated sessions: **`[AWAITING HUMAN RESEARCH]`**.
- Signal-derived findings: **`[AWAITING DATA]`** (no real players have generated signals yet).
