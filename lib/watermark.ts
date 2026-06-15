import 'server-only'
import Jimp from 'jimp'
import { WATERMARK_TILE_PNG_BASE64 } from './watermarkTile'

// Bakes a tiled, semi-transparent "chococfko.com" watermark INTO the image bytes.
// Runs inside the /api/img proxy, so even a download via DevTools/Network yields a
// watermarked file — the only measure that survives copying.
//
// Implementation notes:
// - jimp (pure JS, no native binary) → no sharp/libvips cross-platform problems.
// - The watermark text is a PRE-RENDERED PNG tile embedded as base64, so the
//   serverless runtime never calls jimp's loadFont (whose .fnt font files Next does
//   not bundle into the function → ENOENT). We only decode + composite here.
// - Any failure returns the ORIGINAL bytes, so it can never break image display.

let tilePromise: Promise<Jimp> | null = null
function getTile(): Promise<Jimp> {
  if (!tilePromise) {
    tilePromise = Jimp.read(Buffer.from(WATERMARK_TILE_PNG_BASE64, 'base64'))
  }
  return tilePromise
}

export async function watermarkImage(input: Buffer, contentType: string): Promise<{ buffer: Buffer; contentType: string }> {
  if (contentType.includes('gif') || contentType.includes('svg')) {
    return { buffer: input, contentType }
  }
  try {
    const image = await Jimp.read(input)
    const { width, height } = image.bitmap

    const tile = (await getTile()).clone()
    const tw = tile.bitmap.width
    const th = tile.bitmap.height

    // Tile the watermark across a transparent layer, then composite it over the
    // image at low opacity so it reads as a faint repeating stamp.
    const layer = new Jimp(width, height, 0x00000000)
    for (let y = 0; y < height; y += th) {
      for (let x = 0; x < width; x += tw) {
        layer.composite(tile, x, y)
      }
    }
    image.composite(layer, 0, 0, {
      mode: Jimp.BLEND_SOURCE_OVER,
      opacitySource: 0.24,
      opacityDest: 1,
    })

    const out = await image.quality(82).getBufferAsync(Jimp.MIME_JPEG)
    return { buffer: out, contentType: 'image/jpeg' }
  } catch {
    return { buffer: input, contentType }
  }
}
