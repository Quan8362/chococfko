# Poker UX Findings — Template

Copy this file per research round to `findings-<yyyy-mm-dd>.md`. One row per finding.
A finding is promoted to a tracked issue when it is seen by **≥ 2 independent testers** OR
**corroborated by a signal** (`uxSignals.ts`) or operational telemetry (`telemetry.ts`).

---

## Session log

| Field | Value |
|---|---|
| Date | `[yyyy-mm-dd]` |
| Facilitator | `[name]` |
| Participant experience | complete beginner · casual · experienced |
| Device class | desktop · tablet · small phone · large phone |
| Orientation | portrait · landscape |
| Locale | vi · en · ja · ko · zh |
| Build version | `[NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA]` |

## Task outcomes

| Task | Result (success / assisted / fail) | Primary metric | Notes |
|---|---|---|---|
| T1 Enter lobby | | | |
| T2 Join table | | | |
| T3 Buy-in | | | |
| T4 Blinds | | | |
| T5 Whose turn | | | |
| T6 Check | | | |
| T7 Call | | | |
| T8 Raise | | | |
| T9 Min raise | | | |
| T10 Pot preset | | | |
| T11 Slider | | | |
| T12 All-in | | | |
| T13 Side pot | | | |
| T14 Reconnect | | | |
| T15 Sit out | | | |
| T16 Return | | | |
| T17 Leave & cash out | | | |
| T18 Hand history | | | |
| T19 Why won | | | |

---

## Findings

### Finding `[ID e.g. UXF-001]`

- **Task / screen:** `[where it happened]`
- **Evidence:** `[observation | quote | signal name + value | telemetry code | report ID]`
- **User problem:** `[what the user could not do / misunderstood — from the user's POV]`
- **Current behaviour:** `[what the UI does today]`
- **Frequency:** `[n of N testers | signal rate]`
- **Priority:** Critical · High · Medium _(per the rubric in research-plan.md §6)_
- **Proposed smallest effective change:** `[the least invasive fix that resolves it]`
- **Acceptance criteria:** `[observable, testable pass condition]`
- **Status:** open · in-progress · fixed · won't-fix _(if won't-fix, say why)_
- **Links:** `[design-decision-log.md entry] [commit] [test]`

---

### Signal / telemetry corroboration (fill from real data — do NOT invent)

| Signal | Observed value | Interpretation | Related finding |
|---|---|---|---|
| `action_submitted.elapsedMs` (median) | `[AWAITING DATA]` | | |
| `raise_composer_cancelled` / `_opened` | `[AWAITING DATA]` | | |
| `allin_confirm_cancelled` | `[AWAITING DATA]` | | |
| `invalid_amount_attempt` (per hand) | `[AWAITING DATA]` | | |
| `device_rotated` | `[AWAITING DATA]` | | |
| `reconnect_recovered.elapsedMs` | `[AWAITING DATA]` | | |
| `telemetry: action_stale` rate | `[AWAITING DATA]` | | |

> Reminder: a signal is evidence of **behaviour**, not a verdict. A cancelled raise composer may
> mean "confusing" or may mean "changed my mind" — the moderated session disambiguates.
