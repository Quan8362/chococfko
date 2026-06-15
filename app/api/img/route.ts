import { NextRequest, NextResponse } from 'next/server'
import { decodeStoragePath, decodeBase64Path, publicUrlForPath } from '@/lib/imageProxy'

// Serves Supabase storage images through our own domain so the raw storage URL is
// never exposed. The `t` token is an AES-encrypted object path produced by
// proxyStorageImages() — it cannot be forged without the server key, and only
// whitelisted buckets decode successfully.
export async function GET(req: NextRequest) {
  // Block direct navigation to the image URL (typing it in the address bar or
  // "open in new tab"). Browsers send `Sec-Fetch-Mode: navigate` only for top-level
  // navigations — an <img> load is `no-cors`, and Next's image optimizer fetches
  // this server-side with no Sec-Fetch headers. So this lets the image render inside
  // pages while bouncing anyone who opens the raw link to the homepage.
  // NOTE: this cannot stop right-click→Save (those bytes are already in the page) or
  // screenshots — no website can. It only closes the "copy link → open → save" path.
  if (req.headers.get('sec-fetch-mode') === 'navigate') {
    const res = NextResponse.redirect(new URL('/', req.nextUrl.origin), 302)
    res.headers.set('Cache-Control', 'no-store')
    return res
  }

  // `t` = AES token (server-rendered rich-text bodies); `p` = base64url path
  // (client-rendered images). Both resolve to a whitelisted storage object path.
  const token = req.nextUrl.searchParams.get('t')
  const p = req.nextUrl.searchParams.get('p')
  if (!token && !p) return new Response('missing token', { status: 400 })

  const path = token ? decodeStoragePath(token) : decodeBase64Path(p!)
  if (!path) return new Response('invalid token', { status: 403 })

  try {
    const upstream = await fetch(publicUrlForPath(path), {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; chococfko-img-proxy)' },
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
        // Object paths are unique (timestamped) → cache hard at CDN + browser.
        'Cache-Control': 'public, max-age=86400, s-maxage=604800, immutable',
        // Cache the image and the navigate-redirect under separate keys so the CDN
        // never serves one in place of the other.
        'Vary': 'Sec-Fetch-Mode',
      },
    })
  } catch {
    return new Response('fetch failed', { status: 502 })
  }
}
