# Map UX Redesign — Phase 9: UX Polish, Responsive Audit, Accessibility & i18n Completion

> **Scope:** A usability/accessibility/i18n audit + fixes across the map surfaces
> built in Phases 5–8 (Admin Place Picker, public Map V2, list panel, bottom
> sheets, unified autocomplete, filters, place previews, external POIs, directions,
> geolocation states). No new features; no production data changed, no SQL
> executed, no flags enabled, no keys committed. Follows Phases
> [1](./map-ux-phase-1-audit.md)–[8](./map-ux-phase-8-directions.md).
>
> **Date:** 2026-06-22 · **App root:** `web/`

---

## 1. Issues found → fixed

| # | Severity | Issue | Fix |
|---|---|---|---|
| 1 | **High (stability)** | `List` & `Preview` were nested component functions rendered as `<List/>`/`<Preview/>` → a **new component type every render** → the list/bottom-sheet **remounted on every selection**, resetting scroll position (the "bottom sheet losing position" symptom) and dropping focus. | Render them as **function calls** (`{List({…})}`) so they stay inline — no remount, scroll/focus preserved. |
| 2 | **High (motion a11y)** | Leaflet `panTo`/`setView`/`fitBounds` and smooth `scrollIntoView` animate in **JS** and ignored the OS "reduce motion" setting (the site-wide CSS rule only covers CSS animation). | New `lib/maps/motion.ts`; map pan/zoom/fit now pass `{ animate:false }` and list scroll uses `behavior:'auto'` when `prefers-reduced-motion: reduce`. |
| 3 | **Med (a11y)** | Combobox arrow-key navigation moved a **visual** highlight but set no `aria-activedescendant`, so screen readers didn't announce the active option (UnifiedSearchBox **and** Admin PlacePicker). | Added stable option `id`s + `aria-activedescendant` on both comboboxes. |
| 4 | **Med (a11y)** | Closing the directions/external/internal previews dropped focus to `<body>` (the trigger lived inside a now-hidden panel). | Restore focus to the **map region** on close (directions/external/selected previews). |
| 5 | **Med (a11y/i18n)** | Leaflet zoom buttons shipped hard-coded **English** titles ("Zoom in/out"). | Replaced the default control with a localized `L.control.zoom({ zoomInTitle, zoomOutTitle })`. |
| 6 | **Med (a11y)** | Map container + results regions were unlabeled for screen readers. | `aria-label` on the map container; `role="region"` + label on the desktop results panel and the mobile sheet (the labeled list is the **non-map content alternative**). |
| 7 | **Low (touch)** | Close buttons were 24–28 px; sheet grab area a touch small. | Close buttons → **32 px** (`w-8 h-8`); sheet handle hit-area `py-2`→`py-3`. |
| 8 | **Low (contrast)** | External-preview `slate-400` text (coords/attribution ≈ 2.6:1) failed WCAG 1.4.3. | Bumped to `slate-500`/`slate-600` (≥ 4.5:1 on `slate-50`). |
| 9 | **Low (a11y)** | External preview had no dialog semantics or focus entry. | `role="dialog"` + `aria-label` + focus-on-open (matches the directions panel). |

### Reviewed and confirmed already-correct (no change needed)

- **No hardcoded UI strings** in any `components/maps/*` or `app/map/*` file (grep
  for Latin-diacritic/CJK literals in JSX = 0 matches) — everything routes through
  `next-intl`.
- **No body scroll lock** anywhere (sheets/panels are `absolute` inside the map
  container and scroll within their own containers) → no "locked after close".
- **Escape order** already correct: filters → directions → external → selected →
  collapse full sheet.
- **Overlay z-stacking** already non-overlapping: map `z-0` → panels/sheet `550` →
  search `500` → search-area `600` → pick-origin hint `680` → previews `700` →
  directions `710`.
- **Background stays interactive** (non-modal overlays) — intended so the map keeps
  panning behind contextual cards.
- **CSS reduced-motion** is already global (`app/globals.css`).
- **Safe-area insets** already applied to the bottom sheet and directions panel.

---

## 2. Responsive audit

> Live screenshots cannot be captured in this environment (no browser/seeded
> coordinates — same constraint as Phases 5–8). The matrix below lists what was
> verified by layout review + the reproduction recipe in §8.

