import { unstable_cache } from 'next/cache'
import { createPublicClient } from '@/lib/supabase/public'
import { cleanMeaningText } from '@/lib/sanitize'
import { extractKanji } from '@/lib/japanese/kanji'
import type { JapaneseWord } from '@/components/japanese/WordCard'

export const SITE_URL = 'https://chococfko.com'
const FETCH_BATCH = 1000

/** Canonical/absolute URL for a dictionary word detail page. */
export function wordUrl(word: string): string {
  return `${SITE_URL}/japanese/dictionary/${encodeURIComponent(word)}`
}

/** Minimal row shape used by the sitemap. */
export interface WordSlug {
  word: string
  updated_at: string | null
}

/**
 * Page through every published word (word + updated_at) for the sitemap.
 * Cached for a day so crawler-driven sitemap hits don't re-query 15k rows.
 */
export const getAllPublishedWordSlugs = unstable_cache(
  async (): Promise<WordSlug[]> => {
    const supabase = createPublicClient()
    const all: WordSlug[] = []
    for (let from = 0; ; from += FETCH_BATCH) {
      const { data, error } = await supabase
        .from('japanese_words')
        .select('word,updated_at')
        .eq('is_published', true)
        .order('frequency', { ascending: false })
        .range(from, from + FETCH_BATCH - 1)
      if (error || !data || data.length === 0) break
      all.push(...(data as WordSlug[]))
      if (data.length < FETCH_BATCH) break
    }
    return all
  },
  ['sitemap-word-slugs'],
  { revalidate: 86400, tags: ['japanese-words'] },
)

/** Published grammar item ids (+ updated_at) for the sitemap. */
export const getAllPublishedGrammarIds = unstable_cache(
  async (): Promise<{ id: string; updated_at: string | null }[]> => {
    const supabase = createPublicClient()
    const all: { id: string; updated_at: string | null }[] = []
    for (let from = 0; ; from += FETCH_BATCH) {
      const { data, error } = await supabase
        .from('japanese_grammar')
        .select('id,updated_at')
        .eq('is_published', true)
        .range(from, from + FETCH_BATCH - 1)
      if (error || !data || data.length === 0) break
      all.push(...(data as { id: string; updated_at: string | null }[]))
      if (data.length < FETCH_BATCH) break
    }
    return all
  },
  ['sitemap-grammar-ids'],
  { revalidate: 86400, tags: ['japanese-grammar'] },
)

const WORD_DETAIL_COLUMNS =
  'id,word,reading,romaji,jlpt_level,pos,meanings,examples,tags,frequency,image_url,image_alt,image_source,image_credit_url,image_status,image_fetched_at'

/**
 * Fetch a single word for the detail page, matching on `word` then `reading`.
 * Cached per slug (revalidated daily) so repeat crawls are cheap. The result
 * has no per-user data, so it is safe to share across requests.
 */
export const getWordForDetail = unstable_cache(
  async (wordParam: string): Promise<JapaneseWord | null> => {
    const supabase = createPublicClient()

    const { data: byWord } = await supabase
      .from('japanese_words')
      .select(WORD_DETAIL_COLUMNS)
      .eq('word', wordParam)
      .eq('is_published', true)
      .limit(1)
      .maybeSingle()
    if (byWord) return byWord as JapaneseWord

    const { data: byReading } = await supabase
      .from('japanese_words')
      .select(WORD_DETAIL_COLUMNS)
      .eq('reading', wordParam)
      .eq('is_published', true)
      .limit(1)
      .maybeSingle()
    return (byReading as JapaneseWord | null) ?? null
  },
  ['word-detail'],
  { revalidate: 86400, tags: ['japanese-words'] },
)

const RELATED_COLUMNS = 'id,word,reading,romaji,jlpt_level,pos,meanings,examples,tags,frequency'

