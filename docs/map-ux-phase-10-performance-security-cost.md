# Map UX Redesign — Phase 10: Performance, Security, Privacy, Cost Control & Observability

> **Scope:** Make the complete map experience fast, stable, secure, cost-
> controlled, observable, privacy-conscious, and production-safe. No new product
> features; no production data changed, no SQL executed, no flags enabled, no keys
> committed. Follows Phases [1](./map-ux-phase-1-audit.md)–[9](./map-ux-phase-9-polish-accessibility-i18n.md).
>
> **Date:** 2026-06-22 · **App root:** `web/` · Companion docs:
> [google-maps-cost-control.md](./google-maps-cost-control.md),
> [google-maps-emergency-disable.md](./google-maps-emergency-disable.md).

---

## 1. Performance — before / after

| Metric | Result |
|---|---|
| `/map` route JS | 18.8 kB (P6) → 23.8 (P7) → 27.6 (P8) → 28.1 (P9) → **28.7 kB (P10)** |
| **Shared First Load JS** | **87.9 kB — unchanged across P6–P10** → no map library leaked into the shared/common bundle |
| Leaflet | loaded **only** on `/map` via `next/dynamic({ ssr:false })`; never on other routes |
| Google Maps JS | **never** at import time; the inline bootstrap loader fetches the script **only when called**, only by the Google components, only when the Google provider/picker is active (all off by default) |
| Marker / cluster rendering | `leaflet.markercluster` (`maxClusterRadius 55`); DOM stays small regardless of density |
| Viewport query (`placesWithinBounds`) | 10,000 synthetic places filtered + capped in **< 1.5 s** in a pure unit test (regression canary); typically a few ms at current scale |
| Autocomplete / route latency | debounced + stale-cancelled; user-perceived latency bounded by debounce, not request pile-ups |

The map libraries are route-split and lazily loaded; the only growth on `/map` is
the new client logic (search, directions, metrics), and the **shared** bundle is
flat — confirming map code is not shipped to unrelated pages.

## 2. Database performance

- **Marker queries return only map-card fields.** `NearbyPlace` (from
  `places_in_bbox` / `places_nearby` / the `placesWithinBounds` fallback) carries
  slug/name/area/category/label/coords/station/hours/price/img — **never `body`
  or `desc`** (asserted by `mapPerf.test.ts`). Article bodies never reach a marker
  payload.
- **Indexed paths:** viewport + radius use the partial B-tree
  `places_geo_idx(lat,lng)`; results are capped (default 200–300, hard max 500),
  distance-from-centre sorted, single query (no N+1).
- **Scale tests:** `mapPerf.test.ts` exercises 100 / 1,000 / 10,000 places →
  cap honoured, all results in-bounds, stable ordering.
- **Dedup / stale / cache:** viewport queries dedupe by nature; the client uses a
  monotonic `reqId` to drop stale responses and a per-session `Map` cache for
  identical search queries (Phase 7).

## 3. Google API call points (audit)

| # | Trigger | API | Fields | Origin | Cache | Est. freq | On failure |
|---|---|---|---|---|---|---|---|
| 1 | Google base-map render (provider=google) | Maps JS Dynamic Maps | — | client | loader singleton | 1/session *(off by default)* | reject → Leaflet |
| 2 | Admin typing | Places Autocomplete (New) | prediction text only | client | session token | admin edits/mo | error → manual coords |
| 3 | Admin select / POI / link id | Place Details (New) | **6-field mask** | client | per-session | ≤1/session | error state |
| 4 | Admin map click/drag | Geocoding | address suggest | client | debounced 600 ms | rare | best-effort |
| 5 | Public "Search Google Maps" click | Places Autocomplete (New) | prediction text only | client | session token | explicit only *(off)* | error + retry |
| 6 | Public external select / POI click | Place Details (New) | **6-field mask** | client | per-session dedup | explicit only *(off)* | error |
| 7 | Public "Preview route" click | Routes API Compute Routes | distance/duration/polyline/description | **server** (server key) | none | explicit only *(off)* | status msg; Open-in-GMaps still works |
| 8 | Internal search | our DB `/api/places/search` | minimal | server | client per-query | per keystroke (debounced) | error + retry |
| 9 | Viewport load | our DB `/api/places/in-bounds` | map-card fields | server | — | committed interaction | error + retry, metric |
| 10 | Open in Google Maps | **URL only** | — | client | — | on click | n/a (always works) |

