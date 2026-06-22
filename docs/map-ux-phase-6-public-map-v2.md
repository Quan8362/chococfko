# Map UX Redesign — Phase 6: Public Map V2 & Responsive Redesign

> **Scope:** Redesign `/map` into a modern discovery experience — large map,
> synchronized list, viewport loading, clustering, responsive desktop/tablet/
> mobile, branded markers, URL state. **The existing map stays the production
> default; V2 is opt-in via `NEXT_PUBLIC_MAP_V2_ENABLED`.** No external Google
> POIs, no route preview. Follows Phases [1](./map-ux-phase-1-audit.md)–[5](./map-ux-phase-5-admin-place-picker.md).
>
> **Date:** 2026-06-22 · **App root:** `web/`

---

## 1. Layout decisions

`/map` (`app/map/page.tsx`) branches on `getMapConfig().v2Enabled`:
- **off (default):** renders the existing `MapExplorer` **unchanged** → production is untouched.
- **on:** renders `MapExplorerV2` (Leaflet, full-bleed), with SSR'd initial places for the list (no-JS-friendly + list-only fallback).

| Breakpoint | Layout |
|---|---|
| **Desktop (`lg+`)** | Map fills a `100vh − header` container; **collapsible left results panel** (380px) overlaid on the map; floating search + inline filter row top; selected-place card floats bottom-left; a chevron toggles the panel. No tall control stack above the map. |
| **Tablet** | Uses the **mobile bottom-sheet** layout (chosen by the `lg` width break, not a stretched phone): the side panel needs ≥1024px to avoid crowding the map, so tablets get the sheet + full-width map. |
| **Mobile** | Map uses the full container; **draggable bottom sheet** with three snap states (collapsed `110px` / half `46vh` / full `85vh`); floating search + a **Filters** button opening an inline filter sheet; selected-place card pinned above the sheet; `env(safe-area-inset-bottom)` padding. |

The map sits in a height-bounded container (`calc(100vh - var(--header-h,64px) - 40px)`, `min-h 520px`) so it fits **below the fixed header** and never hides behind it.

---

## 2. Responsive behavior & pitfalls avoided

- **No frozen body scroll:** the sheet/list scroll inside their own containers; the body is never scroll-locked.
- **Map gestures:** the floating search/filters use `pointer-events-none` on the wrapper and `pointer-events-auto` only on the controls, so the map stays draggable around them.
- **Sheet never hidden by browser UI:** `env(safe-area-inset-bottom)` + the sheet is `absolute` within the map container (not `fixed` to the visual viewport).
- **Z-index order:** map `z-0` → panels/sheet `z-[550]` → search `z-[500]`/search-area `z-[600]` → preview `z-[700]`. No overlaps trap content.
- **Closable overlays:** Escape closes filters → preview → collapses a full sheet; the preview has an explicit ✕; the panel has a toggle.
- **No horizontal overflow:** all rows use `flex-wrap`/`truncate`; the sheet/panel are width-bounded.
- **Touch targets:** pill buttons ≥ 36px; the sheet handle is a full-width grab area.

---

## 3. Query strategy (viewport-based)

- **Never loads all of Japan.** `GET /api/places/in-bounds?north&south&east&west&category&q&limit` returns published, search-eligible places **inside the viewport rectangle**, distance-from-centre sorted, capped (default 300, max 500).
- Server path: `getPlacesInBounds` tries the DB function **`places_in_bbox`** (indexed, `migration_places_in_bbox.sql`, *not run*); falls back to a pure server-side filter (`placesWithinBounds`) over the catalog when the function isn't present. Coordinates for places outside the box never reach the client.
- **Committed-interaction loading only:** initial load fetches the real viewport once; afterwards a **"Search this area"** pill appears (driven by `shouldOfferSearchArea` — zoom change or centre moved > 25% of viewport width) and fetches **only on click**. No fetching while dragging.
- **Race safety:** a monotonic `reqId` drops stale responses; category change refetches; the search box debounces 450 ms.
- **States handled:** loading (skeletons), empty viewport, error + retry, excessive results (hard cap).

