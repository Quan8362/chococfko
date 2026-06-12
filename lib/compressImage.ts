// Client-side image compression. Phones now shoot 5–12MB photos; instead of
// rejecting them we downscale + re-encode in the browser so the upload lands
// well under the size cap with no work from the user.

export type CompressOptions = {
  maxEdge?: number   // longest side in px after resize
  maxBytes?: number  // target max output size
  mimeType?: 'image/jpeg' | 'image/webp'
  quality?: number   // starting encoder quality (0–1)
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      // `from-image` applies EXIF orientation so portrait phone photos aren't rotated.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return await createImageBitmap(file, { imageOrientation: 'from-image' } as any)
    } catch { /* fall through to <img> */ }
  }
  return await new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image load failed')) }
    img.src = url
  })
}

export async function compressImage(file: File, opts: CompressOptions = {}): Promise<File> {
  const {
    maxEdge = 1920,
    maxBytes = 2.4 * 1024 * 1024,
    mimeType = 'image/jpeg',
    quality = 0.85,
  } = opts

  // Animated/vector formats can't be re-encoded losslessly via canvas — keep as-is.
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') {
    return file
  }

  let bitmap: ImageBitmap | HTMLImageElement
  try {
    bitmap = await loadBitmap(file)
  } catch {
    return file
  }

  const w0 = 'naturalWidth' in bitmap ? bitmap.naturalWidth : bitmap.width
  const h0 = 'naturalHeight' in bitmap ? bitmap.naturalHeight : bitmap.height

  // Already small + within edge → nothing to do.
  if (file.size <= maxBytes && Math.max(w0, h0) <= maxEdge) {
    if ('close' in bitmap) bitmap.close()
    return file
  }

  let scale = Math.min(1, maxEdge / Math.max(w0, h0))
  let q = quality
  let blob: Blob | null = null

  for (let attempt = 0; attempt < 8; attempt++) {
    const w = Math.max(1, Math.round(w0 * scale))
    const h = Math.max(1, Math.round(h0 * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) { if ('close' in bitmap) bitmap.close(); return file }
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, w, h)

    blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, mimeType, q))
    if (!blob) { if ('close' in bitmap) bitmap.close(); return file }
    if (blob.size <= maxBytes) break

    // Drop quality first, then dimensions once quality is already low.
    if (q > 0.5) q = Math.max(0.4, q - 0.12)
    else scale *= 0.82
  }

  if ('close' in bitmap) bitmap.close()
  if (!blob) return file

  const ext = mimeType === 'image/webp' ? 'webp' : 'jpg'
  const name = file.name.replace(/\.[^.]+$/, '') + '.' + ext
  return new File([blob], name, { type: mimeType, lastModified: Date.now() })
}
