# Map UX Redesign — Phase 2: Coordinate Flow Fix & Normalization

> **Scope:** Fix the bug where the Admin place editor shows latitude/longitude
> values yet warns that coordinates are missing, by creating **one canonical
> coordinate model** end-to-end. **No Google Maps work. No production data
> changes. No migrations executed.** Follows [map-ux-phase-1-audit.md](./map-ux-phase-1-audit.md).
>
> **Date:** 2026-06-22 · **App root:** `web/`

---

## 0. Read-only production verification (done before any code change)

A throwaway, **read-only** diagnostic (service-role + anon REST reads only — no
writes, no DDL, no migrations; credentials never printed; script deleted after
use) confirmed the following against the live Supabase project:

| # | Question | Finding |
|---|---|---|
| 1 | Does `places` have `lat`/`lng` columns? | **Yes — present.** `select('lat,lng')` succeeds. |
| 2 | Production data types? | **`double precision`** for both (confirmed via the PostgREST OpenAPI definition: `format: "double precision", type: "number"`). |
| 3 | Dazaifu Tenmangu coordinates? | **`lat = NULL`, `lng = NULL`.** The row exists, `status='approved'`, `search_eligible=true`, and **has** `map_url` + `address` (`福岡県太宰府市宰府4丁目7-1`) — but **no coordinates**. |
| 4 | Geo migrations actually applied? | **Yes.** Probed columns all present: `lat, lng, search_eligible, recommend_eligible, price_type, opening_hours, created_at, area_main, relation_type, nearest_station, verification_status`. (`google_place_id` is **absent** — that is a *proposed* future column from Phase 1 §14, not yet created, as expected.) |
| 5 | Does `places_nearby` use the expected columns/indexes? | **Yes — the RPC exists and executes** without error (anon role → RLS-respected). It returned **0 rows** at the Dazaifu center because of the finding below. |

**Critical data finding:** **0 of 78 places currently have a valid coordinate
pair** — every row has `lat/lng = NULL`. Consequently the public map's
`places_nearby` RPC returns nothing today, and the Leaflet map shows **no
database markers** at all. The example numbers `33.5902 / 130.4017` seen in the
Admin form are therefore **HTML placeholder hints**, never persisted values —
exactly as Phase 1 predicted (root cause **(a): coordinates never entered**; the
migrations *are* applied, so root cause (b) is ruled out).

> Implication for this phase: normalizing the flow is correct and sufficient, but
> it **does not** (and must not) fabricate coordinates for the 78 existing rows.
> The map stays empty until admins populate coordinates. See §8 Limitations.

---

## 1. Root cause

The lat/lng `<input>` were **uncontrolled** with `defaultValue={p.lat ?? ''}` and
a realistic `placeholder="33.5902"` / `"130.4017"`. When the DB value is `NULL`,
`defaultValue` is `''`, the field renders empty, and the browser paints the
placeholder — which **looks identical to a real value**. Meanwhile the warning
was computed **server-side once** from the (null) DB value via
`isValidCoordinate`, which correctly requires a finite number. So:

- The displayed `33.5902/130.4017` = **placeholder text**, not data.
- The warning = **correct** (`lat/lng` really are `NULL`).
- They appeared to "disagree" only because a greyed placeholder is visually
  mistaken for a filled value, and the warning never re-derived as the field changed.

There was also no single normalization point: the Admin save action,
completeness warning, and map filters each re-implemented "is this a coordinate?"
with subtly different checks.

---

## 2. The fix

**One canonical coordinate model** in [lib/coordinates.ts](../lib/coordinates.ts),
used everywhere (DB→server→form→validation→save→map→radius):

- Representation contract: **valid = finite number in range; missing = `null`;
  `''`/whitespace/`undefined` → `null`; `0` is valid; negatives valid;
  lat ∈ [-90,90]; lng ∈ [-180,180].** No truthy checks (`!lat || !lng`) anywhere
  — they would reject `0`.
- Helpers: `parseCoordinate` (any input → finite number | null, strict),
  `isValidLat`/`isValidLng` (typed guards), `isValidCoordinate` (pair, strict —
  stable contract `isValidCoordinate('33','130') === false`), `hasValidCoordinates`
  (row filter), `validateCoordinateInput` (form → `{lat,lng,errors}`),
  `coordinateWarnings` (shared advisory codes), `latFieldError`/`lngFieldError`
  (live per-field range feedback), `isInJapanBounds`.

