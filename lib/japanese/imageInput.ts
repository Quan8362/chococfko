// Shared helper: read an uploaded image from a multipart form, validate its
// type/size, downscale it to bound OCR cost + payload, and return base64.
//
// The image is processed in memory and never persisted — buffers are discarded
// when the request finishes.

import Jimp from 'jimp'

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024 // 5MB
export const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_DIMENSION = 1600

export type ImageInputError = 'no_file' | 'invalid_type' | 'too_large' | 'decode_failed'

export interface ImageInputOk {
  ok: true
  base64: string
}
export interface ImageInputFail {
  ok: false
  error: ImageInputError
}

export async function readImageFromForm(req: Request): Promise<ImageInputOk | ImageInputFail> {
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return { ok: false, error: 'no_file' }
  }

  const file = form.get('image')
  if (!(file instanceof Blob) || file.size === 0) return { ok: false, error: 'no_file' }
  if (file.type && !ALLOWED_TYPES.includes(file.type)) return { ok: false, error: 'invalid_type' }
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: 'too_large' }

  const buffer = Buffer.from(await file.arrayBuffer())

  try {
    const image = await Jimp.read(buffer)
    if (Math.max(image.bitmap.width, image.bitmap.height) > MAX_DIMENSION) {
      image.scaleToFit(MAX_DIMENSION, MAX_DIMENSION)
    }
    const out = await image.quality(88).getBufferAsync(Jimp.MIME_JPEG)
    return { ok: true, base64: out.toString('base64') }
  } catch {
    return { ok: false, error: 'decode_failed' }
  }
}
