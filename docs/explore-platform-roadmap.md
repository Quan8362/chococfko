# Explore → Discovery & Planning Platform — Roadmap

Living plan for transforming the Chococfko **Explore / Places** section from an
article-style directory into a practical discovery + planning platform for
Vietnamese people in/visiting Japan.

> Scope note: "Explore" in this codebase = the **Places** feature
> (homepage hub + `/places` + `/places/[slug]` + `/map` + `/saved-places`).
> Do **not** touch Community, Chat, Japanese learning, Games, Auth, Admin, or
> i18n plumbing except where a phase explicitly extends them.

Status legend: ✅ done · 🚧 in progress · ⛔ blocked · ⬜ not started

| Phase | Title | Status |
|---|---|---|
| 0 | Audit & architecture | ✅ done (this document) |
| 1 | Location data foundation & action fields | ✅ done (migration pending manual apply) |
| 2 | Intent-based search & practical filters | ✅ done (migrations pending manual apply) |
| 3 | Nearby search, map view, open-now logic | ✅ done (migration pending manual apply) |
| 4 | Detail experience, saved places, recent history | ✅ done (migration pending manual apply) |
| 5 | Lists, trip planning & sharing | ✅ done (migrations pending manual apply) |
| 6 | Place community questions & info verification | ✅ done (migration pending manual apply) |
| 7 | Personalized discovery, events, return-user | ⬜ not started |
| 8 | Admin, analytics, quality audit, release | ⬜ not started |

---

## Phase 0 — Audit (repository-grounded)

Git root is `web/`. App Router lives in `web/app/`, shared code in `web/lib/`,
SQL in `web/supabase/` (applied manually in Supabase SQL Editor — there is no
migration runner; several migrations are "pending manual apply").

### Current routes (Explore surface)

| Route | File | Purpose |
|---|---|---|
| `/` | `app/page.tsx` + `components/ExploreSearch.tsx` | Explore hub: sticky search bar, prefecture selector, topic chips, category-sectioned previews (≤9/section) |
| `/places` | `app/places/page.tsx` + `components/LoadMoreGrid.tsx` | Full category listing, filter by `?category=` & `?prefecture=` (simple `.filter`, **not** the search engine) |
| `/places/[slug]` | `app/places/[slug]/page.tsx` | Detail: hero, body HTML, tags, quick-info, rating, comments, related; sidebar actions = Open Maps + View Photos |
| `/places/new` | `app/places/new/page.tsx` | User-submitted place (status `pending`) |
| `/map` | `app/map/page.tsx` + `app/map/BanDoClient.tsx` | **Not a real map** — a filterable card grid (category + `area` chips) with external "Open Maps" links |
| `/saved-places` | `app/saved-places/page.tsx` + `SavedPlacesClient.tsx` | Saved list rendered **from localStorage only** |
| `/tags`, `/tags/[slug]` | `app/tags/*` | Cross-content tag pages (places/posts/marketplace) |
| `/admin/places`, `/admin/places/[slug]` | `app/admin/places/*` | Moderation + editor (structured area, prefecture/city/address, tags, translations, status, seed) |
| `/admin/search-concepts` | `app/admin/search-concepts/*` | Data-driven search taxonomy editor |

### Homepage & category structure

- `categories` is a hardcoded list of 16 codes in `lib/places.ts`
  (`landmark, food, sea, camp, mountain, park, viet, grocery, izakaya, japanese,
  thai, chinese, korean, cafe_milk_tea, kids_playground, onsen`), each with an
  emoji in `categoryEmoji`. Labels are translated via the `categories` i18n
  namespace; `categoryEmoji` is mirrored (duplicated) in `PlaceCard`, the
  homepage, `/map`, and the detail page.
- Homepage loads all places (`getAllPlacesFromDb(locale)` → fallback
  `staticPlaces`), attaches tags (`attachPlaceTags`), loads the data-driven
  `searchConfig` (`loadSearchConfig`), computes visible categories + prefecture
  counts, and renders `ExploreSearch`.

