# Poker Visual & Responsive Specification — Chợ Cóc FKO

**Status:** Authoritative specification (P0).
**Companions:** [../architecture/system-architecture](../architecture/system-architecture.md), [../architecture/realtime-model](../architecture/realtime-model.md), [../rules/state-machine](../rules/state-machine.md). Asset audit: [../01-preflight-audit §11](../01-preflight-audit.md).

> **Landscape-only gameplay.** Poker is played in landscape on every form factor, including mobile. Portrait shows a **polished Rotate Device screen**, never a squeezed table. Animations are presentation-only and never gate authoritative state (`D3`). All UI text is i18n (5 locales, zero hardcode — CLAUDE.md §6).

---

## 1. Table background assets

Three existing assets (currently untracked, mis-prefixed `pocker_`). **Rename to `poker-{desktop,tablet,mobile}.webp` in the same change that first references them** (Phase P5; safe — zero references, untracked).

| Asset | Dimensions | Aspect | Role |
| --- | --- | --- | --- |
| `poker-desktop.webp` | 1672 × 941 | 16:9 (1.777) | Desktop landscape |
| `poker-tablet.webp` | 1448 × 1086 | 4:3 (1.333) | Tablet landscape |
| `poker-mobile.webp` | 1672 × 941 | 16:9 (1.777) | Mobile **landscape** (same 16:9 → landscape-locked) |

Use `next/image` with art-directed `<source>` (or CSS `image-set`) selecting by viewport. The table felt is the background; **all interactive geometry is anchored as a percentage of an inner play-area element** (`areaRef`), never tied to browser chrome, toolbar, or PWA banner — this is the explicit lesson from `tlmn-seat-positioning` (a TOP seat once collided with the toolbar + PWA banner in iPhone landscape).

---

## 2. Layout zones (all viewports)

The table composition is the same logical set of zones, re-proportioned per breakpoint:

```
┌──────────────────── TOP-NAV SAFE AREA ───────────────────────┐
│  back · table name · stakes · pot-rank badge · sound · menu   │
├───────────────────────────────────────────────────────────────┤
│         [ opponent seats arranged around the oval ]           │
│                                                               │
│              ┌───────── COMMUNITY-CARD SAFE AREA ─────────┐    │
│              │   [ flop ][ turn ][ river ]  (revealed)    │    │
│              │        MAIN-POT  ·  SIDE-POT(S)            │    │
│              └────────────────────────────────────────────┘   │
│                                                               │
│              [ LOCAL PLAYER seat — bottom-center ]            │
│   LOCAL-CARD SAFE AREA (own 2 hole cards)                     │
├───────────────────────── ACTION-CONTROL SAFE AREA ───────────┤
│   Fold · Check/Call · Bet/Raise + slider + presets · time    │
└───────────────────────────────────────────────────────────────┘
```

- **Local player** is always **bottom-center**; opponents fill the remaining seats clockwise around the oval from the local seat.
- **Community-card safe area** is horizontally centered, above the local seat; holds up to 5 board cards + a "burn"/deal affordance. The engine writes only **revealed** cards here (`SHOWDOWN-PRIVATE-001`).
- **Main-pot safe area** sits just below the board, centered. **Side-pot safe area(s)** stack adjacent to the main pot (labeled "Side 1, Side 2…") and must remain legible when several exist (`EC-D2`).
- **Local-card safe area** overlaps the local seat; own hole cards are larger and always fully visible (never clipped by the action bar).
- **Action-control safe area** is the bottom band; it must clear the iOS home indicator / Android nav (`env(safe-area-inset-*)`).
- **Top-nav safe area** holds chrome; seats must never be anchored into it.
- **Side-player safe areas** are the left/right edges where 5–6-max seats sit; long content there truncates rather than overflowing the felt.

