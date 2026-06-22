# Map UX Redesign — Phase 7: Unified Map Search & External Google POI Experience

> **Scope:** A unified search that clearly separates **Chợ Cóc FKO editorial
> places**, **Google external places**, **stations & geographic areas**, and
> **topics/categories** — with internal content prioritized and external Google
> results never styled as reviewed/published by Chợ Cóc FKO. Internal search is
> the primary source; Google is requested only on explicit interaction and is
> **off by default**. No production data changed, no SQL executed, no flags
> enabled, no keys committed. Follows Phases
> [1](./map-ux-phase-1-audit.md)–[6](./map-ux-phase-6-public-map-v2.md).
>
> **Date:** 2026-06-22 · **App root:** `web/`

---

## 0. Prerequisite check (verified before implementing)

| # | Prerequisite | Result |
|---|---|---|
| 1 | Phase-4 location-provider schema in code + migrations | ✅ `lib/places.ts` (`Place`/`DbPlace`/`mapDbPlace`, 10 fields), `lib/placeLocation.ts`, `migration_places_location_provider.sql` (+rollback/privacy/postgis). |
| 2 | `migration_places_in_bbox.sql` required/optional/applied | **Optional, not applied.** `getPlacesInBounds` falls back to `placesWithinBounds`. **Not executed.** |
| 3 | Map V2 disabled by default | ✅ `v2Enabled` ← `NEXT_PUBLIC_MAP_V2_ENABLED` (default `false`); `/map` renders the old `MapExplorer`. |
| 4 | External Google POI disabled | ✅ `externalPoiEnabled` is provider-gated (`googleActive`) and off; the new external **search** availability is independently off by default (§2). |
| 5 | Google Places API (New) from the Admin picker reusable | ✅ `AutocompleteSuggestion`/`fetchFields` + shared loader; reused (not imported from admin) in a new public module. |
| 6 | Internal search remains primary | ✅ New `/api/places/search` is Google-free; Google is only ever *offered*. |
| 7 | Compatible with places lacking coordinates | ✅ Internal results include coordinate-less places (`hasCoordinates:false`); prod has 0/78 coords today. |
| 8 | Old Leaflet map available as fallback | ✅ Default `/map` is unchanged; V2 keeps its list-only fallback. |

---

## 1. Search behavior — internal first

Every (debounced) keystroke hits **our own** `GET /api/places/search?q=` — Google
is **never** called automatically. The route returns four internal-derived,
clearly-labeled groups and a single *flag* indicating whether external Google
results may be offered:

- **Chợ Cóc FKO** — editorial places, ranked.
- **Stations & areas** — distinct stations/areas matching the query (+counts).
- **Topics** — categories & search concepts (facets) matching the query.
- **Google Maps** — offered (never auto-run); requested only on explicit click.

### Internal field coverage

`scoreInternalPlace` (in [lib/maps/unifiedSearch.ts](../lib/maps/unifiedSearch.ts))
scores a place across, with descending weight: **name** → localized **tags** →
**category label** → **category synonyms** (these carry the vi/en/ja/ko/zh keyword
sets) → **nearest station** → **area / structured area** (areaMain/nearbyPlace/
cityOrPrefecture/city/prefecture) → **address** → **description**. Matching is
word-boundary for Latin (so `an` ⊄ `tenmangu`, `hori` ⊄ `Ohori`) and substring
for CJK, AND-ed across query tokens, on `normalizeText` (NFKD: full-width→half,
strips Latin/VI diacritics, đ→d).

> **Honest note on the spec's field list.** There is no dedicated
> `japaneseName` / `alternativeName` / per-language keyword column in `Place`.
> Multilingual search is achieved by the place `name`, **localized tags**, and
> **category synonyms** (which already contain vi/en/ja/ko/zh terms) under NFKD
> normalization — *not* by inventing schema. "Search concepts" are the
> DB-driven `search_concepts` taxonomy loaded via `loadSearchConfig()`.