**Real source-of-truth fix (not just hiding the warning):**

1. **Controlled, live Admin field** — new client component
   [components/admin/CoordinateFields.tsx](../components/admin/CoordinateFields.tsx):
   controlled inputs (`value`/`onChange`), resets when a different place loads
   (`useEffect` on `initialLat/initialLng`), and derives the warning **live** from
   the same `coordinateWarnings` helper the server uses. An empty field now shows
   an explicit amber "no coordinates" line; a valid pair shows a green
   "Coordinates set" confirmation; an out-of-range value shows a red per-field
   error immediately. Placeholders are now clearly labelled examples
   (`coords_example_lat/lng` → "e.g. 33.5902").
2. **Server warning de-duplicated** — `PlaceFieldsEditor` keeps only the
   non-coordinate advisories (hours/price) in its server-rendered box; coordinate
   warnings render live in `CoordinateFields`, so the two can never show a stale,
   contradictory state.
3. **Save/update normalized** — `buildExtendedPlacePayload` now calls
   `validateCoordinateInput(formData.get('lat'), formData.get('lng'))`: empty →
   `null`, string → finite number, `0` preserved, range-checked, "one without the
   other" rejected (`incomplete_coordinates`), bad value rejected
   (`invalid_coordinates`). `undefined` is never persisted.
4. **Single validation source** — `placeFields.ts` re-exports the helpers and
   `placeCompletenessWarnings` delegates the coordinate part to `coordinateWarnings`.
5. **Public map/radius normalized** — the nearby haversine fallback and the
   `/map` area/station centroid pass now use `hasValidCoordinates` /
   `isValidLat`+`isValidLng` (zero-safe, range-checked), matching the SQL RPC's
   `lat/lng IS NOT NULL` + range CHECK.

The warning now updates immediately when valid coordinates are loaded, entered,
cleared, made invalid, or a different place is loaded.

---

## 3. Files changed

| File | Change |
|---|---|
| [lib/coordinates.ts](../lib/coordinates.ts) | **New.** Canonical coordinate model + validators + warning helper. |
| [components/admin/CoordinateFields.tsx](../components/admin/CoordinateFields.tsx) | **New.** Controlled, live lat/lng client field with immediate warning + helper text. |
| [lib/placeFields.ts](../lib/placeFields.ts) | `isValidCoordinate`/`isInJapanBounds` now re-exported from `coordinates`; `placeCompletenessWarnings` delegates coordinate logic to `coordinateWarnings`. |
| [app/admin/places/actions.ts](../app/admin/places/actions.ts) | Coordinate parsing replaced with `validateCoordinateInput` (canonical). |
| [components/admin/PlaceFieldsEditor.tsx](../components/admin/PlaceFieldsEditor.tsx) | Renders `<CoordinateFields>`; server warning box filters out coordinate codes (now live). |
| [lib/placesNearby.ts](../lib/placesNearby.ts) | Fallback excludes rows via `hasValidCoordinates` (zero-safe, range-checked). |
| [app/map/page.tsx](../app/map/page.tsx) | Centroid pass uses `isValidLat`/`isValidLng` guards. |
| `messages/{vi,en,ja,ko,zh}.json` | +6 keys each: `warn_invalid_lat`, `warn_invalid_lng`, `coords_set`, `coords_help`, `coords_example_lat`, `coords_example_lng`. |

**Not touched (by design):** Leaflet, public-map behavior beyond the shared util,
RLS, migrations, production data, the `places_nearby` SQL.

---

## 4. Tests added

[lib/coordinates.test.ts](../lib/coordinates.test.ts) — 17 tests covering all 16
required scenarios:

1. valid positive coords · 2. valid negative coords · 3. **zero coords valid**
(with explicit demo that a truthy check would be wrong) · 4. null coords ·
5. empty string → null · 6. lat > 90 invalid · 7. lat < -90 invalid ·
8. lng > 180 invalid · 9. lng < -180 invalid · 10. string coords from a form
(+ strict-parse rejects `"33.59abc"`; stable `isValidCoordinate('33','130')===false`)
· 11. save+reload round-trip lossless · 12. clearing coords (both → null; one →
`incomplete_coordinates`) · 13. warning **disappears** with valid coords (incl.
`0,0`) · 14. warning **appears** when cleared (and only `missing_coordinates` when
a map link/address exists) · 15. public map excludes rows without valid coords
(`null`, partial, out-of-range dropped; `0,0` kept) · 16. radius search handles
normalized values (`boundingBox` + `haversineKm` with zero/negative origins) ·
plus `isInJapanBounds`.