Enforced (across Phases 5/7/8, verified here): debounce, stale-cancel, session
tokens, minimal fields, **no automatic Place Details**, **no automatic route
calc**, **no photos/reviews by default**, internal search first, Routes only after
a click, Google Maps URL as the primary navigation handoff. Quotas/budgets:
[google-maps-cost-control.md](./google-maps-cost-control.md).

## 4. API-key security

- **Browser key** (`NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`) is public by design;
  safety comes from **HTTP-referrer + per-API restriction + quotas** (documented in
  the setup + emergency docs). Unauthorized referrers fail closed.
- **Server Routes key** (`GOOGLE_MAPS_SERVER_KEY`) is **server-only**, read solely
  in `/api/maps/route`, sent to Google via an `X-Goog-Api-Key` header, **never**
  returned to the client and **never** logged.
- **`.env*.local` is gitignored**; no key is committed (example file has blanks).
- **Logs/errors never expose keys:** server logging emits only aggregated
  `[map-metric]` lines (event + mode/status); a new `redactSensitive`/
  `safeErrorMessage` (`lib/maps/sanitize.ts`) strips API keys, `key=`/token params,
  bearer tokens, and lat,lng pairs from any string before it could be logged.
- **Runtime env validation** (`lib/maps/env.ts`): `validateMapEnv` checks the
  flag↔credential invariants (e.g. route preview ⇒ server key; external search ⇒
  browser key) and returns missing **NAMES** only; surfaced via `/api/health`
  (`map.config_ok`, booleans, missing-names) — values are never exposed.
- **Key rotation + preview-domain strategy:** documented in
  [google-maps-emergency-disable.md](./google-maps-emergency-disable.md).

## 5. Privacy

- Geolocation requested **only** after an explicit "Use current location" click
  (secure-context checked); precise coords live in component state, used for the
  route call, and are **never persisted** to the DB.
- **No precise coordinates in analytics/logs:** the metrics builder
  (`lib/maps/metrics.ts`) keeps only a closed allow-list of low-cardinality
  dimensions; any `lat`/`lng`/`address`/`key`/`query` passed in is **dropped**
  (unit-tested). Route origins are never logged.
- Sensitive errors are sanitized (`safeErrorMessage`).
- Third-party (Google) usage + attribution documented in the setup/cost docs;
  external results show provider attribution and are visually distinct (Phase 7/9).

## 6. Observability (privacy-safe)

New unified module `lib/maps/metrics.ts` (+ `/api/maps/metrics` beacon endpoint),
superseding the Phase-8 `routeAnalytics`. Metric events wired:

| Event | Where emitted |
|---|---|
| `map_loaded` / `map_load_failed` / `map_provider` | `MapExplorerV2` init |
| `viewport_query` (ok + `latency_ms` + `latency_bucket`) / `map_api_unavailable` | `fetchBounds` |
| `search_succeeded` / `search_failed` / `autocomplete_failed` | `UnifiedSearchBox` |
| `result_selected` (`source: internal/external/station/topic`) | selection handlers |
| `route_preview_requested/succeeded/failed` | `/api/maps/route` (server) + panel (requested) |
| `open_in_google_maps_clicked` | `DirectionsPanel` |
| `geolocation` (`permission: granted/denied/unsupported/insecure/timeout/error`) | `DirectionsPanel` |

**Never logged:** raw coordinates, full typed addresses, API keys, provider
payloads — guaranteed by the allow-list drop + `containsNoSensitiveData` guard.

## 7. Resilience / fallback (verified)

