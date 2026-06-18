import type { MetadataRoute } from 'next'
import { getAllPlacesFromDb, places as staticPlaces } from '@/lib/places'
import {
  SITE_URL as BASE_URL,
  wordUrl,
  getAllPublishedWordSlugs,
  getAllPublishedGrammarIds,
} from '@/lib/japanese/seo'

// Regenerate the sitemap (and its cached DB queries) at most once a day.
export const revalidate = 86400

const JLPT_URL_LEVELS = ['n5', 'n4', 'n3', 'n2', 'n1'] as const
// Google caps a single sitemap at 50k URLs; chunk the 15k+ dictionary well under that.
const WORDS_PER_CHUNK = 5000

/**
 * Emit a sitemap index. Chunk 0 holds the core site + Japanese hub/level/grammar
 * pages; chunks 1..N each hold up to WORDS_PER_CHUNK dictionary word URLs.
 * Next serves the index at /sitemap.xml and the parts at /sitemap/<id>.xml.
 */
export async function generateSitemaps(): Promise<{ id: number }[]> {
  const slugs = await getAllPublishedWordSlugs()
  const wordChunks = Math.max(1, Math.ceil(slugs.length / WORDS_PER_CHUNK))
  return Array.from({ length: wordChunks + 1 }, (_, i) => ({ id: i }))
}

export default async function sitemap({ id }: { id: number }): Promise<MetadataRoute.Sitemap> {
  return id === 0 ? coreSitemap() : wordChunkSitemap(id - 1)
}

