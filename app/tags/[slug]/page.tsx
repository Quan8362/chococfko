import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { createPublicClient } from '@/lib/supabase/public'
import { getTagBySlug } from '@/lib/tags'
import { getApprovedTagContent } from '@/lib/tagContent'
import { getAllPlacesFromDb, places as staticPlaces, type Place } from '@/lib/places'
import { getPostFromDb, type Post } from '@/lib/posts'
import { getListingById } from '@/lib/marketplace-data'
import type { Listing } from '@/lib/marketplace'
import { SITE_URL, SITE_NAME } from '@/lib/seo'
import PlaceCard from '@/components/PlaceCard'
import PlacePostCard from '@/components/PlacePostCard'
import ListingCard from '@/components/marketplace/ListingCard'
import TagFilter from '@/components/tags/TagFilter'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 12
type TabKey = 'all' | 'place' | 'post' | 'listing'

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const tag = await getTagBySlug(createPublicClient(), params.slug)
  if (!tag) return { title: SITE_NAME, robots: { index: false, follow: true } }
  const t = await getTranslations('tags')
  const canonical = `${SITE_URL}/tags/${tag.slug}`
  const description = t('metaDescription', { tag: tag.name })
  const title = `${tag.name} · ${t('relatedContent')} | ${SITE_NAME}`
  return {
    title,
    description,
    keywords: [tag.name],
    alternates: { canonical },
    openGraph: { type: 'website', url: canonical, siteName: SITE_NAME, title, description },
  }
}

async function resolvePlaces(slugs: string[], locale: string): Promise<Place[]> {
  if (!slugs.length) return []
  const all = (await getAllPlacesFromDb(locale)) ?? staticPlaces
  const map = new Map(all.map((p) => [p.slug, p]))
  return slugs.map((s) => map.get(s)).filter((p): p is Place => !!p)
}

async function resolvePosts(ids: string[]): Promise<Post[]> {
  if (!ids.length) return []
  const rows = await Promise.all(ids.map((id) => getPostFromDb(id)))
  return rows.filter((p): p is Post => !!p)
}

async function resolveListings(ids: string[]): Promise<Listing[]> {
  if (!ids.length) return []
  const rows = await Promise.all(ids.map((id) => getListingById(id)))
  return rows.filter((l): l is Listing => !!l)
}

