import { NextRequest } from 'next/server'
import { decodeStoragePath, decodeBase64Path, publicUrlForPath, shouldWatermark } from '@/lib/imageProxy'
import { watermarkImage } from '@/lib/watermark'

// Watermarking uses jimp (pure JS) — keep this on the Node.js runtime, not Edge.
export const runtime = 'nodejs'

// Serves Supabase storage images through our own domain so the raw storage URL is
// never exposed. The `t` token is an AES-encrypted object path produced by
// proxyStorageImages() — it cannot be forged without the server key, and only
// whitelisted buckets decode successfully.
export async function GET(req: NextRequest) {
  // Watermark policy: keep the on-page display CLEAN, but stamp the copy that gets
  // handed out when someone OPENS the image link directly (open in new tab / paste
  // address / download the URL) — those arrive as a top-level navigation
  // (`Sec-Fetch-Mode: navigate`). In-page <img> loads are `no-cors`, and Next's
  // image optimizer fetches server-side with no Sec-Fetch header → both stay clean.
  //
  // Limitation (unavoidable on any site): right-click "Save image" and saving the
  // response from the F12 Network tab reuse the already-loaded clean bytes, so those
  // copies are NOT watermarked. Screenshots are clean too.
  const isDirectOpen = req.headers.get('sec-fetch-mode') === 'navigate'

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
    const upstreamType = upstream.headers.get('content-type') ?? 'image/jpeg'
    if (!upstreamType.startsWith('image/')) {
      return new Response('not an image', { status: 415 })
    }

    const cacheHeaders = {
      // Object paths are unique (timestamped) → cache hard at CDN + browser.
      'Cache-Control': 'public, max-age=86400, s-maxage=604800, immutable',
      // Cache the clean (display) and watermarked (direct-open) variants under
      // separate keys so the CDN never serves one in place of the other.
      'Vary': 'Sec-Fetch-Mode',
    }

    // Only the directly-opened copy of a content image gets the baked-in watermark.
    // The on-page display (and avatars/icons) stay clean.
    if (shouldWatermark(path) && isDirectOpen) {
      const input = Buffer.from(await upstream.arrayBuffer())
      const { buffer, contentType } = await watermarkImage(input, upstreamType)
      return new Response(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(buffer.byteLength),
          ...cacheHeaders,
        },
      })
    }

    // Buffer the upstream body and send an explicit Content-Length. Streaming
    // `upstream.body` here emits a chunked response with no Content-Length, which
    // Next.js/Vercel Image Optimization (/_next/image) rejects with a 404 — so
    // every proxied image wrapped in next/image broke. A finite, sized body lets
    // the optimizer fetch and resize it normally.
    const bytes = new Uint8Array(await upstream.arrayBuffer())
    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': upstreamType,
        'Content-Length': String(bytes.byteLength),
        ...cacheHeaders,
      },
    })
  } catch {
    return new Response('fetch failed', { status: 502 })
  }
}
