import { NextRequest } from 'next/server'

// Proxy provider avatars (Google / Facebook) through our own domain so they load
// on networks that block googleusercontent.com / fbcdn.net (e.g. corporate WiFi).
// Only whitelisted avatar hosts are allowed (SSRF protection).
const ALLOWED_SUFFIXES = [
  'googleusercontent.com',
  'ggpht.com',
  'fbcdn.net',
  'fbsbx.com',
  'facebook.com',
  'xx.fbcdn.net',
  'giphy.com',
]

function isAllowedHost(hostname: string): boolean {
  return ALLOWED_SUFFIXES.some(s => hostname === s || hostname.endsWith('.' + s))
}

// A target is safe only if it is https and its host is a known avatar CDN.
// (The allowlist already excludes IP literals / localhost, so no internal hosts.)
function isSafeTarget(u: URL): boolean {
  return u.protocol === 'https:' && isAllowedHost(u.hostname)
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('url')
  if (!raw) return new Response('missing url', { status: 400 })

  let target: URL
  try { target = new URL(raw) } catch { return new Response('bad url', { status: 400 }) }
  if (!isSafeTarget(target)) return new Response('host not allowed', { status: 403 })

  try {
    // Follow redirects manually so each hop's host is re-validated against the
    // allowlist. With `redirect: 'follow'` an allowed host (e.g. facebook.com,
    // which has open redirectors) could bounce the server-side fetch to an
    // internal address — SSRF. Manual following closes that hole.
    let current = target
    let upstream: Response | null = null
    for (let hop = 0; hop < 4; hop++) {
      const res = await fetch(current.toString(), {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; chococfko-avatar-proxy)' },
        redirect: 'manual',
        cache: 'no-store',
      })
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location')
        if (!loc) return new Response('bad redirect', { status: 502 })
        let next: URL
        try { next = new URL(loc, current) } catch { return new Response('bad redirect', { status: 502 }) }
        if (!isSafeTarget(next)) return new Response('redirect not allowed', { status: 403 })
        current = next
        continue
      }
      upstream = res
      break
    }
    if (!upstream) return new Response('too many redirects', { status: 502 })
    if (!upstream.ok || !upstream.body) {
      return new Response('upstream error', { status: 502 })
    }
    const contentType = upstream.headers.get('content-type') ?? 'image/jpeg'
    if (!contentType.startsWith('image/')) {
      return new Response('not an image', { status: 415 })
    }
    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        // Cache hard at the CDN + browser so we proxy each avatar rarely.
        'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400',
      },
    })
  } catch {
    return new Response('fetch failed', { status: 502 })
  }
}
