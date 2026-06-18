import { NextRequest } from 'next/server'
import { extractText, isOcrConfigured } from '@/lib/japanese/ocr'
import { isProviderNotConfigured } from '@/lib/japanese/providerError'
import { readImageFromForm } from '@/lib/japanese/imageInput'
import { rateLimit, clientKey } from '@/lib/japanese/rateLimit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, 'jp-ocr'), 15, 60_000)
  if (!rl.ok) {
    return Response.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  if (!isOcrConfigured()) {
    return Response.json({ configured: false, text: '', blocks: [] }, { status: 200 })
  }

  const img = await readImageFromForm(req)
  if (!img.ok) return Response.json({ error: img.error }, { status: 400 })

  try {
    const result = await extractText(img.base64)
    return Response.json({
      configured: true,
      text: result.text,
      blocks: result.blocks,
      locale: result.locale,
    })
  } catch (e) {
    if (isProviderNotConfigured(e)) {
      return Response.json({ configured: false, text: '', blocks: [] }, { status: 200 })
    }
    // Never log full OCR content; surface a generic code only.
    console.error('[jp-ocr] extract failed:', (e as Error)?.message)
    return Response.json({ error: 'ocr_failed' }, { status: 502 })
  }
}
