// OCR provider abstraction.
//
// Picks a provider from `OCR_PROVIDER` (default: "google"). Swap or add
// providers here without touching the API routes or UI. Throws
// `ProviderNotConfiguredError` when the selected provider has no credentials so
// callers can show a friendly setup message instead of crashing.

import { ProviderNotConfiguredError } from './providerError'
import { googleVisionOcr, getVisionApiKey, type OcrBlock } from './vision'

export type { OcrBlock }

export interface OcrResult {
  text: string
  blocks: OcrBlock[]
  locale?: string
  provider: string
}

export function ocrProvider(): string {
  return (process.env.OCR_PROVIDER || 'google').toLowerCase()
}

export function isOcrConfigured(): boolean {
  const p = ocrProvider()
  if (p === 'none') return false
  if (p === 'google') return !!getVisionApiKey()
  return false
}

/** Extract Japanese text from a base64-encoded image (no data: prefix). */
export async function extractText(base64Image: string): Promise<OcrResult> {
  const p = ocrProvider()
  if (p === 'none') throw new ProviderNotConfiguredError('ocr')
  if (p === 'google') {
    const r = await googleVisionOcr(base64Image)
    return { ...r, provider: 'google' }
  }
  throw new ProviderNotConfiguredError(`ocr:${p}`)
}
