import Link from 'next/link'
import type { ReactNode } from 'react'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { JLPT_LEVELS } from '@/components/japanese/LevelPicker'
import JlptBadge from '@/components/japanese/JlptBadge'
import HeroSearch from '@/components/japanese/HeroSearch'

export async function generateMetadata() {
  const t = await getTranslations('japanese')
  return {
    title: t('page_title'),
    description: t('hero_subtitle'),
    alternates: { canonical: 'https://chococfko.com/japanese' },
    openGraph: {
      title: t('hero_title'),
      description: t('hero_subtitle'),
      url: 'https://chococfko.com/japanese',
    },
  }
}

/* ── Consistent line-icon set (no emoji, no extra dependency) ───────── */
const ICON: Record<string, ReactNode> = {
  dictionary: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.5C10.5 5.5 8.5 5 6 5a1 1 0 00-1 1v11a1 1 0 001 1c2.5 0 4.5.5 6 1.5m0-13c1.5-1 3.5-1.5 6-1.5a1 1 0 011 1v11a1 1 0 01-1 1c-2.5 0-4.5.5-6 1.5m0-13v13" />
  ),
  kanji: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 5h11M9.5 5v3c0 4-2 6.5-5 8m3-5c1.5 2.5 3.5 4 6 5m1.5-9l3.5 9m-3-2.5h-1M14.5 18l1.5-3.5" />
  ),
  grammar: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 4.5l3 3L8 19l-4 1 1-4L16.5 4.5zM14.5 6.5l3 3" />
  ),
  vocabulary: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 5h11a2 2 0 012 2v12a1 1 0 00-1-1H4V5zM4 5a1 1 0 00-1 1v12a1 1 0 001 1m13-1a2 2 0 012-2V5a1 1 0 011 1v11M7 9h7M7 12.5h5" />
  ),
  flashcard: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h9a2 2 0 012 2v6a2 2 0 01-2 2H7a2 2 0 01-2-2v-6a2 2 0 012-2zM8 8V6a2 2 0 012-2h7a2 2 0 012 2v7a2 2 0 01-2 2h-1" />
  ),
  practice: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9 9 0 100-18 9 9 0 000 18zm0-4a5 5 0 100-10 5 5 0 000 10zm0-4a1 1 0 100-2 1 1 0 000 2z" />
  ),
  jlpt_test: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5h6a1 1 0 011 1v.5h1a2 2 0 012 2V19a2 2 0 01-2 2H7a2 2 0 01-2-2V8.5a2 2 0 012-2h1V6a1 1 0 011-1zm0 1.5V8h6V6.5M9 5a1 1 0 011-1h4a1 1 0 011 1M8.5 13l2 2 4-4" />
  ),
  writing: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l7-7a2 2 0 000-3l-1-1a2 2 0 00-3 0l-7 7-1.5 5 5-1.5zM4 21h6" />
  ),
  study_profile: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 20V10m7 10V4m7 16v-7M3 20h18" />
  ),
  handwriting: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 4l5 5-2 2-5-5 2-2zM13 6l-8 8c-1 1-2 4-2 6 2 0 5-1 6-2l8-8" />
  ),
  image_translate: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm2 10l4-4 3 3 3-3 2 2M9 9.5a1 1 0 11-2 0 1 1 0 012 0z" />
  ),
}

function FeatureIcon({ name }: { name: string }) {
  return (
    <span aria-hidden className="w-11 h-11 rounded-xl bg-rose/10 grid place-items-center text-rose shrink-0">
      <svg className="w-[22px] h-[22px]" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
        {ICON[name]}
      </svg>
    </span>
  )
}

const Arrow = () => (
  <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </svg>
)

type FeatureDef = { key: string; href: string; primary?: boolean; cta?: string }

const GROUP_LOOKUP: FeatureDef[] = [
  { key: 'dictionary', href: '/japanese/dictionary', primary: true, cta: 'cta_start_lookup' },
  { key: 'kanji', href: '/japanese/kanji' },
  { key: 'grammar', href: '/japanese/grammar', primary: true, cta: 'cta_view_grammar' },
  { key: 'handwriting', href: '/japanese/handwriting' },
]

const GROUP_JLPT: FeatureDef[] = [
  { key: 'vocabulary', href: '/japanese/vocabulary', primary: true, cta: 'cta_learn_by_level' },
  { key: 'flashcard', href: '/japanese/flashcards' },
  { key: 'practice', href: '/japanese/practice' },
  { key: 'jlpt_test', href: '/japanese/jlpt-mock-test' },
]