| Width × Height | Class | Result |
|---|---|---|
| 320×568, 360×640, 375×667 | small phones | Search + Filters row wraps cleanly; bottom sheet collapsed/half/full snaps; no horizontal scroll; map fits under the fixed header (`calc(100vh − header − 40px)`, `min 520px`). |
| 390×844, 393×852, 414×896, 430×932 | modern phones / notch | `env(safe-area-inset-bottom)` padding on sheet + directions; controls clear the home indicator. |
| common Android | phones | `flex-wrap` on all control rows; pill targets ≥ 32 px. |
| small tablet portrait / tablet landscape | tablet | `< lg` → bottom-sheet layout (chosen by the `lg` breakpoint, not a stretched phone); `lg+` → left results panel. |
| laptop / desktop / large desktop | desktop | Collapsible 380 px left panel overlaid on a full-bleed map; floating search offset to `lg:left-[396px]` so it never sits under the panel. |

Checked: header overlap (map height accounts for `--header-h`), bottom-nav/safe
areas, soft-keyboard (search/inputs are `position:absolute` under the floating
bar, not behind a fixed header), landscape, long Japanese addresses + translated
labels (`truncate`/`flex-wrap` throughout), large-text/zoom (rem-free fixed sizes
avoid reflow breakage; `truncate` prevents overflow).

---

## 3. Scroll & overlay audit

- Body never locked → nothing to "leak" after close.
- Map never frozen: `invalidateSize()` runs on sheet/panel layout changes.
- No overlay behind the header or map canvas (z-order in §1); previews sit at
  `z-[700+]`, above panels and the map.
- Close controls are reachable (32 px, `aria-label`led) and Escape closes in order.
- No nested scroll trap: each scroll region (`list`, sheet body) scrolls
  independently; the page doesn't jump to top (selection uses
  `scrollIntoView({ block:'nearest' })`, not anchor navigation).