The existing `lib/placeFields.test.ts` (which asserts the strict
`isValidCoordinate` contract) and `lib/placesNearby.test.ts` continue to pass
unchanged against the re-exported helpers.

---

## 5. Commands run

| Command | Result |
|---|---|
| Read-only prod diagnostic (temp script, deleted) | ✅ findings in §0 |
| `node --test lib/coordinates.test.ts …` | ✅ 30/30 (focused) |
| `node --test "lib/**/*.test.ts"` | ✅ **361/361 pass**, 0 fail |
| `node scripts/check-i18n-parity.mjs` | ✅ `3716 keys × 5 locales` |
| `npx tsc --noEmit --skipLibCheck` | ✅ exit 0, no errors |
| `npx next lint` (changed files) | ✅ No ESLint warnings or errors |
| `npx next build` | ✅ build succeeded; `/admin/places/[slug]` compiled |

---

## 6. Manual verification

Performed by code-trace + unit evidence against the real production data shape
(in-browser admin confirmation noted in §8):

- **Existing place WITH coordinates** → `coordinateWarnings({lat:33.59,lng:130.4})`
  = `[]`; field shows green "Coordinates set"; marker passes `hasValidCoordinates`.
  (tests 1, 13, 15)
- **Existing place WITHOUT coordinates (e.g. Dazaifu: null lat/lng, has map_url+address)**
  → server box shows no coordinate warning; live field shows
  `['missing_coordinates']` (not `missing_location`, since map_url/address exist),
  matching production data. (tests 14; §0 finding 3)
- **Newly edited place** → typing `33.5902`/`130.4017` flips the live warning to
  the green confirmation without reload; saving normalizes to numbers via
  `validateCoordinateInput`. (tests 10, 13)
- **Page reload** → server re-renders from persisted numbers; controlled field
  re-seeds from `initialLat/initialLng`; round-trip is lossless. (test 11)
- **Warning behavior** → clearing both fields re-shows the warning live; clearing
  one shows `incomplete_coordinates` on save. (tests 12, 14)
- **Public map rendering** → only rows with a valid pair are emitted; `0,0` kept,
  `null`/partial/out-of-range dropped — identical predicate to the SQL RPC.
  (tests 15, 16)

---

## 7. Data safety

- **No production data modified.** Verification used read-only reads; the temp
  script was deleted. No coordinates were written to any place.
- **No migrations executed.** Confirmed the geo columns already exist; added no
  columns, constraints, or RPCs.
- **No broad data correction.** The 78 existing NULL-coordinate rows are
  untouched — the fix changes the *flow*, not the *data*.
- **Leaflet, public-map behavior, RLS unchanged** except for routing coordinate
  checks through the shared util.

---

## 8. Remaining limitations / follow-ups

1. **Existing places still have no coordinates (0/78).** This fix intentionally
   does not backfill them. Until admins enter coordinates (or a future geocoding
   phase populates them), the public map shows no DB markers. A separate,
   explicitly-approved backfill (geocode from existing `address`/`map_url`) is
   out of scope here.
2. **In-browser admin confirmation pending.** This environment cannot authenticate
   as an admin, so the live click-through (load Dazaifu, type coords, watch the
   warning flip, save, reload) was verified by code-trace + unit tests against the
   real data shape rather than a manual browser session. Recommend a human pass on
   staging before release.
3. **`missing_location` uses loaded `map_url`/`address`, not live edits.** The
   coordinate warning is fully live; the map-link/address inputs elsewhere on the
   form are still uncontrolled, so toggling *those* doesn't re-derive the
   `missing_location` branch until save/reload. Acceptable for this phase
   (coordinate accuracy was the goal); revisit when the editor is modularized.
4. **No DB-level "both-or-neither" / Japan-bounds constraint.** Enforced in the
   app layer only (as before). A NULL-safe CHECK was proposed in Phase 1 §14 and
   remains a future, separately-approved migration.
5. **Auto coordinate capture (search by name, map-click, Google-link paste) is
   deferred** to the next phase, as advertised by the new `coords_help` text.

---

**End of Phase 2. Coordinate flow fixed and normalized. No Google Maps integration
started. No production SQL executed.**