/** Same-level related words (excludes the current word). Cached daily. */
export const getRelatedWords = unstable_cache(
  async (level: string, excludeId: string): Promise<JapaneseWord[]> => {
    const supabase = createPublicClient()
    const { data } = await supabase
      .from('japanese_words')
      .select(RELATED_COLUMNS)
      .neq('id', excludeId)
      .eq('jlpt_level', level)
      .eq('is_published', true)
      .order('frequency', { ascending: false })
      .limit(6)
    return (data as JapaneseWord[]) ?? []
  },
  ['related-words'],
  { revalidate: 86400, tags: ['japanese-words'] },
)

/** First Vietnamese + English meaning text, cleaned of language-code prefixes. */
export function primaryMeanings(word: JapaneseWord): { vi: string; en: string } {
  const m = word.meanings?.[0]
  return { vi: cleanMeaningText(m?.vi), en: cleanMeaningText(m?.en) }
}

/**
 * Build a concise, locale-aware meta description for a word page.
 * Falls back gracefully when a meaning is missing.
 */
export function wordDescription(word: JapaneseWord, locale: string): string {
  const { vi, en } = primaryMeanings(word)
  const reading = word.reading && word.reading !== word.word ? ` (${word.reading})` : ''
  const meaning = locale === 'en' ? en || vi : vi || en
  const head = `${word.word}${reading}`
  if (meaning) {
    return locale === 'en'
      ? `${head} — ${meaning}. Japanese–Vietnamese dictionary entry with readings, examples and related words on Chợ Cóc FKO.`
      : `${head} — ${meaning}. Tra nghĩa, cách đọc, ví dụ và từ liên quan trong từ điển Nhật Việt Chợ Cóc FKO.`
  }
  return locale === 'en'
    ? `${head} — Japanese–Vietnamese dictionary entry on Chợ Cóc FKO.`
    : `Tra nghĩa từ ${head} trong từ điển Nhật Việt Chợ Cóc FKO.`
}

/** Keyword list derived from the word's own fields (word, reading, romaji, level, kanji). */
export function wordKeywords(word: JapaneseWord): string[] {
  const kanji = extractKanji(word.word)
  return [
    word.word,
    word.reading ?? '',
    word.romaji ?? '',
    word.jlpt_level ? `${word.jlpt_level} từ vựng` : '',
    'từ điển Nhật Việt',
    'tiếng Nhật',
    ...kanji,
    ...(word.tags ?? []),
  ].filter(Boolean)
}

/**
 * JSON-LD graph for a word page: a DefinedTerm (the entry) inside a
 * DefinedTermSet (the dictionary) plus a BreadcrumbList. Returned as a plain
 * object to embed via <script type="application/ld+json">.
 */
export function wordJsonLd(word: JapaneseWord, locale: string) {
  const url = wordUrl(word.word)
  const { vi, en } = primaryMeanings(word)
  const description = [vi, en].filter(Boolean).join(' / ')

  // undefined-valued keys are dropped automatically when JSON.stringify'd into
  // the <script type="application/ld+json"> tag, so we can leave them inline.
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'DefinedTerm',
        '@id': `${url}#term`,
        name: word.word,
        alternateName: word.reading && word.reading !== word.word ? word.reading : undefined,
        description: description || undefined,
        url,
        inLanguage: 'ja',
        educationalLevel: word.jlpt_level ? `JLPT ${word.jlpt_level}` : undefined,
        inDefinedTermSet: {
          '@type': 'DefinedTermSet',
          '@id': `${SITE_URL}/japanese/dictionary#set`,
          name: locale === 'en' ? 'Japanese–Vietnamese Dictionary' : 'Từ điển Nhật Việt',
          url: `${SITE_URL}/japanese/dictionary`,
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Tiếng Nhật', item: `${SITE_URL}/japanese` },
          { '@type': 'ListItem', position: 2, name: locale === 'en' ? 'Dictionary' : 'Từ điển', item: `${SITE_URL}/japanese/dictionary` },
          { '@type': 'ListItem', position: 3, name: word.word, item: url },
        ],
      },
    ],
  }
}
