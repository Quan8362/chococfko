# Poker Accessibility & Heuristic UX Audit

_Code-level heuristic audit of the live Poker UI. Method: static inspection of the shipped
components/CSS/tokens against WCAG 2.1 AA and Nielsen heuristics._

> **Evidence class.** This is **expert heuristic evidence**, not user-test evidence. It is
> legitimate input to prioritisation but it is **not** a substitute for the moderated sessions
> in `usability-test-script.md`. Items marked _needs human check_ can only be closed by a real
> tester (e.g. screen-reader announcement quality, comprehension of "raise to").
> Audit date: 2026-07-02. Auditor: automated code review (single pass).

Legend: ✅ implemented well · ⚠️ partial / risk · ❌ gap · 🔍 needs human check.

---

## 1. Colour independence & status cues

| Item | State | Notes |
|---|---|---|
| Side-pot eligibility | ✅ | `pots.tsx` labels every pot ("Main", "Side 1") **and** lists eligible seat numbers — not colour alone (`POT-INDEP-001`). |
| Street indicator | ✅ | Coloured dot is `aria-hidden`; the street name label is always present (`pots.tsx`). |
| Pot values | ✅ | Every pot shows a label + exact integer; colour is decorative. |
| Connection status | ⚠️🔍 | `ConnectionIndicator` conveys state — confirm each state has a **text/icon** cue, not just colour, and reads under colour-blind simulation. |
| Current actor | ⚠️🔍 | Actor highlight + `TurnTimer`. Under `prefers-reduced-motion` the timer sweep is dropped but seconds still update (good). Confirm a **non-colour, non-motion** cue (e.g. ring + "your turn" label) marks the actor. |

## 2. Motion & animation

| Item | State | Notes |
|---|---|---|
| Reduced motion | ✅ | `poker-theme.css` neutralises all animation/transition under `prefers-reduced-motion`; actor/winner/timer-flash animations set to `none`. State still updates instantly. |
| User toggle | ✅ | `settings` exposes `reducedMotion` + `animation` prefs (`prefs.ts`, `SettingsClient.tsx`). |
| TS guard | ✅ | `prefersReducedMotion()` in `tokens.ts` for JS-driven motion. |
| Animations gate state | ✅ | Audit found no path where an animation delays authoritative state — winner is from server stack deltas, not animation completion. |

## 3. Touch targets & input

| Item | State | Notes |
|---|---|---|
| Action buttons | ✅ | `ActionControls` targets ≥ 44px, no hover dependency (visual-spec §8). |
| Raise steppers | ✅ | −/+ buttons are 44×44 with `aria-label` (`bet.decrease` / `bet.increase`). |
| Numeric bet input | ⚠️ | `type=number`, clamped to `[minTo, maxTo]`. Clamping happens on **every keystroke**, which can fight a user mid-typing (e.g. typing "1" jumps to `minTo`). _New this phase:_ an `invalid_amount_attempt` signal now records out-of-bounds entries so we can measure whether this is a real problem before changing the clamp timing. |
| Slider | ✅ | `BettingSlider` with `step = bigBlind`; disabled styling present. 🔍 confirm keyboard arrow-key operation with a real AT user. |
| Double-submit | ✅ | Parent `pending` guard blocks a second in-flight command. |

## 4. Irreversible-action safety

| Item | State | Notes |
|---|---|---|
| All-in confirm (idle path) | ✅ | All-in routes through a dedicated `confirm_allin` step with an amber hint + explicit confirm button (`ActionControls`). |
| All-in via composer | ✅ | Reaching all-in requires deliberately dragging the slider / tapping **Max**, then tapping the confirm button — two intentional steps. An amber all-in hint shows. |
| Call-that-is-all-in | ✅ | A call consuming the whole stack is presented as **ALL-IN**, not a plain Call (`ALLIN-CALLSHORT-001`), and goes through confirm. |
| Fold safety | 🔍 | Fold is a single tap (standard for poker). Confirm with testers whether an accidental-fold guard is wanted on mobile; no evidence yet either way. |