| Failure | Behavior |
|---|---|
| Google Maps JS unavailable / script blocked | Leaflet remains the default; Google never required for the public map |
| Places unavailable | external search shows an error + retry; internal search unaffected |
| Routes unavailable / quota exceeded | localized status; **Open in Google Maps still works** |
| Network offline / slow | stale-cancel + debounce; loading/error/retry states; SSR'd initial list |
| Database timeout | `/api/places/in-bounds` catch → error + retry; `places_nearby`/`in_bbox` fall back to a server-side filter |
| Map script blocked / `L.map` throws | `mapFailed` → **list-only** layout (places still reachable) |
| Missing env var | `validateMapEnv` reports it (names only); features degrade to internal-only; Open-in-GMaps unaffected |

**Internal place content is always reachable through the results list** (a real
`role="list"` of links) regardless of any Google/Map failure.

## 8. Files changed

**New:** `lib/maps/metrics.ts`(+`.test.ts`), `lib/maps/sanitize.ts`(+`.test.ts`),
`lib/maps/env.ts`(+`.test.ts`), `lib/maps/mapPerf.test.ts`,
`app/api/maps/metrics/route.ts`, this doc + the two companion docs.
**Edited:** `app/api/maps/route/route.ts` (unified `logMapMetric`),
`app/api/health/route.ts` (value-free map env status),
`app/map/MapExplorerV2.tsx` (map/viewport/selection metrics),
`components/maps/UnifiedSearchBox.tsx` (search/autocomplete metrics),
`components/maps/DirectionsPanel.tsx` (geolocation/route/open metrics via the
unified emitter).
**Removed (superseded):** `lib/maps/routeAnalytics.ts`(+`.test.ts`),
`app/api/maps/route-events/route.ts` (folded into `metrics` + `/api/maps/metrics`).
**Unchanged:** old `/map` map, Leaflet default, RLS, migrations, all flag defaults
(still off), Google keys.

## 9. Tests

`node --test "lib/**/*.test.ts"` → **525/525 pass**. New/updated:

| Area | Coverage |
|---|---|
| privacy logging | `metrics.test.ts` (dims allow-list drops coords/address/key; `containsNoSensitiveData`; status cap) |
| key/coord redaction | `sanitize.test.ts` (API key, `key=`/token, bearer, lat,lng) |
| missing-key / env validation | `env.test.ts` (flag↔credential invariants; booleans-only status; no value leakage) |
| DB performance + field minimization | `mapPerf.test.ts` (100/1k/10k cap+bounds+ordering; **no `body`/`desc`** in `NearbyPlace`) |
| duplicate-request / stale | covered by existing `reqId` logic + viewport/search tests |
| provider fallback / quota / missing-key | `config.test.ts` (`*Available` default-off) + `routeRequest.test.ts` (`statusFromResponse` quota/unavailable/no_route) |

**Gates:** `tsc --noEmit` exit 0 · `next lint` (incl. `jsx-a11y`) clean ·
i18n parity **3844 × 5** · `next build` OK (`/map` 28.7 kB; shared JS flat at
87.9 kB; `/api/maps/metrics` added, `route-events` removed).

**Not runnable here:** real-browser Lighthouse/Web-Vitals profiling and live
Google-quota/billing tests need a browser + a configured project (unavailable in
CI) — covered by build-output bundle sizes, pure perf/regression units, and the
manual recipes in the companion docs.

## 10. Known risks

1. The internal search route loads the catalog per request (`force-dynamic`);
   mitigated by the client per-query cache. A server-side cached catalog snapshot
   is the next optimization if traffic grows.
2. Bundle sizes are read from `next build` output, not a real-device profile.
3. Quotas in the cost-control doc are conservative **starters**, deliberately not
   set to 0 (which would disable normal use); tune as traffic grows.
4. Metrics currently log to stdout (`[map-metric]`); wiring to a metrics sink
   (e.g. Vercel/OTel) is a deployment step, not code.
5. Map renders empty until coordinates are seeded (prod has 0 today) and the
   relevant flags/keys are configured — all still **off by default**.

---

**End of Phase 10. The map experience is route-split, internal-first, Google-off-
by-default, key-safe, privacy-safe (no coordinates/keys logged), observable, and
degrades to internal list content under every failure. No production data changed,
no SQL executed, no flags enabled, no keys committed.**
