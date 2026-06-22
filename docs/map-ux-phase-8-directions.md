# Map UX Redesign — Phase 8: Directions, Route Preview & Google Maps Navigation Handoff

> **Scope:** Let users choose a destination + origin + travel mode, see distance &
> estimated duration, preview the route in-site (behind a flag), and hand off to
> Google Maps for real navigation. **No browser voice/turn-by-turn navigation.**
> "Open in Google Maps" always works, even when route preview is unavailable or
> fails. No production data changed, no SQL executed, no flags enabled, no keys
> committed. Follows Phases [1](./map-ux-phase-1-audit.md)–[7](./map-ux-phase-7-unified-search.md).
>
> **Date:** 2026-06-22 · **App root:** `web/`

---

## 1. Progressive implementation (A → D)

- **A. Open in Google Maps URL** — pure, always available, no API/key.
- **B. Directions panel** — origin/destination/mode/approximate distance + the
  Google Maps handoff, all with **no API**.
- **C. In-site route preview** — real distance/duration/polyline via the Routes
  API, **behind a flag**, computed only on an explicit "Preview route" click.
- **D. Route alternatives** — request shape supports `computeAlternativeRoutes`;
  the UI requests a single route by default (alternatives wired but not surfaced —
  only useful once a strong product need exists; see §11).

The "Open in Google Maps" action is rendered independently of preview state, so a
preview failure/unavailability never removes the handoff.

---

## 2. APIs used

| Need | API | Notes |
|---|---|---|
| Navigation handoff | **Google Maps URLs** (`/maps/dir/?api=1`) | free, no key, no API call |
| Distance + duration + polyline | **Routes API — Compute Routes** (Essentials) | server-side only, minimal field mask |
| Approximate distance (no API) | local **haversine** | labeled "straight-line" |

**Legacy avoided:** Directions API & Distance Matrix API (frozen) — replaced by
the Routes API, per the Phase-1/3 platform decisions.

---

## 3. Fields requested

- **Routes API field mask (minimal):**
  `routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.description`.
  No per-step instructions, legs, fares, viewport, or travel advisories.
- **Compute Routes body:** origin/destination `latLng`, `travelMode`,
  `polylineQuality:'OVERVIEW'`, `units:'METRIC'`, `languageCode` (UI locale),
  `computeAlternativeRoutes:false`; `routingPreference:'TRAFFIC_AWARE'` only for
  driving.

---

## 4. Travel-mode support

UI/URL modes: **walking · driving · bicycling · transit** ([lib/maps/directions.ts](../lib/maps/directions.ts)),
mapped to Routes API `WALK · DRIVE · BICYCLE · TRANSIT`. Modes are a fixed,
non-legacy set the Routes API supports; the URL `travelmode` values match the
current api=1 spec exactly. A mode that yields no route (e.g. transit in an
unsupported area) surfaces a localized "no route"/"unsupported mode" status rather
than a broken state.

---

## 5. URL generation (open-redirect–safe)

`buildGoogleMapsDirectionsUrl` ([directions.ts](../lib/maps/directions.ts)):

- host is the **hard-coded** `https://www.google.com/maps/dir/?api=1` constant —
  there is no user-controlled host, so **no open-redirect surface** (asserted by a
  test that the hostname is always `www.google.com` across all input shapes).
- **destination preference:** Place ID (`destination_place_id`) when present,
  with the text `destination` = coordinates → name → Place ID; coordinates as the
  primary fallback; name as supporting context.
- **origin:** included only when explicitly provided (typed text or resolved
  coordinates). `'current'`/none → origin omitted so Google uses the device
  location. All name/text values are `encodeURIComponent`-escaped (coordinates use
  the URL-safe `lat,lng` form); injection/special-char inputs round-trip safely.
- `travelmode` appended only for a valid mode. Never throws; an empty destination
  degrades to a Google maps **search** URL.

---

## 6. Directions panel ([components/maps/DirectionsPanel.tsx](../components/maps/DirectionsPanel.tsx))

Shows origin, destination, travel mode (large `radiogroup` buttons), distance,
estimated duration, route status, **Clear route**, **Change origin**, **Use
current location**, and a prominent **Open in Google Maps**. Approximate
straight-line distance shows immediately when an origin coordinate is set; real
distance/duration/summary appear after a preview. Mobile: rendered as a bottom
sheet anchored in the map container, `env(safe-area-inset-bottom)` padding, large
touch controls, no nested-scroll trap, Open-in-Google-Maps kept prominent.