### Location card

- `components/PlaceCard.tsx` (primary) — also a bespoke card markup inside
  `BanDoClient.tsx` and `SavedPlacesClient.tsx` (3 card implementations exist).
- `components/PlacePostCard.tsx` renders community posts attached to a place.

### Location detail

- Server component; data via `getPlaceFromDb(slug, locale)` (fallback static
  `getPlace`). Renders rich-text `body`, tags, star rating (`PlaceRating`),
  comments (`PlaceComments`), related (same-category). Actions: external Google
  Maps (`map_url`) + image search (`photo_url`). JSON-LD emits schema.org type
  per category, `geo` block when `lat`/`lng` present (data exists but is rarely
  populated). **No phone / website / hours / reservation actions.**

### Database — places & related tables

`places` (see `migration_places.sql` + geo/user-submit/address/structured-area
migrations):

```
id, slug (unique), name, area, description, body (HTML),
category, category_label, fee ('free'|'paid'|null),
map_url, photo_url, img, img_fallback, sort_order,
status ('pending'|'approved'|'rejected'), user_id,
region, prefecture (default 'fukuoka'), city, lat, lng, address,
area_main, nearby_place, city_or_prefecture, relation_type ('near'|'in'|'central'|'suburb'),
updated_at
```

Related:
- `place_translations` (place_slug, locale, area, short_description, content, translation_status) — per-locale content.
- `place_comments` + view `place_comments_with_author`; `place_ratings` (1–5 stars + review, unique per (slug,user)).
- `posts.place_slug` — community posts linked to a place (`migration_post_place_link.sql`).
- Tags via the shared tag system (`content_tags`, content type `place`).
- `search_concepts` — data-driven search taxonomy (categories/facets/aliases/evidence).
- Static fallback: `places: Place[]` array in `lib/places.ts` (hundreds of Fukuoka entries with `loremflickr`/`picsum` placeholder images) used whenever the DB is empty/unreachable.

### Search

- Engine: `lib/placeSearch.ts` — pure, in-memory, config-driven,
  boundary-aware (word-boundary for Latin, substring for CJK), Unicode/diacritic
  normalization (`normalizeText`). Concepts: **A** category aliases, **B**
  feature facets (bbq/camping/picnic/nightlife with item-level evidence), **C**
  tags/amenities, **D** multilingual aliases. Extracts fee intent + facets from
  the query, then AND-matches remaining tokens with weighted ranking. Designed
  to be swappable for a Supabase full-text query later (same signature).
- Taxonomy loader: `lib/searchConcepts.ts` merges `search_concepts` rows over
  `DEFAULT_SEARCH_CONFIG` (falls back to defaults if the table is absent).
- Wired into the homepage via `ExploreSearch` (`?q=` URL-driven, debounced).
  `/places` and `/map` do **not** use the engine (plain attribute filters).
- Tests: `lib/placeSearch.test.ts`, `lib/searchConcepts.test.ts` (`node --test`).

### Filtering

Available today: category, prefecture, fee, and query-derived facets/fee. **No
structured filter UI** for price range, amenities, open-now, distance, rating,
or "has reservation". `/map` filters by category + raw `area` string.

### Map & geolocation

- `lat`/`lng` columns exist; populated for very few rows; surfaced only in
  detail JSON-LD. **No interactive map** library (no Leaflet/Mapbox/Google Maps
  JS). `/map` is a card grid + external links. **No geolocation / near-me**
  anywhere (`navigator.geolocation` is unused in app code). No distance math.

### Favorites / saved places

- `components/SavePlaceButton.tsx` + `SavedPlacesClient.tsx` store saves in
  **localStorage** (`chococfko_saved_places` + `_meta`). Not per-user, not in
  the DB, not cross-device, lost on cache clear. ⚠️ This is the main
  duplicate-system risk for Phase 4 — a DB-backed table must replace/sync it,
  not sit beside it.