### When Google is called

Only when **external search is available** (master Google switch + browser key +
external-POI flag — all default off) **and** the user explicitly clicks "Search
Google Maps". The server additionally only *offers* the affordance when external
is available and either internal results are insufficient (`< 4`) or the query is
long enough. No Google call happens per keystroke.

---

## 2. Feature-flag model (default = today's behavior)

External **search** is decoupled from the base-map provider so the search box can
offer Google results over the Leaflet map without flipping the whole map to
Google — while staying **off by default**:

```
externalSearchAvailable(config) =
  googleMapsEnabled && !!browserKey && externalPoiFlag      // all default OFF
```

`externalPoiEnabled` (base-map POI clicking, §6) is unchanged and remains
provider-gated. `lib/maps/config.ts` adds `externalPoiFlag` (raw) +
`externalSearchAvailable()`; existing resolution is untouched.

| Env var | Default | Effect in Phase 7 |
|---|---|---|
| `NEXT_PUBLIC_GOOGLE_MAPS_ENABLED` | `false` | master switch for any Google JS |
| `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` | — | browser key (referrer-restricted) |
| `NEXT_PUBLIC_GOOGLE_EXTERNAL_POI_ENABLED` | `false` | enables external search/preview |
| `NEXT_PUBLIC_ADMIN_PLACE_SEARCH_ENABLED` | `false` | gates the admin "use for article" action |
| `NEXT_PUBLIC_MAP_V2_ENABLED` | `false` | the unified search lives in Map V2 |

With defaults unset: `/map` = old Leaflet map; V2 off; unified search would be
internal-only even if V2 were on; **zero Google network calls**.

---

## 3. Result groups & presentation

- **Internal** rows: cover image, title, localized category + area (brand styling,
  rose highlight on active row). Selecting pans/【selects the marker, or opens the
  article when the place has no coordinates / isn't in the current viewport.
- **Stations & areas**: 🚉/📍 glyph, label, type + place count. Selecting filters
  the current viewport by that label.
- **Topics**: 🔖 glyph, localized label, place count. Selecting applies the
  category (or concept text) filter.
- **External (Google)**: a slate 🌐 row under a "not reviewed or published by
  Chợ Cóc FKO" hint. Selecting opens the **distinct** external preview
  ([components/maps/ExternalPlacePreview.tsx](../components/maps/ExternalPlacePreview.tsx)):
  neutral slate styling, a "Google" provider chip, name/address/type/coords,
  **Open in Google Maps** + **Directions** deep links, and `Place data © Google`
  attribution — **no Chợ Cóc FKO editorial badge**.

All group titles and states use the new **`map_search`** i18n namespace (30 keys
× 5 locales).

---

## 4. Google fields requested (cost-minimal)

- **Autocomplete:** `AutocompleteSuggestion.fetchAutocompleteSuggestions({ input,
  sessionToken, language, region:'jp', locationBias: Japan })` — predictions
  render from prediction text, **no Place Details to draw a suggestion**.
- **On selection / POI click only:** `place.fetchFields({ fields:
  EXTERNAL_PREVIEW_FIELDS })` — the minimal Essentials mask
  **`['id','displayName','formattedAddress','location','types','googleMapsURI']`**.
- **Never requested by default:** reviews, rating, userRatingCount, photos,
  phone numbers, opening hours, editorialSummary, priceLevel, businessStatus —
  enumerated in `EXPENSIVE_FIELDS_NEVER_DEFAULT`; a unit test asserts the mask is
  disjoint from this set.

---

## 5. API-call reduction strategy