---

## 4. Marker strategy

- **Only published Chợ Cóc FKO places with valid coordinates** render (server enforces `status='approved'` + `search_eligible` + non-null lat/lng; the pure `placesWithinBounds` re-checks `hasValidCoordinates`).
- **Branded markers:** the brand teardrop pin (`markerAccent(category)` border + category emoji glyph + open-status dot). A **restrained palette** (`mapView.markerAccent`): brand-rose default, amber food, teal café, emerald nature (park/sea/camp/mountain), sky onsen, violet shopping — 6 colours max, brand fallback.
- **Selected marker:** subtle scale (≈1.06 + larger pin), `zIndexOffset 1000`, thicker border; the matching list row gets `aria-pressed` + rose highlight and scrolls into view.
- **Clustering:** `leaflet.markercluster` (`maxClusterRadius 55`, no coverage-on-hover) — count badges, click-to-zoom, stable during pan; handles hundreds–thousands.

---

## 5. Map ↔ list synchronization

- **Marker → list:** selects the slug, opens the preview, highlights + `scrollIntoView({block:'nearest'})` the row (no disruptive jump), expands a collapsed sheet to half.
- **List → marker:** selects the marker, opens the preview, and **pans only when the marker is outside the current bounds** (respects user intent; no constant recentering, no forced zoom change).
- Selection is a single source of truth (`selected` slug) shared by markers, list, preview, and URL.

---

## 6. Selected-place preview

Uses **Chợ Cóc FKO data only** (no Google Place Details): cover image, title,
localized category, area + nearest station, and actions **View article**
(`/places/<slug>`), **Directions** (editorial `mapUrl` or a Google dir deep link),
**Save** (existing `SavePlaceButton` via the global provider), **Share**
(`navigator.share` → clipboard fallback). Distance/travel-time are intentionally
omitted (no user-location/Routes calls this phase).

---

## 7. URL state

`encodeMapView`/`decodeMapView` persist `c=lat,lng`, `z`, `cat`, `q`, `open`,
`sel`, `mode` — written with `history.replaceState` **debounced 500 ms** (never on
every move tick), omitting defaults for short URLs. On load the page decodes
`searchParams` server-side (SSR initial viewport) and the client restores center/
zoom/filters/selection. Shared URLs reopen approximately the same state;
Back/Forward restore meaningful context (replaceState keeps history uncluttered
while the SSR decode handles entry navigation).

---

## 8. Loading & fallback

- Map skeleton implicit (tiles fade in); **list skeletons** (pulse rows) while loading; **no-results** state; **error + Retry**; **list-only fallback** if Leaflet `L.map` throws (`mapFailed` → renders filters + list at 70vh, no map).
- SSR'd initial list = **no-JS-safe content** for the first viewport.
- **Leaflet/OSM only** — the graceful provider story is the same flag-gated Leaflet default from Phase 3 (Google is not used here).

---

## 9. Accessibility foundation

- The list is a real `role="list"` of `<button>`s (keyboard-reachable, `aria-pressed` selection state) — content is reachable without the map.
- Visible focus (native focus rings on buttons/inputs/links); `aria-label`s on icon buttons (toggle list, close, share, filters); search input labelled.
- **Escape** closes filters/preview/sheet; selection state is announced via the highlighted, `aria-pressed` row; touch targets are finger-sized.

---

## 10. Performance results

- **Viewport-bounded payloads:** `placesWithinBounds` unit test feeds **600 markers** → returns exactly the 300-cap, all within bounds; distance-sorted ordering verified. Clustering keeps the DOM small regardless of density.
- **No full-catalog client load** (unlike the old `/places`): the client only ever holds one viewport's capped result set.
- **Indexed DB path ready:** `places_in_bbox` uses the existing partial B-tree `places_geo_idx(lat,lng)`; the app works today via the server fallback.
- Note: production currently has **0 places with coordinates** (Phase 4 finding), so live maps render empty until admins add coordinates via the Phase-5 picker; all behavior is exercised by unit tests + synthetic data.