- Unrelated existing favorite systems (do **not** conflate): `japanese_bookmarks`
  (dictionary/grammar/kanji) and marketplace ratings — different domains.

### User history

- No recent-views / browse history for places. (Japanese learning has its own
  study history — different domain.)

### Community integration

- `posts.place_slug` links community posts to a place; `PlacePostCard` renders
  them. `place_comments` (experiences) + `place_ratings` (stars/reviews) give
  per-place feedback. A first-class "question about this place" flow is not yet
  distinguished from generic comments.

### Admin support

- `/admin/places` (moderate pending/approved/rejected, seed from static array,
  delete) and `/admin/places/[slug]` (edit core fields, structured area,
  prefecture/city/address, tags, per-locale translations). `/admin/search-concepts`
  manages the search taxonomy. Admin actions use the service-role client.

### Analytics

- `lib/analytics.ts` `trackEvent(name, {path,userId,metadata})` → `analytics_events`
  (`event_name, path, user_id, anonymous_visitor_id, session_id, locale, metadata`),
  client-side, deduped 3s, never throws. Generic — ready to record place views &
  action clicks via `metadata`. Admin dashboard at `/admin/analytics`.

### RLS & authorization

- `places`: public `SELECT`; no anon/auth write policies → writes only via
  service-role admin actions (`createAdminClient`). User submissions go through
  a server action that sets `status='pending'`.
- `place_comments`: select approved-or-own, insert/delete own.
- `place_ratings`: select all, insert/update own.
- `search_concepts`: public read, service-role write only.
- Admin gate: `checkIsAdmin()` against `ADMIN_EMAILS`.

### i18n

- 5 locales (`vi` default, `en`, `ja`, `ko`, `zh`) in `messages/*.json` via
  next-intl. Relevant namespaces: `home`, `categories`, `meta`, `common`,
  `map_page`, `saved_places_page`. Per-place content is localized through
  `place_translations`; structured area renders via `formatArea()` (only the
  relation word is translated, never place names). **Zero-hardcode rule is
  mandatory** — every new string lands in all 5 files.

### Mobile issues & technical constraints

- Pages are `force-dynamic` (cookie-based i18n). SEO list/detail pages rely on
  `unstable_cache` via a cookie-free public client elsewhere — keep new public
  reads cache-safe.
- Three divergent card implementations risk visual/behavior drift on mobile.
- No migration runner: every schema change is a hand-applied SQL file; phases
  must be safe to run/re-run (idempotent) and degrade gracefully if unapplied
  (the codebase already wraps optional tables in try/catch).
- Static fallback array keeps pages alive without a DB but can mask "is the DB
  actually populated?" — features must not assume the array.

### Reusable building blocks (prefer extending these)

- Search engine + taxonomy: `lib/placeSearch.ts`, `lib/searchConcepts.ts`,
  `/admin/search-concepts`.
- Data access: `getAllPlacesFromDb`, `getPlaceFromDb`, `mapDbPlace`,
  `attachPlaceTags`, `formatArea`, `neutralAreaString` in `lib/places.ts`.
- Supabase clients: `lib/supabase/{server,admin,public,client}.ts`.
- Tags: `lib/tags.ts` (`getTagsForContent`, `setContentTags`).
- Geography: `lib/japan.ts` (`PREFECTURES`, `prefectureName`).
- Cards/UI: `PlaceCard`, `LoadMoreGrid`, `TopicFilter`, `SmartImg`,
  `StarsDisplay`, `TagList`.
- Analytics: `lib/analytics.ts`. SEO: `lib/seo.ts`.
- Community link: `posts.place_slug`, `PlacePostCard`.

### Missing capabilities (the gap to close)

1. Action fields: **phone, website, official/external reservation URL, opening hours**.
2. Real **interactive map** with markers + clustering.
3. **Geolocation / near-me** + distance sort.
4. **Open-now** logic (needs structured hours + timezone Asia/Tokyo).
5. **DB-backed, per-user saved places** (replace localStorage) + cross-device sync.
6. **Recent history** of viewed places.
7. **Structured filter UI**: price range, amenities, open-now, rating, distance, has-reservation.
8. **Lists / trip planning** + shareable plans.
9. First-class **place questions** (vs generic comments) + info-verification signal.
10. **Personalized discovery, events, return-user** home.