| Control | Implementation |
|---|---|
| Internal before Google | `/api/places/search` runs first; Google only on explicit click |
| Debounce | 300 ms internal; external runs on click, not per keystroke |
| Minimum characters | 2 (`MIN_QUERY_CHARS`) before any request |
| Stale-request cancellation | monotonic `reqId` for both internal & external |
| Session tokens | one `AutocompleteSessionToken`; reset after a selection (fetchFields concludes the session) |
| No details for suggestions | predictions rendered from prediction text only |
| Minimal field mask | 6 Essentials fields |
| Per-session details cache | `createDetailsCache()` — re-selecting/re-clicking the same place id within a session does **not** re-bill Place Details |
| Internal-search cache | client `Map<normalizedQuery, response>` dedupes identical queries within a session |
| No auto photos/reviews | not in the mask; not rendered |
| Quota-safe errors | every fetch has try/catch → localized error + retry; failures never loop |

---

## 6. Clicking Google base-map POIs

POI click handling is **supported only when the public map runs the Google
provider** (`externalPoiEnabled`, provider-gated, default off). The pure pieces
are ready: `fetchExternalPreviewById` (minimal mask + per-session cache) opens the
same external preview and keeps internal vs external state separate; the details
cache prevents accidental repeat requests from repeated clicks; missing details
degrade gracefully (the preview shows whatever fields returned). The public map is
**Leaflet by default**, which has no base-map POIs, so this path is dormant until
a future Google-provider enablement — documented, not enabled here.

---

## 7. Admin-only action

When an admin views the map **and** `ADMIN_PLACE_SEARCH_ENABLED` is set, the
external preview shows **"Use this place for a Chợ Cóc FKO article"**. It:

- is hidden from public users and hidden when a duplicate already exists;
- requires an explicit `confirm()`;
- encodes a provider-attributed, **non-restricted** candidate (id/name/address/
  coords) via `encodeExternalSeed` ([lib/maps/adminSeed.ts](../lib/maps/adminSeed.ts))
  into `/admin/places?seed_place=…`;
- **publishes nothing** — the admin places list shows the seeded candidate
  (slate styling, `Place data © Google`) and directs the admin to open/create a
  place and confirm the location in the Phase-5 Admin Place Picker.

---

## 8. Duplicate detection

`findInternalDuplicate` ([lib/maps/duplicateDetection.ts](../lib/maps/duplicateDetection.ts))
prefers the internal place by precedence: **(1) provider place ID** → **(2)
proximity ≤ 60 m + shared name token** → **(3) normalized name equality/containment
+ shared address token**. When matched, the external preview hides the admin
action and shows **"Chợ Cóc FKO already has an article for this place"** linking to
`/places/<slug>`.

> The pure matcher supports all three reasons (unit-tested). In the live UI it is
> currently run against the **current viewport** places (proximity + name; address
> approximated by `area`, no provider IDs in `NearbyPlace`). A catalog-backed check
> exposing `provider_place_id` + `address` is the natural extension.

---

## 9. Accessibility

- Search input is a `role="combobox"` with `aria-expanded`/`aria-controls`/
  `aria-autocomplete`; results are a `role="listbox"` of `role="option"` rows
  grouped by labeled `role="group"` sections.
- **Stable keyboard navigation:** a flat selectable index across all visible
  groups; ↑/↓ move `activeIdx`, Enter selects, Escape closes; `aria-selected`
  tracks the active row; mouse hover syncs `activeIdx`.
- Outside-click and Escape close the dropdown / external preview; the external
  preview close button is `aria-label`led; deep links use `rel="noopener nofollow"`.

---

## 10. Files changed

**New (pure libs + tests):**
`lib/maps/unifiedSearch.ts`(+`.test.ts`), `lib/maps/externalPlace.ts`(+`.test.ts`),
`lib/maps/duplicateDetection.ts`(+`.test.ts`), `lib/maps/adminSeed.ts`(+`.test.ts`).

**New (server/client):** `app/api/places/search/route.ts` (internal-only, Google-
free), `components/maps/externalSearch.ts` (public Google client, gated),
`components/maps/UnifiedSearchBox.tsx`, `components/maps/ExternalPlacePreview.tsx`,
this doc.

