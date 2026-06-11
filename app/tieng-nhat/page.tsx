import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

export async function generateMetadata() {
  const t = await getTranslations('japanese')
  return { title: t('page_title') }
}

const FEATURES = [
  { key: 'dictionary', emoji: '📖', href: '/tieng-nhat/tu-dien', active: true },
  { key: 'vocabulary', emoji: '📝', href: '/tieng-nhat/tu-vung', active: true },
  { key: 'grammar',    emoji: '✏️', href: '/tieng-nhat/ngu-phap', active: true },
  { key: 'kanji',      emoji: '漢', href: '/tieng-nhat/kanji', active: true },
  { key: 'writing',    emoji: '✍️', href: '/tieng-nhat/tap-viet', active: true },
  { key: 'flashcard',  emoji: '🃏', href: '/tieng-nhat/flashcard', active: true },
  { key: 'practice',   emoji: '🎯', href: '/tieng-nhat/luyen-tap', active: true },
  { key: 'jlpt_test',  emoji: '📋', href: '/tieng-nhat/thi-thu', active: true },
  { key: 'study_profile', emoji: '📊', href: '/tieng-nhat/ho-so', active: true },
] as const

export default async function JapaneseLearningPage() {
  const t = await getTranslations('japanese')

  return (
    <div className="max-w-[960px] mx-auto px-5 sm:px-6 py-10 pb-20">

      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-rose/8 via-cream to-paper border border-line mb-12 px-6 py-10 sm:px-12 sm:py-14">
        {/* Decorative Japanese characters */}
        <div aria-hidden className="absolute right-6 top-4 text-[80px] sm:text-[120px] font-bold text-rose/5 select-none leading-none pointer-events-none">
          日本語
        </div>
        <div className="relative z-10">
          <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold tracking-[2.5px] uppercase text-rose bg-rose/10 border border-rose/20 px-3 py-1.5 rounded-full mb-5">
            {t('page_badge')}
          </span>
          <h1 className="font-serif font-bold text-[clamp(28px,5vw,46px)] leading-tight tracking-[-0.5px] text-ink mb-3">
            {t('page_heading')}
          </h1>
          <p className="text-[15px] sm:text-[16px] text-muted leading-relaxed max-w-[520px] mb-8">
            {t('page_desc')}
          </p>
          <Link
            href="/tieng-nhat/tu-dien"
            className="inline-flex items-center gap-2 bg-rose text-white font-semibold text-[14px] px-6 py-3 rounded-xl hover:bg-rose-deep transition-colors shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {t('dictionary')}
          </Link>
        </div>
      </div>

      {/* Feature cards grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        {FEATURES.map(({ key, emoji, href, active }) => {
          const card = (
            <div className={`group relative bg-paper border rounded-2xl p-4 sm:p-5 transition-all ${
              active
                ? 'border-rose/20 hover:border-rose/40 hover:shadow-[0_4px_20px_-6px_rgba(194,24,91,0.18)] cursor-pointer hover:-translate-y-0.5'
                : 'border-line opacity-70 cursor-default'
            }`}>
              {/* Coming soon badge */}
              {!active && (
                <span className="absolute top-3 right-3 text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-line text-muted">
                  {t('coming_soon')}
                </span>
              )}
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-[22px] mb-3 ${
                active ? 'bg-rose/10' : 'bg-cream'
              }`}>
                {emoji}
              </div>
              <h2 className={`font-serif font-bold text-[15px] leading-snug ${
                active ? 'text-ink group-hover:text-rose transition-colors' : 'text-ink/60'
              }`}>
                {t(key as Parameters<typeof t>[0])}
              </h2>
              <p className={`text-[12px] mt-1 leading-snug ${active ? 'text-muted' : 'text-muted/60'}`}>
                {t(`feature_${key}_desc` as Parameters<typeof t>[0])}
              </p>
            </div>
          )

          return href && active ? (
            <Link key={key} href={href}>
              {card}
            </Link>
          ) : (
            <div key={key}>{card}</div>
          )
        })}
      </div>
    </div>
  )
}