### Duplicate-system risks (audit before building)

- Saved places: localStorage vs a new DB table — migrate, don't duplicate.
- Cards: consolidate the 3 card variants instead of adding a 4th.
- "Questions": extend `place_comments`/posts rather than a parallel table where possible.
- `categoryEmoji`: already duplicated in 4 files — centralize when touched.
- Search: extend `search_concepts`/`placeSearch.ts`; do not fork a second search path for filters.

---

## Recommended architecture (high level)

- Keep `places` as the single source of truth; add nullable action/hours columns
  (additive, idempotent). Keep the static array strictly as a fallback.
- Keep the **pure search engine** and push richer filters through `PlaceCriteria`
  (extend the interface) so `/`, `/places`, and `/map` converge on one engine.
- Add a `place_saves` table (per-user) and a thin sync layer that adopts existing
  localStorage saves on first authenticated load.
- Add map rendering as a **progressive enhancement** layer over the existing data
  (markers from `lat/lng`); never block the card grid on map JS.
- Express new actions (call/website/reserve) as data on the place, rendered by a
  shared `PlaceActions` component reused by card + detail.

### Proposed migrations (later phases — all additive/idempotent)

- P1: `places` add `phone, website, reservation_url, booking_provider, hours (jsonb), price_level (smallint)`.
- P3: spatial index / RPC for nearby (`earthdistance`/`postgis` or app-side haversine if extensions unavailable).
- P4: `place_saves (user_id, place_slug, created_at, unique)`; optional `place_views` for history.
- P5: `place_lists`, `place_list_items`, share token.
- P6: `place_questions` (or extend `place_comments` with a `kind`) + `place_field_reports` for verification.
- P7: `place_events`.

### Proposed routes (later phases)

`/places` filter params extension; `/nearby` (or `/map` upgraded); `/lists`,
`/lists/[id]`, `/lists/[id]/share/[token]`; place-question views within
`/places/[slug]`.

### Proposed server actions / endpoints (later phases)

Saved-place toggle (auth), list CRUD + share, question post/answer, field-report
submit, nearby query (server action or route handler), event read.

### Proposed implementation order

P1 → P2 → P3 → P4 → P5 → P6 → P7 → P8 (as numbered). Each phase ships behind
graceful fallbacks and is independently revertable.

---

## Per-phase plan

> Each phase, before coding: (1) inspect existing impl, (2) describe
> architecture, (3) list files+migrations, (4) risks, then implement, test,
> typecheck, lint, build, verify mobile+desktop, and report honestly.

### Validation commands (run from `web/`)

```bash
npx tsc --noEmit --skipLibCheck     # type check
npm run lint                        # eslint (next lint)
npm test                            # node --test lib/**/*.test.ts
npm run build                       # production build
```

### Phase 1 — Location data foundation & action fields ✅
**Shipped.** `migration_places_phase1_fields.sql` adds ~45 additive, nullable
columns to `places` (identity/geo, price, hours/status, facilities, suitability,
reservation, action links, editorial/trust, visibility). Helpers in
`lib/placeFields.ts` (+ `lib/placeFields.test.ts`, 10 tests) validate URLs,
phones (E.164), coordinates, price ranges, opening-hours/Japanese-phrases JSON,
and compute category-aware relevance + non-blocking completeness warnings. The
`Place` type + `mapDbPlace` carry every field. Admin editor gained sectioned,
collapsible groups (`components/admin/PlaceFieldsEditor.tsx`) with help text,
category-relevance hints, action-button preview, and a warning banner;
`updatePlace` validates + persists with a missing-column fallback (works before
the migration is applied). Detail page renders `PlaceActions` (call/website/
reserve/social), `PlacePractical` (price/hours/station/reservation/suitability/
facilities), Know-before-you-go, VN tips, items/duration/best-time, Japanese
phrases, source/verification, and a temporary-closure banner — all i18n in 5
locales (`place_fields` namespace, 150 keys each). PlaceCard left unchanged
(already limited to details/map/save). **Deferred to Phase 2:** wiring the new
structured fields (bbq/camping flags, price, open-now) into the search engine +
filter UI. **Validation:** `tsc` clean, 56 unit tests pass, production build OK.
(Original plan below.)

