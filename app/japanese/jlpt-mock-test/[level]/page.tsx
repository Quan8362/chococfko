import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { dbLevel } from '@/components/japanese/LevelPicker'
import { getExamQuestions } from '@/app/japanese/quiz-actions'
import ExamClient from '@/components/japanese/ExamClient'

export const dynamic = 'force-dynamic'

const LEVEL_TIMER: Record<string, number> = {
  N5: 1200,
  N4: 1500,
  N3: 1800,
  N2: 2100,
  N1: 2400,
}

interface Props {
  params: { level: string }
}

export async function generateMetadata({ params }: Props) {
  const t = await getTranslations('japanese')
  const jlptLevel = dbLevel(params.level)
  if (!jlptLevel) return { title: 'Not found' }
  return {
    title: `${t('exam_heading')} ${jlptLevel} · ${t('page_heading')}`,
  }
}

export default async function ExamLevelPage({ params }: Props) {
  const t = await getTranslations('japanese')
  const jlptLevel = dbLevel(params.level)
  if (!jlptLevel) notFound()

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const questions = await getExamQuestions(jlptLevel, 20)

  if (questions.length === 0) {
    return (
      <div className="max-w-[700px] mx-auto px-5 sm:px-6 py-10 pb-20">
        <nav className="flex items-center gap-1.5 text-[12.5px] text-muted mb-8 flex-wrap">
          <Link href="/japanese" className="hover:text-rose transition-colors">
            {t('page_heading')}
          </Link>
          <span>/</span>
          <Link href="/japanese/jlpt-mock-test" className="hover:text-rose transition-colors">
            {t('exam_heading')}
          </Link>
          <span>/</span>
          <span className="text-ink">{jlptLevel}</span>
        </nav>
        <p className="text-[14px] text-muted">{t('no_questions')}</p>
      </div>
    )
  }

  const timerSeconds = LEVEL_TIMER[jlptLevel] ?? 1800

  return (
    <div className="max-w-[760px] mx-auto px-5 sm:px-6 py-10 pb-20">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-[12.5px] text-muted mb-8 flex-wrap">
        <Link href="/japanese" className="hover:text-rose transition-colors">
          {t('page_heading')}
        </Link>
        <span>/</span>
        <Link href="/japanese/jlpt-mock-test" className="hover:text-rose transition-colors">
          {t('exam_heading')}
        </Link>
        <span>/</span>
        <span className="text-ink">{jlptLevel}</span>
      </nav>

      {/* Header */}
      <div className="mb-8">
        <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold tracking-[2.5px] uppercase text-rose bg-rose/10 border border-rose/20 px-3 py-1.5 rounded-full mb-4">
          📋 {t('exam_heading')} · {jlptLevel}
        </span>
        <h1 className="font-serif font-bold text-[clamp(22px,4vw,32px)] leading-tight tracking-[-0.4px] text-ink mb-2">
          {t('exam_heading')} {jlptLevel}
        </h1>
        <p className="text-[13.5px] text-muted">
          {questions.length} {t('question_label')} ·{' '}
          {Math.floor(timerSeconds / 60)} {t('exam_minutes')}
        </p>
      </div>

      <ExamClient
        questions={questions}
        level={jlptLevel}
        timerSeconds={timerSeconds}
        isLoggedIn={!!user}
      />
    </div>
  )
}