**Origin selection:** current location (explicit click; secure-context +
denied/timeout/unsupported handling), **pick on map** (arms the next map click),
and **typed text** (used for the Google Maps handoff; in-site preview requires a
coordinate origin). A typed origin **label** (not coordinates) is the only thing
cached, in `sessionStorage`, per the privacy rules.

---

## 7. Map interaction & route mode (`MapExplorerV2`)

When a preview route is active, a dedicated Leaflet layer draws the polyline
(blue) + distinct **origin (🟢)** and **destination (📍)** pins, and the map
**fits the route bounds** (`maxZoom:16`, padding) without excessive zoom. The
previous discovery view (center/zoom) is saved before fitting and **restored on
close**; the selected place is preserved (directions keep `selected`). Route mode
takes panel precedence over the internal/external previews; Escape closes
directions first. Origin-by-map-click shows a hint banner and captures exactly one
click.

---

## 8. Privacy design

- Precise location is **never persisted in the DB**, **never logged**, and
  **never sent to analytics**. Geolocation is requested only on explicit click
  (`enableHighAccuracy:false`), used in-memory for the route call, and discarded.
- The route compute endpoint receives coordinates to call Google but **logs only**
  aggregated, coordinate-free events.
- `lib/maps/routeAnalytics.ts` `buildRouteEvent` structurally yields only
  `{ event, mode, status?, ts }`; `containsNoCoordinates` + a unit test assert no
  `lat`/`lng`/`coord` keys can ever appear, even if a coordinate object is passed
  as the mode. Session storage holds an origin **label** only.

---

## 9. API-call strategy (cost control)

- Routes API is called **only** on an explicit "Preview route" click — never per
  marker, per search, per pan, or on card open.
- Minimal field mask; single route by default; **stale-request cancellation**
  (monotonic `reqId`); destination change invalidates the drawn route.
- The **server-only** `GOOGLE_MAPS_SERVER_KEY` is used by `/api/maps/route`; the
  browser never sees it. Missing key → `unavailable` (handoff still works).
- **Aggregated events:** `route_preview_requested/succeeded/failed`,
  `open_in_google_maps_clicked`, plus travel-mode category — emitted via
  `logRouteEvent` (server) and a coordinate-free `sendBeacon` (client) to
  `/api/maps/route-events`.

**Quota recommendations (documented):** restrict the server key to the **Routes
API** only; set a **daily quota cap** + **billing alert** in Cloud Console; rely
on Essentials free tier (10k/mo) — realistic explicit-preview volume stays well
inside it; cache nothing server-side beyond Google's 30-day coordinate TTL (we
cache nothing here); keep route preview flag **off** until a budget ceiling is set.

---

## 10. Error handling

`statusFromResponse` + the panel map every outcome to a localized message:
**no route**, **unsupported mode**, **API unavailable** (403/5xx/missing key),
**quota exceeded** (429), **origin = destination** / invalid coords (rejected
pre-call), **region unsupported**, **destination changed** (route cleared), and
**stale request cancellation** (dropped). Network failure → `unavailable`. In all
cases "Open in Google Maps" remains.

---

## 11. Feature-flag model (default = today's behavior)

```
routePreviewAvailable(config) = googleMapsEnabled && routePreviewFlag   // default OFF
```

Decoupled from the base-map provider (the panel works over Leaflet), mirroring
Phase 7. `lib/maps/config.ts` adds `routePreviewFlag` (raw) +
`routePreviewAvailable()`; the provider-gated `routePreviewEnabled` is unchanged.
With defaults: only **A** (Open in Google Maps) and **B** (panel + approximate
distance) are active; **C/D** require the flag **and** the server key.

---

## 12. Files changed

**New (pure libs + tests):** `lib/maps/directions.ts`(+`.test.ts`),
`lib/maps/polyline.ts`(+`.test.ts`), `lib/maps/routeRequest.ts`(+`.test.ts`),
`lib/maps/routeAnalytics.ts`(+`.test.ts`).
**New (server/client):** `app/api/maps/route/route.ts` (Routes API proxy,
server-key, coordinate-free logging), `app/api/maps/route-events/route.ts`
(aggregated client events), `components/maps/DirectionsPanel.tsx`, this doc.
**Edited:** `lib/maps/config.ts` (+`routePreviewFlag`, `routePreviewAvailable`),
`lib/maps/config.test.ts` (+tests), `app/map/MapExplorerV2.tsx` (directions panel,
route layer + origin/dest pins + fit/restore, map-click origin capture, Escape),
`app/map/page.tsx` (pass `routePreviewAvailable`), `.env.local.example`
(+`GOOGLE_MAPS_SERVER_KEY`), `messages/{vi,en,ja,ko,zh}.json` (+`directions`, 37
keys each).
**Unchanged:** old `/map` `MapExplorer`, Leaflet default, RLS, migrations, the
unified search/admin picker internals.