- **Goal:** add the structured fields that power real actions: `phone`,
  `website`, `reservation_url` (+ `booking_provider`), `hours` (jsonb,
  Asia/Tokyo), `price_level`. Surface call/website/reserve actions via a shared
  `PlaceActions` component on card + detail. Admin editor gains the new fields.
- **Acceptance:** new columns exist & are editable in `/admin/places/[slug]`;
  detail page shows Call / Website / Reserve when present; reservation uses
  verified external links only (no scraping/booking engine); empty fields render
  nothing; `Place` type + `mapDbPlace` updated; all 5 locales updated.
- **Dependencies:** none (additive migration).
- **DB changes:** `migration_places_actions.sql` (additive, idempotent).
- **Security:** writes admin-only (unchanged RLS); validate/normalize URLs &
  phone server-side; `rel="noopener nofollow"` on external links.
- **Tests:** unit for field mapping + URL/phone normalization helpers.
- **Rollback:** drop new columns (data loss limited to new fields); UI guards on
  presence so unapplied migration is a no-op.
- **Risks:** none structural; keep `categoryEmoji` centralization optional.

### Phase 2 — Intent-based search & practical filters ✅
**Shipped.** Deterministic, AI-free pipeline. New pure libs: `lib/placeIntent.ts`
(parses price/open-now/nearby/station/area/suitability/facilities/time from
multilingual queries, NFKD-normalized phrase tables), `lib/placeOpenNow.ts`
(Asia/Tokyo open-now incl. overnight wrap), `lib/geo.ts` (haversine + format),
`lib/exploreParams.ts` (URL (de)serialize + chips/count). `lib/placeSearch.ts`
extended: `PlaceCriteria` gains ~25 structured filters + `SortKey`;
`filterPlaces` applies them + distance + 6 sorts, all **back-compatible** (existing
tests untouched); added `suggestRelaxation` (zero-result recovery) and
`relevantFilterKeys` (category-aware UI). UI: `components/places/PlacesExplorer.tsx`
+ `PlaceFilters.tsx` (search bar, recent/popular suggestions, quick chips,
geolocation "near me", category-aware filter panel/drawer, active+detected chips,
6 sorts, result count, load-more, empty state with relaxation + related
categories + ask-community, loading/error states). `/places` reworked to
server-render cards + config + community-activity + popular and host the explorer.
Analytics: `lib/searchAnalytics.ts` (11 events + privacy-safe `search_queries`
logging — **no GPS stored**, nearby is a boolean). Admin: query tester now shows
parsed intent; new `/admin/search-concepts/insights` (zero-result / unmatched /
low-CTR + zero-rate); `maps_to` column + persistence wired. Migration
`migration_places_search_phase2.sql` (created_at, search_concepts.maps_to,
search_queries). **Tests:** 248 pass (geo, open-now, params, intent, filters/
sort/relaxation + all prior). tsc clean, build OK. **Known limitations:** search
is in-memory over the loaded set (engine is swap-ready for a DB query at scale);
unmodeled concepts (e.g. "private room"/個室) need an Admin concept or new column;
`maps_to`→filter has schema+persistence but no bespoke editor UI yet (built-in
deterministic intent tables are the active mechanism); "newest" needs the
created_at migration applied. (Original plan below.)

- **Goal:** extend `PlaceCriteria` + filter UI (price level, fee, amenities,
  rating, open-now placeholder, has-reservation) and converge `/places` + `/map`
  onto the shared engine. Keep facets data-driven via `search_concepts`.
