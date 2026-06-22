# Map UX Redesign — Phase 5: Production-Grade Admin Place Picker

> **Scope:** Let an Admin set a place's location by **searching and clicking a
> map** instead of typing coordinates. Workflow: **Search → Select → Review
> marker → Adjust → Confirm → Save.** Lat/lng move into a collapsed "Advanced
> technical location data" section. Public `/map` is **not** redesigned. Uses the
> **New** Google Places API (no legacy). Follows Phases
> [1](./map-ux-phase-1-audit.md)–[4](./map-ux-phase-4-database.md).
>
> **Prerequisite check (done):** all four Phase-4 migration files exist; the app
> remains compatible with old rows (`mapDbPlace` maps the new fields with `?? null`;
> the picker degrades to manual coordinates when Google is unconfigured; the save
> action has a tiered fallback so a not-yet-applied migration never drops lat/lng).
>
> **Date:** 2026-06-22 · **App root:** `web/`

---

## 1. Architecture

```
lib/maps/
  config.ts          # + adminPlaceSearchEnabled flag + adminGoogleAvailable()
  links.ts           # PURE Google Maps URL parser (coords/placeId/query/short) — SSRF-safe
  placeDetails.ts    # PURE: minimal field mask + Place→SelectedLocation + addressComponents→parts
  google/loader.ts   # (Phase 3) bootstrap loader — reused
components/admin/
  PlacePicker.tsx              # orchestrator: search, suggestions, map, summary, advanced, hidden inputs
  place-picker/
    PickerMap.tsx              # Google map + single draggable Advanced Marker (controlled)
    googlePlaces.ts            # thin client: fetchSuggestions / fetchPlace* / reverseGeocode (New API)
app/admin/places/
  actions.ts         # updatePlace persists Phase-4 location fields + confirm metadata (tiered fallback)
components/admin/PlaceFieldsEditor.tsx  # renders <PlacePicker> in the Address & map section
```