---

## 13. Tests

`node --test "lib/**/*.test.ts"` → **499/499 pass** (+76 over Phase 7). New:

| Requirement | Coverage |
|---|---|
| Open in Google Maps with Place ID | `directions.test.ts` |
| coordinate fallback | `directions.test.ts` |
| walking / driving / bicycling / transit modes | `directions.test.ts` + `routeRequest.test.ts` (mode mapping, TRAFFIC_AWARE) |
| URL encoding & no open redirect | `directions.test.ts` (encoding, host always google.com, injection-safe) |
| route unavailable / API failure / quota | `routeRequest.test.ts` (`statusFromResponse`) |
| origin equals destination | `routeRequest.test.ts` (`validateRouteRequest`) |
| no precise-location logging | `routeAnalytics.test.ts` (`buildRouteEvent`/`containsNoCoordinates`) |
| polyline decode (route geometry) | `polyline.test.ts` (canonical example + bounds + garbage-safe) |
| availability flag default-off | `config.test.ts` (`routePreviewAvailable`) |

**Interactive flows not runnable in CI here** (need a live key + browser + device
geolocation): denied/granted geolocation prompts, real Routes API call, mobile
bottom-sheet drag, browser Back after closing route mode, five-locale visual pass.
Covered by the pure units above + the manual script in §14.

**Gates:** `tsc --noEmit` exit 0 · `next lint` clean (changed files) · i18n parity
**3840 × 5** · `next build` OK (`/map` 27.6 kB; `/api/maps/route` +
`/api/maps/route-events` added; old map default).

---

## 14. Manual verification (staging)

1. Set `NEXT_PUBLIC_MAP_V2_ENABLED=true` (+ coords on a few places via the Phase-5
   picker). Without Google flags: open a place → **Directions** → panel shows
   origin/destination/mode + **Open in Google Maps**; click it → Google Maps opens
   with the correct destination/mode; no Routes call is made.
2. Enable `NEXT_PUBLIC_GOOGLE_MAPS_ENABLED=true`,
   `NEXT_PUBLIC_GOOGLE_ROUTE_PREVIEW_ENABLED=true`, and set `GOOGLE_MAPS_SERVER_KEY`
   (Routes API). **Use current location** (allow / deny / insecure) → status; pick
   a mode → **Preview route** → polyline + distance + duration + summary; the map
   fits the route. **Clear route** / **Change origin** / **Pick on map**.
3. Force errors: bad/over-quota key → quota/unavailable message while
   Open-in-Google-Maps still works; transit where unsupported → no-route message.
4. Mobile (320–430px): bottom sheet, large mode buttons, safe-area padding, no
   horizontal scroll, keyboard doesn't cover the panel.
5. Switch `locale` across vi/en/ja/ko/zh → all directions UI localized.
6. Verify server logs show only `[route-metric] {"event":…,"mode":…}` — **no
   coordinates**.

---

## 15. Known limitations

1. In-site preview needs a **coordinate origin** (current location or map-click);
   a typed-text origin is used only for the Google Maps handoff (forward geocoding
   of typed origins is a follow-up).
2. **Route alternatives (D)** are supported in the request/parse layer but not
   surfaced in the UI (single route by default) — enable when a clear need exists.
3. Destination Place ID isn't currently threaded from `NearbyPlace` into the panel
   (handoff uses coordinates/name; the URL builder supports `destination_place_id`
   and will use it once the field is plumbed through).
4. Browser voice / turn-by-turn navigation is intentionally **out of scope**.
5. In-site route preview renders empty until places have coordinates (prod has 0
   today) and the flag + server key are configured.

---

**End of Phase 8. Open in Google Maps works with no key; the directions panel and
approximate distance work with no API; in-site route preview + alternatives are
flag-gated and require the server-only Routes key — all OFF by default. No
production data changed, no SQL executed, no flags enabled, no keys committed. No
browser turn-by-turn navigation was built.**
