import { Suspense } from 'react'
import Link from 'next/link'
import type { Metadata } from 'next'
import { getTranslations, getLocale } from 'next-intl/server'
import { getPostsFromDb } from '@/lib/posts'
import { checkIsAdmin } from '@/lib/supabase/admin'
import PostFeed from '@/components/PostFeed'
import { SITE_URL, SITE_NAME, DEFAULT_OG_IMAGE, OG_LOCALE, breadcrumbJsonLd, jsonLdString } from '@/lib/seo'

const CANONICAL = `${SITE_URL}/community`

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([getTranslations('meta'), getLocale()])
  const title = t('community')
  const description = t('community_description')
  return {
    title,
    description,
    keywords: t('community_keywords').split(',').map(k => k.trim()).filter(Boolean),
    alternates: { canonical: CANONICAL },
    openGraph: {
      type: 'website',
      url: CANONICAL,
      locale: OG_LOCALE[locale] ?? 'vi_VN',
      siteName: SITE_NAME,
      title: `${title} · ${SITE_NAME}`,
      description,
      images: [{ url: DEFAULT_OG_IMAGE }],
    },
    twitter: { card: 'summary_large_image', title: `${title} · ${SITE_NAME}`, description, images: [DEFAULT_OG_IMAGE] },
  }
}
export const dynamic = 'force-dynamic'

// Community topics shown as "what you can share" suggestion cards in the hero.
// These are NOT filters — the active filtering UI lives in PostFeed.
const HERO_TOPICS = [
  { topic: 'life',      key: 'cat_life',      desc: 'cat_life_desc',      emoji: '🏠' },
  { topic: 'paperwork', key: 'cat_paperwork', desc: 'cat_paperwork_desc', emoji: '📋' },
  { topic: 'transport', key: 'cat_transport', desc: 'cat_transport_desc', emoji: '🚃' },
  { topic: 'study',     key: 'cat_study',     desc: 'cat_study_desc',     emoji: '📚' },
  { topic: 'work',      key: 'cat_work',      desc: 'cat_work_desc',      emoji: '💼' },
  { topic: 'story',     key: 'cat_story',     desc: 'cat_story_desc',     emoji: '💬' },
] as const

function TopicCard({ emoji, title, desc, topic }: { emoji: string; title: string; desc: string; topic: string }) {
  return (
    <Link
      href={`/community?topic=${topic}#chu-de`}
      className="group block bg-cream/70 border border-line/70 rounded-2xl p-4 shadow-[0_2px_12px_-8px_rgba(60,40,30,0.55)] hover:bg-paper hover:border-rose/30 hover:shadow-card-hover hover:-translate-y-0.5 transition-all"
    >
      <span className="block text-[22px] mb-2 leading-none">{emoji}</span>
      <span className="block font-semibold text-[13px] text-ink leading-tight mb-1 group-hover:text-rose transition-colors">
        {title}
      </span>
      <span className="block text-[11.5px] text-muted leading-snug">{desc}</span>
    </Link>
  )
}

export default async function CongDong() {
  const t = await getTranslations('community')
  const tMeta = await getTranslations('meta')
  const [dbPosts, isAdmin] = await Promise.all([getPostsFromDb(), checkIsAdmin()])
  const displayPosts = dbPosts ?? []

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${CANONICAL}#page`,
        url: CANONICAL,
        name: `${tMeta('community')} · ${SITE_NAME}`,
        description: tMeta('community_description'),
        isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL },
      },
      breadcrumbJsonLd([
        { name: SITE_NAME, path: '/' },
        { name: tMeta('community'), path: '/community' },
      ]),
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />

      {/* ── HERO ─────────────────────────────────────────────── */}
      <section className="relative pt-14 pb-4 overflow-hidden">
        {/* Subtle background blob */}
        <div className="absolute -top-[140px] -right-[110px] w-[400px] h-[400px] rounded-full bg-[radial-gradient(circle_at_35%_35%,rgba(194,24,91,0.09),transparent_60%)] pointer-events-none" />

        <div className="max-w-[1240px] mx-auto px-6 relative z-[1]">
          <div className="grid lg:grid-cols-[minmax(0,1fr)_420px] gap-12 items-center">
          <div className="max-w-[680px] animate-fadeup">
            {/* Label */}
            <span className="inline-flex items-center gap-2 text-[11.5px] font-semibold tracking-[2.5px] uppercase text-rose mb-5 before:content-[''] before:w-6 before:h-px before:bg-rose/60">
              {t('label')}
            </span>

            {/* Heading */}
            <h1 className="font-serif font-bold text-[clamp(28px,3.8vw,44px)] leading-[1.18] tracking-[-0.5px] mb-5 text-ink [text-wrap:balance]">
              {t('heading')}{' '}
              <em className="not-italic font-semibold text-rose">{t('heading_accent')}</em>{' '}
              {t('heading_suffix')}
            </h1>

            {/* Description */}
            <p className="text-[16px] text-muted max-w-[500px] mb-7 leading-[1.72]">
              {t('description')}
            </p>

            {/* CTAs */}
            <div className="flex gap-3 flex-wrap">
              <Link
                href="/community/write"
                className="inline-flex items-center gap-2 font-semibold text-[14px] px-6 py-[11px] rounded-full bg-rose text-white shadow-[0_4px_14px_-4px_rgba(194,24,91,0.45)] hover:bg-rose-deep hover:-translate-y-px transition-all"
              >
                {t('cta_write')}
              </Link>
              <Link
                href="#chu-de"
                className="inline-flex items-center font-semibold text-[14px] px-6 py-[11px] rounded-full border border-[#c8b8a8] text-[#5c4d44] hover:border-ink hover:bg-ink hover:text-cream transition-all"
              >
                {t('cta_explore')}
              </Link>
            </div>
          </div>

          {/* Right: "what you can share" suggestion cards (not filters) */}
          <div className="hidden lg:block animate-fadeup">
            <p className="text-[11.5px] font-semibold uppercase tracking-[2px] text-rose/80 mb-4 pl-0.5">
              {t('share_intro')}
            </p>
            <div className="grid grid-cols-2 gap-3.5">
              {HERO_TOPICS.map((tp) => (
                <TopicCard
                  key={tp.topic}
                  emoji={tp.emoji}
                  title={t(tp.key)}
                  desc={t(tp.desc)}
                  topic={tp.topic}
                />
              ))}
            </div>
          </div>
          </div>
        </div>
      </section>

      {/* ── POSTS ────────────────────────────────────────────── */}
      <section id="chu-de" className="pt-6 pb-[60px] scroll-mt-24">
        <div className="max-w-[1240px] mx-auto px-6">
          {/* Section header */}
          <div className="mb-6">
            <h2 className="font-serif text-[26px] font-bold tracking-[-0.3px] text-ink leading-tight">
              {t('latest_heading')}
            </h2>
            <p className="text-muted text-[13.5px] mt-1">
              {dbPosts
                ? `${dbPosts.length} ${t('latest_sub_unit')}`
                : t('latest_sub')}
            </p>
          </div>

          <Suspense fallback={null}>
            <PostFeed posts={displayPosts} isAdmin={isAdmin} />
          </Suspense>
        </div>
      </section>
    </>
  )
}
