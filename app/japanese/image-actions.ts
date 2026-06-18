// Server-only: called from server components only.
// Fetches illustration images from Pexels/Pixabay and caches them in the DB.
//
// Selection priority (see getOrFetchWordImage):
//   1. Manually curated image_url already stored on the word.
//   2. Manual approval status ('approved') — always serve the stored image.
//   3. Curated search query for the specific word (CURATED_QUERIES).
//   4. Semantic query derived from the English/Vietnamese meaning.
//   5. No image — abstract words, or when no candidate passes the relevance check.
// A misleading image is never shown: every fetched candidate is scored against
// the word's meaning and only kept when its description actually overlaps.

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

// Curated, hand-tuned image search queries for words whose meaning the raw
// dictionary gloss illustrates poorly. Keyed by the Japanese word.
const CURATED_QUERIES: Record<string, string> = {
  '便利': 'convenient smartphone app daily life',
  '不便': 'inconvenient frustrated waiting',
  '大切': 'precious important treasure hands',
  '簡単': 'easy simple relaxed person',
  '難しい': 'difficult confused thinking problem',
  '高い': 'tall skyscraper height',
  '安い': 'cheap discount sale shopping',
  '多い': 'many crowd lots of people',
  '少ない': 'few empty almost nothing',
  '新しい': 'new modern brand new product',
  '古い': 'old vintage antique building',
  '早い': 'fast speed running motion',
  '遅い': 'slow snail late clock',
  '暑い': 'hot summer sun heat',
  '寒い': 'cold winter snow freezing',
  '好き': 'love like heart happy',
  '嫌い': 'dislike disgust unhappy face',
  '役に立つ': 'useful helpful tool',
  '使いやすい': 'easy to use friendly tool',
}

// Words ignored when scoring relevance (too generic to be discriminating).
const STOPWORDS = new Set([
  'to', 'a', 'an', 'the', 'of', 'for', 'and', 'or', 'in', 'on', 'with',
  'be', 'is', 'are', 'being', 'become', 'becomes', 'as', 'at', 'by', 'it',
  'that', 'this', 'such', 'very', 'more', 'most', 'etc', 'something',
  'someone', 'thing', 'things', 'one', 'sort', 'kind', 'way', 'do', 'does',
])

const RETRY_DAYS = 7

