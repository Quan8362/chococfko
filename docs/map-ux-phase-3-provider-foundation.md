# Map UX Redesign — Phase 3: Provider Architecture, Feature Flags & Safe Google Foundation

> **Scope:** Prepare a gradual Leaflet → Google Maps migration **without touching
> the production map.** Leaflet/OpenStreetMap remains the default. Adds: a feature
> -flag config, a minimal provider abstraction, a safe Google Maps loader, and a
> flag-gated Google **foundation** page (basic map only). **No autocomplete, no
> external POI, no routes, no Admin picker, no migrations.** Follows
> [Phase 1](./map-ux-phase-1-audit.md) and [Phase 2](./map-ux-phase-2-coordinate-fix.md).
>
> **Date:** 2026-06-22 · **App root:** `web/`

---

## 1. Official documentation verified (June 2026) & APIs selected

| Topic | Decision | Why |
|---|---|---|
| **Maps JS loading** | **Inline bootstrap loader** + `google.maps.importLibrary()` | Google's current recommended method; Promise-based errors, lazy library loading, no global callbacks, safe to call multiple times. Legacy `&callback=` script tag avoided. |
| **Map rendering** | **Maps JavaScript API → Dynamic Maps** | Essentials SKU, 10k free loads/mo. |
| **Markers** | **`AdvancedMarkerElement`** (marker library) | Classic `google.maps.Marker` is **deprecated** (Feb 2024). Advanced Markers **require a Map ID**. |
| **Map ID** | Required; `DEMO_MAP_ID` dev fallback | Needed by Advanced Markers. |
| **POI click** | **`clickableIcons: false`** for now | POI interaction belongs to a later, flag-gated phase. |
| **Places / Routes / Autocomplete** | **Places API (New)**, **Routes API**, **Autocomplete (New)** — *not enabled this phase* | Legacy Places/Directions/Distance Matrix + `AutocompleteService` are frozen / not for new customers. |
| **Caching/storage** | Plan to store `place_id` indefinitely; cached coords/details TTL ≤ 30 days | Google terms: place IDs exempt; lat/lng cache max 30 days. |
| **Attribution** | Honor Google logo + provider attribution when POI/Places render (future) | Required by Places policy. |

Full operator setup + sources: [google-maps-platform-setup.md](./google-maps-platform-setup.md).

---

## 2. Architecture introduced

```
lib/maps/
  types.ts          # shared concepts: LatLng, MapBounds, MapMarker, BasicMapProps, MapViewProps
  config.ts         # resolveMapConfig(env) + getMapConfig() + shouldLoadGoogleMaps() + parseFlag()
  config.test.ts    # flag-resolution tests
  loader.test.ts    # loader guard tests
  google/
    loader.ts       # loadGoogleMaps() — official inline bootstrap, singleton, typed errors

components/maps/
  LeafletBasicMap.tsx   # minimal Leaflet renderer (BasicMapProps)
  GoogleBasicMap.tsx    # minimal Google renderer (BasicMapProps + key/mapId), loading/error state
  MapFoundation.tsx     # client switch: picks renderer by resolved config; shows provider/status

app/map/lab/page.tsx    # flag-gated foundation route (server shell → MapFoundation, ssr:false)
```

- **Provider abstraction is deliberately minimal** — `BasicMapProps` (center,
  zoom, one marker) is the only implemented contract; `MapViewProps` documents the
  fuller shared surface (bounds, click, selection, user location, fit/recenter,
  search-area) for later phases **without forcing** it now. Google-specific
  capabilities (POI, Place Details, Routes) are intentionally **not** in the
  interface — they stay provider-specific.
- **Production map is untouched.** `app/map/page.tsx` and `app/map/MapExplorer.tsx`
  do **not** import `lib/maps`. The foundation lives on a separate route.

---

## 3. Feature flags

Resolved purely in `resolveMapConfig(env)`; **any missing/invalid value falls back
to Leaflet.** Google is the effective provider **only** when *requested AND enabled
AND keyed*.

| Env var | Default | Effect |
|---|---|---|
| `NEXT_PUBLIC_MAP_PROVIDER` | `leaflet` | `leaflet \| google`; unknown value → `leaflet`. |
| `NEXT_PUBLIC_MAP_V2_ENABLED` | `false` | Gates the `/map/lab` foundation route. |
| `NEXT_PUBLIC_GOOGLE_MAPS_ENABLED` | `false` | Master switch: may Google JS load at all. |
| `NEXT_PUBLIC_GOOGLE_EXTERNAL_POI_ENABLED` | `false` | POI previews (forced off unless Google active). |
| `NEXT_PUBLIC_GOOGLE_ROUTE_PREVIEW_ENABLED` | `false` | Routes preview (forced off unless Google active). |
| `NEXT_PUBLIC_MAP_INTERNAL_ONLY` | `true` | Restrict V2/Google to admins during rollout. |
| `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` | — | Browser-restricted Maps JS key. Missing → Leaflet. |
| `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` | — | Map ID for Advanced Markers (`DEMO_MAP_ID` dev fallback). |

Resolution rule: `googleActive = (provider==='google') && googleMapsEnabled && !!browserKey`.
Dependent flags (`externalPoiEnabled`, `routePreviewEnabled`) are `&&`-gated by
`googleActive`, so they can never be "on" while Leaflet is active.

---

## 4. Files changed

