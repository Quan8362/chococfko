import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { getAllPlacesFromDb, places as staticPlaces } from '@/lib/places'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('about')
  const description = t('meta_description')
  return {
    title: t('title'),
    description,
    openGraph: { title: t('title'), description },
  }
}

const SECTIONS = [
  { key: 's1', icon: '🗺️' },
  { key: 's2', icon: '🤝' },
  { key: 's3', icon: '💡' },
] as const

// Find / Know / Open are brand words — kept identical across all languages.
const FKO_CARDS = [
  { word: 'Find', icon: '🔍', descKey: 'fko_find_desc' },
  { word: 'Know', icon: '📚', descKey: 'fko_know_desc' },
  { word: 'Open', icon: '🤝', descKey: 'fko_open_desc' },
] as const

async function getApprovedPostCount(): Promise<number> {
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return 0
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = createClient()
    const { count } = await supabase
      .from('posts')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'approved')
    return count ?? 0
  } catch {
    return 0
  }
}

export default async function GioiThieu() {
  const t = await getTranslations('about')

  const [dbPlaces, postCount] = await Promise.all([
    getAllPlacesFromDb(),
    getApprovedPostCount(),
  ])
  const placeCount = (dbPlaces ?? staticPlaces).length

  return (
    <div className="min-h-[calc(100vh-160px)] py-16 px-6">
      <div className="max-w-[780px] mx-auto">

        {/* Breadcrumb */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-rose transition-colors mb-10"
        >
          {t('back')}
        </Link>

        {/* Hero */}
        <div className="mb-14">
          <span className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[2.5px] uppercase text-rose mb-5 before:content-[''] before:w-5 before:h-px before:bg-rose/60 after:content-[''] after:w-5 after:h-px after:bg-rose/60">
            {t('label')}
          </span>
          <h1 className="font-serif font-black text-[clamp(32px,5vw,58px)] leading-[1.08] tracking-[-0.5px] text-ink mb-5">
            {t('heading')}{' '}
            <em className="italic text-rose not-italic">{t('heading_accent')}</em>
          </h1>
          <p className="text-[17px] text-muted leading-[1.78] max-w-[540px]">
            {t('intro')}
          </p>
        </div>

        {/* Stats strip */}
        <div className="flex flex-wrap gap-5 mb-14">
          {[
            { icon: '📍', label: t('stat_places_label'), value: String(placeCount) },
            { icon: '✍️', label: t('stat_posts_label'),  value: postCount > 0 ? String(postCount) : '∞' },
            { icon: '🌏', label: t('stat_langs_label'),  value: t('stat_langs_value') },
          ].map(({ icon, label, value }) => (
            <div key={label} className="flex items-center gap-3 bg-paper border border-line rounded-2xl px-5 py-4 shadow-card flex-1 min-w-[120px]">
              <span className="text-[22px]">{icon}</span>
              <div>
                <b className="font-serif text-[22px] font-bold text-rose-deep block leading-none">{value}</b>
                <span className="text-[12px] text-muted">{label}</span>
              </div>
            </div>
          ))}
        </div>

        {/* FKO meaning */}
        <div className="mb-14">
          <div className="text-center mb-8">
            <h2 className="font-serif font-black text-[clamp(24px,3.5vw,34px)] tracking-[-0.4px] text-ink mb-3">
              {t('fko_title')}
            </h2>
            <p className="text-[15px] text-muted leading-[1.7] max-w-[560px] mx-auto">
              {t('fko_sub')}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {FKO_CARDS.map(({ word, icon, descKey }) => (
              <div
                key={word}
                className="bg-paper border border-line rounded-2xl p-6 shadow-card hover:border-rose/30 hover:-translate-y-0.5 transition-all text-center"
              >
                <div className="w-14 h-14 rounded-2xl bg-rose/10 border border-rose/15 text-[26px] grid place-items-center mx-auto mb-4">
                  {icon}
                </div>
                <h3 className="font-serif font-bold text-[22px] text-rose-deep mb-2.5">{word}</h3>
                <p className="text-[14px] text-muted leading-[1.7]">
                  {t(descKey as Parameters<typeof t>[0])}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Sections */}
        <div className="space-y-5 mb-14">
          {SECTIONS.map(({ key, icon }) => (
            <div
              key={key}
              className="flex gap-5 bg-paper border border-line rounded-2xl p-6 shadow-card hover:border-rose/30 transition-colors"
            >
              <div className="flex-none w-12 h-12 rounded-xl bg-rose/10 border border-rose/15 text-[22px] grid place-items-center">
                {icon}
              </div>
              <div>
                <h2 className="font-serif font-bold text-[18px] text-ink mb-2">
                  {t(`${key}_title` as Parameters<typeof t>[0])}
                </h2>
                <p className="text-[14.5px] text-muted leading-[1.72]">
                  {t(`${key}_desc` as Parameters<typeof t>[0])}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="bg-[linear-gradient(135deg,#9d1248_0%,#c2185b_100%)] rounded-2xl py-10 px-7 text-center text-white">
          <p className="font-serif text-[20px] font-bold mb-2 leading-snug">
            {t('cta_heading')}
          </p>
          <p className="text-white/70 text-[14.5px] mb-7">
            {t('cta_sub')}
          </p>
          <Link
            href="/community/write"
            className="inline-flex items-center gap-2 font-semibold text-[14px] px-7 py-3 rounded-full bg-white text-rose-deep shadow-[0_4px_16px_rgba(0,0,0,0.2)] hover:bg-[#fffdf8] hover:-translate-y-0.5 transition-all"
          >
            {t('cta')}
          </Link>
        </div>

      </div>
    </div>
  )
}