const GROUP_TOOLS: FeatureDef[] = [
  { key: 'writing', href: '/japanese/writing' },
  { key: 'image_translate', href: '/japanese/image-translate' },
  { key: 'study_profile', href: '/japanese/profile' },
]

const FEATURE_DESC: Record<string, string> = {
  dictionary: 'feature_dictionary_desc',
  kanji: 'feature_kanji_desc',
  grammar: 'feature_grammar_desc',
  vocabulary: 'feature_vocabulary_desc',
  flashcard: 'feature_flashcard_desc',
  practice: 'feature_practice_desc',
  jlpt_test: 'feature_jlpt_test_desc',
  writing: 'feature_writing_desc',
  study_profile: 'feature_study_profile_desc',
  handwriting: 'feature_handwriting_desc',
  image_translate: 'feature_image_translate_desc',
}

type Progress = { savedCount: number; dueCount: number; lastLevel: string | null }

async function getProgress(): Promise<Progress | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const [savedRes, dueRes, sessionRes] = await Promise.all([
      supabase.from('jp_bookmarks').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('jp_flashcard_progress').select('id', { count: 'exact', head: true })
        .eq('user_id', user.id).in('status', ['review', 'learning']),
      supabase.from('jp_study_sessions').select('level').eq('user_id', user.id)
        .order('created_at', { ascending: false }).limit(1),
    ])

    const savedCount = savedRes.count ?? 0
    const dueCount = dueRes.count ?? 0
    const rawLevel = (sessionRes.data?.[0]?.level ?? '').toUpperCase()
    const lastLevel = (JLPT_LEVELS as readonly string[]).includes(rawLevel) ? rawLevel : null

    if (savedCount === 0 && dueCount === 0 && !lastLevel) return null
    return { savedCount, dueCount, lastLevel }
  } catch {
    return null
  }
}

