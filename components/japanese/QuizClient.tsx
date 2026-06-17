'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { getQuizQuestions, saveStudySession, type QuizQuestion } from '@/app/japanese/quiz-actions'
import { JLPT_LEVELS } from '@/components/japanese/LevelPicker'
import QuizQuestionComponent from '@/components/japanese/QuizQuestion'
import ResultSummary from '@/components/japanese/ResultSummary'

interface QuizClientProps {
  isLoggedIn: boolean
}

type Phase = 'setup' | 'loading' | 'quiz' | 'result'

const CATEGORIES = ['vocabulary', 'grammar', 'kanji', 'mixed'] as const
const COUNTS = [5, 10, 20] as const

export default function QuizClient({ isLoggedIn }: QuizClientProps) {
  const t = useTranslations('japanese')

  // setup state
  const [level, setLevel] = useState<string>('N5')
  const [category, setCategory] = useState<string>('vocabulary')
  const [count, setCount] = useState<number>(10)

  // session state
  const [phase, setPhase] = useState<Phase>('setup')
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null)
  const [isAnswered, setIsAnswered] = useState(false)
  const [correctCount, setCorrectCount] = useState(0)
  const [startTime, setStartTime] = useState(0)
  const [elapsedSec, setElapsedSec] = useState(0)

  // result state
  const [isSaving, setIsSaving] = useState(false)
  const [isSaved, setIsSaved] = useState<boolean | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  async function handleStart() {
    setPhase('loading')
    setLoadError(null)
    const { questions: qs, error } = await getQuizQuestions(level, category, count)
    if (error || qs.length === 0) {
      setLoadError(error ?? 'empty')
      setPhase('setup')
      return
    }
    setQuestions(qs)
    setCurrentIndex(0)
    setSelectedAnswer(null)
    setIsAnswered(false)
    setCorrectCount(0)
    setStartTime(Date.now())
    setIsSaved(null)
    setPhase('quiz')
  }

  function handleAnswer(key: string) {
    if (isAnswered) return
    setSelectedAnswer(key)
    setIsAnswered(true)
    if (key === questions[currentIndex].correct_answer) {
      setCorrectCount(c => c + 1)
    }
  }

  async function handleNext() {
    const isLast = currentIndex + 1 >= questions.length
    if (isLast) {
      const elapsed = Math.round((Date.now() - startTime) / 1000)
      setElapsedSec(elapsed)
      setPhase('result')
      if (isLoggedIn) {
        setIsSaving(true)
        const finalScore = correctCount
        const result = await saveStudySession({
          session_type: 'quiz',
          level,
          score: finalScore,
          total: questions.length,
          duration_sec: elapsed,
          detail: { category },
        })
        setIsSaved(result.success)
        setIsSaving(false)
      }
    } else {
      setCurrentIndex(i => i + 1)
      setSelectedAnswer(null)
      setIsAnswered(false)
    }
  }

  function handleRetry() {
    setPhase('setup')
    setIsSaved(null)
  }

  /* ── Setup / Loading ── */
  if (phase === 'setup' || phase === 'loading') {
    return (
      <div>
        {/* Level */}
        <div className="mb-6">
          <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-muted mb-3">
            {t('select_level')}
          </p>
          <div className="flex flex-wrap gap-2">
            {JLPT_LEVELS.map(l => (
              <button
                key={l}
                onClick={() => setLevel(l)}
                className={`px-5 py-2 rounded-xl border-2 font-bold text-[14px] transition-all ${
                  level === l
                    ? 'bg-rose border-rose text-white shadow-sm'
                    : 'bg-paper border-line text-ink hover:border-rose/40'
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Category */}
        <div className="mb-6">
          <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-muted mb-3">
            {t('select_category')}
          </p>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map(c => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`px-4 py-2 rounded-xl border-2 text-[14px] transition-all ${
                  category === c
                    ? 'bg-rose border-rose text-white font-semibold shadow-sm'
                    : 'bg-paper border-line text-ink hover:border-rose/40'
                }`}
              >
                {t(`category_${c}` as Parameters<typeof t>[0])}
              </button>
            ))}
          </div>
        </div>

        {/* Count */}
        <div className="mb-8">
          <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-muted mb-3">
            {t('select_count')}
          </p>
          <div className="flex flex-wrap gap-2">
            {COUNTS.map(n => (
              <button
                key={n}
                onClick={() => setCount(n)}
                className={`px-4 py-2 rounded-xl border-2 text-[14px] transition-all ${
                  count === n
                    ? 'bg-rose border-rose text-white font-semibold shadow-sm'
                    : 'bg-paper border-line text-ink hover:border-rose/40'
                }`}
              >
                {t(`count_${n}` as Parameters<typeof t>[0])}
              </button>
            ))}
          </div>
        </div>

        {loadError && (
          <p className="text-[13px] text-red-500 mb-4">{t('no_questions')}</p>
        )}

        <button
          onClick={handleStart}
          disabled={phase === 'loading'}
          className="bg-rose text-white font-semibold text-[15px] px-8 py-3.5 rounded-xl hover:bg-rose-deep transition-colors shadow-sm disabled:opacity-60 w-full sm:w-auto"
        >
          {phase === 'loading' ? `${t('loading')}…` : t('start')}
        </button>
      </div>
    )
  }

  /* ── Result ── */
  if (phase === 'result') {
    return (
      <ResultSummary
        score={correctCount}
        total={questions.length}
        durationSec={elapsedSec}
        onRetry={handleRetry}
        backHref="/japanese"
        isLoggedIn={isLoggedIn}
        isSaving={isSaving}
        isSaved={isSaved}
      />
    )
  }

  /* ── Quiz ── */
  const q = questions[currentIndex]
  const isLast = currentIndex + 1 >= questions.length
  const progressPct = ((currentIndex + (isAnswered ? 1 : 0)) / questions.length) * 100

  return (
    <div>
      {/* Progress header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[13px] text-muted">
          {t('quiz_of', { current: currentIndex + 1, total: questions.length })}
        </span>
        <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-rose/10 text-rose border border-rose/20">
          {level} · {t(`category_${category}` as Parameters<typeof t>[0])}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-line rounded-full mb-8">
        <div
          className="h-full bg-rose rounded-full transition-all duration-300"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <QuizQuestionComponent
        question={q}
        selectedAnswer={selectedAnswer}
        isAnswered={isAnswered}
        onAnswer={handleAnswer}
      />

      {isAnswered && (
        <div className="mt-6">
          <button
            onClick={handleNext}
            className="bg-rose text-white font-semibold text-[14px] px-6 py-3 rounded-xl hover:bg-rose-deep transition-colors shadow-sm w-full sm:w-auto"
          >
            {isLast ? t('complete') : `${t('next_question')} →`}
          </button>
        </div>
      )}
    </div>
  )
}