**Edited:** `lib/maps/config.ts` (+`externalPoiFlag`, `externalSearchAvailable`),
`lib/maps/config.test.ts` (+tests), `app/map/MapExplorerV2.tsx` (unified search box
replaces the plain input; external preview + duplicate + admin action; Escape
handling), `app/map/page.tsx` (pass external/apiKey/locale/isAdmin/adminSearch),
`app/admin/places/page.tsx` (seed-candidate banner), `messages/{vi,en,ja,ko,zh}.json`
(+`map_search`, 30 keys each).

**Unchanged:** old `/map` `MapExplorer`, Leaflet default, RLS, applied/optional
migrations, Admin Place Picker internals, existing search engine for `/places`.

---

## 11. Tests

`node --test "lib/**/*.test.ts"` → **467/467 pass** (+44 new). New coverage:

| Requirement | Coverage |
|---|---|
| internal results only | `unifiedSearch.test.ts` (JP/VI/EN/station/address matches; boundary) |
| Japanese / Vietnamese / station / category search | `unifiedSearch.test.ts` |
| coordinate-less places searchable | `unifiedSearch.test.ts` (`hasCoordinates:false`) |
| stations & areas group | `unifiedSearch.test.ts` (counts, eligibility) |
| topics group (category + concept) | `unifiedSearch.test.ts` (multilingual alias + label) |
| external offer decision | `unifiedSearch.test.ts` (`shouldOfferExternalSearch`: off/insufficient/sufficient/explicit) |
| external results model + cost guardrail | `externalPlace.test.ts` (mask disjoint from expensive fields; mapping; deep links) |
| duplicate internal/external (all 3 reasons) | `duplicateDetection.test.ts` |
| admin seed encode/decode | `adminSeed.test.ts` (round-trip, URL-safe, garbage→null) |
| external availability flag (default off) | `config.test.ts` (`externalSearchAvailable`) |

**Interactive flows not runnable in CI here** (need a live key + browser):
external autocomplete keystroke→select, base-map POI click, slow network /
rate-limit / API-disabled surfaces (covered structurally by stale-cancel + try/
catch + the disjoint-mask test + flag gating), five-locale visual pass, unauthorized
admin action (gated by `isAdmin && adminSearchEnabled` server-side).

**Gates:** `tsc --noEmit` exit 0 · `next lint` clean · i18n parity **3803 × 5** ·
`next build` OK (`/map` 23.8 kB; `/api/places/search` added; old map default).

---

## 12. Cost risks & mitigations

- **External off by default** — three flags + a key are required; zero Google
  calls otherwise.
- **No Place Details per suggestion**; **minimal 6-field mask**; **session
  tokens**; **per-session details cache** (no repeat billing for the same place);
  **no auto photos/reviews/hours**.
- **Quota-safe**: all Google fetches are try/caught → localized error + retry,
  never a retry loop; stale responses dropped.
- **Residual risk**: the internal search route loads the catalog per request
  (force-dynamic), mitigated by the client per-session cache; a server-side
  cached catalog snapshot is a follow-up if volume warrants.

---

## 13. Limitations / follow-ups

1. Live duplicate detection runs against the current viewport (proximity+name);
   a catalog-backed provider-ID/address check is the next step (pure matcher
   already supports it).
2. Base-map POI clicking is dormant until the public map runs the Google provider.
3. The admin "use for article" seed is surfaced on the admin list; wiring it to
   prefill a brand-new place draft (no create route exists yet) is a follow-up.
4. Station/area selection filters the current viewport (no geocoded recentre).
5. In-site route preview is intentionally **not** implemented (out of scope).
6. Prod has 0 coordinates today → external preview pins and proximity dedupe stay
   quiet until coordinates are seeded via the Phase-5 picker.

---

**End of Phase 7. Internal search is the primary source; external Google search,
previews, POI clicking, and the admin action are all flag-gated and OFF by
default. No production data changed, no SQL executed, no flags enabled, no keys
committed. In-site route preview was not implemented.**
