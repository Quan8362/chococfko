# Map UX Redesign — Phase 4: Location Data Model, Migration & Data Audit

> **Scope:** A safe, scalable DB model for manually-selected coordinates,
> Google-selected places, external provider IDs, structured addresses, and
> Japan-wide map discovery (viewport + radius). **No production migration is
> executed here.** Deliverables: migration + rollback + optional migrations, a
> read-only audit script, domain model + types, tests, and this doc. Follows
> [Phase 1](./map-ux-phase-1-audit.md), [Phase 2](./map-ux-phase-2-coordinate-fix.md),
> [Phase 3](./map-ux-phase-3-provider-foundation.md).
>
> **Date:** 2026-06-22 · **App root:** `web/`

---

## 1. Read-only data audit (production, before any change)

Ran `node scripts/audit-place-locations.mjs` (SELECT-only) against production:

```
Phase-4 columns present: NO (migration not yet applied)
total places                                 78
published (approved / null status)           78
draft / pending                               0
valid coordinates                             0
missing coordinates                          78
invalid coordinate range                      0
incomplete pair (lat XOR lng)                 0
suspicious (0,0) "null island"                0
valid coords OUTSIDE Japan bounds             0
PUBLISHED but missing coordinates            78
has address but NO coordinates               17
has coordinates but NO address                0
duplicate provider place IDs            n/a (no column)
duplicate coordinate groups                   0
```

**Confirms Phase 2's finding:** every one of the 78 places lacks coordinates;
none are malformed/duplicated. 17 already have a usable `address` (geocodable
later). This is a clean slate — the migration adds capacity, not corrections.

---

## 2. Schema design — fields ADDED vs REJECTED

Audited the existing schema first. **Already present (NOT re-added):** `lat`,
`lng` (double precision, nullable), `address`, `postal_code`, `prefecture`,
`region`, `city`, `area`/`area_main`/`nearby_place`/`city_or_prefecture`/
`relation_type`, `nearest_station`, `station_walk_minutes`, `map_url`, plus the
partial index `places_geo_idx(lat,lng)` and CHECKs on lat/lng range.

### Added (10 columns) — only what the goals genuinely require

| Column | Type | Purpose |
|---|---|---|
| `location_provider` | text, CHECK in (manual,google,osm,other) | Which provider supplied the place/coords. |
| `provider_place_id` | text | External ID (e.g. Google Place ID). Storable **indefinitely** per Google ToS. |
| `provider_formatted_address` | text | Provider-normalized address — **kept separate** from editorial `address`. |
| `provider_maps_url` | text | Provider canonical maps URL — **kept separate** from editorial `map_url`. |
| `provider_data_updated_at` | timestamptz | Freshness for the **30-day** cache TTL Google requires on lat/lng & address. |
| `country_code` | text default 'JP', CHECK `^[A-Z]{2}$` | Multi-country future; backfilled 'JP' (certain — all rows are in Japan). |
| `location_source` | text, CHECK in 7 values | HOW the coordinate was obtained (see §3). |
| `location_manually_adjusted` | boolean not null default false | Was a provider coordinate later hand-dragged/edited. |
| `location_confirmed_at` | timestamptz | When an admin confirmed coords are correct (private audit). |
| `location_confirmed_by` | uuid | Which admin confirmed (auth.users id; no FK → decoupled). Private audit. |

### Rejected (with rationale) — avoided blindly adding every suggested field

- **`geography(Point,4326)` / PostGIS** — scale (78 places, 0 coords) doesn't
  justify it; B-tree bbox + haversine already work. Ready-but-unused path in
  `migration_places_postgis_optional.sql` with adoption criteria. (§5)
- **`municipality` / `ward`** — covered by existing `city` + `area_main` +
  `address`; adding them duplicates the structured-area model.
- **`postal_code`, `prefecture`, `nearest_station`, `formatted_address`** — first
  three already exist; "formatted address" is represented by editorial `address`
  + new provider-derived `provider_formatted_address` (separation principle).
