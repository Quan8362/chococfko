# Map UX Redesign — Phase 1: Architecture Audit

> **Scope:** Read-only architecture audit of the location map, Admin place editor,
> place search, map interactions, and directions experience. **No redesign,
> no migrations, no production changes were made.** This document is the
> deliverable for Phase 1 only.
>
> **Date:** 2026-06-22 · **Repo root for app:** `web/` · **Stack:** Next.js 14
> (App Router), React 18, Supabase (Postgres + PostgREST + RLS), next-intl 4,
> Leaflet 1.9 + leaflet.markercluster, deployed on Vercel.

---

## 1. Current architecture summary

### 1.1 Two distinct "map/explore" surfaces

The product has **two** separate discovery surfaces that share data but not UI:

| Surface | Route | Component | Data path | Search |
|---|---|---|---|---|
| **Map** (Leaflet) | `/map` | [app/map/page.tsx](../app/map/page.tsx) → [app/map/MapExplorer.tsx](../app/map/MapExplorer.tsx) | `GET /api/places/nearby` (RPC `places_nearby`) | radius/center bounded on DB |
| **List/Explore** | `/places` | [app/places/page.tsx](../app/places/page.tsx) → [components/places/PlacesExplorer.tsx](../components/places/PlacesExplorer.tsx) | `getAllPlacesFromDb()` (full catalog) | in-memory ([lib/placeSearch.ts](../lib/placeSearch.ts)) |

These are architecturally divergent: `/map` is **viewport/radius-bounded and server-paginated**, while `/places` **loads the entire catalog into memory** and filters client-side. A 10/10 redesign should unify these into one synchronized map+list model.

### 1.2 Public map (`/map`) data + render flow

- `app/map/page.tsx` (Server Component, `force-dynamic`):
  - `DEFAULT_CENTER = { lat: 33.5902, lng: 130.4017 }` (Fukuoka/Hakata). **Note this constant — it is the same pair shown in the Admin coordinate bug (§2).**
  - Loads `getAllPlacesFromDb()` **only** to pre-compute up to 60 area-centroids and 60 station-centroids for the "jump to area/station" dropdowns. Markers themselves are **not** seeded from this.
  - Renders `<MapExplorer>` client component with `ssr:false` (Leaflet needs DOM).
- `MapExplorer.tsx` (Client Component) owns all interactivity:
  - **Leaflet init** (once): `L.map(...).setView([lat,lng], 13)`; OSM tile layer `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`, `maxZoom:19`; a `markerClusterGroup({showCoverageOnHover:false})`; `moveend` → sets `moved=true` (drives "Search this area").
  - **Markers:** custom `L.divIcon` teardrop with category emoji + an open-state status dot (green/amber/red/grey). Click → `setSelected(slug)` + `panTo`.
  - **Radius circle:** `L.circle` at last search center, `radius*1000` m, re-drawn on radius/markers change.
  - **Fetch:** `fetchNearby(center, r)` → `/api/places/nearby?lat&lng&radius` → `setMarkers`.
  - **Geolocation:** only on explicit "Use my location" click (`navigator.geolocation.getCurrentPosition`, `enableHighAccuracy:false`, 8s timeout, 5min maxAge). Status states: locating/denied/error/unsupported.
  - **Filters (client-side, post-fetch):** category `<select>`, "open now" checkbox, "at time" `datetime-local` (parsed as JST), radius pills `[0.5,1,3,5,10,20]` km.
  - **Views:** `map | list | split` (split is desktop-only). `invalidateSize()` on view toggle.
  - **Selected preview:** bottom-sheet on mobile (`inset-x-3 bottom-3`), floating card on desktop (`sm:right-3 sm:w-[320px]`).

### 1.3 API + server query

- [app/api/places/nearby/route.ts](../app/api/places/nearby/route.ts): validates lat/lng/radius (radius restricted to the allow-list, else 5), `limit` clamped 1–500 (default 200), calls `getNearbyPlaces`.
- [lib/placesNearby.ts](../lib/placesNearby.ts): calls Supabase RPC `places_nearby` via a **cookie-free public client** (`@/lib/supabase/public`); on any error/missing-function, falls back to a **server-side haversine** over the full catalog (never ships all coords to browser). Returns `NearbyPlace[]` (camelCased).
- RPC `places_nearby` ([supabase/migration_places_nearby.sql](../supabase/migration_places_nearby.sql)): bounding-box prefilter (uses `places_geo_idx`) + haversine, filters `status='approved'` AND `search_eligible`, `SECURITY INVOKER` (respects RLS), `STABLE`, granted to `anon, authenticated`.

### 1.4 Open-now / hours engine

