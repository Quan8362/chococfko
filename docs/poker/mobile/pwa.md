# Poker — PWA Installation, Service-Worker Cache & App Update

Scope: the installable / standalone experience and the **shared** service worker as they relate to
the live poker table. Like the rest of the mobile work this changes **behaviour only** — no
authoritative rules, economy, bot strategy, or feature flags. Poker remains hard-OFF
(`POKER_ENABLED`) and ships dark. The service worker is **site-wide** (one worker for the whole app,
not a poker-only worker); the additions here are strictly additive and fail-safe.

## Web App Manifest

Served by Next at `/manifest.webmanifest` and auto-linked from every page (`app/manifest.ts`):

| Field | Value | Notes |
|-------|-------|-------|
| `name` / `short_name` | `Chợ Cóc FKO` | site-wide brand |
| `start_url` | `/` | **home** — never a private/table route (see below) |
| `scope` | `/` | whole app |
| `display` | `standalone` | chrome-free launch — the only way to a maximal game area on iOS, where element-fullscreen is unavailable |
| `orientation` | `any` | site-wide; **poker enforces its own landscape** in-app (see `orientation.md`), so the manifest must stay permissive for the rest of the site |
| `theme_color` / `background_color` | `#faf4ea` | site paper tone; the poker table paints its own dark felt over this |
| `icons` | 192, 512, 512-maskable | `purpose: 'any'` + `purpose: 'maskable'` for Android adaptive icons; `apple-touch-icon.png` for iOS home-screen |

**Why `start_url: '/'` matters (§2).** The installed app always launches to the public home route.
It never restores a deep link into `/games/poker/[tableId]`, so a standalone launch can never
re-open another user's private table or expose a private route from a previous session. If the user
navigates to a table after launch, the normal server-side auth + table-access gates apply
(`app/games/poker/access.ts`), and realtime revalidates auth on connect.

**iOS / Android metadata.** iOS reads `apple-touch-icon.png` and the manifest `display`/`theme_color`;
Android reads the maskable icon + `theme_color` for the splash/status bar. No user-agent sniffing is
used anywhere — capability is always feature-detected.

## Install experience (§2)

- There is **no forced install prompt and no custom install UI** in poker. The browser's own
  "Add to Home Screen" affordance is the only entry point, so nothing can block or overlay gameplay,
  and dismissing it is entirely the browser's concern (it does not reappear on its own).
- **Browser (non-installed) mode is fully supported** — the table, landscape handling, wake lock,
  and haptics all work in a normal tab. Installation is a nice-to-have, never a requirement.
- A standalone launch lands on `/` and authenticates through the normal session flow before any
  table is reachable.

## Service-worker responsibilities

The shared worker (`public/sw.js`) has exactly two jobs:

1. **Web Push** — unchanged from before 29B: always show the OS notification; a focused page
   de-dupes by tag and shows an in-app toast instead.
2. **An allowlist-only static-asset cache** (added in 29B).

### Cache policy — allowlist (cache-first)

The runtime policy in `public/sw.js` is the hand-mirrored copy of the **tested specification**
`lib/games/poker/pwa/swCachePolicy.ts` (`swCachePolicy.test.ts` pins the contract). Only these are
ever written to the cache (`choco-static-v1`), cache-first:

- **`/_next/static/*`** — content-hashed, immutable JS/CSS. A new deploy references new hashes, so a
  cached entry is safe forever and can never be a "stale asset that corrupts game state".
- **Public static assets by extension** (`.woff2/.woff/.ttf/.otf/.png/.jpg/.jpeg/.webp/.avif/.gif/.svg/.ico`)
  served same-origin from `/public` **without a query string** — fonts, the approved poker table art
  (`/poker-mobile.webp` etc.), card/chip/icon imagery, logos.

### Cache policy — denylist (passthrough, NEVER stored)

Everything below bypasses the cache entirely — the worker does not call `respondWith`, so the
browser's default network behaviour is preserved exactly (zero risk of serving a foreign or stale
response):

- **Navigations / HTML documents** (`request.mode === 'navigate'`) — so a private route's HTML is
  never cached and never re-served to a different user.
- **Non-GET requests** — every poker mutation (fold/check/call/bet/raise/all-in, sit/leave,
  settlement) is a **POST server action**, so it is structurally excluded.