**New:** `lib/maps/types.ts`, `lib/maps/config.ts`, `lib/maps/google/loader.ts`,
`lib/maps/config.test.ts`, `lib/maps/loader.test.ts`,
`components/maps/LeafletBasicMap.tsx`, `components/maps/GoogleBasicMap.tsx`,
`components/maps/MapFoundation.tsx`, `app/map/lab/page.tsx`,
`docs/google-maps-platform-setup.md`, this file.

**Edited (additive only):** `.env.local.example` (documented maps flags),
`messages/{vi,en,ja,ko,zh}.json` (+`map_lab` namespace, 13 keys each).

**NOT touched:** `app/map/page.tsx`, `app/map/MapExplorer.tsx`, the Admin editor,
Leaflet, RLS, any migration, the existing server-only `GOOGLE_CLOUD_API_KEY`.

---

## 5. Environment variables

See §3 and [.env.local.example](../.env.local.example). The browser key is
`NEXT_PUBLIC_*` (public by design, restricted by HTTP referrer + API in Cloud
Console). **No secret is committed** — example entries are blank with docs.

---

## 6. Manual Google Cloud setup (summary)

Detailed runbook: [google-maps-platform-setup.md](./google-maps-platform-setup.md).
Short version: enable **Maps JavaScript API** only; create a **browser key**
restricted to our domains + that one API; create a **Map ID**; set a **daily quota
cap** + **budget alert**; place the key/Map ID in Vercel env; keep all other APIs
disabled until their phase.

### APIs currently required
- **Maps JavaScript API** (Dynamic Maps + Advanced Markers).

### APIs intentionally NOT enabled (this phase)
- Places API (New) — Autocomplete/Details/Photos · Geocoding API · Routes API ·
  and **all** legacy APIs (Places classic, Directions, Distance Matrix).

---

## 7. Leaflet preservation — default-off verification

With all new flags unset (production default):

- **`resolveMapConfig({})` → `provider: 'leaflet'`** (unit-tested) and
  `shouldLoadGoogleMaps()` → `false`.
- **`/map` is unchanged** — it does not import `lib/maps` (grep-verified); the full
  Leaflet experience (`MapExplorer`) is byte-for-byte the same as after Phase 2.
- **Admin editor unchanged** — no Phase-3 edits.
- **No Google script loads / no Google API call** — `loadGoogleMaps()` is invoked
  **only** inside `GoogleBasicMap`'s effect, which renders only when
  `provider==='google'`. With defaults, `MapFoundation` renders `LeafletBasicMap`.
  (`grep` confirms the only non-test call site is `GoogleBasicMap.tsx`.)
- **`/map/lab` shows a "disabled" notice** when `MAP_V2_ENABLED` is off — it never
  reaches the map components, so nothing loads.
- **Production build stable** — `next build` succeeds; `/map` 14.4 kB unchanged,
  `/map/lab` 2.57 kB added.

---

## 8. Foundation page behavior (`/map/lab`)

- **Gate 1:** `MAP_V2_ENABLED=false` → localized "not enabled" notice, no map.
- **Gate 2:** `MAP_INTERNAL_ONLY=true` (default) → non-admins redirected to `/map`.
- When enabled: renders the basic map for the **effective** provider with one test
  marker (Dazaifu Tenmangu sample coords — existing rows still have none, per
  Phase 2). Shows active vs requested provider, a live Google load status
  (loading/ready/error), and — if Google was requested but fell back — the reason
  (disabled vs missing key). `noindex`.

---

## 9. Test results

| Check | Result |
|---|---|
| `node --test lib/maps/config.test.ts lib/maps/loader.test.ts` | ✅ 13/13 |
| `node --test "lib/**/*.test.ts"` (full suite) | ✅ **374/374**, 0 fail |
| `node scripts/check-i18n-parity.mjs` | ✅ `3729 keys × 5 locales` |
| `npx tsc --noEmit --skipLibCheck` | ✅ exit 0 |
| `npx next lint` (changed files) | ✅ no warnings/errors |
| `npx next build` | ✅ BUILD_OK; `/map` unchanged, `/map/lab` added |

Test coverage maps to the required scenarios: default Leaflet fallback · explicit
Leaflet · Google selected-but-disabled · Google enabled-but-missing-key · Google
fully configured · invalid/garbage provider · POI/route flags gated · flag parsing ·
loader missing-key rejection · loader no-window rejection (the same rejection
surface a real script-load failure produces) · loader retry-after-failure. "No
Google loading on unrelated routes" is structural: the loader is reachable only
through `GoogleBasicMap`, only on `/map/lab`, only when Google is active.

---

## 10. Rollback process

Pure config — **no code rollback needed**:

1. **Instant:** set `NEXT_PUBLIC_MAP_PROVIDER=leaflet` (or
   `NEXT_PUBLIC_GOOGLE_MAPS_ENABLED=false`) in Vercel → redeploy. Effective
   provider returns to Leaflet; no Google JS loads.
2. **Hide the lab:** `NEXT_PUBLIC_MAP_V2_ENABLED=false` → `/map/lab` shows the
   disabled notice.
3. **Cost kill-switch:** disable the browser key / Maps JavaScript API in Cloud
   Console — config resolves Google as unusable (missing key) and falls back.
4. **Full code removal (if ever needed):** delete `lib/maps/`, `components/maps/`,
   `app/map/lab/`, the `map_lab` i18n namespace, and the example env block. `/map`
   and the Admin editor are unaffected (they never depended on Phase 3).

Because defaults are off and `/map` doesn't import any Phase-3 code, the safe
state is the **shipped** state.

---

**End of Phase 3. Leaflet remains production default. Foundation is flag-gated and
admin-only. No production map replaced, no Admin autocomplete, no migrations.**
