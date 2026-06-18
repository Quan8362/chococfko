import { NextRequest } from 'next/server'
import { extractText, isOcrConfigured } from '@/lib/japanese/ocr'
import { translateText, isTranslateConfigured } from '@/lib/japanese/translate'
import { isProviderNotConfigured } from '@/lib/japanese/providerError'
import { readImageFromForm } from '@/lib/japanese/imageInput'
import { rateLimit, clientKey } from '@/lib/japanese/rateLimit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SUPPORTED_TARGETS = ['vi', 'en', 'ja', 'ko', 'zh']

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, 'jp-image-translate'), 12, 60_000)
  if (!rl.ok) {
    return Response.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  if (!isOcrConfigured()) {
    return Response.json({ ocr_configured: false, translate_configured: isTranslateConfigured() }, { status: 200 })
  }

  const img = await readImageFromForm(req)
  if (!img.ok) return Response.json({ error: img.error }, { status: 400 })

  // 1) OCR — extract the Japanese text.
  let sourceText = ''
  let blocks: { text: string }[] = []
  try {
    const ocr = await extractText(img.base64)
    sourceText = ocr.text
    blocks = ocr.blocks
  } catch (e) {
    if (isProviderNotConfigured(e)) {
      return Response.json({ ocr_configured: false, translate_configured: isTranslateConfigured() }, { status: 200 })
    }
    console.error('[jp-image-translate] ocr failed:', (e as Error)?.message)
    return Response.json({ error: 'ocr_failed' }, { status: 502 })
  }

  if (!sourceText.trim()) {
    return Response.json({ ocr_configured: true, translate_configured: isTranslateConfigured(), source_text: '', translation: '', blocks })
  }

  // Resolve target language (default Vietnamese).
  const requested = (req.nextUrl.searchParams.get('target') || 'vi').toLowerCase()
  const target = SUPPORTED_TARGETS.includes(requested) ? requested : 'vi'

  // 2) If target is Japanese, no translation needed — return the OCR text.
  if (target === 'ja') {
    return Response.json({
      ocr_configured: true,
      translate_configured: isTranslateConfigured(),
      source_text: sourceText,
      translation: sourceText,
      target,
      blocks,
    })
  }

  // 3) Translate — but still return OCR text if translation isn't available/fails.
  if (!isTranslateConfigured()) {
    return Response.json({
      ocr_configured: true,
      translate_configured: false,
      source_text: sourceText,
      translation: '',
      target,
      blocks,
    })
  }

  try {
    const tr = await translateText(sourceText, target, 'ja')
    return Response.json({
      ocr_configured: true,
      translate_configured: true,
      source_text: sourceText,
      translation: tr.text,
      detected_source: tr.detectedSource,
      target,
      blocks,
    })
  } catch (e) {
    if (isProviderNotConfigured(e)) {
      return Response.json({
        ocr_configured: true,
        translate_configured: false,
        source_text: sourceText,
        translation: '',
        target,
        blocks,
      })
    }
    console.error('[jp-image-translate] translate failed:', (e as Error)?.message)
    // Do not silently fail — return OCR text plus an explicit translate error.
    return Response.json({
      ocr_configured: true,
      translate_configured: true,
      source_text: sourceText,
      translation: '',
      target,
      blocks,
      error: 'translate_failed',
    }, { status: 200 })
  }
}
