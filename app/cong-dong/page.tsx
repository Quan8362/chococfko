import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { getPostsFromDb } from '@/lib/posts'
import { checkIsAdmin } from '@/lib/supabase/admin'
import PostFeed from '@/components/PostFeed'

export async function generateMetadata() {
  const t = await getTranslations('meta')
  return { title: `${t('community')} · Chợ Cóc FKO` }
}
export const dynamic = 'force-dynamic'

export default async function CongDong() {
  const t = await getTranslations('community')
  const [dbPosts, isAdmin] = await Promise.all([getPostsFromDb(), checkIsAdmin()])
  const displayPosts = dbPosts ?? []

  return (
    <>
      {/* ── HERO ─────────────────────────────────────────────── */}
      <section className="relative pt-14 pb-4 overflow-hidden">
        {/* Subtle background blob */}
        <div className="absolute -top-[140px] -right-[110px] w-[400px] h-[400px] rounded-full bg-[radial-gradient(circle_at_35%_35%,rgba(194,24,91,0.09),transparent_60%)] pointer-events-none" />

        <div className="max-w-[1240px] mx-auto px-6 relative z-[1]">
          <div className="max-w-[680px] animate-fadeup">
            {/* Label */}
            <span className="inline-flex items-center gap-2 text-[11.5px] font-semibold tracking-[2.5px] uppercase text-rose mb-5 before:content-[''] before:w-6 before:h-px before:bg-rose/60">
              {t('label')}
            </span>

            {/* Heading */}
            <h1 className="font-serif font-bold text-[clamp(30px,4.2vw,50px)] leading-[1.12] tracking-[-0.5px] mb-5 text-ink">
              {t('heading')}
              <br />
              <em className="italic font-semibold text-rose not-italic">{t('heading_accent')}</em>{' '}
              {t('heading_suffix')}
            </h1>

            {/* Description */}
            <p className="text-[16px] text-muted max-w-[500px] mb-7 leading-[1.72]">
              {t('description')}
            </p>

            {/* CTAs */}
            <div className="flex gap-3 flex-wrap">
              <Link
                href="/cong-dong/viet-bai"
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
        </div>
      </section>

      {/* ── POSTS ────────────────────────────────────────────── */}
      <section id="chu-de" className="pt-6 pb-[60px] scroll-mt-24">
        <div className="max-w-[1240px] mx-auto px-6">
          {/* Section header */}
          <div className="flex items-end justify-between flex-wrap gap-3 mb-6">
            <div>
              <h2 className="font-serif text-[26px] font-bold tracking-[-0.3px] text-ink leading-tight">
                {t('latest_heading')}
              </h2>
              <p className="text-muted text-[13.5px] mt-1">
                {dbPosts
                  ? `${dbPosts.length} ${t('latest_sub_unit')}`
                  : t('latest_sub')}
              </p>
            </div>
            {dbPosts && dbPosts.length > 0 && (
              <Link
                href="/cong-dong/viet-bai"
                className="hidden sm:inline-flex items-center gap-1.5 text-[13px] font-semibold text-rose hover:text-rose-deep transition-colors"
              >
                {t('cta_write')}
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            )}
          </div>

          <PostFeed posts={displayPosts} isAdmin={isAdmin} />
        </div>
      </section>
    </>
  )
}
