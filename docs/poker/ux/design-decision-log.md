# Poker UX — Design Decision Log

Append-only record of UX decisions. Each entry states the evidence, the change (or the decision
**not** to change), and how it was verified. No entry may claim a user-research result that did
not happen.

Evidence classes: **H** = heuristic/code audit · **U** = moderated user session · **S** = signal
data · **T** = operational telemetry.

---

## 2026-07-02 — Phase: UX research infrastructure + feedback + heuristic audit

### D-001 — Add a privacy-safe client usability-signal taxonomy
- **Evidence:** H — the server telemetry (`telemetry.ts`) captures *system* failures but nothing
  about *interaction* (decision time, raise abandonment, invalid amounts, rotation). Without these
  we cannot tell a real UX problem from thoughtful play.
- **Change:** new pure module `lib/games/poker/uxSignals.ts` — 14-signal taxonomy, numbers-only
  `detail` redaction (cards/ids/strings cannot be represented), bounded ring buffer, and a
  `name:count` trail summary. `+ uxSignals.test.ts` (9 tests).
- **Why numbers-only:** privacy by construction — mirrors the bug-report allowlist stance so no
  card/hole/token value can ever ride along, even by mistake.
- **Acceptance:** taxonomy stable & unique; redaction drops non-finite/non-number values; buffer
  evicts FIFO; module never throws. **Met** (tests green).
- **Verification:** `node --test lib/games/poker/uxSignals.test.ts` → 9/9 pass.

### D-002 — Wire signals at the highest-value, lowest-risk points only
- **Evidence:** H — audit flagged the raise composer, all-in confirm, numeric input, rotation and
  reconnect as the moments most likely to hide UX problems.
- **Change:** fire-and-forget `recordUxSignal(...)` calls added inside existing event handlers in
  `ActionControls.tsx` (`raise_composer_opened/_cancelled`, `allin_confirm_opened/_cancelled`,
  `invalid_amount_attempt`) and `PokerTable.tsx` (`device_rotated`, `reconnect_recovered`+elapsed).
