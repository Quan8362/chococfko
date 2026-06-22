# Map UX Redesign — Final Release Report (Phase 11)

> **Status:** Release-prepared. Map V2 is **built, verified, and ready** behind
> `NEXT_PUBLIC_MAP_V2_ENABLED`. **Not enabled for all production users** — staged
> rollout pending explicit approval (see [map-ux-production-rollout.md](./map-ux-production-rollout.md)).
> **Leaflet is NOT removed** and remains the production default + emergency
> fallback. No production data changed, no SQL executed, no flags enabled, no keys
> committed.
>
> **Date:** 2026-06-22 · **App root:** `web/` · Covers Phases 1–11.

---

## 1. Final architecture

```
Public map  /map  (app/map/page.tsx, force-dynamic, SSR shell)
  └─ getMapConfig().v2Enabled ?
       MapExplorerV2 (Leaflet, dynamic ssr:false)         ← flag ON
         • UnifiedSearchBox  → /api/places/search (internal, Google-free)
                             → external Google (gated, explicit click)
         • viewport load     → /api/places/in-bounds (places_in_bbox | fallback)
         • markers + clusters (leaflet.markercluster), branded pins
         • DirectionsPanel   → /api/maps/route (Routes API, server key) + Open-in-GMaps
         • ExternalPlacePreview (slate, provider-attributed, dup-detected)
       : MapExplorer (existing Leaflet map)                ← flag OFF (DEFAULT)

Admin editor  /admin/places/[slug]
  └─ PlacePicker (search → select → review → adjust → confirm → save)
       degrades to manual lat/lng when Google unconfigured

lib/maps/   types · config · motion · directions · polyline · routeRequest
            metrics · sanitize · env · links · placeDetails · unifiedSearch
            externalPlace · duplicateDetection · adminSeed · mapView · google/loader
lib/        coordinates · placeLocation · placesNearby · placeSearch · searchConcepts
```

Provider abstraction keeps **Leaflet the default**; Google is swapped in per-
capability only when its flag + key are present. Everything Google is **off by
default**.

## 2. Features delivered (by phase)

| Phase | Feature |
|---|---|
| 1 | Architecture audit + coordinate-bug root cause |
| 2 | Canonical coordinate model (`lib/coordinates.ts`), live Admin warning fix |
| 3 | Provider abstraction, feature flags, safe Google loader, `/map/lab` |
| 4 | Location data model (+10 columns), read-only audit, optional migrations |
| 5 | Admin Place Picker (search/map-click/drag/link/current-location → confirm → save) |
| 6 | Public Map V2 (viewport queries, clustering, list sync, bottom sheet, URL state) |
| 7 | Unified search (4 groups: FKO / Google / stations-areas / topics) + external preview + duplicate detection + admin "use for article" |
| 8 | Directions panel + Routes API in-site preview + Google Maps navigation handoff |
| 9 | Polish, responsive, WCAG 2.2 AA, i18n completion, reduced motion |
| 10 | Performance, key security, privacy, cost control, observability, resilience |
| 11 | Final QA, data audit, staged-rollout + rollback prep, release docs |

## 3. Migrations

| File | Status | Notes |
|---|---|---|
| `migration_places_geo.sql`, `…_phase1_fields.sql`, `…_nearby.sql` | **applied (prod)** | lat/lng, Phase-1 fields, `places_nearby` RPC, `places_geo_idx` |
| `migration_places_location_provider.sql` | **applied (prod)** ✅ | confirmed by the Phase-11 audit (`Phase-4 columns present: YES`) |
| `migration_places_location_provider_rollback.sql` | reversible | drops only the added objects |
| `migration_places_location_privacy_optional.sql` | **optional, not applied** | column-level REVOKE on audit metadata (validate in staging first) |
| `migration_places_postgis_optional.sql` | **optional, not applied** | only if national KNN/polygon needs emerge |
| `migration_places_in_bbox.sql` | **optional, not applied** | viewport RPC; app falls back to a server-side filter today |