---

## 11. Files changed

**New:** `app/map/MapExplorerV2.tsx`, `app/api/places/in-bounds/route.ts`,
`lib/maps/mapView.ts`(+`.test.ts`), `lib/placesInBounds.test.ts`,
`supabase/migration_places_in_bbox.sql` (optional, not run), this doc.
**Edited:** `app/map/page.tsx` (flag branch + SSR initial places; old map path
unchanged), `lib/placesNearby.ts` (+`getPlacesInBounds`, `placesWithinBounds`,
viewport types), `messages/{vi,en,ja,ko,zh}.json` (+`map_v2` namespace, 15 keys).
**Unchanged:** `app/map/MapExplorer.tsx` (old map), Admin, RLS, applied migrations.

---

## 12. Tests

`node --test "lib/**/*.test.ts"` → **423/423 pass**. New coverage:

| Requirement | Coverage |
|---|---|
| Invalid-coordinate exclusion | `placesInBounds.test.ts` (null/partial/out-of-range dropped) |
| Viewport query / marker rendering set | `placesInBounds.test.ts` (in/out of bounds, eligibility) |
| Clustering / hundreds of markers | 600-marker cap-to-300, all-in-bounds |
| Search this area | `mapView.test.ts` `shouldOfferSearchArea` (zoom change / tiny vs big pan) |
| Shared URL restoration + Back/Forward | `mapView.test.ts` decode/encode round-trip, default omission |
| Marker strategy | `markerAccent` palette + fallback |
| Category / text filters, sort | `placesInBounds.test.ts` |

**Gates:** `tsc --noEmit` exit 0 · `next lint` clean · i18n parity `3773 × 5` ·
`next build` OK (`/map` 18.8 kB; `/api/places/in-bounds` added; old map default).

**Manual (need a browser + seeded coordinates — not runnable in CI here):** map
load, marker/list sync clicks, mobile bottom-sheet drag/snap, fixed-header fit,
five-locale visual pass, map-failure fallback. Reproduction in §13.

---

## 13. Screenshots / reproducible instructions

V2 is flag-gated and prod has no coordinate data yet, so live screenshots can't be
captured here. To produce them on staging:

1. Set `NEXT_PUBLIC_MAP_V2_ENABLED=true` (Vercel) → redeploy. Add coordinates to a
   few places via the Phase-5 Admin picker (or apply `migration_places_in_bbox.sql`
   + seed lat/lng).
2. **Desktop:** open `/map` ~1280px → screenshot the left panel + map + a selected
   preview; toggle the panel (chevron).
3. **Tablet (~820px) / Mobile (320/360/375/390/414/430px):** screenshot the bottom
   sheet in collapsed/half/full, the Filters sheet, and a selected card; verify the
   map fits below the header and there's no horizontal scroll.
4. Pan the map → screenshot the **"Search this area"** pill; click → results
   update. Click a marker → list row highlights + scrolls; click a row → marker
   selects without recentering when already visible.
5. Switch the `locale` cookie across vi/en/ja/ko/zh → screenshot the localized UI.

---

## 14. Remaining limitations

- **Header height** is assumed `64px` via `--header-h` fallback; if the global
  header differs, set that CSS var for a pixel-perfect fit.
- **Bottom-sheet drag** uses threshold-snap (drag up/down one step, tap toggles)
  rather than continuous finger-following physics — simple and robust, less fluid.
- **No user-location distance / travel time** (deferred; needs geolocation/Routes).
- **`places_in_bbox` not applied** — viewport queries use the server-side fallback
  until the (provided) migration is run; fine at current scale.
- **Live interactive flows not E2E-tested in CI** (no browser/seeded data here);
  covered by pure unit tests + the manual script above.
- Production data has **0 coordinates** today → maps render empty until seeded.

---

**End of Phase 6. The existing map remains the default; Map V2 is opt-in via
`NEXT_PUBLIC_MAP_V2_ENABLED`. External Google POIs and route preview were not
enabled.**