export default async function TagPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: { type?: string; page?: string }
}) {
  const [tag, t, locale] = await Promise.all([
    getTagBySlug(createClient(), params.slug),
    getTranslations('tags'),
    getLocale(),
  ])
  if (!tag) notFound()

  const ids = await getApprovedTagContent(createClient(), tag.id)
  const counts: Record<TabKey, number> = {
    all: ids.place.length + ids.post.length + ids.listing.length,
    place: ids.place.length,
    post: ids.post.length,
    listing: ids.listing.length,
  }

  const typeParam = searchParams.type
  const active: TabKey =
    typeParam === 'place' || typeParam === 'post' || typeParam === 'listing' ? typeParam : 'all'
  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10) || 1)

  return (
    <div className="max-w-[1100px] mx-auto px-5 sm:px-6 py-10 pb-20">
      <Link
        href="/tags"
        className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-rose transition-colors mb-5"
      >
        ← {t('browse')}
      </Link>

      <h1 className="font-serif font-black text-[clamp(26px,4vw,40px)] tracking-[-0.5px] text-ink mb-1.5">
        #{tag.name}
      </h1>
      <p className="text-[14px] text-muted mb-6">
        {t('relatedContent')} · {t('resultCount', { count: counts.all })}
      </p>

      {counts.all === 0 ? (
        <div className="bg-paper border border-dashed border-line rounded-2xl p-10 text-center">
          <p className="text-[15px] text-muted">{t('emptyState')}</p>
        </div>
      ) : (
        <>
          <div className="mb-7">
            <TagFilter active={active} counts={counts} />
          </div>

          {(active === 'all' || active === 'place') && counts.place > 0 && (
            <Section
              title={t('places')}
              viewAll={active === 'all' && counts.place > PAGE_SIZE ? `/tags/${tag.slug}?type=place` : undefined}
              viewAllLabel={t('viewAll')}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {(await resolvePlaces(slice(ids.place, active === 'place' ? page : 1, active), locale)).map(
                  (p) => <PlaceCard key={p.slug} place={p} />,
                )}
              </div>
              {active === 'place' && (
                <Pager slug={tag.slug} type="place" page={page} total={counts.place} t={t} />
              )}
            </Section>
          )}

          {(active === 'all' || active === 'post') && counts.post > 0 && (
            <Section
              title={t('community')}
              viewAll={active === 'all' && counts.post > PAGE_SIZE ? `/tags/${tag.slug}?type=post` : undefined}
              viewAllLabel={t('viewAll')}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {(await resolvePosts(slice(ids.post, active === 'post' ? page : 1, active))).map((p) => (
                  <PlacePostCard key={p.id} post={p} />
                ))}
              </div>
              {active === 'post' && (
                <Pager slug={tag.slug} type="post" page={page} total={counts.post} t={t} />
              )}
            </Section>
          )}

          {(active === 'all' || active === 'listing') && counts.listing > 0 && (
            <Section
              title={t('marketplace')}
              viewAll={active === 'all' && counts.listing > PAGE_SIZE ? `/tags/${tag.slug}?type=listing` : undefined}
              viewAllLabel={t('viewAll')}
            >
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {(await resolveListings(slice(ids.listing, active === 'listing' ? page : 1, active))).map(
                  (l) => <ListingCard key={l.id} listing={l} />,
                )}
              </div>
              {active === 'listing' && (
                <Pager slug={tag.slug} type="listing" page={page} total={counts.listing} t={t} />
              )}
            </Section>
          )}
        </>
      )}
    </div>
  )
}

/** Slice ids for the current view: in "all" mode cap each section; otherwise paginate. */
function slice(ids: string[], page: number, active: TabKey): string[] {
  if (active === 'all') return ids.slice(0, PAGE_SIZE)
  const start = (page - 1) * PAGE_SIZE
  return ids.slice(start, start + PAGE_SIZE)
}

function Section({
  title,
  viewAll,
  viewAllLabel,
  children,
}: {
  title: string
  viewAll?: string
  viewAllLabel: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-10">
      <div className="flex items-center justify-between gap-4 mb-4">
        <h2 className="font-serif font-bold text-[20px] text-ink">{title}</h2>
        {viewAll && (
          <Link href={viewAll} className="text-[13px] font-semibold text-rose hover:underline">
            {viewAllLabel} →
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}

function Pager({
  slug,
  type,
  page,
  total,
  t,
}: {
  slug: string
  type: string
  page: number
  total: number
  t: Awaited<ReturnType<typeof getTranslations>>
}) {
  const pages = Math.ceil(total / PAGE_SIZE)
  if (pages <= 1) return null
  return (
    <div className="flex items-center justify-center gap-3 mt-7">
      {page > 1 && (
        <Link
          href={`/tags/${slug}?type=${type}&page=${page - 1}`}
          className="px-4 py-2 rounded-full border border-line text-[13px] font-semibold text-muted hover:text-rose hover:border-rose/40 transition-colors"
        >
          ← {t('prev')}
        </Link>
      )}
      <span className="text-[13px] text-muted">
        {page} / {pages}
      </span>
      {page < pages && (
        <Link
          href={`/tags/${slug}?type=${type}&page=${page + 1}`}
          className="px-4 py-2 rounded-full border border-line text-[13px] font-semibold text-muted hover:text-rose hover:border-rose/40 transition-colors"
        >
          {t('next')} →
        </Link>
      )}
    </div>
  )
}
