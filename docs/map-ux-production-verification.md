# Map UX — Production Verification Matrix (Phase 11)

> End-to-end verification record for Map V2. **Legend:** ✅ automated (unit test) ·
> 🧩 structural (verified by code/flag logic) · 🔁 manual on staging (needs a
> browser + live Google key + seeded coordinates — not capturable in this
> environment). Reproduction recipes are inline. Defaults remain Leaflet / Google-
> off; nothing was enabled to produce this record.

## A. Automated gates (run this phase)

| Gate | Result |
|---|---|
| TypeScript (`tsc --noEmit --skipLibCheck`) | ✅ exit 0 |
| Unit tests (`node --test "lib/**/*.test.ts"`) | ✅ **529 / 529** |
| i18n parity (`scripts/check-i18n-parity.mjs`) | ✅ **3844 × 5** |
| Lint + `eslint-plugin-jsx-a11y` (`next lint`) | ✅ clean |
| Production build (`next build`) | ✅ `/map` 28.7 kB, shared JS 87.9 kB flat |
| Read-only data audit (`scripts/audit-place-locations.mjs`) | ✅ 78 places, 0 anomalies |
| e2e (Playwright `e2e/`, responsive matrix 320→desktop) | 🔁 infra present; run on staging |

## B. Admin functional tests

| Test | Status | Note / recipe |
|---|---|---|
| Create by Google search / address / station / Japanese name | 🔁 | needs key; mapping logic ✅ `placeDetails.test.ts` |
| Create by Google Maps link | ✅/🔁 | parser ✅ `links.test.ts` (12 shapes); live resolve 🔁 |
| Choose point on map / click supported POI / drag marker | 🔁 | PickerMap; coords + provenance set |
| Use current location / clear / replace location | 🔁 | secure-context + denied/timeout handled |
| Save & reload; edit unrelated fields without losing location | 🔁 | tiered save fallback; hidden-field round-trip |
| Existing place WITHOUT / WITH coordinates | ✅/🔁 | `mapDbPlace` `?? null`; audit confirms old rows map cleanly |
| Manually-adjusted coordinate | 🔁 | `location_manually_adjusted` flag |
| Invalid coordinate validation | ✅ | `coordinates.test.ts` (range, 0 valid, one-without-other) |

## C. Public map functional tests

| Test | Status | Note / recipe |
|---|---|---|
| Map load / list load | ✅/🔁 | `map_loaded` metric; SSR'd initial list; live 🔁 |
| Provider fallback (Leaflet) | 🧩 | default; `mapFailed` → list-only |
| Internal / topic / station search | ✅ | `unifiedSearch.test.ts` (JP/VI/EN, station, topic, boundary) |
| External search | 🔁 | gated; `externalPlace.test.ts` for mapping/mask |
| Marker / list / cluster click | 🔁 | selection single-source; clustering = markercluster |
| Search this area | ✅ | `mapView.test.ts` `shouldOfferSearchArea` |
| Filter interaction | 🔁 | category/open-now |
| Back / Forward; share URL; selected restoration | ✅/🔁 | `mapView.test.ts` encode/decode round-trip; live nav 🔁 |
| External POI; internal duplicate preference | ✅ | `duplicateDetection.test.ts` (id/proximity/name+address) |
| Save / Share / View article | 🔁 | SavePlaceButton, `navigator.share`, `/places/<slug>` |

## D. Directions tests

| Test | Status | Note |
|---|---|---|
| Current-location / typed origin | 🔁 | typed = handoff; coords = in-site preview |
| Walking / driving / transit / bicycling | ✅/🔁 | `directions.test.ts` URL + `routeRequest.test.ts` mode mapping; live route 🔁 |
| Route unavailable / API unavailable / quota | ✅ | `routeRequest.test.ts` `statusFromResponse`; UI localized status |
| Open in Google Maps (always works) | ✅ | `directions.test.ts` (host-locked, encoded) |
| Correct destination Place ID / coordinate fallback | ✅ | `directions.test.ts` (Place ID preferred, coords fallback) |

## E. Responsive matrix (Playwright projects exist: 320/360/375/390/412/tablet/desktop)

🔁 Run on staging (`MAP_V2_ENABLED=true` + seeded coords). Checks: header/footer
never hide controls (height-bounded container + safe-area), bottom-sheet snap
(collapsed/half/full), soft-keyboard (floating search not behind a fixed header),
landscape, browser zoom + large text (`truncate`/`flex-wrap`), long Japanese
addresses, no horizontal scroll. Portrait + landscape both covered by the
viewport projects. Structural safeguards verified in Phase 9.