- **Acceptance:** filters reflect in URL, are SSR-safe, and reuse `filterPlaces`;
  `/places` uses the engine; no regression in existing query behavior (tests).
- **DB changes:** possibly new `search_concepts` rows only.
- **Tests:** extend `placeSearch.test.ts` for new criteria.
- **Rollback:** UI flag; engine changes are additive/back-compatible.

### Phase 3 — Nearby search, map view, open-now ✅
**Shipped.** **Provider: Leaflet + OpenStreetMap tiles** (`leaflet` + `leaflet.markercluster`,
MIT) — **no API key, no usage cost** (OSM tile policy: fine at this scale; switch
to a tile CDN if traffic grows). **Open-now state machine**: `openStatus()` in
`lib/placeOpenNow.ts` → `open | closing_soon | closed | opens_later |
temporarily_closed | hours_unknown` (Asia/Tokyo, multi-interval, overnight wrap,
closing-soon window, closed-days, holiday `ph` slots, temp/permanent closure,
selected future time) — never "open" when hours are unknown. **Server geo query**:
`migration_places_nearby.sql` adds `places_nearby()` (bounding-box prefilter on the
indexed lat/lng + haversine, RLS-respecting) called via `lib/placesNearby.ts` and
`/api/places/nearby` (server-side fallback haversine pre-migration) — distance is
NOT computed by shipping all coords to the browser. **Map view**: `/map` rebuilt
(`app/map/MapExplorer.tsx`, client-only via `ssr:false`, Leaflet isolated to a
~56 kB route chunk) — list/map/split views, clustered category-emoji markers with
open-state dots, marker↔card sync, "search this area", recenter, radius chips
(500 m–20 km), category + open-now + selected-time filters, manual area/station
recenter, mobile bottom-sheet preview, distance + nearest station + walk time.
**Geolocation privacy**: requested only on explicit "Use my location" tap (never
on load), with a "why" note + stop-using-location, coarse accuracy, and **no
coordinate persistence** (the API stores nothing; Phase 2 analytics already drop
coords). i18n `map_explore` (26 keys ×5). **Tests:** 255 pass (open-now states,
bounding-box vs haversine, distance + all prior). tsc clean, build OK. **Known
limitations:** marker attribute/open-now filtering runs on the radius-bounded set
client-side (geo query itself is server-side); Japanese public-holiday detection
is a hook (`isHoliday` flag) — no holiday calendar wired; "search this area" +
radius refetch from the DB; map UI verified via build/tsc (not a live browser);
`npm audit` flags transitive issues from markercluster's dev deps (no runtime
exploit path in our usage). (Original plan below.)

- **Goal:** interactive map with markers/clustering; geolocation + distance sort;
  open-now computed from `hours` in Asia/Tokyo.
- **Acceptance:** map renders only `lat/lng` rows, degrades to grid; "near me"
  asks permission and sorts by distance; open-now badge correct across DST-free
  JST; map JS lazy-loaded (no LCP regression on mobile).
- **DB changes:** spatial index / nearby RPC (or app-side haversine fallback).
- **Risks:** map library bundle size (lazy-load), missing coordinates coverage,
  geolocation permission UX. **Product decision:** map provider (see below).

