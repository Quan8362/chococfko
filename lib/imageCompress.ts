// Client-side image compression. Resizes to a max dimension and re-encodes to
// WebP before upload — cuts a typical 400-500KB phone photo down to ~60-100KB,
// which lowers both Storage size and (repeated) egress from Supabase.
//
// Animated GIFs are passed through untouched (canvas would flatten them), and if
// compression somehow yields a larger file the original is kept.

export interface CompressOptions {
  /** Longest edge in px after resize. Default 1600. */
  maxDimension?: number
  /** WebP quality 0–1. Default 0.82. */
  quality?: number
}

export async function compressImage(
  file: File,
  opts: CompressOptions = {},
): Promise<File> {
  const { maxDimension = 1600, quality = 0.82 } = opts

  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file
  if (typeof document === 'undefined') return file

  try {
    const source = await loadImage(file)
    const srcW = (source as HTMLImageElement).naturalWidth || source.width
    const srcH = (source as HTMLImageElement).naturalHeight || source.height
    if (!srcW || !srcH) return file

    const scale = Math.min(1, maxDimension / Math.max(srcW, srcH))
    const w = Math.round(srcW * scale)
    const h = Math.round(srcH * scale)

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(source as CanvasImageSource, 0, 0, w, h)
    if ('close' in source) (source as ImageBitmap).close()

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', quality),
    )
    if (!blob || blob.size >= file.size) return file

    const base = file.name.replace(/\.[^.]+$/, '') || 'image'
    return new File([blob], `${base}.webp`, { type: 'image/webp' })
  } catch {
    return file
  }
}

async function loadImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file)
    } catch {
      // Fall through to the <img> path (e.g. browsers without createImageBitmap).
    }
  }
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = (e) => {
      URL.revokeObjectURL(url)
      reject(e)
    }
    img.src = url
  })
}
