// Translation provider abstraction.
//
// Picks a provider from `TRANSLATE_PROVIDER` (default: "google"). Throws
// `ProviderNotConfiguredError` when no credentials are present. The Google
// Cloud Translation v2 REST API is used with a server-side API key.

import { ProviderNotConfiguredError } from './providerError'

const GT_ENDPOINT = 'https://translation.googleapis.com/language/translate/v2'

export interface TranslateResult {
  text: string
  detectedSource?: string
  provider: string
}

export function translateProvider(): string {
  return (process.env.TRANSLATE_PROVIDER || 'google').toLowerCase()
}

function getTranslateApiKey(): string | undefined {
  return process.env.GOOGLE_TRANSLATE_API_KEY || process.env.GOOGLE_CLOUD_API_KEY
}

export function isTranslateConfigured(): boolean {
  const p = translateProvider()
  if (p === 'none') return false
  if (p === 'google') return !!getTranslateApiKey()
  return false
}

/**
 * Translate `text` into `target` (ISO code: vi, en, ja, ko, zh).
 * `source` is optional — providers auto-detect when omitted.
 */
export async function translateText(
  text: string,
  target: string,
  source?: string,
): Promise<TranslateResult> {
  const p = translateProvider()
  if (p === 'none') throw new ProviderNotConfiguredError('translate')
  if (p === 'google') {
    const key = getTranslateApiKey()
    if (!key) throw new ProviderNotConfiguredError('google-translate')

    const params = new URLSearchParams({ key, q: text, target, format: 'text' })
    if (source) params.set('source', source)

    const res = await fetch(GT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`translate_http_${res.status}`)

    const json = await res.json()
    const tr = json?.data?.translations?.[0]
    return {
      text: decodeEntities(tr?.translatedText ?? ''),
      detectedSource: tr?.detectedSourceLanguage,
      provider: 'google',
    }
  }
  throw new ProviderNotConfiguredError(`translate:${p}`)
}

// The v2 API HTML-escapes some characters even with format=text; undo the common ones.
function decodeEntities(s: string): string {
  return s
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}