export type WordImageResult = {
  image_url: string | null
  image_alt: string | null
  image_source: string | null
  image_credit_url: string | null
  // True when the word is illustratable but no relevant image was found, so the
  // UI may show a clean "no suitable illustration" placeholder instead of nothing.
  show_placeholder?: boolean
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

type Candidate = {
  image_url: string
  image_alt: string | null
  image_source: string
  image_credit_url: string | null
}

const PIXABAY_TTL_MS = 20 * 3_600_000 // Pixabay webformatURLs expire after ~24h

export async function getOrFetchWordImage(word: WordInput): Promise<WordImageResult> {
  // Manually rejected — admin decided no image is suitable. Show placeholder.
  if (word.image_status === 'rejected') return emptyPlaceholder()

  // Already cached in DB
  if (word.image_url) {
    // A manually approved image is authoritative — always serve it, never re-fetch.
    if (word.image_status === 'approved') return fromCache(word)

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

    if (!isPixabayStale || !hasApiKeys) return fromCache(word)
    // Stale Pixabay URL + API keys available — fall through to re-fetch
  }

  const pexelsKey = process.env.PEXELS_API_KEY?.trim()
  const pixabayKey = process.env.PIXABAY_API_KEY?.trim()
  const hasApiKeys = !!(pexelsKey || pixabayKey)

  // Skip if recently tried and failed (avoid hammering the API)
  if (word.image_status === 'not_found' || word.image_status === 'error') {
    if (word.image_fetched_at) {
      const daysSince = (Date.now() - new Date(word.image_fetched_at).getTime()) / 86_400_000
      if (daysSince < RETRY_DAYS) return hasApiKeys ? emptyPlaceholder() : empty()
    }
  }

  // Skip abstract / grammar words — never show a placeholder for these.
  if (isAbstract(word)) return empty()

  const query = buildQuery(word)
  if (!query) return empty()

  if (!hasApiKeys) return empty()

  const provider = (process.env.IMAGE_PROVIDER ?? 'pexels').trim()
  // Token set the candidate's description must overlap with to be considered relevant.
  const relevanceTokens = buildRelevanceTokens(word, query)

  try {
    const candidates: Candidate[] = []

    if (provider === 'pexels' && pexelsKey) {
      candidates.push(...await fetchPexels(query, pexelsKey))
    }
    if (candidates.length === 0 && pixabayKey) {
      candidates.push(...await fetchPixabay(query, pixabayKey))
    }
    // Fallback: try pexels even when provider !== 'pexels' (e.g. provider=pixabay but no pixabay key)
    if (candidates.length === 0 && provider !== 'pexels' && pexelsKey) {
      candidates.push(...await fetchPexels(query, pexelsKey))
    }

    const best = pickRelevant(candidates, relevanceTokens)
    if (best) {
      const result: WordImageResult = {
        image_url: best.image_url,
        image_alt: best.image_alt,
        image_source: best.image_source,
        image_credit_url: best.image_credit_url,
      }
      await persistImage(word.id, result, query)
      return result
    }

    // Either no results, or none passed the relevance check — don't show a
    // misleading image. Persist as not_found so we back off for RETRY_DAYS.
    await persistStatus(word.id, 'not_found', query)
    return emptyPlaceholder()
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

function emptyPlaceholder(): WordImageResult {
  return { image_url: null, image_alt: null, image_source: null, image_credit_url: null, show_placeholder: true }
}

function fromCache(word: WordInput): WordImageResult {
  return {
    image_url: word.image_url ?? null,
    image_alt: word.image_alt ?? null,
    image_source: word.image_source ?? null,
    image_credit_url: word.image_credit_url ?? null,
  }
}

function isAbstract(word: WordInput): boolean {
  if (ABSTRACT_WORDS.has(word.word)) return true
  if (word.pos?.some(p => SKIP_POS.has(p))) return true
  return false
}

/** Split a gloss/description into lowercase comparable tokens (>=3 chars, no stopwords). */
function tokenize(text: string | null | undefined): string[] {
  if (!text) return []
  return text
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')        // drop parentheticals
    .split(/[^a-z]+/)
    .filter(t => t.length >= 3 && !STOPWORDS.has(t))
}

function buildQuery(word: WordInput): string | null {
  const curated = CURATED_QUERIES[word.word]
  if (curated) return curated

  // Prefer the first English sense — English gives better image search results.
  const en = firstSense(word.meanings?.[0]?.en)
  if (en && en.length > 1 && en.length < 60) return en

  const vi = firstSense(word.meanings?.[0]?.vi)
  if (vi && vi.length > 1 && vi.length < 60) return vi

  // Last resort: reading or word (may produce poor results for Japanese text)
  return word.reading ?? word.word ?? null
}

/** First gloss before a comma/semicolon, with a leading "to "/"a " stripped. */
function firstSense(text: string | null | undefined): string {
  if (!text) return ''
  const first = text.split(/[,;/]/)[0]?.trim() ?? ''
  return first.replace(/^\((.*?)\)\s*/, '').replace(/^(to|a|an|the)\s+/i, '').trim()
}

/** Tokens the chosen image's description must overlap with to count as relevant. */
function buildRelevanceTokens(word: WordInput, query: string): Set<string> {
  const tokens = new Set<string>()
  for (const t of tokenize(query)) tokens.add(t)
  for (const t of tokenize(word.meanings?.[0]?.en)) tokens.add(t)
  return tokens
}

/**
 * Pick the first candidate whose description overlaps the relevance tokens.
 * Matching is substring-based both ways so "eat" matches "eating" and vice versa.
 * If we have no usable relevance tokens at all, we cannot verify relevance, so we
 * conservatively reject everything (better no image than a misleading one).
 */
function pickRelevant(candidates: Candidate[], tokens: Set<string>): Candidate | null {
  if (tokens.size === 0) return null
  const wanted = Array.from(tokens)
  for (const c of candidates) {
    const altTokens = tokenize(c.image_alt)
    const hit = altTokens.some(a =>
      wanted.some(t => a === t || a.includes(t) || t.includes(a)),
    )
    if (hit) return c
  }
  return null
}

async function fetchPexels(query: string, apiKey: string): Promise<Candidate[]> {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=8&orientation=landscape`
  const res = await fetch(url, { headers: { Authorization: apiKey }, cache: 'no-store' })
  if (!res.ok) return []

  const data = await res.json() as {
    photos?: { src?: { medium?: string; large?: string }; alt?: string; url?: string }[]
  }
  return (data.photos ?? [])
    .map(p => ({
      image_url: p.src?.medium ?? p.src?.large ?? '',
      image_alt: p.alt ?? null,
      image_source: 'pexels',
      image_credit_url: p.url ?? null,
    }))
    .filter(c => c.image_url)
}

async function fetchPixabay(query: string, apiKey: string): Promise<Candidate[]> {
  const url = `https://pixabay.com/api/?key=${apiKey}&q=${encodeURIComponent(query)}&image_type=photo&orientation=horizontal&per_page=8&safesearch=true`
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) return []

  const data = await res.json() as {
    hits?: { webformatURL?: string; tags?: string; pageURL?: string }[]
  }
  return (data.hits ?? [])
    .map(h => ({
      image_url: h.webformatURL ?? '',
      image_alt: h.tags ?? null,
      image_source: 'pixabay',
      image_credit_url: h.pageURL ?? null,
    }))
    .filter(c => c.image_url)
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
