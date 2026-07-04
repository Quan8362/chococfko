import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyRequest,
  staleCaches,
  isOwnedCache,
  STATIC_CACHE,
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

// ── Cache lifecycle ──────────────────────────────────────────────────────────────────────────
test('staleCaches: deletes owned older generations, keeps current + foreign caches', () => {
  const names = ['choco-static-v0', STATIC_CACHE, 'workbox-precache', 'other-app']
  assert.deepEqual(staleCaches(names), ['choco-static-v0'])
})

test('isOwnedCache: only our prefix is owned', () => {
  assert.equal(isOwnedCache(STATIC_CACHE), true)
  assert.equal(isOwnedCache('choco-static-v9'), true)
  assert.equal(isOwnedCache('workbox-precache-v2'), false)
})
