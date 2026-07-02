# Closed Beta — Support Process

How tester feedback and incidents are captured, classified, triaged, and escalated during the
Closed Beta.

---

## 1. Intake

Testers file reports **in-game** via the "Report a problem" button (`ReportProblemButton`).
Every report is:

- Written through the service-role server action (`submitPokerBugReport`) into
  `poker_bug_reports` (DB is source of truth; a Resend email is best-effort notification).
- Attached with **non-sensitive** context via a strict allowlist (`bugReport.ts`): build
  version, device/browser/OS, viewport, orientation, locale, connection state, table ID,
  hand ID, seat/street/phase/state-version. **Never** hole cards, deck, seed, tokens.
- Tagged with a **feedback category** (see below) and a severity.

Support contact path for anything outside the game: `/feedback` (linked from the beta banner).

---

## 2. Classification

Every report carries one **category** (`BETA_FEEDBACK_CATEGORIES` in `bugReport.ts`):

`rules` · `coin` · `realtime` · `reconnect` · `ui` · `mobile` · `performance` ·
`translation` · `sound` · `abuse` · `other`

And one **severity** (`blocker` · `major` · `minor` · `cosmetic`). UX-usability observations
use the separate `ux_feedback` report kind with its own category + 1–5 rating.

Each report already connects to: **build version, device, locale, table ID, hand ID**. Link a
report to an existing **incident** manually in `/admin/poker/incidents` when it maps to one.

---

## 3. Triage (run on `/admin/poker/beta` + `/admin/poker`)

1. **Coin / private-card / duplicate-settlement reports → treat as P0.** Verify against
   `poker_ops_events` and the coin ledger immediately. Any confirmed hit is a hard safety
   breach → see escalation.
2. Set each report's status: `open → triaged → in_progress → resolved | wont_fix | duplicate`.
3. Reproduce using the attached table/hand ID + state-version.
4. Group by category on the dashboard to spot systemic issues (e.g. many `reconnect`).

Cadence: at least daily while a cohort is active; within the hour for blocker severity.

---

## 4. Incident escalation

Open an incident (`openIncident` → `/admin/poker/incidents`) when a report is a **blocker**, a
**coin/integrity** issue, an **abuse** case, or affects multiple testers.

Escalation ladder:

1. **Contain** — use the matching safety control (freeze the hand, pause the table, block new
   joins). See [rollback.md](./rollback.md).
2. **Investigate** — `freezeHand` + `addIncidentNote`; `revealHoleCards` only at a terminal
   hand state, audited, when strictly necessary.
3. **Decide** — fix-forward, or trigger controlled rollback (rollback.md).
4. **Record** — transition the incident, note the resolution, link the originating reports.

---

## 5. Coin-correction policy

- Coins move **only** through the audited DEFINER RPCs. Never hand-edit balances.
- A confirmed coin error is corrected via the sanctioned path (`refundHand` for a specific
  hand, or an audited admin adjustment) with an incident case and reason recorded.
- Play-money only: if in doubt, prefer preserving conservation over "making a tester whole" —
  document and correct deliberately, not reactively.
- Every correction is auditable (`poker_admin_audit`).

---

## 6. Beta removal policy

- **Suspend (immediate, reversible):** add the email to `POKER_BETA_SUSPENDED` → locked out at
  the access layer next request. Use for suspected abuse pending review.
- **Gameplay restriction:** `restrictPlayer` prevents sitting while allowing view — use for
  targeted enforcement without full lockout.
- **Remove:** delete the email from every cohort env var. Access is revoked; the tester's
  acknowledgement row is retained for audit; their wallet is untouched.
- Record the reason on the incident case for any suspend/removal driven by abuse.

---

## 7. Guides for testers

- Welcome + onboarding: [tester-guide.md](./tester-guide.md).
- Known issues: player-facing at `/games/poker/known-issues` (linked from the beta banner).
- Bug-report guide: inside tester-guide.md (§ "How to file a good report").
