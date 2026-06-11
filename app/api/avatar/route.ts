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

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('url')
  if (!raw) return new Response('missing url', { status: 400 })

  let target: URL
  try { target = new URL(raw) } catch { return new Response('bad url', { status: 400 }) }
  if (target.protocol !== 'https:') return new Response('forbidden', { status: 403 })
  if (!isAllowedHost(target.hostname)) return new Response('host not allowed', { status: 403 })

  try {
    const upstream = await fetch(target.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; chococfko-avatar-proxy)' },
      redirect: 'follow',
      cache: 'no-store',
    })
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