### Phase 4 — Detail experience, saved places, recent history ✅
**Shipped.** **Saved places** now DB-backed: `migration_place_saves.sql`
(`place_saves`, PK(user_id,place_slug) → no dup, RLS own-rows select/insert/delete).
`app/places/saved-actions.ts` (anon client → RLS via auth.uid): `getSavedState`,
`toggleSave`, `mergeSaves`. `components/SavedPlacesProvider.tsx` (mounted in
layout) is the single source of truth across cards/map/detail: members → DB,
guests → localStorage (legacy key reused), **login merges guest saves (dedup) then
clears local**. `SavePlaceButton` rewired to the provider. **Recent history**:
privacy-first localStorage only (`lib/recentPlaces.ts`, capped 24, dedup,
most-recent-first, never synced/public) via `RecentViewRecorder` + clear button on
the saved page. **Detail page**: open-now state badge (Phase 3 `openStatus`),
`PlaceSaveShare` (desktop sidebar), sticky mobile `PlaceActionBar` (Directions/
Save/Share + overflow Call/Reserve/Website/Ask/Report, safe-area inset, leaving-
site confirm for external reservations naming the provider + "handled by external
site"), Web-Share-with-copy-fallback, `PlacePhrases` (per-place + category
templates, copy + speech). **Reviewed phrases**: `lib/japanesePhrases.ts` (static,
category-aware: reservation/parking/payment/allergies/private-room/children/tattoo/
campsite/…). **Action availability**: `lib/placeActions.ts` (no active button
without a valid target). Saved page rebuilt (DB+guest + guest sign-in hint +
recently-viewed). i18n `place_detail` (26 keys ×5). **Analytics**: place_save/
unsave/share/directions/call/website/reserve_click/ask/report. **Tests:** 267 pass
(saved merge/dedup, recent cap/dedup, phrase selection, action availability +
prior). tsc clean, build OK. **Known limitations:** "Add to plan" intentionally
deferred to Phase 5 (plans don't exist yet — no valid target); recent history is
local-only by privacy choice (no cross-device); reservation/directions analytics
on the detail action bar are best-effort client events; mobile action-bar UX
verified via build/tsc/breakpoints, not a live device. (Original plan below.)

- **Goal:** DB-backed per-user saves replacing localStorage (with one-time
  adoption of existing local saves); recent-viewed history; richer detail.
- **Acceptance:** save works logged-in (DB) and logged-out (local→adopt on
  login); no duplicate stores; history shows recent places.
- **DB changes:** `place_saves` (+ optional `place_views`), RLS own-rows.
- **Risks:** migrating localStorage data; offline/anon behavior.

### Phase 5 — Lists & trip planning & sharing ✅
**Shipped.** **Migrations** `migration_place_lists.sql` (place_lists +
place_list_items) and `migration_place_plans.sql` (place_plans + place_plan_stops)
— RLS owner-only (child tables gated by parent ownership), unique constraints
prevent duplicate items, updated_at triggers. **Custom lists**: create/rename/
describe/delete/duplicate, add/remove/reorder (↑↓), private-by-default with
opt-in shareable + unguessable `share_token` + include-notes toggle + revoke
(`app/lists/*` + `ListsClient`/`ListEditor`). **Trip plans**: title/date/start/
notes, ordered stops with arrival/departure/duration/cost/note/transport,
reorder, **honest straight-line distances** (no routing), **non-blocking warnings**
(closed-on-day, arrival-outside-hours, hours-unknown, reservation-required,
missing-coords, temp-closure, not-verified-recently, time-overlap, large-distance),
per-stop directions + Google-Calendar links, **export** (print, copy summary,
.ics download — never silent), share + **duplicate-shared-plan-into-account**
(`app/plans/*` + `PlanEditor`). **Sharing/privacy**: private default, explicit
shareable action, revocable token, owner-only RLS, shared read via service-role +
`is_shareable` check, private notes excluded unless opted in, no emails/user_ids
exposed, viewers can't edit. The Phase-4 **"Add to list/plan"** action is now live
(`AddToCollection` in the detail action bar + sidebar). Pure libs:
`lib/planning.ts` (moveItem, analyzePlan), `lib/calendar.ts` (buildICS/gcalUrl/
summary), `lib/shareToken.ts`, `lib/placeLite.ts`. i18n `trips` (80 keys ×5).
**Tests:** 276 pass (reorder, opening-hour conflict/overlap/distance warnings,
ICS/gcal/summary builders, share-token validity + prior). tsc clean, build OK
(/lists, /lists/[id], /lists/shared/[token], /plans, /plans/[id],
/plans/shared/[token]). **Known limitations:** reorder uses ↑↓ buttons (accessible/
mobile-friendly) not drag; distances/times are estimates (labeled), no routing
provider; RLS verified by policy + code path, not a live DB; UI verified via
build/tsc/tests, not a live browser. (Original plan below.)

- **Goal:** user lists/plans of places, ordering, share links.
- **DB changes:** `place_lists`, `place_list_items`, share token; RLS.

### Phase 6 — Place questions & info verification ✅
**Shipped (reuse-first, no duplicate comment platform).** `migration_place_qa.sql`
**extends `place_comments`** with `kind` (comment/question/answer), `parent_id`,
`helpful`, `helpful_marked_by` (+ recreates the author view); adds `place_reports`
(structured review queue, RLS own-insert/select) and `place_visits` (PK(user,slug)
anti-spam, RLS own-only). **Q&A** ([components/places/PlaceQuestions.tsx](web/components/places/PlaceQuestions.tsx) +
[qa-actions.ts](web/app/places/qa-actions.ts)): ask/answer, mark-helpful (question
author or admin, via admin client with ownership check), sort newest/most-helpful
([lib/placeQa.ts](web/lib/placeQa.ts) `buildQuestionThreads`/`sortQuestions`), report
content, admin hide (status='hidden'), delete own, "open community". `getPlaceComments`
now filters `kind='comment'` (pre-migration fallback) so existing "experiences"
stay separate. **Structured reports** (`PlaceReport`, 10 kinds) never edit place
data → admin queue at [/admin/places/reports](web/app/admin/places/reports/page.tsx)
(resolve/reject + moderation note + resolved_by/at audit; admin applies changes
manually via the place editor). **"I visited"** (`VisitedButton`): self-reported,
private (no date/user exposed), spam-guarded by PK, honest "N users reported
visiting" wording. **Notifications reuse** `notifyUsers()` (community_notifications
+ web push) for `place_answer`, `place_answer_helpful`, `place_report_reviewed`;
both notification renderers + 6 i18n keys added. i18n `place_qa` (59 keys ×5).
**Tests:** 279 pass (report-kind validation, thread building excl. comments/hidden,
newest/helpful sort + prior). tsc clean, build OK. **Known limitations:**
comment-content "report" routes into the same `place_reports` queue (kind=other)
rather than a separate flag table; admin hide records no separate reason column
(reports do, via admin_note); "saved place confirmed major update" notification is
not auto-fired (no change-diff pipeline yet) — admins apply updates manually.
(Original plan below.)
- **DB changes:** extended `place_comments` + `place_reports` + `place_visits`.

