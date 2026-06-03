import type { MetadataRoute } from 'next'
import { getAllPlacesFromDb, places as staticPlaces } from '@/lib/places'

const BASE_URL = 'https://chococfko.com'

export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()

  // ── Static public routes ─────────────────────────────────────────────────
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: BASE_URL,                              priority: 1.0,  changeFrequency: 'daily'   as const },
    { url: `${BASE_URL}/cong-dong`,               priority: 0.9,  changeFrequency: 'daily'   as const },
    { url: `${BASE_URL}/ban-do`,                  priority: 0.85, changeFrequency: 'weekly'  as const },
    { url: `${BASE_URL}/gioi-thieu`,              priority: 0.7,  changeFrequency: 'monthly' as const },
    { url: `${BASE_URL}/huong-dan-viet-bai`,      priority: 0.65, changeFrequency: 'monthly' as const },
    { url: `${BASE_URL}/gop-y`,                   priority: 0.5,  changeFrequency: 'yearly'  as const },
    { url: `${BASE_URL}/lien-he`,                 priority: 0.5,  changeFrequency: 'yearly'  as const },
    { url: `${BASE_URL}/privacy-policy`,          priority: 0.4,  changeFrequency: 'yearly'  as const },
    { url: `${BASE_URL}/delete-data`,             priority: 0.4,  changeFrequency: 'yearly'  as const },
  ].map(r => ({ ...r, lastModified: now }))

  // ── Dynamic: place detail pages ──────────────────────────────────────────
  const allPlaces = (await getAllPlacesFromDb()) ?? staticPlaces
  const placeRoutes: MetadataRoute.Sitemap = allPlaces.map(p => ({
    url:             `${BASE_URL}/dia-diem/${p.slug}`,
    lastModified:    now,
    changeFrequency: 'monthly',
    priority:        0.75,
  }))

  // ── Dynamic: approved community posts ────────────────────────────────────
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
          url:             `${BASE_URL}/cong-dong/${p.id}`,
          lastModified:    new Date(p.updated_at ?? Date.now()),
          changeFrequency: 'weekly' as const,
          priority:        0.65,
        }))
      }
    }
  } catch {
    // Supabase unavailable — sitemap still works with static data
  }

  return [...staticRoutes, ...placeRoutes, ...postRoutes]
}