- **Raw Google API response (JSONB)** — **not stored.** Google ToS + no documented
  need. Only `provider_place_id` (durable) + minimal derived fields (TTL'd).

---

## 3. Coordinate-source rules

`location_source` is constrained text (CHECK) — matching the existing
option-list-via-CHECK convention (`price_type`, `parking`, …). Values:

`existing` · `admin_search` · `map_click` · `marker_drag` · `current_location`
· `imported` · `manually_entered`

Backfill sets `location_source='existing'` on any row that already has coordinates
(0 today; future-safe). The TS mirror + guards live in
[lib/placeLocation.ts](../lib/placeLocation.ts) (`LOCATION_SOURCES`,
`parseLocationSource`), kept in lock-step with the DB CHECK.

---

## 4. Geospatial query design

- **Current radius query** ([`places_nearby`](../supabase/migration_places_nearby.sql)):
  partial B-tree `places_geo_idx(lat,lng)` bbox prefilter + haversine refine +
  distance sort + `LIMIT`. Adequate to tens of thousands of coordinate-bearing
  rows; at 0 today it is trivially fast.
- **Viewport bounding-box** query: the same `(lat,lng)` index serves
  `lat BETWEEN … AND lng BETWEEN …`. Pure predicate `pointInViewport()` added for
  app/test parity.
- **Pagination / distance sort:** already handled in `places_nearby` (`ORDER BY
  distance_km, LIMIT`). No change.
- **Duplicate detection:** the new partial **unique index**
  `places_provider_place_uidx(location_provider, provider_place_id) WHERE
  provider_place_id IS NOT NULL` enforces no duplicate provider IDs; the audit
  also scans duplicate coordinates (`findDuplicateCoordinates`).
- **PostGIS:** **not adopted.** Adopt only when coordinate-bearing places ≳ 50k
  *and* national-scale viewport KNN is slow, or polygon containment / true
  nearest-N / isochrones are needed. `migration_places_postgis_optional.sql`
  provides a ready, reversible, **additive generated `geog` column** + GiST index
  + a commented PostGIS `places_nearby_geo()` so the future switch is low-risk.

---

## 5. Migration safety

`migration_places_location_provider.sql` is:

- **Idempotent** — `ADD COLUMN IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS` then
  `ADD`, `CREATE UNIQUE INDEX IF NOT EXISTS`.
- **Reversible** — `migration_places_location_provider_rollback.sql` drops exactly
  the added objects.
- **Compatible with existing rows** — all new columns nullable (or defaulted);
  every CHECK is NULL-safe.
- **Non-destructive** — no DROP/RENAME/overwrite of existing columns or coords.
- **Coordinate-safe** — never writes lat/lng; never invents coordinates.
- **Publication-safe** — never touches `status`/published content.
- **RLS-safe** — **no policy changed.** (Optional column-privilege hardening is a
  separate file — §6.)
- **Google-independent** — pure DDL.

Backfills are **certain derivations only**: `country_code='JP'` (every row is in
Japan), `location_source='existing'` where coords exist. No fake defaults.

---

## 6. RLS & security

- **Public read of published coordinates:** unchanged — `places_nearby` (explicit
  column list, no audit fields) and the existing `status='approved'` SELECT
  policy already cover public coordinate reads. The new columns inherit table RLS.
- **Admin editing:** via service-role (bypasses RLS) — unchanged.
- **Provider IDs / structured address / `country_code` / `provider_*`:** treated
  as public-safe (help "open in Google", show address).
- **Private audit metadata** (`location_source`, `location_confirmed_at/by`,
  `location_manually_adjusted`, `provider_data_updated_at`): the app never sends
  these to the browser (`mapDbPlace` maps them but the public RPC omits them).
  For defense-in-depth, **optional** `migration_places_location_privacy_optional.sql`
  REVOKEs column-level SELECT on those from `anon`/`authenticated`. It is **kept
  separate** (so the core migration carries zero RLS risk) and must be validated
  in staging first (PostgREST expands `select('*')` to permitted columns).

---

## 7. Generated types & domain model

- **Handwritten DB types updated** ([lib/places.ts](../lib/places.ts)): `DbPlace`
  (+10 snake_case fields), `Place` (+10 camelCase fields), `mapDbPlace` (reads
  them, `?? null`). All optional → **old rows and pre-migration rows map cleanly**
  (missing column → `undefined` → `null`). No generated-types file exists in this
  repo; types are handwritten.
- **Domain model** ([lib/placeLocation.ts](../lib/placeLocation.ts)):
  `normalizePlaceLocation`, provider/source enums + guards, `pointInViewport`,
  `findDuplicateProviderPlaceIds`, `findDuplicateCoordinates`,
  `isSuspiciousCoordinate`, `hasIncompleteCoordinatePair`, `auditPlaceLocations` —
  the single source of truth for both the audit script and the tests. Built on the
  Phase-2 canonical `lib/coordinates.ts`.
- **Write path unchanged.** The Admin save action does **not** yet write the new
  fields — that is Phase 5 (Admin picker), intentionally out of scope.

---

## 8. Files changed

**New (migrations):** `supabase/migration_places_location_provider.sql`,
`…_rollback.sql`, `…_location_privacy_optional.sql`, `…_postgis_optional.sql`.
**New (code):** `lib/placeLocation.ts`, `lib/placeLocation.test.ts`,
`scripts/audit-place-locations.mjs`, this doc.
**Edited (additive, back-compat):** `lib/places.ts` (`DbPlace`, `Place`,
`mapDbPlace`).
**NOT touched:** Leaflet, `/map`, Admin save action, existing RLS, existing
columns/indexes, the public RPC.

---

## 9. Audit commands

```bash
# Read-only data-quality report (no writes). Needs .env.local Supabase creds.
node scripts/audit-place-locations.mjs
```

It degrades gracefully before the migration (skips provider-id checks, says so)
and reports: totals, published/draft, valid/missing/invalid/incomplete coords,
suspicious (0,0), out-of-Japan, published-missing-coords, address-without-coords,
coords-without-address, duplicate provider IDs, duplicate coordinates.

---

## 10. Test results

| Check | Result |
|---|---|
| `node --test lib/placeLocation.test.ts` | ✅ 13/13 |
| `node --test "lib/**/*.test.ts"` (full) | ✅ **387/387**, 0 fail |
| `npx tsc --noEmit --skipLibCheck` | ✅ exit 0 |
| `npx next lint` (changed files) | ✅ clean |
| `node scripts/check-i18n-parity.mjs` | ✅ `3729 keys × 5 locales` (no new UI strings) |
| `npx next build` | ✅ BUILD_OK (`/map`, `/admin/places/[slug]` unchanged) |

Covered scenarios: old row without new fields · coordinates-only · Google provider
data · manually-adjusted · null address · duplicate place-ID detection (mirrors the
unique index) · viewport predicate · radius (bbox+haversine, zero-safe) ·
rollback/back-compat (post-rollback row shape still works) · full audit tally
across all data-quality classes.

---

## 11. Production execution order (MANUAL — not run here)

Run in the **Supabase SQL Editor**, in order, reviewing each:

1. **`migration_places_location_provider.sql`** — adds columns/constraints/index +
   certain backfills. Idempotent.
2. **Verify:** `node scripts/audit-place-locations.mjs` now shows
   `Phase-4 columns present: YES` and unchanged counts (no data altered).
3. *(Optional, after staging validation)* **`migration_places_location_privacy_optional.sql`**
   — hide audit metadata from public reads.
4. *(Optional, only if §4 criteria met)* **`migration_places_postgis_optional.sql`**
   — PostGIS geog + GiST.

No app redeploy is required for step 1 (the code already reads the new fields as
optional). The Admin write path arrives in Phase 5.

---

## 12. Rollback procedure

- **Schema rollback:** run `migration_places_location_provider_rollback.sql`
  (drops only the added objects; editorial data untouched). Loses only data held
  in the new columns.
- **Privacy rollback:** the GRANT statements at the bottom of
  `…_location_privacy_optional.sql`.
- **PostGIS rollback:** the commented DROP block in `…_postgis_optional.sql`
  (leaves the extension installed).
- **No-op rollback during rollout:** simply don't write the new columns — the app
  treats them as optional, so an applied-but-unused migration is harmless.

---

## 13. Summary

- **Schema changes:** +10 additive columns (provider provenance, provider-derived
  address/url, freshness, country, coordinate source + audit), 4 NULL-safe CHECKs,
  certain-only backfills. No PostGIS (criteria documented).
- **Indexes:** +1 partial unique `places_provider_place_uidx`; existing
  `places_geo_idx` reused for viewport/radius.
- **RLS impact:** none in the core migration; optional column-level REVOKE
  provided separately for audit metadata.
- **Audit:** read-only script + pure model; production scan clean (78 places, 0
  coords, 0 anomalies, 17 address-only).
- **Tests:** 387/387; typecheck/lint/build green.

**End of Phase 4. No production migration executed. No Admin write path started.**
