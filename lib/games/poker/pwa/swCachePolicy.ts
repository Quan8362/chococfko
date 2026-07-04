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
// A single versioned static cache. Bump the suffix when the cache *contract* changes (new allowed
// asset kinds, etc.); on `activate` the worker purges every owned cache whose name differs, so a
// stale generation can never serve an asset the new build no longer references.
export const STATIC_CACHE = 'choco-static-v1'

/** True for caches this worker owns (so we never delete another tool's cache during cleanup). */
export function isOwnedCache(name: string): boolean {
  return name.startsWith('choco-static-')
}

/** Given the full list of cache names present, the obsolete ones to delete on activate. */
export function staleCaches(names: readonly string[], current: string = STATIC_CACHE): string[] {
  return names.filter((n) => isOwnedCache(n) && n !== current)
}