- **Cross-origin requests** — Supabase Realtime (WebSocket) and REST live on another origin; the
  recipient-aware authoritative snapshot, hole cards, and legal actions all travel this path and are
  never same-origin GETs.
- **`/api`, `/auth`, `/admin`, `/sw.js`, `/manifest*`** — denied even if the extension looks static
  (defense in depth), and **any static-looking URL that carries a query string** (which could be a
  signed/tokenised URL).

**Result:** there is no code path in the worker that stores a document or an API/Realtime response.
Hole cards, table snapshots, legal-action models, settlements, auth tokens, deck order, and private
passwords cannot reach the cache because they only travel via POST server actions or cross-origin
Supabase — both `passthrough`. This is asserted directly in `swCachePolicy.test.ts`.

### Fail-safe & lifecycle

- The `fetch` handler wraps classification in `try/catch`; **any doubt ⇒ passthrough**. A cache miss
  while offline rejects exactly as it would with no service worker (it never fabricates a response).
- Only a clean same-origin `200` of `type: 'basic'` is stored; opaque/partial/error responses are
  returned to the page but never cached.
- `activate` purges only **our** older cache generations (`choco-static-*`, `staleCaches()`), never a
  cache another tool owns.

## App update experience (§7)

Signal: every build bakes `NEXT_PUBLIC_BUILD_ID` into the client bundle **and** stamps it as Next's
build id (so `/_next/static/<BUILD_ID>/…` matches — `next.config.mjs`). The new endpoint
**`GET /api/version`** (`{ buildId, pokerProtocol }`, `no-store`, unauthenticated, no secrets) echoes
the *server's* current values.

`app/games/poker/_design/usePokerAppUpdate.ts` polls it on a slow cadence (5 min) and on every
tab-visible transition, comparing against the client's baked values (`lib/games/poker/pwa/version.ts`):

- **Newer build id** → `updateAvailable`. Surfaced as a **non-blocking** `UpdateAvailableBanner` in
  the table HUD, but — via `shouldPromptUpdate` — **only between hands** (a seated player in a live
  hand is never interrupted; "offer update after the hand where practical"). Play continues normally.
- **Protocol mismatch** (`pokerProtocol` differs from `POKER_PROTOCOL_VERSION`) → `mustBlock`. This is
  a breaking change: the banner turns **urgent** (shown even mid-hand) and the action bar is disabled
  so the client can never *silently* submit an intent the new server may not understand. The
  server-side expected-seq CAS remains the actual security boundary; this is the UX guard in front of
  it. Bump `POKER_PROTOCOL_VERSION` only on a breaking action/snapshot-shape change.
- **Applying** (`applyUpdate`) messages any waiting worker `SKIP_WAITING`, then reloads — a deliberate
  user tap, so there is **no reload loop**. Reloading fetches fresh HTML referencing current hashes;
  the existing chunk-load guard (`app/error.tsx` → `lib/diagnostics/clientError.ts`,
  `shouldReloadForChunk`) bounds any residual stale-chunk mismatch to a single reload.

Because navigations are never cached and static URLs are content-hashed, a reloaded page always loads
a coherent build — stale service-worker assets cannot corrupt game state.

## Unsupported-platform fallbacks

| Capability | Missing on | Fallback |
|------------|-----------|----------|
| Service worker | private mode / disabled | No cache, no push; app runs fully from the network |
| Install / standalone | some desktop browsers | Runs as a normal tab; no feature depends on being installed |
| `/api/version` reachable | offline / probe fails | `usePokerAppUpdate` degrades to a no-op; it never invents an update |

## Known risks

- The service worker is **shared site-wide**, so the static cache benefits (and applies to) the whole
  app, not just poker. It is allowlist-only and immutable-only, but any future change to the allowlist
  must keep the `swCachePolicy.ts` spec and the `sw.js` mirror in lockstep.
- The update banner is exercised through unit tests and the design showcase; end-to-end coverage of
  the banner on the *authenticated* live table is gated behind the poker flags staying OFF.
- `POKER_PROTOCOL_VERSION` gating is currently **client-side detection + server CAS enforcement**. A
  future hard server-side protocol reject (returning the client's incompatibility explicitly) would
  make the block authoritative rather than advisory; today an old client is stopped from acting by the
  UI and would be rejected by the CAS if it tried.