// ── Chunk 0: static routes + places + posts + Japanese learning pages ────────
async function coreSitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: BASE_URL,                          priority: 1.0,  changeFrequency: 'daily'   as const },
    { url: `${BASE_URL}/community`,           priority: 0.8,  changeFrequency: 'daily'   as const },
    { url: `${BASE_URL}/places`,              priority: 0.8,  changeFrequency: 'weekly'  as const },
    { url: `${BASE_URL}/marketplace`,         priority: 0.75, changeFrequency: 'daily'   as const },
    { url: `${BASE_URL}/tags`,                priority: 0.6,  changeFrequency: 'weekly'  as const },
    { url: `${BASE_URL}/map`,              priority: 0.7,  changeFrequency: 'weekly'  as const },
    { url: `${BASE_URL}/about`,          priority: 0.7,  changeFrequency: 'monthly' as const },
    { url: `${BASE_URL}/posting-guide`,  priority: 0.65, changeFrequency: 'monthly' as const },
    { url: `${BASE_URL}/feedback`,               priority: 0.5,  changeFrequency: 'yearly'  as const },
    { url: `${BASE_URL}/contact`,             priority: 0.5,  changeFrequency: 'yearly'  as const },
    { url: `${BASE_URL}/privacy-policy`,      priority: 0.4,  changeFrequency: 'yearly'  as const },
    { url: `${BASE_URL}/delete-data`,         priority: 0.4,  changeFrequency: 'yearly'  as const },
  ].map(r => ({ ...r, lastModified: now }))

  // Japanese learning hubs + per-level index pages (high crawl value)
  const japaneseHubs: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/japanese`,             priority: 0.9,  changeFrequency: 'weekly'  as const },
    { url: `${BASE_URL}/japanese/dictionary`,     priority: 0.9,  changeFrequency: 'daily'   as const },
    { url: `${BASE_URL}/japanese/vocabulary`,     priority: 0.85, changeFrequency: 'weekly'  as const },
    { url: `${BASE_URL}/japanese/kanji`,       priority: 0.8,  changeFrequency: 'weekly'  as const },
    { url: `${BASE_URL}/japanese/grammar`,    priority: 0.8,  changeFrequency: 'weekly'  as const },
    { url: `${BASE_URL}/japanese/flashcards`,   priority: 0.6,  changeFrequency: 'monthly' as const },
    { url: `${BASE_URL}/japanese/jlpt-mock-test`,     priority: 0.6,  changeFrequency: 'monthly' as const },
    { url: `${BASE_URL}/japanese/writing`,    priority: 0.6,  changeFrequency: 'monthly' as const },
    { url: `${BASE_URL}/japanese/practice`,   priority: 0.6,  changeFrequency: 'monthly' as const },
    { url: `${BASE_URL}/japanese/handwriting`,    priority: 0.6,  changeFrequency: 'monthly' as const },
    { url: `${BASE_URL}/japanese/image-translate`, priority: 0.6, changeFrequency: 'monthly' as const },
  ].map(r => ({ ...r, lastModified: now }))

  const levelPages: MetadataRoute.Sitemap = JLPT_URL_LEVELS.flatMap(lv => [
    { url: `${BASE_URL}/japanese/vocabulary/${lv}`,  priority: 0.8,  changeFrequency: 'weekly' as const, lastModified: now },
    { url: `${BASE_URL}/japanese/kanji/${lv}`,    priority: 0.75, changeFrequency: 'weekly' as const, lastModified: now },
    { url: `${BASE_URL}/japanese/grammar/${lv}`, priority: 0.75, changeFrequency: 'weekly' as const, lastModified: now },
  ])

  // Grammar detail pages
  let grammarRoutes: MetadataRoute.Sitemap = []
  try {
    const grammar = await getAllPublishedGrammarIds()
    grammarRoutes = grammar.map(g => ({
      url:             `${BASE_URL}/japanese/grammar/item/${g.id}`,
      lastModified:    new Date(g.updated_at ?? Date.now()),
      changeFrequency: 'monthly',
      priority:        0.6,
    }))
  } catch {
    // DB unavailable — keep the rest of the sitemap valid
  }

  // Place detail pages
  const allPlaces = (await getAllPlacesFromDb()) ?? staticPlaces
  const placeRoutes: MetadataRoute.Sitemap = allPlaces.map(p => ({
    url:             `${BASE_URL}/places/${p.slug}`,
    lastModified:    now,
    changeFrequency: 'monthly',
    priority:        0.7,
  }))

  // Approved community posts
  let postRoutes: MetadataRoute.Sitemap = []
  try {
    if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
      const { createClient } = await import('@/lib/supabase/server')
      const supabase = createClient()
      const { data } = await supabase
        .from('posts')
        .select('id, updated_at')
        .eq('status', 'approved')
        .order('updated_at', { ascending: false })
      if (data?.length) {
        postRoutes = data.map(p => ({
          url:             `${BASE_URL}/community/${p.id}`,
          lastModified:    new Date(p.updated_at ?? Date.now()),
          changeFrequency: 'weekly' as const,
          priority:        0.6,
        }))
      }
    }
  } catch {
    // Supabase unavailable — sitemap still works with static data
  }

  // Public tag pages — only tags actually in use (usage_count > 0), so empty
  // or invalid tag pages are never indexed.
  let tagRoutes: MetadataRoute.Sitemap = []
  try {
    if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
      const { createPublicClient } = await import('@/lib/supabase/public')
      const { getPopularTags } = await import('@/lib/tags')
      const tags = await getPopularTags(createPublicClient(), 5000)
      tagRoutes = tags.map(tg => ({
        url:             `${BASE_URL}/tags/${tg.slug}`,
        lastModified:    now,
        changeFrequency: 'weekly' as const,
        priority:        0.5,
      }))
    }
  } catch {
    // Tags table may not exist yet — keep the rest of the sitemap valid
  }

  return [...staticRoutes, ...japaneseHubs, ...levelPages, ...grammarRoutes, ...placeRoutes, ...postRoutes, ...tagRoutes]
}

// ── Chunks 1..N: dictionary word detail pages ────────────────────────────────
async function wordChunkSitemap(chunk: number): Promise<MetadataRoute.Sitemap> {
  const slugs = await getAllPublishedWordSlugs()
  const start = chunk * WORDS_PER_CHUNK
  return slugs.slice(start, start + WORDS_PER_CHUNK).map(s => ({
    url:             wordUrl(s.word),
    lastModified:    new Date(s.updated_at ?? Date.now()),
    changeFrequency: 'monthly',
    priority:        0.7,
  }))
}
