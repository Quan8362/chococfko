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

function FeatureIcon({ name, featured = false }: { name: string; featured?: boolean }) {
  return (
    <span
      aria-hidden
      className={`grid place-items-center rounded-xl shrink-0 transition-colors ${
        featured
          ? 'w-12 h-12 bg-rose text-white group-hover:bg-rose-deep shadow-[0_6px_16px_-6px_rgba(194,24,91,0.5)]'
          : 'w-10 h-10 bg-rose/10 text-rose group-hover:bg-rose/15'
      }`}
    >
      <svg className={featured ? 'w-6 h-6' : 'w-5 h-5'} fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
        {ICON[name]}
      </svg>
    </span>
  )
}

const Arrow = () => (
  <svg aria-hidden className="w-4 h-4 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </svg>
)

type FeatureDef = { key: string; href: string; cta?: string }

/* Three flagship tools — the visual focal point of the page. */
const PRIMARY_TOOLS: FeatureDef[] = [
  { key: 'dictionary', href: '/japanese/dictionary', cta: 'cta_start_lookup' },
  { key: 'vocabulary', href: '/japanese/vocabulary', cta: 'cta_learn_by_level' },
  { key: 'grammar', href: '/japanese/grammar', cta: 'cta_view_grammar' },
]

/* Every other tool, once, in a single balanced grid. */
const SECONDARY_TOOLS: FeatureDef[] = [
  { key: 'kanji', href: '/japanese/kanji' },
  { key: 'flashcard', href: '/japanese/flashcards' },
  { key: 'practice', href: '/japanese/practice' },
  { key: 'jlpt_test', href: '/japanese/jlpt-mock-test' },
  { key: 'writing', href: '/japanese/writing' },
  { key: 'handwriting', href: '/japanese/handwriting' },
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

  type TT = Parameters<typeof t>[0]
  const tt = (k: string) => t(k as TT)

  /* Suggestion chips under the hero search — the first one (dictionary) is the
     primary suggestion, expressed with a filled chip, not an underline. */
  const popular: { label: string; href: string; active?: boolean }[] = [
    { label: tt('dict_heading'), href: '/japanese/dictionary', active: true },
    { label: tt('seo_link_vocab_n5'), href: '/japanese/vocabulary/n5' },
    { label: tt('exam_heading'), href: '/japanese/jlpt-mock-test' },
  ]

  const renderPrimary = ({ key, href, cta }: FeatureDef) => (
    <Link
      key={key}
      href={href}
      className="group relative flex flex-col rounded-2xl p-6 bg-gradient-to-br from-rose-soft to-paper border border-rose/25 transition-all hover:-translate-y-1 hover:border-rose/45 hover:shadow-[0_14px_34px_-14px_rgba(194,24,91,0.32)] focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/45 focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
    >
      <FeatureIcon name={key} featured />
      <h3 className="font-serif font-bold text-[18px] leading-snug text-ink mt-4 transition-colors group-hover:text-rose">
        {tt(key)}
      </h3>
      <p className="text-[13px] text-muted leading-snug mt-1.5 flex-1">{tt(FEATURE_DESC[key])}</p>
      <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-rose mt-4">
        {tt(cta ?? 'card_open')}
        <Arrow />
      </span>
    </Link>
  )

  const renderSecondary = ({ key, href }: FeatureDef) => (
    <Link
      key={key}
      href={href}
      className="group flex flex-col rounded-xl p-4 bg-paper border border-line transition-all hover:-translate-y-0.5 hover:border-rose/30 hover:shadow-[0_6px_20px_-10px_rgba(194,24,91,0.22)] focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/45 focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
    >
      <FeatureIcon name={key} />
      <h3 className="font-serif font-bold text-[14.5px] leading-snug text-ink mt-3 transition-colors group-hover:text-rose">
        {tt(key)}
      </h3>
      <p className="text-[12px] text-muted leading-snug mt-1">{tt(FEATURE_DESC[key])}</p>
    </Link>
  )

  return (
    <div className="max-w-[1040px] mx-auto px-5 sm:px-6 py-8 sm:py-10 pb-16 space-y-12">

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-rose-soft via-cream to-paper border border-line px-6 py-9 sm:px-12 sm:py-14">
        {/* Layered Japanese-typography motif + soft glow */}
        <div aria-hidden className="pointer-events-none absolute inset-0 select-none">
          <span className="absolute -right-3 -top-4 sm:right-6 sm:top-6 text-[96px] sm:text-[150px] font-bold leading-none text-rose/[0.07]">
            日本語
          </span>
          <span className="absolute right-10 bottom-2 hidden lg:block text-[120px] font-bold leading-none text-transparent [-webkit-text-stroke:1px_rgba(194,24,91,0.06)]">
            学
          </span>
          <span className="absolute -left-16 -bottom-20 w-72 h-72 rounded-full bg-rose/10 blur-3xl" />
        </div>

        <div className="relative z-10">
          <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold tracking-[2.5px] uppercase text-rose bg-rose/10 border border-rose/20 px-3 py-1.5 rounded-full mb-5">
            {tt('page_badge')}
          </span>
          <h1 className="font-serif font-bold text-[clamp(28px,5.2vw,46px)] leading-tight tracking-[-0.5px] text-ink mb-3">
            {tt('hero_title')}
          </h1>
          <p className="text-[14.5px] sm:text-[16px] text-muted leading-relaxed max-w-[560px] mb-7">
            {tt('hero_subtitle')}
          </p>

          {/* PRIMARY call-to-action */}
          <HeroSearch />

          {/* Suggestion chips — selection shown by fill, never an underline */}
          <div role="group" aria-label={tt('hero_popular')} className="flex flex-wrap items-center gap-2 mt-5">
            <span aria-hidden="true" className="text-[13px] font-semibold text-muted mr-0.5">{tt('hero_popular')}</span>
            {popular.map(p => (
              <Link
                key={p.href}
                href={p.href}
                aria-current={p.active ? 'true' : undefined}
                className={`inline-flex items-center min-h-[36px] px-3.5 text-[12.5px] font-medium rounded-full border transition-colors duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/45 focus-visible:ring-offset-2 focus-visible:ring-offset-cream ${
                  p.active
                    ? 'bg-rose text-white border-rose shadow-sm hover:bg-rose-deep hover:border-rose-deep'
                    : 'bg-rose/[0.07] text-rose border-rose/15 hover:bg-rose/[0.12] hover:text-rose-deep'
                }`}
              >
                {p.label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Continue learning (logged-in only) ───────────────── */}
      {progress && (
        <section aria-labelledby="jp-continue">
          <div className="rounded-2xl border border-rose/20 bg-gradient-to-br from-rose-soft to-paper p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
              <div>
                <h2 id="jp-continue" className="font-serif font-bold text-[19px] text-ink">{tt('continue_heading')}</h2>
                <p className="text-[13px] text-muted mt-0.5">{tt('continue_subtitle')}</p>
              </div>
              <Link href="/japanese/profile" className="group inline-flex items-center gap-1.5 text-[13px] font-semibold text-rose focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/45 rounded-md px-1">
                {tt('continue_browse_saved')}
                <Arrow />
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Link href="/japanese/profile" className="group bg-white border border-line rounded-xl p-4 transition-all hover:-translate-y-0.5 hover:border-rose/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/45">
                <p className="text-[12px] text-muted">{tt('continue_saved_label')}</p>
                <p className="font-serif font-bold text-[26px] text-ink leading-tight mt-1 transition-colors group-hover:text-rose">{progress.savedCount}</p>
              </Link>
              <Link href="/japanese/flashcards" className="group bg-white border border-line rounded-xl p-4 transition-all hover:-translate-y-0.5 hover:border-rose/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/45">
                <p className="text-[12px] text-muted">{tt('continue_due_label')}</p>
                <p className="font-serif font-bold text-[26px] text-ink leading-tight mt-1 transition-colors group-hover:text-rose">{progress.dueCount}</p>
              </Link>
              <Link
                href={progress.lastLevel ? `/japanese/vocabulary/${progress.lastLevel.toLowerCase()}` : '/japanese/vocabulary'}
                className="group bg-white border border-line rounded-xl p-4 flex flex-col transition-all hover:-translate-y-0.5 hover:border-rose/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/45"
              >
                <p className="text-[12px] text-muted">{tt('continue_level_label')}</p>
                <p className="font-serif font-bold text-[26px] text-ink leading-tight mt-1 transition-colors group-hover:text-rose">
                  {progress.lastLevel ?? tt('continue_none')}
                </p>
                <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-rose mt-auto pt-2">
                  {tt('continue_resume')}
                  <Arrow />
                </span>
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ── Learning tools (consolidated) ────────────────────── */}
      <section aria-labelledby="jp-tools">
        <div className="mb-5">
          <h2 id="jp-tools" className="font-serif font-bold text-[20px] sm:text-[22px] text-ink">{tt('tools_heading')}</h2>
          <p className="text-[13.5px] text-muted mt-1">{tt('tools_subtitle')}</p>
        </div>

        {/* Flagship trio — full row, the focal point */}
        <div className="grid gap-4 sm:grid-cols-3">
          {PRIMARY_TOOLS.map(renderPrimary)}
        </div>

        {/* Supporting tools — balanced 2×4 / 4×2 grid, no orphans */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          {SECONDARY_TOOLS.map(renderSecondary)}
        </div>
      </section>

      {/* ── JLPT roadmap N5 → N1 (progression) ───────────────── */}
      <section aria-labelledby="jp-roadmap">
        <div className="mb-5">
          <h2 id="jp-roadmap" className="font-serif font-bold text-[20px] sm:text-[22px] text-ink">{tt('jlpt_path_title')}</h2>
          <p className="text-[13.5px] text-muted mt-1">{tt('jlpt_path_subtitle')}</p>
        </div>
        <ol className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {JLPT_LEVELS.map((level, i) => {
            const lv = level.toLowerCase()
            return (
              <li
                key={level}
                className="group relative flex flex-col rounded-2xl bg-paper border border-line p-4 transition-all hover:-translate-y-0.5 hover:border-rose/30 hover:shadow-[0_6px_20px_-10px_rgba(194,24,91,0.2)]"
              >
                {/* progression accent strip */}
                <span aria-hidden className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-gradient-to-r from-rose/0 via-rose/40 to-rose/0" />
                <div className="flex items-center justify-between">
                  <JlptBadge level={level} />
                  <span aria-hidden className="text-[10px] font-semibold text-muted tabular-nums">{i + 1}/{JLPT_LEVELS.length}</span>
                </div>
                <h3 className="font-serif font-bold text-[16px] text-ink mt-2.5">
                  {tt('jlpt_level')} {level}
                </h3>
                <p className="text-[12.5px] text-muted leading-snug mt-1 mb-3 flex-1">
                  {tt(`path_${lv}_desc`)}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <Link href={`/japanese/vocabulary/${lv}`} className="text-[11.5px] font-medium bg-cream border border-line text-ink px-2.5 py-1 rounded-full transition-colors hover:border-rose/40 hover:text-rose focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/45">
                    {tt('path_action_vocab')}
                  </Link>
                  <Link href={`/japanese/grammar/${lv}`} className="text-[11.5px] font-medium bg-cream border border-line text-ink px-2.5 py-1 rounded-full transition-colors hover:border-rose/40 hover:text-rose focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/45">
                    {tt('grammar')}
                  </Link>
                  <Link href={`/japanese/jlpt-mock-test/${lv}`} className="text-[11.5px] font-medium bg-cream border border-line text-ink px-2.5 py-1 rounded-full transition-colors hover:border-rose/40 hover:text-rose focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/45">
                    {tt('path_action_exam')}
                  </Link>
                </div>
              </li>
            )
          })}
        </ol>
      </section>

      {/* ── About + quick links ──────────────────────────────── */}
      <section aria-labelledby="jp-about" className="rounded-2xl border border-line bg-paper p-6 sm:p-8">
        <h2 id="jp-about" className="font-serif font-bold text-[20px] text-ink mb-3">{tt('seo_title')}</h2>
        <p className="text-[14px] text-muted leading-[1.8] max-w-[760px]">{tt('seo_body')}</p>
        <p className="text-[11.5px] font-bold text-muted uppercase tracking-wide mt-6 mb-3">{tt('seo_links_title')}</p>
        <div className="flex flex-wrap gap-2">
          {[
            { label: tt('seo_link_dictionary'), href: '/japanese/dictionary' },
            { label: tt('seo_link_vocab_n5'), href: '/japanese/vocabulary/n5' },
            { label: tt('seo_link_vocab_n4'), href: '/japanese/vocabulary/n4' },
            { label: tt('seo_link_grammar_n5'), href: '/japanese/grammar/n5' },
            { label: tt('seo_link_kanji'), href: '/japanese/kanji' },
            { label: tt('seo_link_exam'), href: '/japanese/jlpt-mock-test' },
          ].map(l => (
            <Link key={l.href} href={l.href} className="text-[13px] font-medium text-rose bg-rose/[0.07] border border-rose/15 px-3.5 py-1.5 rounded-full transition-colors hover:bg-rose/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/45">
              {l.label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