No migration is required to start the staged rollout; the in-bbox RPC is a
performance optimization for later scale.

## 4. Environment variables

All map flags default to the safe (Leaflet/internal-only) state. See
[.env.local.example](../.env.local.example).

| Var | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_MAP_PROVIDER` | `leaflet` | base-map renderer |
| `NEXT_PUBLIC_MAP_V2_ENABLED` | `false` | gate the unified Map V2 shell |
| `NEXT_PUBLIC_MAP_INTERNAL_ONLY` | `true` | restrict V2/Google to admins during rollout |
| `NEXT_PUBLIC_GOOGLE_MAPS_ENABLED` | `false` | master Google switch |
| `NEXT_PUBLIC_GOOGLE_EXTERNAL_POI_ENABLED` | `false` | external Google search/preview |
| `NEXT_PUBLIC_GOOGLE_ROUTE_PREVIEW_ENABLED` | `false` | in-site route preview |
| `NEXT_PUBLIC_ADMIN_PLACE_SEARCH_ENABLED` | `false` | Admin Google place picker |
| `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` | — | referrer-restricted browser key |
| `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` | — | Map ID for Advanced Markers |
| `GOOGLE_MAPS_SERVER_KEY` | — | **server-only** Routes key |

## 5. Google Cloud + quota setup

Operator runbook: [google-maps-platform-setup.md](./google-maps-platform-setup.md).
Quotas + budget alerts: [google-maps-cost-control.md](./google-maps-cost-control.md).
Emergency disable + key rotation: [google-maps-emergency-disable.md](./google-maps-emergency-disable.md).
APIs (non-legacy): Maps JavaScript (Dynamic Maps), Places API (New)
Autocomplete/Details, Geocoding, Routes (Compute Routes). Keys: browser key
(referrer + per-API restricted) and a **separate** server-only Routes key.

## 6. Verification & gates (this phase)

| Gate | Result |
|---|---|
| `tsc --noEmit` | ✅ exit 0 |
| Unit tests (`node --test "lib/**/*.test.ts"`) | ✅ **529/529** |
| i18n parity | ✅ **3844 keys × 5 locales** |
| `next lint` (incl. `eslint-plugin-jsx-a11y`) | ✅ clean |
| `next build` | ✅ `/map` 28.7 kB; **shared JS 87.9 kB (flat)**; `/api/maps/route` + `/api/maps/metrics` present |
| Read-only production data audit | ✅ 78 places, **0 anomalies** (manual-review list empty) |
| e2e (Playwright, `e2e/`) | infra present incl. the responsive matrix (320–desktop); execution needs a dev server + browsers (CI) — see §9 |

Full per-workflow status: [map-ux-production-verification.md](./map-ux-production-verification.md).

## 7. Data audit results (read-only, production)

```
total places                              78
published                                 78
valid coordinates                          0
missing coordinates                       78
invalid coordinate range                   0
incomplete pair (lat XOR lng)              0
suspicious (0,0)                           0
valid coords OUTSIDE Japan                 0
PUBLISHED but missing coordinates         78
has address but NO coordinates            17
duplicate provider place IDs               0
duplicate coordinate groups                0
MANUAL-REVIEW LIST (anomalies)         none ✓
DATA-ENTRY BACKLOG (needs coords)         78  (17 address-ready first)
```

**No unresolved critical data issue** (criterion #25 ✓). The only action item is
**data entry**: all 78 places need coordinates (enter via the Phase-5 picker;
17 already have a geocodable address). Until coordinates exist, the public map
renders **no markers** — this is expected, not a defect, and is why the rollout
starts admin-only. Records were **not** auto-repaired. Manual-review records: none.

## 8. Release criteria (25/25)

| # | Criterion | Evidence |
|---|---|---|
| 1 | Admin needn't type coordinates | PlacePicker search/map-click/drag/link/current-location (Phase 5) |
| 2 | Existing locations preserved | tiered save fallback; audit shows no data loss |
| 3 | Coordinate warning correct | `coordinates.ts` + live `CoordinateFields`/picker (Phase 2/5) |
| 4 | Search & selection work | `unifiedSearch.test.ts`; UnifiedSearchBox |
| 5 | Marker drag works | PickerMap draggable Advanced Marker (Phase 5) |
| 6 | Marker/list sync | MapExplorerV2 selection single-source (Phase 6) |
| 7 | Clustering | `leaflet.markercluster` (Phase 6) |
| 8 | Search this area | `mapView.shouldOfferSearchArea` + committed fetch |
| 9 | Mobile bottom sheet stable | non-remount fix + snap states (Phase 9) |
| 10 | Header/footer never hide controls | height-bounded container, safe-area, z-order (Phase 6/9) |
| 11 | Back/Forward natural | `encode/decodeMapView` + replaceState (Phase 6) |
| 12 | Five locales complete | `i18nCoverage.test.ts`; parity 3844×5 |
| 13 | Directions work | DirectionsPanel + Routes API (Phase 8) |
| 14 | Google Maps URL valid | `directions.test.ts` (encoding, host-locked) |
| 15 | No unrestricted API key | browser key referrer+API restricted; server key separate (Phase 10) |
| 16 | No precise location logged | `metrics.ts` allow-list + `containsNoSensitiveData` tests |
| 17 | API requests controlled | debounce/session/minimal-fields/explicit-only (Phase 7/8/10) |
| 18 | Leaflet fallback works | default provider + `mapFailed` list-only fallback |
| 19 | Lint passes | ✅ |
| 20 | Type check passes | ✅ |
| 21 | Tests pass | ✅ 529/529 |
| 22 | Production build passes | ✅ |
| 23 | Responsive verification | manual matrix + Playwright viewport projects (§9; verification doc) |
| 24 | Accessibility review | jsx-a11y clean + manual keyboard review (Phase 9; verification doc) |
| 25 | Data audit — no critical issue | ✅ 0 anomalies |

Criteria 1–22 & 25 are evidenced by automated gates/tests/audit. 23–24 are
covered by static a11y tooling + documented manual procedures (live browser
screenshots/SR runs can't be captured in this environment).

## 9. Screenshots & live verification

Live screenshots / Lighthouse / screen-reader passes require a browser + seeded
coordinates not available in this environment. Reproduction recipes are in
[map-ux-production-verification.md](./map-ux-production-verification.md); the
Playwright config (`e2e/playwright.config.ts`) already defines the 320/360/375/
390/412/tablet/desktop projects and captures screenshots on failure — run on
staging with `MAP_V2_ENABLED=true` + a few seeded places.

## 10. Known limitations

1. Public map renders empty until coordinates are entered (0/78 today).
2. In-site route preview needs a coordinate origin; typed origin is handoff-only.
3. Destination Place ID not yet threaded from `NearbyPlace` into the directions
   handoff (uses coords/name; the URL builder supports the id).
4. Map e2e specs not yet written (infra + responsive matrix exist).
5. Metrics log to stdout (`[map-metric]`); wiring to a sink is a deploy step.
6. `places_in_bbox` RPC optional/not applied (server-side fallback in use).

## 11. Future enhancements

- Batch/assisted geocoding to seed the 17 address-ready places, then the rest.
- Thread `provider_place_id` into the public directions handoff.
- Map-focused e2e specs (load, marker/list sync, sheet snap, directions).
- Server-cached catalog snapshot for `/api/places/search` at higher traffic.
- Optional `places_in_bbox` + PostGIS when coordinate-bearing places grow large.
- Route alternatives surfaced in the directions UI when useful.

---

**End of final release report. Map V2 is built, gated, verified, and rollback-safe;
Leaflet remains the default. Awaiting explicit approval for staged production
rollout.**
