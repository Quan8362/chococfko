import { staticCacheName } from '@/lib/games/poker/pwa/swCachePolicy'

// ── /sw.js — the service worker, served build-versioned & never HTTP-cached ───────────────────
//
// The SW used to be a fixed static file (public/sw.js). Because its BYTES never changed between
// deploys, the browser never saw a "new" worker, so its `activate` cache-purge never ran and a
// returning user could keep being served a PRIOR build's cached `/_next/static/*` chunks until a
// manual hard reload (Prompt 27F-A, Defect D1).
//
// Serving it from this route handler fixes that at the source:
//   • the running deploy's build id (NEXT_PUBLIC_BUILD_ID — see next.config.mjs) is stamped into the
//     script AND the cache name, so every deploy ships a byte-different worker the browser installs;
//   • on `activate` the new worker purges every owned cache whose name isn't the current build's
//     (staleCaches), removing the legacy `choco-static-v1` and any older build's cache;
//   • the response is `no-cache, no-store, must-revalidate` so no browser/CDN can pin a stale worker.
//
// The cache POLICY itself is unchanged and still mirrors lib/games/poker/pwa/swCachePolicy.ts:
// ONLY immutable, public, same-origin static assets are cache-first; navigations / HTML / RSC / API
// / auth / admin / cross-origin / non-GET are ALWAYS network (never stored). No private poker state
// can land in the cache. The controlled, between-hands update prompt (usePokerAppUpdate →
// UpdateBanner) is unchanged; this route only guarantees a genuinely new worker is delivered.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev'

function serviceWorkerSource(staticCache: string): string {
  return `// Chợ Cóc FKO service worker — generated per deploy by app/sw.js/route.ts.
// STATIC_CACHE is stamped with this deploy's build id; a new deploy ⇒ new worker ⇒ old caches purged.
// Cache policy mirrors lib/games/poker/pwa/swCachePolicy.ts (allowlist-only immutable static assets).

var STATIC_CACHE = ${JSON.stringify(staticCache)}
var STATIC_CACHE_PREFIX = 'choco-static-'
var IMMUTABLE_PREFIX = '/_next/static/'
var STATIC_ASSET_EXT = /\\.(?:woff2?|ttf|otf|png|jpe?g|webp|avif|gif|svg|ico)$/i
var DENY_PREFIXES = ['/api', '/auth', '/admin', '/sw.js', '/manifest']

function isOwnedCache(name) {
  return name.indexOf(STATIC_CACHE_PREFIX) === 0
}

// Returns 'cache-first' only for allowlisted immutable public assets; 'passthrough' otherwise.
function classifyRequest(request) {
  try {
    if (request.method !== 'GET') return 'passthrough'
    if (request.mode === 'navigate') return 'passthrough'
    var url = new URL(request.url)
    if (url.origin !== self.location.origin) return 'passthrough'
    var path = url.pathname
    for (var i = 0; i < DENY_PREFIXES.length; i++) {
      if (path.indexOf(DENY_PREFIXES[i]) === 0) return 'passthrough'
    }
    if (path.indexOf(IMMUTABLE_PREFIX) === 0) return 'cache-first'
    if (!url.search && STATIC_ASSET_EXT.test(path)) return 'cache-first'
    return 'passthrough'
  } catch (e) {
    return 'passthrough'
  }
}

self.addEventListener('install', function () {
  // Take over as soon as installed; the page is only RELOADED via the user's between-hands prompt
  // (usePokerAppUpdate), never here — claiming control does not reload an open, mid-hand page.
  self.skipWaiting()
})

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (names) {
        return Promise.all(
          names.map(function (name) {
            // Purge only OUR caches from a different build; never touch a cache another tool owns.
            if (isOwnedCache(name) && name !== STATIC_CACHE) return caches.delete(name)
            return undefined
          })
        )
      })
      .then(function () {
        return self.clients.claim()
      })
  )
})

// Cache-first ONLY for allowlisted immutable static assets; everything else is left to the network
// untouched. We only call respondWith for cache-first requests, so navigations / HTML / RSC / API /
// auth / cross-origin keep the browser's default network behaviour exactly — never served stale.
self.addEventListener('fetch', function (event) {
  if (classifyRequest(event.request) !== 'cache-first') return

  event.respondWith(
    caches.open(STATIC_CACHE).then(function (cache) {
      return cache.match(event.request).then(function (cached) {
        if (cached) return cached
        return fetch(event.request)
          .then(function (response) {
            if (response && response.status === 200 && response.type === 'basic') {
              var copy = response.clone()
              cache.put(event.request, copy).catch(function () {})
            }
            return response
          })
          .catch(function () {
            return cached || Response.error()
          })
      })
    })
  )
})

// Allow the page to activate a waiting worker on the user's terms (controlled update flow).
self.addEventListener('message', function (event) {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

// ── Web Push (unchanged) ──────────────────────────────────────────────────────────────────────
self.addEventListener('push', function (event) {
  var data = {}
  try { data = event.data ? event.data.json() : {} } catch (e) {}

  var title = data.title || 'Chợ Cóc FKO'
  var options = {
    body: data.body || '',
    icon: data.icon || '/logo-nav.png',
    badge: '/logo-nav.png',
    tag: data.tag || undefined,
    data: { url: data.url || '/' },
    requireInteraction: false,
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  var url = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (windowClients) {
      for (var i = 0; i < windowClients.length; i++) {
        var client = windowClients[i]
        try {
          if (new URL(client.url).origin === self.location.origin) {
            client.postMessage({ type: 'notification-navigate', url: url })
            return client.focus()
          }
        } catch (e) {}
      }
      if (clients.openWindow) return clients.openWindow(url)
    })
  )
})
`
}

export function GET(): Response {
  const body = serviceWorkerSource(staticCacheName(BUILD_ID))
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/javascript; charset=utf-8',
      // The SW script itself must NEVER be pinned by a browser or CDN, or a new deploy could be
      // masked. Browsers already bypass the HTTP cache for the worker on update checks, but this is
      // explicit belt-and-braces (and covers any intermediary CDN).
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Service-Worker-Allowed': '/',
    },
  })
}