**Degradation:** `adminGoogleAvailable(config)` is true only when
`GOOGLE_MAPS_ENABLED` + a browser key + `ADMIN_PLACE_SEARCH_ENABLED` are all set.
When false (today's default), `PlacePicker` renders just the **Advanced** section
(manual lat/lng with Phase-2 validation) + a localized "search is off" note — so
Admin editing always works and **no Google script loads**.

**Form integration:** `PlacePicker` emits hidden inputs (`lat`, `lng`,
`location_provider`, `provider_place_id`, `provider_formatted_address`,
`provider_maps_url`, `country_code`, `location_source`,
`location_manually_adjusted`, `location_confirmed`) consumed by the existing
`<form action={updatePlace}>`. No new submit pipeline.

---

## 2. Fields requested from Google (cost-minimal)

- **Autocomplete:** `AutocompleteSuggestion.fetchAutocompleteSuggestions({ input,
  sessionToken, language, region:'jp', locationBias: Japan })`. Predictions render
  from `placePrediction.mainText/secondaryText/types` — **no Place Details fetch
  to draw a suggestion.**
- **On selection only** — `place.fetchFields({ fields: PLACE_DETAIL_FIELDS })` with
  the **minimal Essentials mask**: `['id','displayName','formattedAddress',
  'location','addressComponents','googleMapsURI']`. The shared **session token**
  bundles the typing + this one details call into a single billed session; a new
  token is created after each selection.
- **Reverse geocode** (map click / drag / current location): one debounced
  `Geocoder.geocode({location})` that only **suggests** an address (never
  auto-overwrites the editorial address).

---

## 3. API-call behavior (cost control)

| Behavior | Implementation |
|---|---|
| Debounce typing | 300 ms (`DEBOUNCE_MS`) |
| Minimum characters | 2 (`MIN_CHARS`) before any request |
| Cancel stale requests | monotonic `reqId` guard — late responses are dropped |
| Session tokens | one `AutocompleteSessionToken` per search session; reset after a selection |
| No details for suggestions | predictions rendered from prediction text only |
| Minimal field mask | 6 Essentials fields on selection |
| Reverse geocode | debounced 600 ms, **suggestion-only**, skipped when Google unavailable |
| Loads only when needed | Google JS bootstraps only inside `PickerMap`/`googlePlaces`, only when `adminGoogleAvailable` |
| URL paste | parsed **locally** (no API) for coords; one Place Details call only when a link yields a Place ID |

---

## 4. Behavior details

- **Selection:** populates lat/lng, `provider='google'`, `provider_place_id`,
  `provider_formatted_address`, `googleMapsURI`, `country_code`, and (as summary
  suggestions, not auto-applied) postal code / prefecture / city / ward. Marks
  `location_source='admin_search'`, `manually_adjusted=false`, **not confirmed**.
  Editorial fields (the form's prefecture/city/address selects) are **never
  overwritten** — Google's values are shown in the summary for the admin to copy.
- **Map click / POI / drag:** updates coords immediately; a base-map POI click
  fetches details like a selection; a plain click/drag marks
  `manually_adjusted=true` + `location_source='map_click'|'marker_drag'` and
  debounced-reverse-geocodes a *suggested* address.
- **Current location:** only after clicking "Use my current location"; never on
  load. Handles granted / denied / timeout / unavailable / **insecure context**
  (checks `window.isSecureContext`).
- **Google Maps link paste:** `parseGoogleMapsUrl` (pure, Google-host allowlisted)
  extracts coords / Place ID / query / detects short links. Short links
  (`maps.app.goo.gl`) are flagged with a clear error (need server-side expansion,
  deferred). No open redirects.
- **Confirm:** sets `location_confirmed=1`; on save the action stamps
  `location_confirmed_at` + `location_confirmed_by` (admin uid) when coords valid.
- **Advanced section:** raw lat/lng (editable, Phase-2 normalized validation) +
  read-only provider / Place ID / source — for emergency correction.
- **Unsaved-change protection:** a `beforeunload` warning while the picker is
  dirty (marker moved, place selected, address changed, location cleared, not yet
  saved).
- **Save:** `updatePlace` re-normalizes lat/lng via `validateCoordinateInput`
  (range-checked, 0 valid, one-without-the-other rejected), persists provenance,
  and uses a **tiered fallback** (full → drop Phase-4 columns → legacy) so a
  not-yet-applied migration never blocks editing or drops coordinates.

---

## 5. Files changed

**New:** `lib/maps/links.ts`(+`.test.ts`), `lib/maps/placeDetails.ts`(+`.test.ts`),
`components/admin/PlacePicker.tsx`, `components/admin/place-picker/PickerMap.tsx`,
`components/admin/place-picker/googlePlaces.ts`, this doc.
**Edited:** `lib/maps/config.ts` (+`adminPlaceSearchEnabled`, `adminGoogleAvailable`),
`lib/maps/config.test.ts` (+tests), `app/admin/places/actions.ts` (persist location
provenance + confirm metadata + tiered fallback), `components/admin/PlaceFieldsEditor.tsx`
(render `<PlacePicker>`), `.env.local.example` (+flag), `messages/{vi,en,ja,ko,zh}.json`
(+`place_picker` namespace, 29 keys each).
**Unchanged:** public `/map`, `MapExplorer`, Leaflet, RLS, migrations.
`components/admin/CoordinateFields.tsx` (Phase 2) is now superseded by the
picker's advanced section and left in place (unused) for reference.

---

## 6. Environment variables

```
NEXT_PUBLIC_ADMIN_PLACE_SEARCH_ENABLED=false   # gate the Google place picker (default off → manual)
NEXT_PUBLIC_GOOGLE_MAPS_ENABLED=false          # master Google switch (Phase 3)
NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=           # referrer-restricted browser key (Phase 3)
NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=                # Map ID for Advanced Markers (Phase 3)
```

To enable the picker: set the three Google vars (per
[google-maps-platform-setup.md](./google-maps-platform-setup.md)) **and** enable
the **Places API (New)** + **Geocoding API** on the browser key (Maps JavaScript
API alone is not enough for autocomplete/details/reverse-geocode).

---

## 7. Tests

**Automated (pure logic) — `node --test`:** 409/409 pass overall.

| Req # | Scenario | Coverage |
|---|---|---|
| 3,5 | Japanese query / fields; null address | `placeDetails.test.ts` (JP components, null address) |
| 7 | Google Maps link | `links.test.ts` (12 URL shapes incl. short, SSRF allowlist, out-of-range) |
| 16 | Invalid coordinates | Phase-2 `coordinates.test.ts` + advanced-section validation |
| 17 | API unavailable → manual fallback | `config.test.ts` `adminGoogleAvailable` (no key / flag off) |
| 1,14,15 | Select / edit / replace mapping | `placeDetails.test.ts` `mapPlaceToLocation` |

**Manual / instrumented (need a live key + browser — not runnable in CI here):**
2 keyboard nav · 4 Vietnamese query · 6 station query · 8 map click · 9 marker
drag · 10 current location · 11 permission denied · 12 clear location · 13 save+
reload · 18 slow network (debounce/cancel) · 19 mobile keyboard · 20 five locales.
Reproduction steps in §8.

**Gates:** `tsc --noEmit` exit 0 · `next lint` clean (warnings only) · i18n parity
`3758 keys × 5 locales` · `next build` OK (`/admin/places/[slug]` 8.95 kB; `/map`
unchanged at 14.4 kB).

---

## 8. Manual verification & screenshot instructions

Screenshots require a configured key, so they can't be captured in this
environment. To reproduce on staging:

1. In Google Cloud, enable **Places API (New)** + **Geocoding API** on the browser
   key (see setup doc). Set `NEXT_PUBLIC_GOOGLE_MAPS_ENABLED=true`,
   `NEXT_PUBLIC_ADMIN_PLACE_SEARCH_ENABLED=true`, the browser key, and a Map ID in
   Vercel → redeploy.
2. Open `/admin/places/<slug>` → **Address & map**. Screenshot the search field +
   placeholder.
3. Type `太宰府天満宮` (JA), `chùa Dazaifu` (VI), `Ohori Park` (EN), `Hakata Station`
   → screenshot suggestions; ↑/↓/Enter to select; screenshot the map marker +
   selected-place summary + "Selected — not yet confirmed" badge.
4. Drag the marker / click a base-map POI → screenshot "Coordinates manually
   adjusted" + suggested-address link.
5. Click **Use my current location** (allow, then deny in another run) → screenshot
   both states.
6. Paste `https://www.google.com/maps/place/...@33.52,130.53...` → screenshot
   resolved marker; paste a bad link → screenshot the error.
7. **Confirm location** → **Save changes** → reload → screenshot persisted state +
   "Location confirmed".
8. Resize to 320/360/375/390/414/430 px → screenshot the map + suggestions not
   hidden by the keyboard/header, no horizontal overflow.

**Responsive notes:** map height `44vh` on mobile; suggestions are
`position:absolute z-[60]` directly under the input (not behind fixed headers);
controls are pill buttons (touch-friendly); inputs use `inputMode="decimal"`.

---

## 9. Known limitations

- **Short Google Maps links** (`maps.app.goo.gl`) aren't resolved client-side
  (need a server-side redirect follow) — shown as a clear error; a guarded
  server expander is a future add.
- **Editorial prefecture/city/ward/address are not auto-filled** from Google (by
  design — "don't overwrite editorial fields"); the picker shows them as summary
  suggestions to copy. Auto-apply-with-confirm is a possible enhancement.
- **Interactive Google flows are not E2E-tested in CI** (no key/browser here);
  covered by pure unit tests + the manual script above.
- **Provider Place ID is retained on small marker nudges** (with
  `manually_adjusted=true`); a large drag does not auto-clear it — admins can
  Clear + re-search if the pin no longer matches the place.
- Persisting the new provenance columns requires the **Phase-4 migration applied**;
  until then the tiered fallback saves lat/lng and silently drops the provenance.

---

## 10. Cost-control summary

Per the verified 2025 pricing (Autocomplete session billing; Essentials free caps
of 10k/SKU/mo): suggestions cost nothing extra to render, a session = typing + one
Essentials Place Details, reverse geocode is debounced/suggestion-only, and the
whole picker is **admin-only and flag-gated** — so realistic admin-edit volume
stays well within the free tier. Defaults keep Google **off** (zero calls).

---

**End of Phase 5. Public `/map` not redesigned. Picker is flag-gated, admin-only,
and degrades to manual coordinates when Google is unconfigured.**