- Bottom sheet keeps position now that the list no longer remounts (fix #1).
- Focus is **not** trapped (non-modal overlays) and is **restored** to the map on
  close (fix #4).

---

## 4. Touch interaction

- Practical targets: pills ≥ 32 px, mode buttons full-width quarter cells, close
  buttons 32 px (WCAG 2.5.8 AA min is 24 px — comfortably exceeded).
- No icon-only control without a label (every `✕`/`↗`/chevron/handle has
  `aria-label`).
- No accidental marker selection during drag (Leaflet distinguishes click vs
  drag); origin-pick captures exactly **one** click and disarms.
- No accidental sheet movement during list scroll (drag handle is a dedicated
  element; list scrolls inside its own container).

---

## 5. Accessibility results (WCAG 2.2 AA, where practical)

**Automated tooling available here:** `eslint-plugin-jsx-a11y` (bundled in Next's
`next/core-web-vitals` config, run via `next lint`) — **clean** on all changed
files. Full axe/Lighthouse runs need a browser/seeded data not available in this
environment; a **manual keyboard + semantics review** was performed instead.

| WCAG | Item | Status |
|---|---|---|
| 1.4.3 | Contrast | external-preview light text bumped to ≥ 4.5:1 |
| 2.1.1 / 2.1.2 | Keyboard / no trap | full keyboard reach; non-modal; Escape closes; no trap |
| 2.2.2 / 2.3.3 | Motion from interactions | Leaflet pan/zoom/fit + scroll honour reduce-motion |
| 2.4.3 | Focus order | logical; focus restored to map on overlay close |
| 2.4.7 | Focus visible | native focus rings retained on buttons/inputs/links |
| 2.5.8 | Target size | ≥ 32 px on all icon controls |
| 4.1.2 | Name/Role/Value | combobox + `aria-activedescendant`; `role="dialog"`/`region`; labeled map + list |
| — | Non-map alternative | the results `role="list"` of buttons is fully usable without the map |

**Manual keyboard walk-through (reasoned):** Tab → search input (combobox); type →
results open; ↓/↑ move `aria-activedescendant` across groups; Enter selects; Escape
closes; Tab continues to Filters → list buttons (`aria-pressed`) → map (focusable,
arrow-pans) → zoom (localized titles). Opening Directions focuses the panel
(`role="dialog"`), Tab cycles its controls, Escape closes and returns focus to the
map.

---

## 6. i18n audit & translation coverage

- **Hardcoded-string sweep:** 0 hardcoded UI strings in the map surfaces.
- **New keys (Phase 9):** `map_v2.zoom_in`, `zoom_out`, `map_region_label`,
  `list_region_label` — added to **all five** locales.
- **Coverage:** namespaces `map_v2`, `map_search`, `directions`, `map_lab`,
  `place_picker` are fully populated in vi/en/ja/ko/zh — enforced by a new
  `i18nCoverage.test.ts` (identical key sets, no empty values → no raw keys / blank
  labels can ship) **and** the global parity check (**3844 keys × 5**).
- **Provider names not mistranslated:** external Google results render the
  provider-returned `displayName`/`formattedAddress` **verbatim**; only the chrome
  (group labels, attribution, actions) is localized.
- Reviewed surfaces: search placeholder, the four result groups, filters,
  current-location/permission states, Admin picker, external provider labels,
  directions + travel modes, loading/empty/error/validation, map controls, share
  text — all localized.

---

## 7. Visual polish & motion

- **Brand alignment:** internal (Chợ Cóc FKO) UI uses brand rose/teal/cream +
  `font-serif` headings; **external** Google UI is deliberately neutral **slate**
  (no brand rose) so editorial vs external never blur — reinforced this phase by
  fixing slate contrast and adding the provider dialog header.
- **Restraint:** "excessive pink" avoided (external = slate; route polyline =
  blue); marker palette stays the 6-colour Phase-6 set; close/icon controls share
  one rounded style.
- **Motion:** no bouncing/pulsing/constant animation; the only map motion is
  pan/zoom/fit, now suppressed under reduce-motion; selection uses a subtle marker
  scale (CSS, also reduce-motion-aware); no recenter-after-every-interaction (pan
  only when a marker is off-screen, as in Phase 6).

---

## 8. Reproduction (manual verification on staging)

1. `NEXT_PUBLIC_MAP_V2_ENABLED=true`; add coordinates to a few places (Phase-5
   picker). Open `/map`.
2. **Keyboard-only:** Tab through search → results (↓/↑/Enter) → filters → list →
   map → zoom; confirm visible focus and that Escape closes overlays and returns
   focus to the map.
3. **Reduce motion:** enable OS "Reduce motion" → select a far place / preview a
   route → map jumps without animation; list scroll is instant.
4. **Screen reader** (VoiceOver/NVDA): the search announces the active option;
   directions/external open as dialogs; the results list is navigable without the
   map.
5. **Widths** 320–430 px + tablet + desktop: no horizontal scroll, sheet snaps,
   safe-area padding, map fits under the header; switch `locale` across vi/en/ja/
   ko/zh and confirm no raw keys.

---

## 9. Files changed

**New:** `lib/maps/motion.ts`(+`.test.ts`), `lib/maps/i18nCoverage.test.ts`, this doc.
**Edited:**
`app/map/MapExplorerV2.tsx` (function-call list/preview rendering; reduce-motion
pan/zoom/fit/scroll; map + region `aria-label`s; localized zoom control; focus
restoration; 32 px close target; sheet handle hit-area),
`components/maps/UnifiedSearchBox.tsx` (option ids + `aria-activedescendant`),
`components/admin/PlacePicker.tsx` (option ids + `aria-activedescendant`),
`components/maps/ExternalPlacePreview.tsx` (dialog semantics + focus-on-open +
32 px close + contrast),
`components/maps/DirectionsPanel.tsx` (32 px close target),
`messages/{vi,en,ja,ko,zh}.json` (+4 `map_v2` keys each).
**Unchanged:** old `/map` `MapExplorer`, Leaflet default, RLS, migrations, all
flag defaults (still off).

---

## 10. Tests

`node --test "lib/**/*.test.ts"` → **508/508 pass** (+9). New:

| Area | Coverage |
|---|---|
| reduced motion | `motion.test.ts` (matchMedia read, SSR/legacy-safe, `motionOptions`, `scrollBehavior`) |
| five-locale completeness / no raw keys | `i18nCoverage.test.ts` (identical key sets, non-empty values, travel-mode/status/group keys present) |

**Gates:** `tsc --noEmit` exit 0 · `next lint` (incl. `jsx-a11y`) clean ·
i18n parity **3844 × 5** · `next build` OK (`/map` 28.1 kB; old map default).

**Why no DOM-level tests:** the repo's test runner is pure `node --test` (no
jsdom/React Testing Library). Adding RTL+jsdom for keyboard/focus/scroll-lock DOM
assertions is a large, out-of-scope infra change; those behaviors are covered by
the pure motion/i18n tests, `jsx-a11y` static analysis, and the manual recipe in §8.

---

## 11. Remaining limitations

1. Live screenshots and full axe/Lighthouse runs require a browser + seeded
   coordinates not available in this environment (manual recipe provided).
2. DOM-level interaction tests (keyboard/focus/scroll-lock/overlay-stacking) are
   not automated — no jsdom/RTL in the repo (see §10).
3. Contrast was tuned by review, not a calibrated tool; the brand-token palette
   (rose/teal/ink/muted) was not re-derived — only the clearly-failing external
   slate text was fixed.
4. Map still renders empty until coordinates are seeded (prod has 0 today) and the
   relevant flags/keys are configured — all still **off by default**.

---

**End of Phase 9. Polish, accessibility, and i18n completion done across the map
surfaces; defaults unchanged (Leaflet, no Google, V2 off). No production data
changed, no SQL executed, no flags enabled, no keys committed.**
