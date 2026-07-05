// ── Service-worker cache policy (PURE, DOM-free) ─────────────────────────────────────────────
//
// This module is the TESTABLE SPECIFICATION for the shared service worker's static-asset cache.
// The runtime copy lives, mirrored by hand, in `public/sw.js` (a classic worker that cannot
// import TS). Keep the two in lockstep — `swCachePolicy.test.ts` pins the contract, and sw.js
// carries a comment pointing back here.
//
// 🔴 SECURITY INVARIANT (29B): the cache is ALLOWLIST-ONLY and stores ONLY immutable, PUBLIC,
// non-user assets (content-hashed `/_next/static/*`, public fonts/images/icons). Everything else
// is `passthrough` — served from the network and NEVER written to the cache:
//
//   • navigations / HTML documents  → passthrough (so a private route is never reused by anyone)
//   • non-GET requests              → passthrough (server actions are POST → never cached)
//   • cross-origin requests         → passthrough (Supabase Realtime/REST is another origin)
//   • /api, /auth, /admin, sw, manifest → passthrough (defense in depth, even if the ext looks static)
//
// Because ALL money-bearing / private poker state — hole cards, table snapshots, legal-action
// models, settlements — travels either through POST server actions or cross-origin Supabase, it is
// structurally impossible for any of it to land in this cache. There is no code path that stores a
// document or an API response.

export type CacheStrategy = 'cache-first' | 'passthrough'

export interface RequestFacts {
  /** HTTP method (uppercase, e.g. 'GET'). */
  readonly method: string
  /** URL origin === the page origin. */
  readonly sameOrigin: boolean
  /** `request.mode === 'navigate'` — a top-level document/HTML load. */
  readonly isNavigate: boolean
  /** URL pathname only (no origin, no query). */
  readonly path: string
  /** URL carries a non-empty query string. */
  readonly hasSearch: boolean
}

// Immutable, content-hashed Next.js static output. The filename embeds the build hash, so a URL
// is safe to cache-first forever — a new deploy references new hashes and never re-requests these.
const IMMUTABLE_PREFIX = '/_next/static/'

// Public static assets by extension (served from /public). No user data; effectively immutable for
// a given deploy. Query-string variants are deliberately excluded so a signed/tokenised URL — which
// could carry a credential — is never cached.
const STATIC_ASSET_EXT = /\.(?:woff2?|ttf|otf|png|jpe?g|webp|avif|gif|svg|ico)$/i

// Never cache anything under these prefixes even when the extension looks static. Poker data never
// flows through GETs to these, but this is belt-and-braces against a future route added carelessly.
const DENY_PREFIXES = ['/api', '/auth', '/admin', '/sw.js', '/manifest']

// The single decision function. Returns `cache-first` ONLY for allowlisted immutable public assets;
// everything else is `passthrough` (network, never stored). Fails safe by construction: any input
// that is not positively recognised as a safe static asset falls through to `passthrough`.
export function classifyRequest(f: RequestFacts): CacheStrategy {
  if (f.method !== 'GET') return 'passthrough'
  if (!f.sameOrigin) return 'passthrough'
  if (f.isNavigate) return 'passthrough'
  for (const p of DENY_PREFIXES) if (f.path.startsWith(p)) return 'passthrough'

  if (f.path.startsWith(IMMUTABLE_PREFIX)) return 'cache-first'
  if (!f.hasSearch && STATIC_ASSET_EXT.test(f.path)) return 'cache-first'
  return 'passthrough'
}

// ── Cache identity + lifecycle ───────────────────────────────────────────────────────────────
// The static cache is versioned by the DEPLOY BUILD ID, not a hand-bumped literal. The worker is
// served by app/sw.js/route.ts, which stamps the running deploy's NEXT_PUBLIC_BUILD_ID into both
// the cache name AND the script body — so every deploy ships a byte-different worker. The browser
// therefore always detects the new worker, installs it, and on `activate` purges every owned cache
// whose name differs (staleCaches), so a previous deploy's cached `/_next/static/*` can never be
// served to a returning user. Bumping the app is enough; there is no manual version to remember.
export const STATIC_CACHE_PREFIX = 'choco-static-'

// Cache-name-safe token: cache names are arbitrary strings, but we keep it to a tidy, predictable
// charset so it reads cleanly in devtools and can never collide with another tool's namespace.
function sanitizeBuildId(buildId: string): string {
  const safe = (buildId || '').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 64)
  return safe.length > 0 ? safe : 'dev'
}

/** The static cache name for a given deploy build id, e.g. 'choco-static-a1b2c3d4e5f6'. */
export function staticCacheName(buildId: string): string {
  return STATIC_CACHE_PREFIX + sanitizeBuildId(buildId)
}

/** True for caches this worker owns (so we never delete another tool's cache during cleanup). */
export function isOwnedCache(name: string): boolean {
  return name.startsWith(STATIC_CACHE_PREFIX)
}

/**
 * Given every cache name present, the obsolete owned ones to delete on activate: every cache we own
 * whose name is not the CURRENT deploy's cache. This purges the legacy fixed 'choco-static-v1' AND
 * any prior build's 'choco-static-<oldBuildId>' the moment the new worker activates.
 */
export function staleCaches(names: readonly string[], current: string): string[] {
  return names.filter((n) => isOwnedCache(n) && n !== current)
}