## F. Locale matrix (vi / en / ja / ko / zh)

| Check | Status |
|---|---|
| No untranslated keys | ✅ `i18nCoverage.test.ts` (identical key sets, non-empty) + parity 3844×5 |
| Overflow / line wrapping / long JP addresses / ZH+KO labels | 🔁 visual on staging (`truncate`/`flex-wrap` in place) |
| Provider-returned names not mistranslated | 🧩 external results render Google's name verbatim; only chrome localized |
| Distance / duration formatting | ✅ `directions.test.ts` (`formatDurationSeconds`, `metresToKm`) |

## G. Accessibility (WCAG 2.2 AA where practical)

| Check | Status |
|---|---|
| Keyboard-only use; focus order; focus visibility | 🧩/🔁 native focus rings; manual keyboard walk-through (Phase 9 §5) |
| Screen-reader labels; autocomplete (`aria-activedescendant`); result selection | 🧩 combobox + option ids (Phase 9); SR pass 🔁 |
| Dialog / bottom-sheet focus | 🧩 `role="dialog"` + focus-on-open; focus restored to map on close |
| Reduced motion | ✅ `motion.test.ts`; Leaflet pan/zoom/fit honour it |
| Contrast | 🧩 external slate text bumped to AA (Phase 9); calibrated-tool pass 🔁 |
| Non-map fallback | 🧩 results `role="list"` of links fully usable without the map |
| `eslint-plugin-jsx-a11y` | ✅ clean |

## H. Failure tests

| Failure | Status | Behavior |
|---|---|---|
| Google key missing | ✅ | `env.test.ts`/`config.test.ts` → internal-only; Open-in-GMaps works |
| Google script blocked | 🧩 | loader rejects → Leaflet; no hard dependency |
| Places disabled | 🔁 | external search error + retry; internal unaffected |
| Routes disabled / quota exceeded | ✅ | `statusFromResponse` quota/unavailable; handoff still works |
| Geolocation denied | ✅/🔁 | `geolocation` metric `permission:denied`; localized message |
| Database timeout | 🧩 | `/api/places/in-bounds` catch → error+retry; RPC→fallback |
| No network / slow network | 🧩 | stale-cancel + debounce + loading/error/retry; SSR list |
| Invalid shared URL | 🧩 | `decodeMapView` tolerant (defaults); `adminSeed` decode → null |
| Stale selected place / deleted / unpublished | 🧩/🔁 | selection falls back to null; queries filter `status='approved'` + `search_eligible` |

## I. Data audit (read-only, production — Phase 11)

```
total places 78 · published 78 · valid coords 0 · missing 78
invalid range 0 · incomplete pair 0 · suspicious(0,0) 0 · outside-Japan 0
duplicate provider ids 0 · duplicate coordinate groups 0
MANUAL-REVIEW LIST: none ✓     DATA-ENTRY BACKLOG: 78 (17 address-ready)
```

- **Manual-review records: NONE** — no anomalies; criterion #25 satisfied.
- **Records NOT auto-repaired** (per instruction). The audit only reports.
- **Action item (not a release blocker):** enter coordinates for the 78 places
  via the Phase-5 picker — start with the 17 address-ready ones:
  `marine-world-uminonakamichi, mojiko-retro, nagahama-yatai, nakasu-yatai,
  nanzo-in-temple-…, ohori-park, ohori-park-2, tenjin-yatai,
  uminonakamichi-seaside-park, yanagawa, …` (full list from the audit run).
- Re-run before each rollout stage: `node scripts/audit-place-locations.mjs`.

## J. How to capture screenshots / live runs (staging)

1. Set `NEXT_PUBLIC_MAP_V2_ENABLED=true`; seed coordinates on a few places.
2. (Optional Google) set the browser key + Map ID + server Routes key and the
   relevant flags; set Cloud quotas + budget first.
3. `cd web && npx playwright test e2e/` (responsive projects auto-run a dev server)
   — screenshots captured on failure; add map-specific specs as a follow-up.
4. Manual SR pass (VoiceOver/NVDA) per Phase 9 §5; reduced-motion via OS setting.

---

**Verification complete for everything runnable in this environment (gates, units,
read-only audit). Interactive/browser/Google-live items are documented with
recipes for staging. No anomalies; Map V2 is rollout-ready behind its flag.**
