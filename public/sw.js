// ── Chợ Cóc FKO service worker ───────────────────────────────────────────────────────────────
// Two responsibilities, both deliberately narrow:
//   1. Web Push (unchanged): always show the OS notification; the page de-dupes when focused.
//   2. An ALLOWLIST-ONLY static-asset cache (29B): immutable /_next/static + public fonts/images.
//
// 🔴 The cache policy is the runtime mirror of lib/games/poker/pwa/swCachePolicy.ts (the tested
// spec). Keep the two in lockstep. It stores ONLY immutable, public, non-user assets. Navigations
// (HTML documents), non-GET requests, cross-origin (Supabase Realtime/REST), and /api /auth /admin
// are NEVER stored — so no private route, hole card, table snapshot, settlement, or auth token can
// ever land in the cache. The handler fails safe: any doubt ⇒ fall through to the network.

// ── Static cache: identity + policy (mirror of swCachePolicy.ts) ──────────────────────────────
var STATIC_CACHE = 'choco-static-v1'
var IMMUTABLE_PREFIX = '/_next/static/'
var STATIC_ASSET_EXT = /\.(?:woff2?|ttf|otf|png|jpe?g|webp|avif|gif|svg|ico)$/i
var DENY_PREFIXES = ['/api', '/auth', '/admin', '/sw.js', '/manifest']

function isOwnedCache(name) {
  return name.indexOf('choco-static-') === 0
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
  self.skipWaiting()
})

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (names) {
        return Promise.all(
          names.map(function (name) {
            // Purge only OUR older generations; never touch a cache another tool owns.
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

// Cache-first for allowlisted static assets; everything else is left to the network untouched.
// We only call respondWith for cache-first requests, so navigations / API / auth / cross-origin
// keep the browser's default behaviour exactly (zero risk of serving a stale or foreign response).
self.addEventListener('fetch', function (event) {
  if (classifyRequest(event.request) !== 'cache-first') return

  event.respondWith(
    caches.open(STATIC_CACHE).then(function (cache) {
      return cache.match(event.request).then(function (cached) {
        if (cached) return cached
        return fetch(event.request)
          .then(function (response) {
            // Only cache a clean, complete same-origin 200. Opaque/partial/error responses are
            // returned to the page but never stored.
            if (response && response.status === 200 && response.type === 'basic') {
              var copy = response.clone()
              cache.put(event.request, copy).catch(function () {})
            }
            return response
          })
          .catch(function () {
            // Offline and not cached: fall back to any cached match (already null here) or let the
            // request reject as it would without a service worker. Never fabricate a response.
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
// ALWAYS show the OS notification. Deciding whether to suppress based on tab focus inside the
// service worker proved unreliable (WindowClient.focused is flaky across browsers) and skipping
// while a hidden tab is open triggers Chrome's "silent push" penalty (which disabled the
// subscription). Instead, when a page is focused it closes this notification itself (by tag) and
// shows an in-app toast.
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
            // Ask the page to navigate itself (client.navigate() fails for windows
            // not controlled by this SW). The page listens for this message.
            client.postMessage({ type: 'notification-navigate', url: url })
            return client.focus()
          }
        } catch (e) {}
      }
      // No open tab → open a fresh one at the target URL
      if (clients.openWindow) return clients.openWindow(url)
    })
  )
})