### Phase 7 — Personalized discovery, events, return-user ⬜
- **Goal:** recommendations from saves/history/ratings, events, return-user home.
- **DB changes:** `place_events`; read models for recs.

### Phase 8 — Admin, analytics, quality audit, release ⬜
- **Goal:** admin coverage for all new entities, place-event analytics
  (`trackEvent` with `metadata`), full QA, release validation.

---

## Cross-cutting constraints (apply every phase)

- **Non-destructive, idempotent SQL**; degrade gracefully if unapplied.
- **Zero-hardcode i18n** — all 5 message files together.
- **RLS on every new table**; user writes own-rows, admin via service role.
- **Reuse** the search engine, data-access helpers, tags, analytics, cards.
- **No external publish/booking engine**; reservation = verified external links.
- **No scraping** that violates provider ToS.
- Don't break Community, Chat, Japanese, Games, Auth, Admin, i18n.

## Open product decisions (need confirmation only where unsafe to assume)

1. **Map provider** for Phase 3 (Leaflet+OpenStreetMap free vs Google Maps JS —
   may need a billed API key). Default assumption: Leaflet/OSM (no key, ToS-safe).
2. **Reservation model** — confirm external-links-only (assumed) vs any one
   supported integration the business already has.
3. **Geographic scope** of launch (Fukuoka-first vs all-Japan) for prioritizing
   data/coordinate backfill.
