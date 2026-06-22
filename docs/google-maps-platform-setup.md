# Google Maps Platform — Manual Cloud Setup (Chợ Cóc FKO)

> Operator runbook for provisioning Google Maps Platform safely for the staged
> map migration. **No key is committed to the repo.** The app reads a
> browser-restricted key from `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` and stays on
> Leaflet until the flags in [map-ux-phase-3-provider-foundation.md](./map-ux-phase-3-provider-foundation.md)
> are flipped. Verified against current Google Maps Platform docs (June 2026).

---

## 1. APIs to ENABLE now (Phase 3 foundation)

Enable only what the basic foundation map needs:

| API | Why | Billing tier | Free cap |
|---|---|---|---|
| **Maps JavaScript API** | Render the Google map (Dynamic Maps) + Advanced Markers | Essentials | 10,000 map loads/mo |

That's it for Phase 3. Advanced Markers need a **Map ID** (see §4); they are part
of the Maps JavaScript API (no separate API to enable).

## 2. APIs to keep DISABLED until later phases

Do **not** enable these yet — they are wired to flags that default off and have
their own cost surface:

| API | Future phase | Flag that gates it |
|---|---|---|
| **Places API (New)** — Autocomplete (New) + Place Details (Essentials) | Admin coordinate capture | (later) `…ADMIN_PLACE_SEARCH_ENABLED` |
| **Geocoding API** | Admin address → coords | (later) |
| **Places API (New)** — external POI previews + Place Photos | Public POI previews | `NEXT_PUBLIC_GOOGLE_EXTERNAL_POI_ENABLED` |
| **Routes API** — Compute Routes (Essentials) | Directions preview | `NEXT_PUBLIC_GOOGLE_ROUTE_PREVIEW_ENABLED` |

**Never use the Legacy services** (classic Places API, Directions API, Distance
Matrix API, `AutocompleteService`/`Autocomplete` widget). They are frozen and not
available to new customers.

## 3. Browser key — create & restrict

Create a **dedicated browser key** (separate from the existing server-only
`GOOGLE_CLOUD_API_KEY` used for OCR/Translate — do **not** reuse it):

1. Google Cloud Console → **APIs & Services → Credentials → Create credentials → API key**.
2. **Application restriction → Websites (HTTP referrers).** Add exactly:
   - `https://chococfko.com/*`
   - `https://www.chococfko.com/*`
   - `http://localhost:3000/*` (local dev)
   - Vercel previews: `https://*.vercel.app/*` is broad. Prefer a **stable preview
     alias** (e.g. `https://chococfko-staging.vercel.app/*`) and add only that,
     rather than the wildcard, to limit referrer spoofing exposure. If wildcard
     previews are unavoidable during testing, keep this key **low-quota** and
     remove the wildcard before launch.
3. **API restriction → Restrict key → select only "Maps JavaScript API"** for now.
   Add Places API (New) / Geocoding / Routes only when their phase ships.
4. Save. Copy the key into Vercel env (see §6) — never into the repo.

> A browser key is inherently public (shipped in client JS). Referrer + API
> restriction + quotas are what keep it safe; the key string itself is not a secret.

## 4. Map ID (required for Advanced Markers)

1. Console → **Google Maps Platform → Map Management → Create Map ID.**
2. Type: **JavaScript**, raster or vector. Copy the Map ID.
3. Put it in `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`.
4. If unset, the foundation falls back to `DEMO_MAP_ID` (dev only — do not ship).

## 5. Quotas, budget alerts, restrictions

- **Per-API quota caps:** Console → APIs & Services → Maps JavaScript API → Quotas.
  Set a conservative **"Map loads per day"** cap (e.g. 1,000/day during rollout)
  so a misconfiguration can't run away.
- **Budget alert:** Billing → Budgets & alerts → create a budget (e.g. **$10/mo**)
  with email alerts at 50% / 90% / 100%. The foundation should stay within the
  10k free map-loads cap, so any spend is an early-warning signal.
- **API restriction:** the key is locked to Maps JavaScript API only (§3.3).
- **Application restriction:** HTTP referrers only (§3.2).

## 6. Environment-variable placement

| Var | Where | Notes |
|---|---|---|
| `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` | Vercel → Project → Settings → **Environment Variables** (Production + Preview) | Browser-restricted; safe to expose. |
| `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` | same | Map ID for Advanced Markers. |
| `NEXT_PUBLIC_MAP_PROVIDER` / `…_ENABLED` / `…_V2_ENABLED` / `…_INTERNAL_ONLY` | same | Provider + feature flags (default keep Google off). |

- Keep the existing **server-only** `GOOGLE_CLOUD_API_KEY` separate and unchanged.
- Locally, copy entries from [.env.local.example](../.env.local.example) into `.env.local`.
- After changing Vercel envs, **redeploy** (NEXT_PUBLIC_* are inlined at build time).

## 7. Key-rotation process

1. Create a **new** browser key with identical restrictions (§3–4).
2. Update `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` in Vercel → redeploy.
3. Verify `/map/lab` renders the Google map (with V2 + Google flags on, as admin).
4. **Delete** the old key in Console. Rotate on any suspected leak or on a fixed
   schedule (e.g. every 6–12 months).

## 8. Compliance notes (terms verified June 2026)

- **Attribution:** Google POI/Places results must be shown on a Google Map with
  the Google logo + any third-party provider attribution clearly visible. The
  foundation only renders our own marker, but the POI phase must honor this.
- **Caching/storage:** you may cache lat/lng from Places/Directions/Routes for at
  most **30 days**, then delete — **except `place_id`, which may be stored
  indefinitely.** This is why the future schema stores `google_place_id` (durable)
  but treats cached coordinates/details as TTL'd.
- **No legacy APIs.** Use Places API (New), Routes API, Advanced Markers, and the
  inline bootstrap loader.

---

### Sources (verified June 2026)
- [Load the Maps JavaScript API (inline bootstrap loader)](https://developers.google.com/maps/documentation/javascript/load-maps-js-api)
- [Advanced Markers — migration & Map ID requirement](https://developers.google.com/maps/documentation/javascript/advanced-markers/migration)
- [Google Maps Platform pricing / SKU tiers](https://developers.google.com/maps/billing-and-pricing/pricing)
- [Places API policies & attribution](https://developers.google.com/maps/documentation/places/web-service/policies)
- [Maps Platform Service Specific Terms (caching/storage, place ID exemption)](https://cloud.google.com/maps-platform/terms/maps-service-terms)
