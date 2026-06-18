// Low-level Google Cloud Vision REST client (TEXT_DETECTION).
//
// Uses an API key passed as a query param — the simplest server-side auth for
// the Vision REST API. The key is read from the environment and never sent to
// the browser. Enable "Cloud Vision API" on the Google Cloud project and create
// an API key restricted to that API.

import { ProviderNotConfiguredError } from './providerError'

const VISION_ENDPOINT = 'https://vision.googleapis.com/v1/images:annotate'

export interface OcrBlock {
  text: string
}

export interface VisionOcrResult {
  text: string
  blocks: OcrBlock[]
  locale?: string
}

/** Resolve the Vision API key (dedicated var first, then a shared Cloud key). */
export function getVisionApiKey(): string | undefined {
  return process.env.GOOGLE_VISION_API_KEY || process.env.GOOGLE_CLOUD_API_KEY
}

export async function googleVisionOcr(base64Image: string): Promise<VisionOcrResult> {
  const key = getVisionApiKey()
  if (!key) throw new ProviderNotConfiguredError('google-vision')

  const body = {
    requests: [
      {
        image: { content: base64Image },
        features: [{ type: 'TEXT_DETECTION', maxResults: 1 }],
        imageContext: { languageHints: ['ja'] },
      },
    ],
  }

  const res = await fetch(`${VISION_ENDPOINT}?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  })

  if (!res.ok) throw new Error(`vision_http_${res.status}`)

  const json = await res.json()
  const resp = json?.responses?.[0]
  if (resp?.error?.message) throw new Error(resp.error.message)

  const full: string =
    resp?.fullTextAnnotation?.text ??
    resp?.textAnnotations?.[0]?.description ??
    ''

  const blocks: OcrBlock[] = full
    ? full.split('\n').map(s => s.trim()).filter(Boolean).map(text => ({ text }))
    : []

  return {
    text: full.trim(),
    blocks,
    locale: resp?.textAnnotations?.[0]?.locale,
  }
}
