// Server-only: called from server components only.
// Fetches illustration images from Pexels/Pixabay and caches them in the DB.

import { createAdminClient } from '@/lib/supabase/admin'

// Part-of-speech values that are too abstract to illustrate
const SKIP_POS = new Set(['particle', 'conjunction', 'auxiliary'])

// Common abstract function words that have no meaningful visual representation
const ABSTRACT_WORDS = new Set([
  'こと', 'もの', 'ため', 'ように', 'について', 'しかし', 'そして',
  'から', 'ので', 'だけ', 'ほど', 'まで', 'ながら', 'ても', 'けど',
  'が', 'は', 'を', 'に', 'で', 'と', 'も', 'の', 'へ', 'か',
  'や', 'ね', 'よ', 'わ', 'な', 'ば', 'し', 'て', 'で',
])

const RETRY_DAYS = 7

export type WordImageResult = {
  image_url: string | null
  image_alt: string | null
  image_source: string | null
  image_credit_url: string | null
}

type WordInput = {
  id: string
  word: string
  reading?: string | null
  meanings?: { vi: string; en: string }[] | null
  pos?: string[] | null
  image_url?: string | null
  image_alt?: string | null
  image_source?: string | null
  image_credit_url?: string | null
  image_status?: string | null
  image_fetched_at?: string | null
}

const PIXABAY_TTL_MS = 20 * 3_600_000 // Pixabay webformatURLs expire after ~24h

export async function getOrFetchWordImage(word: WordInput): Promise<WordImageResult> {
  // Already cached in DB
  if (word.image_url) {
    // Pixabay webformatURLs expire after ~24h. Only bypass cache when API keys
    // are available so we can actually replace the URL; otherwise keep serving
    // the cached URL (browser onError will clear it if it truly expired).
    const isPixabayStale =
      word.image_source === 'pixabay' &&
      word.image_fetched_at != null &&
      Date.now() - new Date(word.image_fetched_at).getTime() > PIXABAY_TTL_MS

    const hasApiKeys = !!(
      process.env.PEXELS_API_KEY?.trim() ||
      process.env.PIXABAY_API_KEY?.trim()
    )

    if (!isPixabayStale || !hasApiKeys) {
      return {
        image_url: word.image_url,
        image_alt: word.image_alt ?? null,
        image_source: word.image_source ?? null,
        image_credit_url: word.image_credit_url ?? null,
      }
    }
    // Stale Pixabay URL + API keys available — fall through to re-fetch
  }

  // Skip if recently tried and failed (avoid hammering the API)
  if (word.image_status === 'not_found' || word.image_status === 'error') {
    if (word.image_fetched_at) {
      const daysSince = (Date.now() - new Date(word.image_fetched_at).getTime()) / 86_400_000
      if (daysSince < RETRY_DAYS) return empty()
    }
  }

  // Skip abstract / grammar words
  if (isAbstract(word)) return empty()

  const query = buildQuery(word)
  if (!query) return empty()

  const pexelsKey = process.env.PEXELS_API_KEY?.trim()
  const pixabayKey = process.env.PIXABAY_API_KEY?.trim()
  const provider = (process.env.IMAGE_PROVIDER ?? 'pexels').trim()

  if (!pexelsKey && !pixabayKey) return empty()

  try {
    let result: WordImageResult | null = null

    if (provider === 'pexels' && pexelsKey) {
      result = await callPexels(query, pexelsKey)
    }
    if (!result && pixabayKey) {
      result = await callPixabay(query, pixabayKey)
    }
    // Fallback: try pexels even when provider !== 'pexels' (e.g. provider=pixabay but no pixabay key)
    if (!result && provider !== 'pexels' && pexelsKey) {
      result = await callPexels(query, pexelsKey)
    }

    if (result?.image_url) {
      await persistImage(word.id, result, query)
      return result
    }

    await persistStatus(word.id, 'not_found', query)
    return empty()
  } catch (err) {
    console.error('[image-actions] fetch error:', err)
    await persistStatus(word.id, 'error', query)
    return empty()
  }
}

// ── Helpers ──────────────────────────────────────────────────

function empty(): WordImageResult {
  return { image_url: null, image_alt: null, image_source: null, image_credit_url: null }
}

function isAbstract(word: WordInput): boolean {
  if (ABSTRACT_WORDS.has(word.word)) return true
  if (word.pos?.some(p => SKIP_POS.has(p))) return true
  return false
}

function buildQuery(word: WordInput): string | null {
  // Prefer meaning_en — English gives better image search results
  const en = word.meanings?.[0]?.en?.trim()
  if (en && en.length > 1 && en.length < 60) return en

  const vi = word.meanings?.[0]?.vi?.trim()
  if (vi && vi.length > 1 && vi.length < 60) return vi

  // Last resort: reading or word (may produce poor results for Japanese text)
  return word.reading ?? word.word ?? null
}

async function callPexels(query: string, apiKey: string): Promise<WordImageResult | null> {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`
  const res = await fetch(url, {
    headers: { Authorization: apiKey },
    cache: 'no-store',
  })
  if (!res.ok) return null

  const data = await res.json() as {
    photos?: { src?: { medium?: string; large?: string }; alt?: string; url?: string }[]
  }
  const photo = data.photos?.[0]
  if (!photo) return null

  return {
    image_url: photo.src?.medium ?? photo.src?.large ?? null,
    image_alt: photo.alt ?? null,
    image_source: 'pexels',
    image_credit_url: photo.url ?? null,
  }
}

async function callPixabay(query: string, apiKey: string): Promise<WordImageResult | null> {
  const url = `https://pixabay.com/api/?key=${apiKey}&q=${encodeURIComponent(query)}&image_type=photo&orientation=horizontal&per_page=3&safesearch=true`
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) return null

  const data = await res.json() as {
    hits?: { webformatURL?: string; tags?: string; pageURL?: string }[]
  }
  const hit = data.hits?.[0]
  if (!hit) return null

  return {
    image_url: hit.webformatURL ?? null,
    image_alt: hit.tags ?? null,
    image_source: 'pixabay',
    image_credit_url: hit.pageURL ?? null,
  }
}

async function persistImage(wordId: string, data: WordImageResult, query: string) {
  try {
    const admin = createAdminClient()
    await admin.from('japanese_words').update({
      image_url: data.image_url,
      image_alt: data.image_alt,
      image_source: data.image_source,
      image_credit_url: data.image_credit_url,
      image_query: query,
      image_fetched_at: new Date().toISOString(),
      image_status: 'found',
    }).eq('id', wordId)
  } catch (err) {
    console.error('[image-actions] DB persist error:', err)
  }
}

async function persistStatus(wordId: string, status: string, query: string) {
  try {
    const admin = createAdminClient()
    await admin.from('japanese_words').update({
      image_status: status,
      image_query: query,
      image_fetched_at: new Date().toISOString(),
    }).eq('id', wordId)
  } catch (err) {
    console.error('[image-actions] DB status error:', err)
  }
}