- **Constraint honoured:** no control-flow change — every emit is an added statement in a handler
  that already ran; the game path is untouched if instrumentation throws (it can't — it swallows).
- **Deliberately deferred (at 18):** `turn_started`/`action_submitted` timing and
  `chat_opened_on_turn`, `help_opened_in_hand`, `why_cant_i_raise_opened`.
- **Verification:** `tsc` clean; 260/260 poker lib tests pass; eslint clean on `app/games/poker`.

### D-002b — Wire the remaining signals ONLY where a real UI path exists (Prompt 18B)
- **Evidence:** H — audited the live table tree (`[tableId]/page.tsx` renders `<PokerTable>`
  directly; it is NOT wrapped in `_eco/PokerShell`, and it is a full-screen `fixed inset-0`
  overlay).
- **Wired (real paths exist):**
  - `turn_started` — effect keyed on the authoritative `legal.model.actionSeq` when `isMyTurn`;
    fires once per fresh decision point and sets t0.
  - `action_submitted` (`elapsedMs`) — emitted in `onAct` (the sole viewer submit path), recording
    decision time on SUBMIT regardless of the server's accept/reject.
- **NOT wired — no current UI path (would fabricate an event, forbidden by Prompt 18B #4):**
  - `chat_opened_on_turn` — **there is no chat/emote surface on the poker table** (grep: zero
    matches in `app/games/poker`). Nothing to instrument.
  - `help_opened_in_hand` — the rules/glossary links live in `_eco/PokerShell` (lobby/landing
    chrome), which the live table does **not** render. There is no in-hand help affordance, so
    "help opened during a hand" cannot occur. Firing it from the shell would falsely assert an
    in-hand context.
  - `why_cant_i_raise_opened` — **no disabled-action explanation UI exists** (audit §7; grep
    confirms). Nothing to open.
- **Decision:** leave these three defined-but-unwired. They become wireable the moment their
  affordances are built (in-table chat, an in-hand help/info button, a "why is this disabled?"
  tooltip) — the taxonomy is ready.
- **Verification:** see the Prompt 18B validation block appended at the end of this file.

### D-003 — No durable sink for client signals this phase
- **Evidence:** H — building a client→server ingestion endpoint + table is unproven scope for an
  Alpha with a handful of allowlisted testers, and risks a new attack surface.
- **Decision:** keep signals in an in-memory session buffer; surface them **only** as a bounded,
  privacy-safe `uxTrail` breadcrumb attached to a feedback report (reuses the existing, audited
  bug-report pipeline — no new endpoint). Durable aggregation is a follow-up once human research
  begins and we know which signals earn their keep.
- **Trade-off accepted:** signals are lost when a tester leaves the table unless they file a report.
  Acceptable for moderated sessions where the facilitator observes directly.

### D-004 — Extend in-game feedback with UX categories + usability rating
- **Evidence:** H — the existing `ReportProblemButton` captured functional bugs (severity) but had
  no way to file "the raise slider is imprecise" or rate table usability, which the research plan
  requires.
- **Change:** `bugReport.ts` gains `REPORT_KINDS` (bug | ux_feedback), `UX_CATEGORIES`
  (confusing_action / layout / visual / terminology / sound_animation / other) and an optional 1–5
  `usabilityRating`. `ReportProblemButton.tsx` gains a kind toggle, a category select, and a rating
  control (radiogroup). i18n added to all 5 locales.
- **Degrade-safe design:** the new fields travel inside the **existing** allowlisted `context` jsonb
  column — **no schema change, no change to the DB insert column list** — so the flow keeps working
  whether or not any future dashboard migration is applied, and cannot regress the current report
  path. Enum/range guards in `sanitizeBugContext` drop anything invalid.
- **Acceptance:** valid kind/category/rating survive sanitisation; invalid enums and out-of-range
  ratings are dropped; card-shaped smuggling is impossible (allowlist). **Met** (4 new tests).
- **Verification:** `node --test lib/games/poker/bugReport.test.ts` → 17/17 pass; i18n parity green.

### D-005 — Heuristic audit only; NO taste-driven visual changes
- **Evidence:** H — `accessibility-audit.md`. The live UI already implements most best practices
  (colour-independent side pots, comprehensive reduced-motion, 44px targets, all-in confirm,
  `role="alert"` recovery, integer coins, i18n).
- **Decision:** make **zero** speculative visual/layout changes this phase. Log the audit's risks
  and route them through moderated research before touching pixels. Prevents redesign-on-taste.

### Deferred with rationale (awaiting evidence — do NOT implement on taste)
- **Numeric bet-input: clamp-on-blur instead of per-keystroke** — plausible annoyance (§3), now
  measured via `invalid_amount_attempt`. Change only if data shows real friction.
- **Fold-confirm guard on mobile** — no evidence of accidental folds; standard poker is single-tap.
- **`aria-live` "your turn"/result announcements + screen-reader table semantics** — likely the
  biggest a11y gap (§7) but needs an assistive-tech user to scope correctly; not guessed at here.
- **Mobile side-pot eligibility surfacing** — collapsed summary may hide eligibility; verify T13
  discoverability before restructuring.

---

## Template for future entries

```
### D-0NN — <short title>
- Evidence: <H|U|S|T> — <what the evidence is, with the specific value/quote/signal>
- Change: <smallest effective change, files touched>  (or "Decision: no change because …")
- Acceptance: <observable pass condition> — Met/Not met
- Verification: <commands run + result>
```

---

## 2026-07-02 — Prompt 18B validation record

Full final validation run on this branch (nothing committed/pushed/deployed; Poker + Alpha flags
remain OFF; `migration_poker_alpha_bug_reports.sql` unchanged and pending; no SQL applied; no
testers added).

| Gate | Command | Result |
|---|---|---|
| TypeScript (app) | `npx tsc --noEmit --skipLibCheck` | PASS (0 errors) |
| Poker E2E TypeScript | `npx tsc --noEmit -p tsconfig.poker-e2e.json` | PASS (0 errors) |
| ESLint (poker) | `npx next lint --dir app/games/poker` | PASS (0 warnings/errors) |
| i18n parity (5 langs) | `node scripts/check-i18n-parity.mjs` | PASS (5199 keys × 5) |
| Poker + shared unit | `node --test lib/games/poker/*.test.ts lib/games/shared/**/*.test.ts` | 297 pass / 0 fail / 0 skip |
| Full repo unit suite | `npm test` | 1121 pass / 0 fail / 0 skip |
| Next.js prod build | `npx next build` | PASS (Compiled successfully; 122/122 pages) |
| Playwright `responsive` | landscape matrix ×9 (small/large phone, tablet, desktop, wide) | 9 pass / 0 fail |
| Playwright `a11y` (new) | portrait fallback ×3, keyboard/focus ×2, reduced-motion ×2 | 7 pass / 0 fail |
| Playwright `smoke` | public poker pages, no console errors ×4 | 4 pass / 0 fail |
| Playwright `coin-conservation`, `multiplayer` | — | SKIPPED (need a throwaway Supabase branch; not provisioned — no prod SQL, alpha off) |

Signals wired this phase: `turn_started`, `action_submitted`. Signals left unwired **because no UI
path exists** (not fabricated): `chat_opened_on_turn`, `help_opened_in_hand`,
`why_cant_i_raise_opened` — see D-002b.