A single **GEOMETRY band** constant (mirroring TLMN's approach — memory `tlmn-table-zones`) is the **single source of truth** for seat/board/pot spacing per breakpoint. Played/community cards render **only in the centre pile** — no per-seat card minis (the TLMN lesson: never re-add per-seat played-card minis).

---

## 3. Seat maps (2–6 players)

Seats are positioned as `%` of the inner play area, local seat fixed at bottom-center (`pos 0`). Opponents fill clockwise. Indicative anchor positions (tuned in P5 against each asset):

- **2 (heads-up):** local bottom-center; opponent top-center.
- **3:** local bottom-center; opponents upper-left and upper-right.
- **4:** local bottom-center; left-center, top-center, right-center.
- **5:** local bottom-center; lower-left/upper-left, upper-right/lower-right (two per side, fanned).
- **6 (max):** local bottom-center; left (2), top (1–2), right (2) — evenly distributed around the oval.

Per seat, render: avatar (live-hydrated from `profiles`, never the snapshot — memory `tlmn-avatar-fix`), display name (truncated), **public stack** (`formatCoinsShort`), committed-this-street chips, dealer button / SB / BB markers, action badge (fold/check/call/bet/raise/all-in), to-act highlight + countdown ring, all-in/sit-out/disconnected badges. **Opponent hole cards are face-down card backs** until a legal showdown reveal — the client never even receives the values (`A1`).

The **dealer button** visibly moves one seat clockwise between hands (`BUTTON-MOVE-001`); heads-up shows button=SB on the local/opponent seat per `BLIND-HEADSUP-001`.

---

## 4. Per-breakpoint composition

### Desktop landscape (16:9, `poker-desktop.webp`)
- Widest oval; up to 6 seats with generous spacing. Action controls as a full bottom bar with bet slider + preset buttons (½ pot, ¾ pot, pot, all-in) and a numeric input. Side-pots laid out horizontally with room for labels. Hover affordances allowed.

### Tablet landscape (4:3, `poker-tablet.webp`)
- Taller felt; oval slightly compressed vertically. Seats keep the same map but with reduced inter-seat gaps; pot/board moved a touch higher to leave room for the action bar. Touch-first targets (no hover-only affordances).

### Mobile landscape (16:9, `poker-mobile.webp`)
- **Landscape-locked.** Compact oval; opponents hug the top/edges, local seat + own cards + action bar own the bottom third. Bet controls collapse to: Fold · Check/Call · Raise (opens a compact slider sheet with presets). Stacks/pots use `formatCoinsShort`; full values available on long-press/tooltip (`formatCoinsFull`). Respect `env(safe-area-inset-bottom/left/right)` for notch/home-indicator. Anchor every seat to inner play-area % (never to chrome/banner — `tlmn-seat-positioning`).

### Portrait (any device) — Rotate Device fallback
- A **polished full-screen "Rotate your device" screen** (illustration + i18n message in all 5 locales), shown whenever `orientation` is portrait. **No gameplay is rendered in portrait.** It transitions smoothly back to the table on rotation. This is a designed screen, not an error.

---

## 5. Content-overflow behavior

| Case | Behavior |
| --- | --- |
| **Long username** | Truncate with ellipsis at the seat width; full name on tap/hover tooltip. Never overflow the felt or push the stack value. |
| **Large stack value** | Compact `formatCoinsShort` ("1.25M", "10B"); exact value in tooltip/long-press (`formatCoinsFull`). Fixed-width so it never reflows the seat. |
| **Multiple side-pots** | Stack labeled pots ("Main", "Side 1", "Side 2"…) near center; on mobile, collapse to "Main + N side pots" with an expandable detail. Each pot's eligibility is visually distinct (`EC-D2`/`POT-INDEP-001`). |
| **All-in** | Clear "ALL-IN" badge on the seat; chips slide fully into the pot; board runs out with paced reveals (`ROUND-ALLIN-RUNOUT-001`) — purely visual, state already decided server-side. |

---

## 6. Accessibility

- **Reduced motion:** honor `prefers-reduced-motion` — disable chip slides, card-deal cascades, and pot-push animations; state still updates instantly from the authoritative payload (animations were never authoritative anyway, `D3`).
- **Color independence:** suits/hand strength never conveyed by color alone (suit glyphs + rank text; per CLAUDE.md §11, never render bare language/flag codes — and never rely on flag emoji which render as country codes on Windows).
- **Contrast & legibility:** stacks, pot, and to-act indicators meet WCAG AA contrast over the felt; add a subtle scrim behind text where the felt is busy.
- **Screen-reader labels:** seats, pot, board, and the action bar have accessible labels (own cards announced; opponents' announced only as "face down" / at reveal). Exact values via `formatCoinsFull` accessible labels.
- **Focus order:** action buttons reachable and operable by keyboard on desktop; the current legal action set is focus-highlighted.

---

## 7. Sound & haptics

- **Singleton AudioContext** unlocked by first user gesture, module-level (copy `useTlmnSound` verbatim — memory `tlmn-mobile-layout-sound`; fixes dead mobile sound). One context, `useSyncExternalStore` mute.
- **Mute control** in the top-nav safe area; persists. Cue set: deal, check, bet/raise chips, call, fold, all-in, win/pot-push, your-turn alert, time-warning. Optional light haptics on mobile for your-turn/time-warning.
- Sounds are **presentation-only** — never used to infer or gate state.

---

## 8. Touch-target requirements

- Minimum interactive target **44 × 44 px** (Apple HIG) on touch devices; primary action buttons (Fold/Check-Call/Raise) larger.
- Bet slider thumb and preset chips are touch-friendly with adequate spacing to avoid mis-taps near the all-in control (a costly mis-tap in a money-bearing UI).
- A **confirm step** (or hold) on irreversible high-cost actions (e.g., all-in, or leaving an active hand which forfeits per `LEAVE-001`), matching the TLMN voluntary-exit confirm pattern.

---

## 9. Visual integrity rules (tie-back)

- The UI **renders authoritative state**; it never computes winners, pots, legal actions, or turn order locally (it may show a legal-action *hint*, but sends intent and lets the server decide — `C2`).
- Opponent hole cards are **card backs** until a legal reveal; the client never holds their values (`A1`).
- Board cards appear **only as each street is revealed** (`SHOWDOWN-PRIVATE-001`); the deal/burn is a visual flourish over server-revealed data.
- `connState` banner (connecting/connected/reconnecting) is always visible; actions are disabled while reconnecting until the client reconciles (`D1`).

---

## 10. UI release gates

1. Responsive Playwright matrix passes for desktop 16:9, tablet 4:3, mobile-landscape 16:9 across 2–6 seats.
2. Portrait shows the rotate screen on every device; no table rendered in portrait.
3. Long username + large stack + multi-side-pot cases render within safe areas.
4. `prefers-reduced-motion` honored; sound toggle works; mobile sound unlocks on first gesture.
5. Touch targets ≥ 44 px; all-in/leave have a confirm step.
6. Zero hardcoded UI strings; `npm run i18n:check` clean for the `poker` namespace.
