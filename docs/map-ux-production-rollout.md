# Map UX — Production Rollout & Rollback Plan

> Staged activation of **Map V2** with config-only rollback at every step.
> **Leaflet is the default and is NOT removed** — it stays the emergency fallback
> throughout. Full public activation requires **explicit approval**. All changes
> are Vercel environment variables + redeploy; **no code or database change is
> needed to advance or roll back.**

## Pre-flight (before Stage 1)

- [ ] Data: run `node scripts/audit-place-locations.mjs` → manual-review list **empty**, note the coordinate backlog (78 today; seed the 17 address-ready first).
- [ ] Gates green: lint · `tsc` · `node --test` (529) · `next build` · i18n parity (3844×5).
- [ ] Google Cloud (only if testing Google features): browser key (referrer + per-API restricted), Map ID, **separate** server Routes key, per-API daily quotas + a $25 budget alert ([google-maps-cost-control.md](./google-maps-cost-control.md)).
- [ ] Confirm `/api/health` → `map.config_ok: true` (or expected `missing` names) — values never exposed.

---

## Stage 1 — Developers / Admin only (Leaflet inside V2)

**Goal:** exercise the V2 shell with no Google spend; admins begin entering coordinates.

Vercel → Project `chococfko` → Settings → Environment Variables (Production):
```
NEXT_PUBLIC_MAP_V2_ENABLED        = true
NEXT_PUBLIC_MAP_INTERNAL_ONLY     = true     # admins only see V2; others get Leaflet
NEXT_PUBLIC_MAP_PROVIDER          = leaflet  # base map stays Leaflet/OSM
NEXT_PUBLIC_GOOGLE_MAPS_ENABLED   = false    # no Google anything
NEXT_PUBLIC_ADMIN_PLACE_SEARCH_ENABLED = true  # OPTIONAL: enable Google picker for admins
NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY = <browser key>   # only if admin picker enabled
NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID      = <map id>        # only if admin picker enabled
```
Redeploy. **Exit criteria:** admins can search/select/save coordinates; the V2
list + map render; public users still see the existing Leaflet map; error rate
flat; `[map-metric]` shows `map_loaded` / `viewport_query` with healthy latency.

---

## Stage 2 — Selected internal users (still no external POI)

**Goal:** widen V2 to internal members; watch errors + (if any) Google cost.
```
NEXT_PUBLIC_MAP_INTERNAL_ONLY     = true     # internal members + admins
NEXT_PUBLIC_GOOGLE_EXTERNAL_POI_ENABLED = false   # NO external POI while risk remains
NEXT_PUBLIC_GOOGLE_ROUTE_PREVIEW_ENABLED = false  # directions = Open-in-Google-Maps only
```
Monitor: `[map-metric]` map/search/viewport events; Vercel logs for `5xx`;
`/api/client-errors`; Google billing (should stay ~$0). **Exit criteria:** no
elevated errors; viewport latency mostly `<300`/`300-1000`; enough seeded
coordinates that the map is useful.

---

## Stage 3 — Small public percentage / controlled activation

**Goal:** limited public exposure; optionally enable directions/external.
```
NEXT_PUBLIC_MAP_INTERNAL_ONLY     = false    # public can see V2
# optional, only after Cloud quotas + budget alerts are set:
NEXT_PUBLIC_GOOGLE_MAPS_ENABLED          = true
NEXT_PUBLIC_GOOGLE_ROUTE_PREVIEW_ENABLED = true
GOOGLE_MAPS_SERVER_KEY                   = <server routes key>
# external POI still optional / last:
NEXT_PUBLIC_GOOGLE_EXTERNAL_POI_ENABLED  = true
```
> A true % split needs a middleware/cohort gate (not built); until then, "controlled
> activation" = enable V2 for everyone but keep `MAP_PROVIDER=leaflet` and Google
> features off, OR coordinate a soft-launch window. Monitor performance, Google API
> usage vs quotas, and user feedback. **Exit criteria:** stable latency/errors;
> Google usage well within quotas; no cost surprises; positive feedback.

---

## Stage 4 — Full Map V2 activation (Leaflet remains emergency fallback)

```
NEXT_PUBLIC_MAP_V2_ENABLED        = true
NEXT_PUBLIC_MAP_INTERNAL_ONLY     = false
NEXT_PUBLIC_MAP_PROVIDER          = leaflet   # keep Leaflet as the renderer unless Google base map is explicitly chosen
```
**Requires explicit approval.** Leaflet stays installed and is the instant
rollback target. Do **not** remove Leaflet in this phase.

---

## Rollback (config-only — no DB revert, no code revert)

Any stage can be reverted instantly by flipping env vars and redeploying. The DB
columns are additive/nullable, so **no database data must be reverted.**

| Symptom | Action (Vercel env → Redeploy) |
|---|---|
| V2 misbehaving | `NEXT_PUBLIC_MAP_V2_ENABLED=false` → everyone gets the existing Leaflet map |
| Google base map issue | `NEXT_PUBLIC_MAP_PROVIDER=leaflet` |
| External POI / search problem | `NEXT_PUBLIC_GOOGLE_EXTERNAL_POI_ENABLED=false` |
| Route preview / Routes cost issue | `NEXT_PUBLIC_GOOGLE_ROUTE_PREVIEW_ENABLED=false` |
| Any Google cost/abuse | `NEXT_PUBLIC_GOOGLE_MAPS_ENABLED=false` (master kill) — full procedure in [google-maps-emergency-disable.md](./google-maps-emergency-disable.md) |
| Admin picker issue | `NEXT_PUBLIC_ADMIN_PLACE_SEARCH_ENABLED=false` (admins fall back to manual coords) |

**Exact Vercel steps:** Project `chococfko` → Settings → Environment Variables →
edit the var (Production scope) → Save → Deployments → latest → **Redeploy**
(env-only change; no rebuild of logic required). Effect is immediate after the
redeploy completes. Verify on `/api/health` and by loading `/map`.

**Rollback verified:** with `MAP_V2_ENABLED=false`, `app/map/page.tsx` renders the
unchanged `MapExplorer` (existing Leaflet map); with Google flags off, no Google
script loads and the unified search is internal-only — confirmed structurally by
`config.test.ts` (`*Available` helpers default to off) and the page's flag branch.

## Monitoring during rollout

- **Errors:** Vercel logs (`5xx`), `/api/client-errors`, route `[map-metric]`
  `*_failed` / `map_api_unavailable` counts.
- **Cost:** Google Cloud Billing reports + the per-API quota dashboards.
- **Performance:** `viewport_query` latency buckets; `map_loaded` vs
  `map_load_failed`.
- **Privacy check:** confirm `[map-metric]` lines contain **no** coordinates/
  addresses/keys (guaranteed by the metrics allow-list).
