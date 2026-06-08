import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import JlptBadge from '@/components/japanese/JlptBadge'
import { JLPT_LEVELS } from '@/components/japanese/LevelPicker'

export async function generateMetadata() {
  const t = await getTranslations('japanese')
  return {
    title: `${t('exam_heading')} · ${t('page_heading')} · Chợ Cóc FKO`,
  }
}

const LEVEL_TIMER: Record<string, number> = {
  N5: 1200,
  N4: 1500,
  N3: 1800,
  N2: 2100,
  N1: 2400,
}

export default async function ExamHubPage() {
  const t = await getTranslations('japanese')

  return (
    <div className="max-w-[700px] mx-auto px-5 sm:px-6 py-10 pb-20">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-[12.5px] text-muted mb-8 flex-wrap">
        <Link href="/tieng-nhat" className="hover:text-rose transition-colors">
          {t('page_heading')}
        </Link>
        <span>/</span>
        <span className="text-ink">{t('exam_heading')}</span>
      </nav>

      {/* Header */}
      <div className="mb-8">
        <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold tracking-[2.5px] uppercase text-rose bg-rose/10 border border-rose/20 px-3 py-1.5 rounded-full mb-4">
          📋 {t('exam_heading')}
        </span>
        <h1 className="font-serif font-bold text-[clamp(24px,4vw,36px)] leading-tight tracking-[-0.4px] text-ink mb-2">
          {t('exam_heading')}
        </h1>
        <p className="text-[14px] text-muted">{t('exam_desc')}</p>
      </div>

      {/* Level cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {JLPT_LEVELS.map(level => {
          const minutes = Math.floor((LEVEL_TIMER[level] ?? 1800) / 60)
          return (
            <Link
              key={level}
              href={`/tieng-nhat/thi-thu/${level.toLowerCase()}`}
              className="group bg-paper border border-line rounded-2xl p-5 hover:border-rose/30 hover:shadow-[0_4px_20px_-6px_rgba(194,24,91,0.15)] transition-all hover:-translate-y-0.5"
            >
              <div className="flex items-center justify-between mb-3">
                <JlptBadge level={level} />
                <span className="text-[12px] text-muted">
                  ⏱ {minutes} {t('exam_minutes')}
                </span>
              </div>
              <h3 className="font-serif font-bold text-[17px] text-ink group-hover:text-rose transition-colors mb-1">
                {level}
              </h3>
              <p className="text-[13px] text-muted leading-snug mb-4">
                {t(`${level.toLowerCase()}_desc` as Parameters<typeof t>[0])}
              </p>
              <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-rose">
                {t('exam_start_label')}
                <svg
                  className="w-4 h-4 group-hover:translate-x-1 transition-transform"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
