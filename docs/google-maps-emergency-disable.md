# Google Maps Platform — Emergency Disable & Key Rotation

> Runbook for instantly stopping Google spend / abuse, and rotating keys, for
> **Chợ Cóc FKO**. The site is designed so that **disabling Google never breaks
> the map** — the public map falls back to Leaflet/OSM, internal place content
> stays fully available through the results list, and "Open in Google Maps" deep
> links keep working (they need no key/API).

## 0. Response order (fastest → most thorough)

1. **Feature-flag shutdown** (Vercel env) — instant, no code change. **Do this first.**
2. **Cloud quota → 0** on the offending API — stops new calls within minutes.
3. **Key revoke / rotate** — when a key is leaked or abused.

---

## 1. Feature-flag shutdown (Vercel → Project → Settings → Environment Variables)

Flip the relevant flag(s) to `false` (or unset the key), then redeploy (or use
"Redeploy" on the latest deployment). Resolution is pure config — no code logic
changes.

| Goal | Set |
|---|---|
| **Kill ALL Google** (master switch) | `NEXT_PUBLIC_GOOGLE_MAPS_ENABLED=false` |
| Public base map → Leaflet | `NEXT_PUBLIC_MAP_PROVIDER=leaflet` |
| Disable external Google search/preview | `NEXT_PUBLIC_GOOGLE_EXTERNAL_POI_ENABLED=false` |
| Disable in-site route preview | `NEXT_PUBLIC_GOOGLE_ROUTE_PREVIEW_ENABLED=false` |
| Disable Admin Google place picker | `NEXT_PUBLIC_ADMIN_PLACE_SEARCH_ENABLED=false` |
| Disable route preview server-side | remove `GOOGLE_MAPS_SERVER_KEY` |

After `NEXT_PUBLIC_GOOGLE_MAPS_ENABLED=false`: no Google JS loads, no Places/Routes
calls, the unified search is internal-only, the directions panel shows only "Open
in Google Maps", and the map renders with Leaflet. **No user-facing breakage.**

Verify on `/api/health` → `map.config_ok` and the boolean flags reflect the change
(values are never exposed).

---

## 2. Google Cloud Console — quota & API controls

- **Throttle:** APIs & Services → **Quotas** → select the API → set requests/day
  to **0** (emergency) or a low number. Reversible.
- **Disable an API:** APIs & Services → **Enabled APIs** → select → **Disable**.
  The app treats this as "unavailable" and falls back (route preview returns
  `unavailable`; the map stays on Leaflet).
- **Billing kill (last resort):** Billing → disable billing on the project. This
  hard-stops all paid APIs (and any other Google service on the project).

---

## 3. Key rotation

**Browser key** (`NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`, public by design):

1. Cloud Console → Credentials → create a **new** browser key; restrict by **HTTP
   referrer** (`chococfko.com/*`, `*.vercel.app` preview domains as needed) **and
   by API** (only the APIs in use).
2. Update the Vercel env var → redeploy.
3. Delete the old key.

**Server Routes key** (`GOOGLE_MAPS_SERVER_KEY`, secret — never `NEXT_PUBLIC`):

1. Create a new key restricted to **Routes API** (and, if applicable, by IP).
2. Update Vercel env (Production + Preview) → redeploy.
3. Delete the old key.

Rotate immediately if a key appears in logs, a public repo, or shows anomalous
usage. Browser keys are inherently public (shipped in client JS) — **referrer +
API restriction + quotas** are what keep them safe; the string itself is not a
secret. The server key **is** a secret and must never be exposed to the client.

### Preview-domain strategy
Add Vercel preview wildcards (`*.vercel.app` or the project's preview domain) to
the **browser** key referrer allow-list only if Google features must work on
previews; otherwise leave previews to Leaflet (default) so preview traffic costs
nothing and unauthorized referrers fail closed.

---

## 4. Post-incident checklist

- [ ] Confirm spend stopped (Billing → Reports).
- [ ] Confirm the public map still works on Leaflet and the list shows places.
- [ ] Confirm "Open in Google Maps" still works (no key needed).
- [ ] Re-enable gradually (flag → low quota → normal quota) once the cause is fixed.
- [ ] Review `[map-metric]` aggregated logs (event + mode/status only) for the
      failure signature — these contain **no coordinates, addresses, or keys**.
