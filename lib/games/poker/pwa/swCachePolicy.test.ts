import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyRequest,
  staleCaches,
  isOwnedCache,
  staticCacheName,
  STATIC_CACHE_PREFIX,
  type RequestFacts,
} from './swCachePolicy.ts'

const base: RequestFacts = {
  method: 'GET',
  sameOrigin: true,
  isNavigate: false,
  path: '/',
  hasSearch: false,
}
const facts = (o: Partial<RequestFacts>): RequestFacts => ({ ...base, ...o })

// ── Allowlist: immutable + public static assets are cache-first ──────────────────────────────
test('cache-first: content-hashed /_next/static asset', () => {
  assert.equal(classifyRequest(facts({ path: '/_next/static/chunks/main-abc123.js' })), 'cache-first')
})

test('cache-first: public fonts and images by extension', () => {
  for (const path of ['/fonts/inter.woff2', '/poker-mobile.webp', '/icon-192.png', '/logo-nav.png', '/card-back.svg']) {
    assert.equal(classifyRequest(facts({ path })), 'cache-first', path)
  }
})

// ── Denylist: navigations, API, auth, cross-origin, non-GET are passthrough (never stored) ───
test('passthrough: navigations / HTML documents are never cached', () => {
  assert.equal(classifyRequest(facts({ isNavigate: true, path: '/games/poker/table-123' })), 'passthrough')
  assert.equal(classifyRequest(facts({ isNavigate: true, path: '/' })), 'passthrough')
})

test('passthrough: non-GET (server actions are POST) is never cached', () => {
  assert.equal(classifyRequest(facts({ method: 'POST', path: '/games/poker/table-123' })), 'passthrough')
  assert.equal(classifyRequest(facts({ method: 'HEAD', path: '/icon-192.png' })), 'passthrough')
})

test('passthrough: cross-origin (Supabase Realtime/REST) is never cached', () => {
  assert.equal(classifyRequest(facts({ sameOrigin: false, path: '/rest/v1/poker_hands' })), 'passthrough')
  assert.equal(classifyRequest(facts({ sameOrigin: false, path: '/realtime/v1/websocket' })), 'passthrough')
})

test('passthrough: /api, /auth, /admin, sw, manifest even with a static-looking extension', () => {
  for (const path of ['/api/version', '/api/foo.png', '/auth/callback', '/admin/poker', '/sw.js', '/manifest.webmanifest']) {
    assert.equal(classifyRequest(facts({ path })), 'passthrough', path)
  }
})

test('passthrough: static-looking asset carrying a query string is never cached (may be signed)', () => {
  assert.equal(classifyRequest(facts({ path: '/private.png', hasSearch: true })), 'passthrough')
})

test('passthrough: unknown non-asset GET (dynamic data) is never cached', () => {
  assert.equal(classifyRequest(facts({ path: '/games/poker/table-123/data' })), 'passthrough')
})

// 🔴 The security assertion made concrete: no poker private-state request shape can be cache-first.
test('security: hole-card / snapshot / settlement transports are all passthrough', () => {
  // Server actions (POST, same-origin) and Supabase reads (cross-origin) — the only channels that
  // ever carry private poker state — both classify as passthrough.
  assert.equal(classifyRequest(facts({ method: 'POST', path: '/games/poker/table-1' })), 'passthrough')
  assert.equal(classifyRequest(facts({ sameOrigin: false, path: '/rest/v1/poker_hole_cards' })), 'passthrough')
})

// ── Cache identity is BUILD-VERSIONED ──────────────────────────────────────────────────────────
test('staticCacheName: names the cache by deploy build id', () => {
  assert.equal(staticCacheName('a1b2c3d4e5f6'), 'choco-static-a1b2c3d4e5f6')
  assert.equal(staticCacheName('dev-1783168482434'), 'choco-static-dev-1783168482434')
})

test('staticCacheName: sanitises unsafe build ids and never yields an empty suffix', () => {
  // strips characters outside [A-Za-z0-9._-]
  assert.equal(staticCacheName('feat/poker@v2 rc1'), 'choco-static-featpokerv2rc1')
  // empty / whitespace-only → deterministic 'dev' fallback (never a bare prefix)
  assert.equal(staticCacheName(''), 'choco-static-dev')
  assert.equal(staticCacheName('   '), 'choco-static-dev')
  assert.ok(staticCacheName('x').length > STATIC_CACHE_PREFIX.length)
})

test('two different builds produce two different cache names', () => {
  assert.notEqual(staticCacheName('build-A'), staticCacheName('build-B'))
})

// ── Cache lifecycle: a new deploy purges the legacy fixed cache AND every prior build ───────────
test('staleCaches: deletes the legacy v1 cache and older builds, keeps current + foreign caches', () => {
  const current = staticCacheName('buildNew')
  const names = ['choco-static-v1', 'choco-static-buildOld', current, 'workbox-precache', 'other-app']
  assert.deepEqual(staleCaches(names, current), ['choco-static-v1', 'choco-static-buildOld'])
})

test('staleCaches: nothing to delete when only the current cache is present', () => {
  const current = staticCacheName('only')
  assert.deepEqual(staleCaches([current, 'third-party'], current), [])
})

test('isOwnedCache: only our prefix is owned', () => {
  assert.equal(isOwnedCache(staticCacheName('anything')), true)
  assert.equal(isOwnedCache('choco-static-v1'), true) // legacy fixed name is still ours (so it gets purged)
  assert.equal(isOwnedCache('choco-static-v9'), true)
  assert.equal(isOwnedCache('workbox-precache-v2'), false)
})
