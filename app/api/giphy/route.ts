import { NextRequest } from 'next/server'

// Proxy the GIPHY trending/search API through our own domain so the GIF picker
// works on networks that block api.giphy.com (e.g. corporate WiFi).
const API_KEY = process.env.NEXT_PUBLIC_GIPHY_API_KEY
const LIMIT = 18

export async function GET(req: NextRequest) {
  if (!API_KEY) return Response.json({ data: [] })

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  const url = q
    ? `https://api.giphy.com/v1/gifs/search?api_key=${API_KEY}&q=${encodeURIComponent(q)}&limit=${LIMIT}&rating=pg`
    : `https://api.giphy.com/v1/gifs/trending?api_key=${API_KEY}&limit=${LIMIT}&rating=pg`

  try {
    const r = await fetch(url, { cache: 'no-store' })
    if (!r.ok) return Response.json({ data: [] })
    const data = await r.json()
    return Response.json(data, {
      headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' },
    })
  } catch {
    return Response.json({ data: [] })
  }
}