## 5. Error recovery & feedback

| Item | State | Notes |
|---|---|---|
| Rejected/stale action | ✅ | Error surfaced via `role="alert"` in `ActionControls`; bar re-enables once truth re-syncs. |
| Stable error codes | ✅ | `telemetry.ts` `PKR_*` codes; UI maps to translated strings with a generic fallback. |
| Reconnect state | ⚠️🔍 | `ConnectionIndicator` + recovery watchdog exist. Confirm the copy reassures the player their **coins/seat are safe** during reconnect (a common fear moment — see T14). |

## 6. Internationalisation

| Item | State | Notes |
|---|---|---|
| Zero-hardcode | ✅ | Audited components use `t()` throughout; new UX-feedback strings added to all 5 locales (parity check green). |
| Long-string resilience | 🔍 | JA/KO/ZH action labels and long usernames need a real render check at small-phone width (see Responsive). |

## 7. Screen-reader labelling

| Item | State | Notes |
|---|---|---|
| Icon-only controls | ✅ | Steppers, close button, report trigger have `aria-label`. New report-kind & rating controls use `role="radiogroup"`/`role="radio"` + `aria-checked`. |
| Live regions | ⚠️ | Action errors use `role="alert"`. 🔍 Consider an `aria-live` region announcing "your turn" and hand results for non-visual play — **not yet implemented**; needs an AT user to scope. |
| Table semantics | 🔍 | The felt is a positioned `div` layout, not a data table. Screen-reader comprehension of seat/stack/pot state is **unverified**; likely the biggest a11y gap. Scope with a real AT user before building. |

---

## 8. Responsive matrix (heuristic — needs device verification)

| Scenario | Heuristic read | Verify on real device |
|---|---|---|
| Small phone landscape | Layout is % of the art cover-box; safe areas handled by `poker-theme.css`. | 🔍 iPhone SE / small Android landscape — controls not clipped by notch/home bar. |
| Large phone landscape | ✅ likely fine. | 🔍 confirm action bar reachable one-handed. |
| Tablet landscape | ✅ likely fine. | 🔍 seat spacing at 6-max. |
| Desktop | ✅ likely fine. | — |
| Long username | ⚠️ | 🔍 truncation/ellipsis on the seat pod. |
| Large stack (e.g. 10-digit) | ✅ | `formatCoinsShort` + `tabular-nums`; full value in `title`. |
| 6-player table | ✅ | `seatLayout.ts` supports 2–6p × desktop/tablet/mobile (15 unit tests). |
| Multiple side pots | ⚠️ | Desktop lists each; mobile collapses to a summary chip — eligibility then lives in the expandable `SidePotDisplay`. 🔍 confirm the summary is discoverable/tappable. |
| Browser safe areas | ⚠️🔍 | Portrait shows `RotateDeviceOverlay`; landscape safe-area insets need on-device confirmation. |

---

## 9. Summary of audit-derived risks (pre-human-research)

**Highest-value things to verify with real people (ranked):**

1. **Screen-reader table comprehension** (§7) — likely the biggest gap; unverified.
2. **Reconnect copy reassurance** (§5) — a fear moment; confirm coins/seat safety is communicated.
3. **Numeric bet-input clamp timing** (§3) — instrumented (`invalid_amount_attempt`); decide with data.
4. **Mobile side-pot eligibility discoverability** (§8) — collapsed summary may hide eligibility.
5. **Small-phone landscape safe areas & long i18n labels** (§8) — device matrix.

**Deliberately NOT changed this phase** (no evidence yet; avoid taste-driven churn): fold-confirm
guard, clamp-on-blur rewrite, `aria-live` turn announcements, any visual restyle. Each is logged
in `design-decision-log.md` as "awaiting evidence".