export default async function JapaneseLearningPage() {
  const [t, progress] = await Promise.all([getTranslations('japanese'), getProgress()])

  const renderCard = ({ key, href, primary, cta }: FeatureDef) => (
    <Link
      key={key}
      href={href}
      className={`group relative flex flex-col rounded-2xl p-5 transition-all hover:-translate-y-0.5 focus-visible:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/40 ${
        primary
          ? 'bg-gradient-to-br from-rose/[0.07] to-paper border border-rose/25 hover:border-rose/45 hover:shadow-[0_8px_28px_-10px_rgba(194,24,91,0.28)]'
          : 'bg-paper border border-line hover:border-rose/30 hover:shadow-[0_4px_20px_-8px_rgba(194,24,91,0.18)]'
      }`}
    >
      <FeatureIcon name={key} />
      <h3 className="font-serif font-bold text-[16px] leading-snug text-ink group-hover:text-rose transition-colors mt-3.5">
        {t(key as Parameters<typeof t>[0])}
      </h3>
      <p className="text-[12.5px] text-muted leading-snug mt-1 flex-1">
        {t(FEATURE_DESC[key] as Parameters<typeof t>[0])}
      </p>
      <span className={`inline-flex items-center gap-1.5 text-[12.5px] font-semibold mt-3.5 ${primary ? 'text-rose' : 'text-muted group-hover:text-rose transition-colors'}`}>
        {t((cta ?? 'card_open') as Parameters<typeof t>[0])}
        <Arrow />
      </span>
    </Link>
  )

  const SmartStart = [
    { titleKey: 'start_first_word', descKey: 'start_first_word_desc', href: '/japanese/dictionary', icon: 'dictionary' },
    { titleKey: 'start_n5_vocab', descKey: 'start_n5_vocab_desc', href: '/japanese/vocabulary/n5', icon: 'vocabulary' },
    { titleKey: 'start_n5_grammar', descKey: 'start_n5_grammar_desc', href: '/japanese/grammar/n5', icon: 'grammar' },
    { titleKey: 'start_practice', descKey: 'start_practice_desc', href: '/japanese/practice', icon: 'practice' },
  ] as const

  return (
    <div className="max-w-[1040px] mx-auto px-5 sm:px-6 py-8 sm:py-10 pb-20">

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-rose/[0.08] via-cream to-paper border border-line mb-10 px-6 py-9 sm:px-12 sm:py-12">
        <div aria-hidden className="absolute -right-2 -top-3 sm:right-6 sm:top-4 text-[88px] sm:text-[130px] font-bold text-rose/[0.06] select-none leading-none pointer-events-none">
          日本語
        </div>
        <div className="relative z-10">
          <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold tracking-[2.5px] uppercase text-rose bg-rose/10 border border-rose/20 px-3 py-1.5 rounded-full mb-5">
            {t('page_badge')}
          </span>
          <h1 className="font-serif font-bold text-[clamp(26px,5vw,44px)] leading-tight tracking-[-0.5px] text-ink mb-3">
            {t('hero_title')}
          </h1>
          <p className="text-[14.5px] sm:text-[16px] text-muted leading-relaxed max-w-[560px] mb-6">
            {t('hero_subtitle')}
          </p>

          <HeroSearch />

          <div className="flex flex-wrap gap-2.5 mt-5">
            <Link href="/japanese/dictionary" className="inline-flex items-center gap-1.5 bg-rose text-white font-semibold text-[13.5px] px-4 py-2.5 rounded-full hover:bg-rose-deep transition-colors shadow-sm">
              {t('dict_heading')}
            </Link>
            <Link href="/japanese/vocabulary" className="inline-flex items-center gap-1.5 bg-white text-ink font-semibold text-[13.5px] px-4 py-2.5 rounded-full border border-line hover:border-rose/40 hover:text-rose transition-colors">
              {t('vocabulary')}
            </Link>
            <Link href="/japanese/grammar" className="inline-flex items-center gap-1.5 bg-white text-ink font-semibold text-[13.5px] px-4 py-2.5 rounded-full border border-line hover:border-rose/40 hover:text-rose transition-colors">
              {t('grammar')}
            </Link>
            <Link href="/japanese/jlpt-mock-test" className="inline-flex items-center gap-1.5 bg-white text-ink font-semibold text-[13.5px] px-4 py-2.5 rounded-full border border-line hover:border-rose/40 hover:text-rose transition-colors">
              {t('exam_heading')}
            </Link>
          </div>
        </div>
      </section>

      {/* ── Continue learning / Smart start ──────────────────── */}
      {progress ? (
        <section className="mb-12">
          <div className="rounded-2xl border border-rose/20 bg-gradient-to-br from-rose/[0.05] to-paper p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
              <div>
                <h2 className="font-serif font-bold text-[19px] text-ink">{t('continue_heading')}</h2>
                <p className="text-[13px] text-muted mt-0.5">{t('continue_subtitle')}</p>
              </div>
              <Link href="/japanese/profile" className="group inline-flex items-center gap-1.5 text-[13px] font-semibold text-rose">
                {t('continue_browse_saved')}
                <Arrow />
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Link href="/japanese/profile" className="group bg-white border border-line rounded-xl p-4 hover:border-rose/30 transition-all">
                <p className="text-[12px] text-muted">{t('continue_saved_label')}</p>
                <p className="font-serif font-bold text-[26px] text-ink group-hover:text-rose transition-colors leading-tight mt-1">{progress.savedCount}</p>
              </Link>
              <Link href="/japanese/flashcards" className="group bg-white border border-line rounded-xl p-4 hover:border-rose/30 transition-all">
                <p className="text-[12px] text-muted">{t('continue_due_label')}</p>
                <p className="font-serif font-bold text-[26px] text-ink group-hover:text-rose transition-colors leading-tight mt-1">{progress.dueCount}</p>
              </Link>
              <Link
                href={progress.lastLevel ? `/japanese/vocabulary/${progress.lastLevel.toLowerCase()}` : '/japanese/vocabulary'}
                className="group bg-white border border-line rounded-xl p-4 hover:border-rose/30 transition-all flex flex-col"
              >
                <p className="text-[12px] text-muted">{t('continue_level_label')}</p>
                <p className="font-serif font-bold text-[26px] text-ink group-hover:text-rose transition-colors leading-tight mt-1">
                  {progress.lastLevel ?? t('continue_none')}
                </p>
                <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-rose mt-auto pt-2">
                  {t('continue_resume')}
                  <Arrow />
                </span>
              </Link>
            </div>
          </div>
        </section>
      ) : (
        <section className="mb-12">
          <div className="mb-4">
            <h2 className="font-serif font-bold text-[20px] text-ink">{t('start_heading')}</h2>
            <p className="text-[13.5px] text-muted mt-0.5">{t('start_subtitle')}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {SmartStart.map(({ titleKey, descKey, href, icon }) => (
              <Link
                key={titleKey}
                href={href}
                className="group bg-paper border border-line rounded-2xl p-4 hover:border-rose/30 hover:-translate-y-0.5 hover:shadow-[0_4px_20px_-8px_rgba(194,24,91,0.18)] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/40"
              >
                <FeatureIcon name={icon} />
                <h3 className="font-serif font-bold text-[14.5px] text-ink group-hover:text-rose transition-colors mt-3">
                  {t(titleKey as Parameters<typeof t>[0])}
                </h3>
                <p className="text-[12px] text-muted leading-snug mt-1">{t(descKey as Parameters<typeof t>[0])}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── Feature groups ───────────────────────────────────── */}
      <FeatureGroup title={t('group_lookup_title')} desc={t('group_lookup_desc')}>
        {GROUP_LOOKUP.map(renderCard)}
      </FeatureGroup>

      <FeatureGroup title={t('group_jlpt_title')} desc={t('group_jlpt_desc')}>
        {GROUP_JLPT.map(renderCard)}
      </FeatureGroup>

      <FeatureGroup title={t('group_tools_title')} desc={t('group_tools_desc')}>
        {GROUP_TOOLS.map(renderCard)}
      </FeatureGroup>

      {/* ── JLPT learning path ───────────────────────────────── */}
      <section className="mb-12">
        <div className="mb-5">
          <h2 className="font-serif font-bold text-[20px] sm:text-[22px] text-ink">{t('jlpt_path_title')}</h2>
          <p className="text-[13.5px] text-muted mt-1">{t('jlpt_path_subtitle')}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {JLPT_LEVELS.map(level => {
            const lv = level.toLowerCase()
            return (
              <div key={level} className="bg-paper border border-line rounded-2xl p-5 hover:border-rose/30 transition-colors">
                <div className="flex items-center gap-2.5 mb-2.5">
                  <JlptBadge level={level} />
                  <span className="font-serif font-bold text-[17px] text-ink">{t('jlpt_level')} {level}</span>
                </div>
                <p className="text-[13px] text-muted leading-snug mb-4">
                  {t(`path_${lv}_desc` as Parameters<typeof t>[0])}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/japanese/vocabulary/${lv}`} className="text-[12.5px] font-medium bg-cream border border-line text-ink hover:border-rose/40 hover:text-rose px-3 py-1.5 rounded-full transition-colors">
                    {t('path_action_vocab')}
                  </Link>
                  <Link href={`/japanese/grammar/${lv}`} className="text-[12.5px] font-medium bg-cream border border-line text-ink hover:border-rose/40 hover:text-rose px-3 py-1.5 rounded-full transition-colors">
                    {t('grammar')}
                  </Link>
                  <Link href={`/japanese/jlpt-mock-test/${lv}`} className="text-[12.5px] font-medium bg-cream border border-line text-ink hover:border-rose/40 hover:text-rose px-3 py-1.5 rounded-full transition-colors">
                    {t('path_action_exam')}
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── SEO content block ────────────────────────────────── */}
      <section className="rounded-2xl border border-line bg-paper p-6 sm:p-8">
        <h2 className="font-serif font-bold text-[20px] text-ink mb-3">{t('seo_title')}</h2>
        <p className="text-[14px] text-muted leading-[1.8] max-w-[760px]">{t('seo_body')}</p>
        <p className="text-[11.5px] font-bold text-muted uppercase tracking-wide mt-6 mb-3">{t('seo_links_title')}</p>
        <div className="flex flex-wrap gap-2">
          {[
            { label: t('seo_link_dictionary'), href: '/japanese/dictionary' },
            { label: t('seo_link_vocab_n5'), href: '/japanese/vocabulary/n5' },
            { label: t('seo_link_vocab_n4'), href: '/japanese/vocabulary/n4' },
            { label: t('seo_link_grammar_n5'), href: '/japanese/grammar/n5' },
            { label: t('seo_link_kanji'), href: '/japanese/kanji' },
            { label: t('seo_link_exam'), href: '/japanese/jlpt-mock-test' },
          ].map(l => (
            <Link key={l.href} href={l.href} className="text-[13px] font-medium text-rose bg-rose/[0.07] border border-rose/15 hover:bg-rose/10 px-3.5 py-1.5 rounded-full transition-colors">
              {l.label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}

function FeatureGroup({ title, desc, children }: { title: string; desc: string; children: ReactNode }) {
  return (
    <section className="mb-12">
      <div className="mb-4">
        <h2 className="font-serif font-bold text-[20px] sm:text-[22px] text-ink">{title}</h2>
        <p className="text-[13.5px] text-muted mt-1">{desc}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {children}
      </div>
    </section>
  )
}