- [lib/placeOpenNow.ts](../lib/placeOpenNow.ts) (`openStatus`/`isOpenNow`) computes open state in **Asia/Tokyo** from structured `opening_hours` JSON + `closed_days` + `temporary_status`. Drives both the marker status dot and the "open now" filter. Pure & unit-tested.

### 1.5 i18n

- next-intl 4, **cookie-based locale** (`locale` cookie), **not route-prefixed** ([i18n/request.ts](../i18n/request.ts)). 5 locales: `vi` (default), `en`, `ja`, `ko`, `zh`. One messages file per locale (`messages/*.json`, ~170–205 KB each). Map UI uses namespaces `map_explore`, `explore_search`, `place_detail`, `categories`; Admin uses `admin`, `place_fields`, `common`.

---

## 2. Exact cause of the coordinate-warning bug

**Symptom reported:** Admin place editor shows latitude `33.5902` and longitude `130.4017` yet a warning says coordinates are missing.

**Verdict: The displayed values are HTML `placeholder` attributes (greyed hint text), not persisted data. The two values are not in disagreement — the warning is correct; the coordinates genuinely are NULL.**

### Trace (DB → UI → DB)

1. **Render source.** [components/admin/PlaceFieldsEditor.tsx:88-89](../components/admin/PlaceFieldsEditor.tsx#L88-L89):
   ```tsx
   <Inp label={t('lat')} name="lat" type="number" step="any" defaultValue={p.lat ?? ''} placeholder="33.5902" />
   <Inp label={t('lng')} name="lng" type="number" step="any" defaultValue={p.lng ?? ''} placeholder="130.4017" />
   ```
   When `p.lat`/`p.lng` are `null`/`undefined`, `defaultValue` becomes the empty string `''`, so the `<input>` renders **empty** and the browser paints the `placeholder` text `33.5902` / `130.4017` in muted grey. **These literals are hard-coded placeholders** chosen as the Fukuoka example — identical to `DEFAULT_CENTER` in [app/map/page.tsx:10](../app/map/page.tsx#L10). They are **not** placeholders-as-defaults, uncontrolled defaults, fallbacks, or stale state, and they are **not** submitted.

2. **Warning source.** [components/admin/PlaceFieldsEditor.tsx:49-54](../components/admin/PlaceFieldsEditor.tsx#L49-L54) calls `placeCompletenessWarnings({ lat: p.lat, lng: p.lng, ... })`. In [lib/placeFields.ts:256-262](../lib/placeFields.ts#L256-L262):
   ```ts
   const hasCoords = isValidCoordinate(p.lat ?? undefined, p.lng ?? undefined);
   if (!p.mapUrl && !hasCoords && !p.address?.trim()) warnings.push('missing_location');
   if (!hasCoords) warnings.push('missing_coordinates');
   ```
   `isValidCoordinate` ([lib/placeFields.ts:83-89](../lib/placeFields.ts#L83-L89)) requires `typeof lat === 'number'`. A NULL column is **not** a number → `hasCoords=false` → the `missing_coordinates` (and possibly `missing_location`) warning fires. **The warning firing is itself proof that `lat`/`lng` are NULL/absent** — if real numbers were stored, no warning would render.

3. **Why the field is NULL (two possible roots, both produce identical UI):**
   - **(a) Never entered.** The place row has `lat=NULL, lng=NULL`. The Admin form has always shown the placeholder, no one typed a value, save persisted NULL.
   - **(b) Migration not applied on the live DB.** The Admin page reads `admin.from('places').select('*')` ([app/admin/places/[slug]/page.tsx:54](../app/admin/places/[slug]/page.tsx#L54)). If `migration_places_geo.sql` / `migration_places_phase1_fields.sql` have not been applied to the target Supabase project, the `lat`/`lng` columns don't exist, the row has no such keys, `p.lat` is `undefined`, and `defaultValue` is again `''` → same placeholder + same warning. The `updatePlace` action already defends against this with a `PGRST204` "missing column" fallback ([app/admin/places/actions.ts:20-24,218-220](../app/admin/places/actions.ts#L218-L220)), which means **the codebase explicitly anticipates the migration may not be applied yet.**

4. **Round-trip to DB.** On submit, [app/admin/places/actions.ts:38-50](../app/admin/places/actions.ts#L38-L50): empty inputs → `latRaw=''`/`lngRaw=''` → `lat=null, lng=null` (no error, since "one without the other" is the only coordinate hard error). The update writes NULL/NULL. The warning persists on the next render. **Self-consistent loop confirming the placeholder hypothesis.**

### Fix direction (Phase ≥2, not done here)

- Make the empty/placeholder state visually unmistakable (e.g. don't use realistic-looking coordinates as placeholder; show "—" or "not set"), **and** give Admin a real way to *fill* coordinates (map-click / search / Google-link paste) so the field stops being hand-typed. The redesign's core Admin goal (§12, target feature 1–4) directly resolves this.
- Operational check: confirm `migration_places_geo.sql` + `migration_places_phase1_fields.sql` are applied on the production Supabase project (root cause (b)). **Do not run them in this phase.**

---

## 3. Full list of affected files

### Public map
- [app/map/page.tsx](../app/map/page.tsx) — server shell, centroids, `DEFAULT_CENTER`.
- [app/map/MapExplorer.tsx](../app/map/MapExplorer.tsx) — Leaflet, markers, clustering, filters, geolocation, views, bottom sheet.
- [app/api/places/nearby/route.ts](../app/api/places/nearby/route.ts) — nearby API.
- [lib/placesNearby.ts](../lib/placesNearby.ts) — RPC call + haversine fallback + `NearbyPlace` type.
- [lib/geo.ts](../lib/geo.ts) — `haversineKm`, `formatDistanceKm`.
- [lib/placeOpenNow.ts](../lib/placeOpenNow.ts) — open-now status (JST).
- [lib/placeActions.ts](../lib/placeActions.ts) — `directionsUrl`, `telHref`, action availability.

### List/Explore
- [app/places/page.tsx](../app/places/page.tsx) — loads full catalog, pre-renders all cards.
- [components/places/PlacesExplorer.tsx](../components/places/PlacesExplorer.tsx) — client filter/search UI.
- [components/places/PlaceFilters.tsx](../components/places/PlaceFilters.tsx), [components/PlaceCard.tsx](../components/PlaceCard.tsx).
- [lib/placeSearch.ts](../lib/placeSearch.ts) — in-memory search/rank engine + structured filters.
- [lib/placeIntent.ts](../lib/placeIntent.ts), [lib/searchConcepts.ts] (concept loader), [lib/exploreParams.ts] (URL filter codec).

### Admin editor
- [app/admin/places/[slug]/page.tsx](../app/admin/places/[slug]/page.tsx) — edit form (`select('*')`).
- [components/admin/PlaceFieldsEditor.tsx](../components/admin/PlaceFieldsEditor.tsx) — **lat/lng inputs + warning block.**
- [app/admin/places/actions.ts](../app/admin/places/actions.ts) — `updatePlace`, `buildExtendedPlacePayload`, PGRST204 fallback.
- [lib/placeFields.ts](../lib/placeFields.ts) — `isValidCoordinate`, `placeCompletenessWarnings`, parsers, option lists.
- [lib/places.ts](../lib/places.ts) — `Place` type, `getAllPlacesFromDb`, `mapDbPlace`, translations.

### Database (migrations — reference, not applied here)
- `migration_places_geo.sql`, `migration_places_phase1_fields.sql`, `migration_places_nearby.sql`, `migration_places_search_phase2.sql`, `migration_places_rls.sql`, `migration_places_address.sql`, `migration_place_structured_area.sql`, `migration_place_translations.sql`, `migration_places_user_submit.sql`.

### Config / env
- [next.config.mjs](../next.config.mjs) (CSP, redirects, image hosts), [middleware.ts](../middleware.ts), [i18n/request.ts](../i18n/request.ts), [vercel.json](../vercel.json), `messages/*.json`.

---

## 4. Database findings

### 4.1 `places` table (coordinate-relevant columns)
- `lat double precision`, `lng double precision` — **nullable** (added by `migration_places_geo.sql`). No PostGIS `geography`/`geometry` column; no generated columns.
- CHECK constraints (NULL-safe): `places_lat_check (lat is null or lat between -90 and 90)`, `places_lng_check (lng is null or lng between -180 and 180)` ([migration_places_phase1_fields.sql:168-174](../supabase/migration_places_phase1_fields.sql#L168-L174)). **There is no "both-or-neither" constraint and no Japan-bounds enforcement** (`isInJapanBounds` exists in TS but is not used as a DB or even an app-level guard).
- Hierarchy/identity columns: `region`, `prefecture` (default `fukuoka`), `city`, `area`, `area_main`, `nearby_place`, `city_or_prefecture`, `relation_type`, `postal_code`, `nearest_station`, `station_walk_minutes`, `address`.
- ~40 structured Phase-1 columns (price, hours JSON, reservation/suitability tri-states, facilities, action links, KBYG, japanese_phrases, verification, `search_eligible`/`recommend_eligible`).
- Publication: `status` (`approved`/`pending`/`rejected`/NULL for seeded), `created_at`, `updated_at`, `sort_order`, `user_id`.

### 4.2 Coordinate types & validation
- Type: `double precision` (fine for lat/lng). Validation lives only in app code (`isValidCoordinate`); DB allows any in-range value, including (0,0) and mismatched single coordinate is prevented only at the app layer.

### 4.3 Indexes
- `places_geo_idx ON (lat, lng) WHERE lat IS NOT NULL AND lng IS NOT NULL` — composite B-tree, partial. Used by the bounding-box prefilter in `places_nearby`.
- `places_prefecture_idx`, `places_region_idx`, `places_pref_cat_idx (prefecture, category)`.
- `places_search_eligible_idx`, `places_recommend_eligible_idx` (partial), `places_price_type_idx`, `places_temporary_status_idx`, `places_created_at_idx`.
- GIN: `places_subcategories_gin`, `places_payment_methods_gin`.

### 4.4 RLS / RPC / triggers
- RLS ([migration_places_rls.sql](../supabase/migration_places_rls.sql)): `SELECT` for `anon, authenticated` where `status='approved'`; `INSERT` for `authenticated` only with `user_id=auth.uid() AND status='pending'`; UPDATE/DELETE via service-role (Admin) only.
- RPC: `places_nearby(...)` (`SECURITY INVOKER`, `STABLE`). No PostGIS functions.
- No triggers observed on `places` for geo. No generated columns.

### 4.5 Will it scale across Japan?
- **Radius/nearby query: yes, adequately for now.** The B-tree bounding-box prefilter on `(lat,lng)` + haversine refine is O(box) and indexed; good to tens of thousands of rows. Two caveats:
  - The B-tree composite is **latitude-leading**; very wide longitude spans at fixed latitude still scan a latitude band. Fine at city/radius scale; suboptimal at national viewport scale.
  - `cos(radians(lat))` longitude delta breaks down near the poles — irrelevant for Japan.
- **List/Explore (`/places`): no.** It `select('*')` the entire catalog with **no limit/pagination** ([lib/places.ts:1423-1426](../lib/places.ts#L1423-L1426)), pre-renders a `PlaceCard` server node for **every** place ([app/places/page.tsx:83-85](../app/places/page.tsx#L83-L85)), and ships the whole array + card map to the client. This is the dominant scaling risk (see §6).

### 4.6 PostGIS — enabled or useful?
- **Not enabled / not used.** For the current radius/viewport workload the B-tree bbox approach is sufficient and cheaper to operate. PostGIS (`geography` + GiST) becomes worthwhile only if you need: true spherical distance ordering at national scale, polygon/prefecture containment, KNN (`<->`) "N nearest regardless of radius", or isochrone-style queries. **Recommendation: keep non-PostGIS for Phase 2–3; revisit PostGIS as an optional Phase 4+ optimization, behind a migration, only if national-viewport KNN becomes a real need.**

### 4.7 Migration risks
- Multiple place migrations are **idempotent and additive** (`ADD COLUMN IF NOT EXISTS`, `CREATE OR REPLACE`), low risk to re-run. The real risk is **drift**: the app tolerates un-applied columns (PGRST204 fallback), so a production DB can silently lack `lat`/`lng`/Phase-1 columns while the UI still renders — exactly the conditions that make the coordinate bug ambiguous. **Action item (not this phase): verify applied state of all `migration_places_*.sql` on production.**

---

## 5. Current radius-query implementation

- Client picks center (default/geo/`getCenter()` on "search this area") + radius pill → `GET /api/places/nearby`.
- Server RPC `places_nearby(center_lat, center_lng, radius_km, max_results)`:
  - `dlat = r/111.045`, `dlng = r/(111.320·cos(lat))`; bbox prefilter on indexed `(lat,lng)`.
  - Haversine (`2·6371·asin(sqrt(...))`) for exact distance; `WHERE distance_km <= r ORDER BY distance_km LIMIT max_results`.
  - Filters `status='approved'` + `coalesce(search_eligible,true)`.
- Fallback: `nearbyFallback` server-side haversine over `getAllPlacesFromDb()` when the function is missing.
- Distance formatting client-side via `formatDistanceKm` ("350 m" / "1.2 km").
- **Gaps:** radius is a fixed pill set (no free radius / no true viewport-bbox query — it always queries a *circle around a center*, not the actual visible rectangle); "Search this area" re-queries center+radius, so corners of a non-square viewport may be under/over-covered.

---

## 6. Current map performance risks

1. **`/places` loads the entire catalog + pre-renders every card** (largest risk). Payload, TTFB, and client memory grow linearly with place count. Across Japan this is untenable. Needs server-side search + pagination/viewport querying.
2. **`/map` centroid pass also loads the full catalog** (`getAllPlacesFromDb`) just to build area/station dropdowns — full-table read on every `/map` hit (`force-dynamic`, uncached).
3. **Marker re-render churn:** the markers `useEffect` does `cluster.clearLayers()` + rebuild **all** markers whenever `displayed`, `emojiOf`, or `stateOf` change. `stateOf` depends on `when`, which changes whenever the "at time" input changes → full marker rebuild on each keystroke of the time picker.
4. **No request cancellation / debounce:** rapid radius/area/"search this area" actions fire overlapping `fetchNearby` calls; last-write-wins is not guaranteed (no `AbortController`).
5. **No tile caching strategy / attribution-only OSM:** direct `tile.openstreetmap.org` usage is subject to OSM's tile-usage policy and has no CDN fallback; heavy traffic could be rate-limited.
6. **`force-dynamic` everywhere** (`/map`, `/places`, nearby route): no caching layer; every visit recomputes. (The dictionary work used `unstable_cache` via a cookie-free client — same pattern is available here but unused for places.)

---

## 7. Mobile UX problems

- **Filter bar wrapping:** the controls row (view toggle, category, open-now, time picker, radius pills, location, area/station selects) is a single `flex-wrap` cluster; on phones it wraps to many rows and pushes the map far down. No mobile filter sheet / collapse.
- **`datetime-local`** is a heavy control for mobile and sits inline in the filter bar.
- **Map height** `60vh` on mobile with the tall filter stack above → little of the map visible without scrolling; fixed site header (see §6 of interactions) further reduces it.
- **Selected card** is a bottom sheet (good) but `max-h-[45%]` with internal scroll can clip actions on small screens; no drag-to-expand.
- **Split view** is desktop-only (`hidden lg:block`); mobile has no synchronized list+map, only hard `map`/`list` tab switch.
- **"Search this area" button** overlaps the top of the map at `z-[1100]`; on small maps it covers content.
- **No skeleton/loading shimmer** on the map tab — only a tiny text "loading" in the filter row.

---

## 8. Current i18n problems

- **Parity is good.** All 5 locales contain `map_explore`, `place_fields`, and the `warn_missing_coordinates|location|hours` keys (verified). A parity checker exists (`scripts/check-i18n-parity.mjs`, `npm run i18n:check`).
- **Hard-coded, non-localized bits (minor):**
  - Marker fallback emoji `'📍'` and OSM `attribution: '© OpenStreetMap'` (acceptable, non-translatable).
  - `directionsUrl` appends literal `" Japan"` to name searches ([lib/placeActions.ts:37](../lib/placeActions.ts#L37)) — not user-visible but locale-agnostic.
  - Admin lat/lng **placeholders** `33.5902`/`130.4017` are literals (the root of the §2 confusion); the *labels* are localized via `place_fields`.
  - Admin `LOCALES` flags/labels and `PREFECTURES` names are data, not message keys (acceptable).
- **Locale is cookie-based, routes are not localized**, so map/Admin URLs are locale-independent (no `/[locale]/map`). This simplifies the redesign but means any new map deep-links must carry locale via cookie, not path.
- **No missing keys detected** for the current map/Admin surfaces.

---

## 9. Google API requirements (verified against current docs, June 2026)

> Verified that the **$200 monthly credit was removed on 1 March 2025** and replaced by **per-SKU free monthly caps**: **Essentials 10,000**, **Pro 5,000**, **Enterprise 1,000** events/SKU/month. Also verified that **Places API (classic), Directions API, and Distance Matrix API are now "Legacy"**; the supported replacements are **Places API (New)** and **Routes API**. The legacy `google.maps.places.Autocomplete` widget and `AutocompleteService` are **not available to new customers** as of 1 March 2025 — new builds must use **`PlaceAutocompleteElement` / `AutocompleteSuggestion` (New)**. (Sources at end.)

**Map this project's 18 target features to current (non-legacy) APIs:**

| Need | Current API (non-legacy) | SKU tier | Free cap |
|---|---|---|---|
| Render an interactive map | Maps JavaScript API — **Dynamic Maps** | Essentials | 10k map loads/mo |
| Admin: search place by name/address/station | **Place Autocomplete (New)** `PlaceAutocompleteElement` | Essentials (per-request) **or** session-billed | 10k/mo (per-request) |
| Admin: resolve selected suggestion → coords | **Place Details (Essentials)** (only needed fields via FieldMask) | Essentials | 10k/mo |
| Admin: address → coords (typed address) | **Geocoding API** | Essentials | 10k/mo |
| Admin: map-click → coords | client-side (map `click` latlng) | **none** | free |
| Admin: parse Google Maps link → coords/Place ID | client/server URL parse (+ optional 1 Place Details lookup) | mostly **none**; Place Details if resolving a Place ID | 10k/mo |
| Public: external Google POI preview | **Place Details (Essentials/Pro)** + Place Photos | Essentials/Pro | 10k / 5k |
| Directions preview | **Routes API — Compute Routes (Essentials)** | Essentials | 10k/mo |
| "Open in Google Maps" deep link | URL only (`/maps/dir/?api=1...`) | **none** | free (current impl) |

**Explicitly avoid (Legacy):** classic Places API, `AutocompleteService`/`Autocomplete` widget, Directions API, Distance Matrix API.

### Required vs optional vs expensive vs free-without-paid-API

- **Required to remove manual coordinate typing (the core Admin goal):** Maps JS Dynamic Maps + (Geocoding **or** Place Autocomplete New + Place Details Essentials). Map-click coordinate capture needs **no paid API**.
- **Optional / value-add:** external Google POI previews, Routes directions preview, Place Photos.
- **Expensive / watch:** Place Details **Pro** fields, Place Photos, Routes **Pro**, anything Enterprise (3D tiles, Aerial) — not needed.
- **Achievable with NO paid Google API (keep on Leaflet/OSM/free):** the entire public Leaflet map, OSM tiles, "Open in Google Maps" deep links, map-click coordinate capture, our own `places_nearby` radius search, marker clustering, distance/open-now. **The Google spend is confined to Admin geocoding/autocomplete and optional public POI/route previews.**

---

## 10. Estimated API call points (where paid calls would originate)

1. **Admin editor — autocomplete keystrokes** (`PlaceAutocompleteElement`): 1 session per place edited (session token bundles the typing + 1 Place Details). **Volume = admin edits/month** → tiny.
2. **Admin editor — Place Details on selection / link-paste Place ID resolve:** 1 per resolved place. Tiny.
3. **Admin editor — Geocoding** when admin types a raw address and clicks "locate": 1 per click. Tiny.
4. **Public map load** (only if `MAP_PROVIDER=google`): 1 Dynamic Map load per page view. **Volume = public map sessions** → the only potentially large meter; default to Leaflet keeps this at 0.
5. **Public POI preview** (only if `GOOGLE_EXTERNAL_POI_ENABLED`): 1 Place Details (+ photos) per preview open. User-driven; cache aggressively.
6. **Route preview** (only if `GOOGLE_ROUTE_PREVIEW_ENABLED`): 1 Compute Routes per preview. User-driven.

**Admin-only usage (1–3) realistically stays inside the 10k Essentials free cap indefinitely.** Public usage (4–6) is the cost surface and must be flag-gated + cached + provider-abstracted.

---

## 11. Cost-risk areas

- **Default the public map to Google** → every visit bills a Dynamic Map load (and possibly POI details). **Mitigation: keep Leaflet as default provider; Google opt-in.**
- **Place Autocomplete without session tokens** → each keystroke billed separately (abandoned sessions bill per-request). **Mitigation: always pass a session token; debounce.**
- **Uncached Place Details / Photos** for popular POIs → repeat billing. **Mitigation: persist `place_id` + cache details/photos in our DB with TTL.**
- **No usage caps / alerts** on the Google Cloud key → runaway risk. **Mitigation: per-API quotas, billing alerts, key restricted by HTTP referrer (browser key) + by API.**
- **Pro/Enterprise field masks** creeping into Place Details → silent tier upgrade. **Mitigation: explicit FieldMask limited to Essentials fields.**

---

## 12. Proposed provider abstraction

Introduce a thin, typed boundary so Leaflet stays the default and Google is swappable per-capability:

```
lib/maps/
  types.ts            // LatLng, MapMarker, GeocodeResult, PlaceSuggestion, RoutePreview
  provider.ts         // MapProvider interface (below)
  leaflet/            // current Leaflet impl (default) — wraps app/map/MapExplorer internals
  google/             // Maps JS New / Places New / Routes (flag-gated, lazy-loaded)
  geocode.ts          // geocodeAddress(): google | (free: Nominatim opt-in) | none
  links.ts            // parseGoogleMapsUrl() -> {lat,lng?} | {placeId} | null  (NO API)
  index.ts            // getMapProvider() reads NEXT_PUBLIC_MAP_PROVIDER
```

```ts
interface MapProvider {
  id: 'leaflet' | 'google';
  renderMap(el, opts): MapHandle;                 // markers, clustering, viewport events
  // optional capabilities (undefined => not supported by this provider):
  geocodeAddress?(q: string): Promise<GeocodeResult[]>;
  placeAutocomplete?(q: string, token): Promise<PlaceSuggestion[]>;
  placeDetails?(id: string, fields): Promise<PlaceLite>;
  routePreview?(from, to): Promise<RoutePreview>;
}
```

- **Admin coordinate-capture** is provider-agnostic UX (map-click + search + link-paste); only the *search/geocode* call routes to a provider. Map-click works with **either** provider and needs **no paid API**.
- All Google modules are **dynamically imported** behind flags so the default bundle never pulls the Google SDK.
- Keep `directionsUrl`/"Open in Google Maps" exactly as-is (free deep links) regardless of provider.

---

## 13. Proposed feature flags

Adapt to this repo's `NEXT_PUBLIC_*` convention (client-readable) + server-only secret:

| Flag | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_MAP_PROVIDER` | `leaflet` | `leaflet \| google` — which renderer the public map uses |
| `NEXT_PUBLIC_MAP_V2_ENABLED` | `false` | gate the redesigned unified map+list shell (old Leaflet map stays live) |
| `NEXT_PUBLIC_GOOGLE_MAPS_ENABLED` | `false` | master switch for any client Google Maps JS |
| `NEXT_PUBLIC_GOOGLE_EXTERNAL_POI_ENABLED` | `false` | external Google POI previews on public map |
| `NEXT_PUBLIC_GOOGLE_ROUTE_PREVIEW_ENABLED` | `false` | in-app Routes preview (else deep-link only) |
| `NEXT_PUBLIC_ADMIN_PLACE_SEARCH_ENABLED` | `false` | Admin map-click/search/link-paste coordinate UI |
| `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` | — | referrer-restricted browser key (maps/autocomplete) |
| `GOOGLE_MAPS_SERVER_KEY` | — | **server-only** key for Geocoding/Place Details/Routes called from server actions |

Rules: default state = **exactly today's behavior** (Leaflet, OSM, no Google). Every Google path is off until explicitly enabled. Browser key and server key are **separate** and independently restricted.

---

## 14. Proposed database changes (Phase ≥2 — design only, no SQL run)

- `places.google_place_id text` (+ unique partial index where not null) — store resolved Place ID for stable re-lookups & dedupe.
- `places.geo_source text` (`manual | map_click | geocode | google_place | link_parse`) — provenance of coordinates.
- `places.geocoded_at timestamptz` — freshness of geocode.
- Optional `place_external_cache(place_id pk, payload jsonb, photos jsonb, fetched_at)` — TTL cache for Google Place Details/Photos to cap cost.
- Optional later: enable PostGIS + `geog geography(Point,4326)` generated from lat/lng + GiST index — **only if** national KNN/polygon needs emerge (§4.6).
- Optional: a real viewport RPC `places_in_bbox(min_lat,min_lng,max_lat,max_lng,limit)` to replace the circle-around-center model with true rectangle queries for "search this area".
- Keep all additive + idempotent + NULL-safe, matching existing migration conventions. Add a **"both-or-neither" coordinate CHECK** and (optionally) a Japan-bounds soft validation at write time.

---

## 15. Proposed implementation phases

- **Phase 1 (this doc):** audit only. ✅
- **Phase 2 — Admin coordinate capture (highest value, lowest cost, fixes §2):** map-click + search (Geocoding/Autocomplete New) + Google-link parsing + draggable marker in the Admin editor; store `lat/lng`, `google_place_id`, `geo_source`. Behind `ADMIN_PLACE_SEARCH_ENABLED`. Leaflet-based map-click works with no paid API; Google search optional.
- **Phase 3 — Map/list unification & viewport queries:** introduce provider abstraction; build `places_in_bbox` RPC; server-side paginated search for `/places` (stop loading the full catalog); synchronized map+list; "search this area" uses true viewport; mobile bottom sheet. All behind `MAP_V2_ENABLED`, still Leaflet.
- **Phase 4 — Optional Google enrichment (cost-gated):** external POI previews, Routes preview, optional `MAP_PROVIDER=google`. Each behind its own flag, cached, quota-capped.
- **Phase 5 — Cleanup:** retire `/map` vs `/places` split once unified shell is proven; consider PostGIS only if data justifies.

---

## 16. Test strategy

- **Pure units (existing `node --test` harness):** extend `lib/placeFields.test.ts` (coordinate validation incl. both-or-neither, Japan bounds), add `lib/maps/links.test.ts` for Google-Maps-URL parsing (every link shape: `@lat,lng`, `?q=lat,lng`, `place/.../@`, short `maps.app.goo.gl`, Place ID), `lib/maps/geocode` adapter contract tests with mocked fetch.
- **Provider contract tests:** one suite run against both `leaflet` and `google` providers asserting identical `MapProvider` semantics (markers add/remove, viewport events, capability presence).
- **i18n:** `npm run i18n:check` must stay green; add new map/admin keys to all 5 locales.
- **E2E (existing `e2e/`):** Admin sets coordinates via map-click → save → warning clears → public map shows marker; `/map` radius + "search this area"; provider flag flip leaves Leaflet behavior unchanged.
- **Cost guardrail test:** assert no Google SDK import in the default bundle when flags are off (build-output grep / dynamic-import assertion).
- **Type/lint gates:** `npm run typecheck`, `npm run lint` clean before each phase merges.

---

## 17. Rollback strategy

- **Feature-flag first:** every new path is behind a `NEXT_PUBLIC_*` flag defaulting off; rollback = flip the env var in Vercel (no redeploy of code logic needed for provider/feature toggles).
- **Provider fallback:** `MAP_PROVIDER=leaflet` fully restores today's map; Google modules are lazy and never loaded when off.
- **DB migrations additive & idempotent:** new columns are nullable; documented `DROP COLUMN IF EXISTS` rollbacks (as existing migrations already provide). The app already tolerates missing columns (PGRST204 fallback), so a partial/rolled-back migration won't crash editing.
- **API fallback already exists:** `places_nearby` RPC missing → server haversine fallback; preserve this.
- **Kill switch for cost:** disabling `GOOGLE_MAPS_ENABLED` immediately stops all billable calls; server key can be revoked in Google Cloud independently.

---

## 18. Risks & unresolved questions

1. **Is the production Supabase actually migrated?** The coordinate bug's root cause (a) vs (b) can't be distinguished from code alone. **Needs a read-only check of applied migrations / column existence on prod** before Phase 2.
2. **How many places exist on prod today, and projected national scale?** Determines urgency of replacing the full-catalog `/places` load and whether PostGIS is ever needed.
3. **Google billing account ownership & budget ceiling** — who owns the Cloud project, what monthly cap, alerting thresholds? Required before any Google flag is enabled.
4. **EU/region considerations** for Places API (New) — not relevant for Japan-only data but worth confirming if any admin operates from the EU.
5. **OSM tile policy** — current direct `tile.openstreetmap.org` usage may need a proper tile provider (or self-host/CDN) before national traffic; not a blocker for the audit.
6. **Coordinate provenance for existing rows** — many places likely have NULL lat/lng (per the bug). A backfill plan (geocode-on-save vs batch geocode) has cost implications and is unscoped here.
7. **"Search this area" semantics** — circle-around-center vs true viewport rectangle is a UX/behavior decision affecting the proposed `places_in_bbox` RPC.
8. **Two surfaces or one?** Product decision: unify `/map` and `/places` into one shell (recommended) vs keep both. Affects Phase 3 scope.

---

### Sources (Google Maps Platform, verified June 2026)

- [Google Maps Platform pricing overview](https://developers.google.com/maps/billing-and-pricing/overview) — per-SKU free caps replacing the $200 credit (1 Mar 2025).
- [Core services pricing list](https://developers.google.com/maps/billing-and-pricing/pricing) and [SKU details](https://developers.google.com/maps/billing-and-pricing/sku-details) — Essentials/Pro/Enterprise tiers (10k/5k/1k).
- [Changes to volume discounts, monthly credit, and Legacy services (FAQ)](https://developers.google.com/maps/billing-and-pricing/faq) — Places API, Directions API, Distance Matrix API → Legacy.
- [Places API (New) Autocomplete](https://developers.google.com/maps/documentation/places/web-service/place-autocomplete) and [deprecations](https://developers.google.com/maps/deprecations) — `AutocompleteService`/`Autocomplete` widget not for new customers (1 Mar 2025); use `AutocompleteSuggestion`/`PlaceAutocompleteElement`.
- [Migrate to Routes API](https://developers.google.com/maps/documentation/routes/migrate-routes) and [why migrate](https://developers.google.com/maps/documentation/routes/migrate-routes-why) — Routes API replaces Directions + Distance Matrix.
- [Places API Usage and Billing](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing) — Autocomplete **session** billing (typing + ≤1 Place Details share one token).
- [Maps JavaScript API Usage and Billing](https://developers.google.com/maps/documentation/javascript/usage-and-billing) — Dynamic Maps (Essentials).

---

**End of Phase 1. No implementation performed. Awaiting approval to proceed to Phase 2 (Admin coordinate capture).**
