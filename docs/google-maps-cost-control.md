# Google Maps Platform — Cost Control & Recommended Quotas

> Conservative starter configuration for **Chợ Cóc FKO** at its current scale
> (~78 places, low traffic, Google **off by default**). Every Google capability is
> flag-gated; with the shipped defaults the spend is **$0**. These quotas cap
> runaway cost without throttling normal production use. Tune upward as traffic
> grows. Verified against the post-2025 per-SKU pricing model (no $200 credit;
> Essentials/Pro/Enterprise free caps of 10k/5k/1k per SKU/month).

## 1. Where spend can originate (only when flags are on)

| API (SKU) | Trigger | Default state |
|---|---|---|
| Maps JavaScript API — Dynamic Maps | Public map only if `MAP_PROVIDER=google` | **off** (Leaflet) |
| Places API (New) — Autocomplete (Per Session) | Admin picker typing; public "Search Google Maps" click | **off** |
| Places API (New) — Place Details (Essentials, 6-field mask) | Admin selection / public external preview / POI click | **off** |
| Geocoding API | Admin reverse-geocode on map click/drag (debounced, suggestion-only) | **off** |
| Routes API — Compute Routes (Essentials) | Public "Preview route" click only | **off** |
| Maps URLs (Open in Google Maps) | Navigation handoff | free, no API, always on |

## 2. Recommended daily quotas (per-API caps in Cloud Console → APIs & Services → Quotas)

Generous vs current scale, bounded against abuse. **Do not set these to 0** (that
would disable normal use); 0 is only for the emergency procedure.

| API | Quota (requests/day) | Rationale |
|---|---|---|
| Maps JavaScript API (map loads) | **2,000/day** | only consumed if the base map is switched to Google; covers a busy day with headroom |
| Places Autocomplete (Per Session) | **1,000/day** | admin edits are tiny; public external search is explicit-click only |
| Place Details (Essentials) | **1,000/day** | ≤ 1 per session (session token bundles typing + 1 details) + cached per session |
| Geocoding | **300/day** | admin-only, debounced, suggestion-only |
| Routes (Compute Routes) | **1,000/day** | explicit "Preview route" only; Open-in-Google-Maps is the primary handoff |

Per-minute caps: leave Google's defaults; the app's debounce + session tokens +
stale-cancel already smooth bursts.

## 3. Budget alerts (Billing → Budgets & alerts)

- **Monthly budget:** **$25** (well above expected $0–low spend; a tripwire, not a limit).
- **Alert thresholds:** **50% / 80% / 100%** of budget, emailed to the billing owner.
- **Forecasted-spend alert:** enable (warns before month-end overruns).
- Note: a budget alert **notifies**; it does not cap spend — the per-API daily
  quotas above are the hard ceiling. Pair both.

## 4. App-level cost controls already enforced (see Phase 7/8/10 docs)

- Internal search first; Google is only **offered**, never auto-run.
- Autocomplete: 300 ms debounce, 2-char minimum, stale-request cancel, **session
  tokens** (typing + 1 Place Details billed as one session).
- Minimal **6-field** Place Details mask; **no** reviews/photos/phone/hours by default.
- Per-session Place Details **cache** (no re-billing the same place id).
- Routes API only after an explicit **Preview route** click; minimal field mask
  (distance/duration/polyline/description); single route by default.
- Map provider defaults to **Leaflet/OSM** → 0 Maps-JS loads by default.

## 5. Scaling guidance

Raise the daily quotas roughly in proportion to monthly active map users; keep the
Place Details cap ≈ the Autocomplete cap (≤ 1 per session). Revisit the budget when
sustained spend exceeds ~50% for two consecutive months. The emergency disable and
key-rotation procedures live in [google-maps-emergency-disable.md](./google-maps-emergency-disable.md).
