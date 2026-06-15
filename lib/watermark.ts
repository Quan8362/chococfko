import 'server-only'
import sharp from 'sharp'

// Bakes a tiled, semi-transparent "chococfko.com" watermark INTO the image bytes.
// Because it runs inside the /api/img proxy, even a download via DevTools/Network
// yields a watermarked file — this is the only measure that actually survives
// copying (right-click blocking and URL hiding are just deterrents).
//
// Returns the original buffer unchanged if processing fails, so a watermark bug can
// never break image display.
export async function watermarkImage(input: Buffer, contentType: string): Promise<{ buffer: Buffer; contentType: string }> {
  // Skip formats sharp shouldn't re-encode (animated GIF, SVG).
  if (contentType.includes('gif') || contentType.includes('svg')) {
    return { buffer: input, contentType }
  }
  try {
    const image = sharp(input, { failOn: 'none' })
    const meta = await image.metadata()
    const w = meta.width ?? 1000
    const h = meta.height ?? 750
    const fontSize = Math.max(13, Math.round(Math.min(w, h) / 24))
    const tileW = Math.round(fontSize * 12)
    const tileH = Math.round(fontSize * 7)

    const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <pattern id="wm" width="${tileW}" height="${tileH}" patternUnits="userSpaceOnUse" patternTransform="rotate(-28)">
      <text x="0" y="${Math.round(tileH * 0.6)}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="700"
            fill="#ffffff" fill-opacity="0.30" stroke="#000000" stroke-opacity="0.10" stroke-width="0.7">chococfko.com</text>
    </pattern>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#wm)"/>
</svg>`

    const out = await image
      .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
      .toBuffer()
    return { buffer: out, contentType }
  } catch {
    return { buffer: input, contentType }
  }
}
