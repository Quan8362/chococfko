import 'server-only'
import Jimp from 'jimp'

// Bakes a tiled, semi-transparent "chococfko.com" watermark INTO the image bytes.
// Runs inside the /api/img proxy, so even a download via DevTools/Network yields a
// watermarked file — the only measure that survives copying (right-click blocking
// and URL hiding are just deterrents).
//
// Uses jimp (pure JS, no native binary) so it works reliably on serverless without
// the libvips/sharp cross-platform install problems. On any failure it returns the
// ORIGINAL bytes, so a watermark bug can never break image display.
export async function watermarkImage(input: Buffer, contentType: string): Promise<{ buffer: Buffer; contentType: string }> {
  // Skip formats jimp shouldn't re-encode (animated GIF, SVG).
  if (contentType.includes('gif') || contentType.includes('svg')) {
    return { buffer: input, contentType }
  }
  try {
    const image = await Jimp.read(input)
    const { width, height } = image.bitmap
    const minDim = Math.min(width, height)

    // Pick a built-in font roughly proportional to the image size.
    const fontName =
      minDim < 240 ? Jimp.FONT_SANS_16_WHITE
      : minDim < 700 ? Jimp.FONT_SANS_32_WHITE
      : Jimp.FONT_SANS_64_WHITE
    const font = await Jimp.loadFont(fontName)

    const text = 'chococfko.com'
    const stepX = Math.max(180, Math.round(minDim * 0.7))
    const stepY = Math.max(90, Math.round(minDim * 0.38))

    // Draw the repeated text onto a transparent layer, then composite it over the
    // image at low opacity so it reads as a faint watermark.
    const layer = new Jimp(width, height, 0x00000000)
    for (let y = 0; y < height; y += stepY) {
      for (let x = -Math.round(stepX / 2); x < width; x += stepX) {
        layer.print(font, x, y, text)
      }
    }

    image.composite(layer, 0, 0, {
      mode: Jimp.BLEND_SOURCE_OVER,
      opacitySource: 0.22,
      opacityDest: 1,
    })

    const out = await image.quality(82).getBufferAsync(Jimp.MIME_JPEG)
    return { buffer: out, contentType: 'image/jpeg' }
  } catch {
    return { buffer: input, contentType }
  }
}
