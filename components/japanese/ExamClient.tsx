'use client'

import { useCallback, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { saveStudySession, type QuizQuestion } from '@/app/tieng-nhat/quiz-actions'
import JlptBadge from '@/components/japanese/JlptBadge'
import Timer from '@/components/japanese/Timer'
import ResultSummary from '@/components/japanese/ResultSummary'

interface ExamClientProps {
  questions: QuizQuestion[]
  level: string
  timerSeconds: number
  isLoggedIn: boolean
}

type Phase = 'exam' | 'result'

export default function ExamClient({
  questions,
  level,
  timerSeconds,
  isLoggedIn,
}: ExamClientProps) {
  const t = useTranslations('japanese')
  const locale = useLocale()

  const [phase, setPhase] = useState<Phase>('exam')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [score, setScore] = useState(0)
  const [isSaving, setIsSaving] = useState(false)
  const [isSaved, setIsSaved] = useState<boolean | null>(null)

  const startTimeRef = useRef(Date.now())
  const elapsedRef = useRef(0)
  const answersRef = useRef(answers)
  answersRef.current = answers

  const handleSubmit = useCallback(
    async (isAutoSubmit = false) => {
      const currentAnswers = answersRef.current
      const answeredCount = Object.keys(currentAnswers).length

      if (!isAutoSubmit && answeredCount < questions.length) {
        const ok = window.confirm(t('submit_warning'))
        if (!ok) return
      }

      const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000)
      elapsedRef.current = elapsed

      const finalScore = questions.filter(q => currentAnswers[q.id] === q.correct_answer).length
      setScore(finalScore)
      setPhase('result')

      if (isLoggedIn) {
        setIsSaving(true)
        const result = await saveStudySession({
          session_type: 'exam',
          level,
          score: finalScore,
          total: questions.length,
          duration_sec: elapsed,
          detail: {
            category: 'mixed',
            wrong_answers: questions
              .filter(q => currentAnswers[q.id] !== q.correct_answer)
              .map(q => ({
                id: q.id,
                chosen: currentAnswers[q.id] ?? null,
                correct: q.correct_answer,
              })),
          },
        })
        setIsSaved(result.success)
        setIsSaving(false)
      }
    },
    [questions, level, isLoggedIn, t]
  )

  const answeredCount = Object.keys(answers).length
  const q = questions[currentIndex]

  /* ── Result phase ── */
  if (phase === 'result') {
    return (
      <div>
        <ResultSummary
          score={score}
          total={questions.length}
          durationSec={elapsedRef.current}
          backHref="/tieng-nhat/thi-thu"
          backLabel={t('back_to_exam')}
          isLoggedIn={isLoggedIn}
          isSaving={isSaving}
          isSaved={isSaved}
        />

        {/* Detailed review */}
        <div className="mt-10 space-y-5">
          <h3 className="font-serif font-bold text-[18px] text-ink border-b border-line pb-3">
            {t('explanation')}
          </h3>
          {questions.map((question, i) => {
            const chosen = answers[question.id]
            const isCorrect = chosen === question.correct_answer
            const questionText =
              locale === 'en'
                ? (question.question_en ?? question.question)
                : (question.question_vi ?? question.question)
            const explanationText =
              locale === 'en'
                ? (question.explanation_en ?? question.explanation_vi)
                : (question.explanation_vi ?? question.explanation_en)

            return (
              <div
                key={question.id}
                className={`border rounded-2xl p-4 ${
                  isCorrect
                    ? 'border-green-200 bg-green-50/50'
                    : 'border-red-200 bg-red-50/50'
                }`}
              >
                <div className="flex items-start gap-3 mb-3">
                  <span
                    className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
                      isCorrect ? 'bg-green-500 text-white' : 'bg-red-400 text-white'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-[15px] text-ink leading-snug">
                      {question.question}
                    </p>
                    {questionText !== question.question && (
                      <p className="text-[12.5px] text-muted mt-0.5">{questionText}</p>
                    )}
                  </div>
                </div>

                <div className="ml-9 space-y-1 mb-2">
                  {question.options.map(opt => {
                    const isChosen = opt.key === chosen
                    const isCorrectOpt = opt.key === question.correct_answer
                    return (
                      <div
                        key={opt.key}
                        className={`flex items-center gap-2 text-[13px] rounded-lg px-3 py-1.5 ${
                          isCorrectOpt
                            ? 'bg-green-100 text-green-800 font-medium'
                            : isChosen
                              ? 'bg-red-100 text-red-800'
                              : 'text-muted'
                        }`}
                      >
                        <span className="font-bold w-4 shrink-0">{opt.key}.</span>
                        <span className="flex-1">{opt.text}</span>
                        {isCorrectOpt && <span className="ml-auto shrink-0">✓</span>}
                        {isChosen && !isCorrectOpt && <span className="ml-auto shrink-0">✗</span>}
                      </div>
                    )
                  })}
                </div>

                {explanationText && (
                  <p className="ml-9 text-[12.5px] text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                    {explanationText}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  /* ── Exam phase ── */
  return (
    <div>
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-paper/95 backdrop-blur-sm border-b border-line -mx-1 px-1 py-3 mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <JlptBadge level={level as 'N5' | 'N4' | 'N3' | 'N2' | 'N1'} />
          <span className="text-[13px] text-muted">
            {answeredCount}/{questions.length} {t('answered')}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Timer
            totalSeconds={timerSeconds}
            onExpire={() => handleSubmit(true)}
          />
          <button
            onClick={() => handleSubmit(false)}
            className="bg-rose text-white font-semibold text-[13px] px-4 py-2 rounded-lg hover:bg-rose-deep transition-colors"
          >
            {t('submit')}
          </button>
        </div>
      </div>

      {/* Question navigator */}
      <div className="flex flex-wrap gap-1.5 mb-8">
        {questions.map((ques, i) => (
          <button
            key={ques.id}
            onClick={() => setCurrentIndex(i)}
            className={`w-8 h-8 rounded-lg text-[12px] font-bold transition-all border ${
              i === currentIndex
                ? 'bg-rose border-rose text-white shadow-sm'
                : answers[ques.id]
                  ? 'bg-green-100 border-green-300 text-green-800'
                  : 'bg-paper border-line text-muted hover:border-rose/30'
            }`}
          >
            {i + 1}
          </button>
        ))}
      </div>

      {/* Current question */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-[11.5px] font-bold text-muted uppercase tracking-wide">
            {t('question_label')} {currentIndex + 1}
          </span>
          {!answers[q.id] ? (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
              {t('not_answered_label')}
            </span>
          ) : (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">
              ✓
            </span>
          )}
        </div>

        <p className="font-serif text-[17px] sm:text-[19px] font-semibold text-ink leading-relaxed mb-1">
          {q.question}
        </p>
        {(() => {
          const qText =
            locale === 'en'
              ? (q.question_en ?? q.question)
              : (q.question_vi ?? q.question)
          return qText !== q.question ? (
            <p className="text-[13.5px] text-muted mb-5">{qText}</p>
          ) : (
            <div className="mb-5" />
          )
        })()}

        <div className="grid gap-2.5">
          {q.options.map(opt => {
            const isSelected = answers[q.id] === opt.key
            return (
              <button
                key={opt.key}
                onClick={() =>
                  setAnswers(prev => ({ ...prev, [q.id]: opt.key }))
                }
                className={`flex items-center gap-3 w-full border-2 rounded-xl px-4 py-3.5 text-left transition-all ${
                  isSelected
                    ? 'bg-rose/10 border-rose text-ink'
                    : 'bg-paper border-line hover:border-rose/30 hover:bg-rose/5 text-ink'
                }`}
              >
                <span
                  className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-bold border-2 transition-colors ${
                    isSelected ? 'bg-rose border-rose text-white' : 'border-current'
                  }`}
                >
                  {opt.key}
                </span>
                <span className="text-[14px] leading-snug flex-1">{opt.text}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-2">
          {currentIndex > 0 && (
            <button
              onClick={() => setCurrentIndex(i => i - 1)}
              className="px-4 py-2.5 border border-line rounded-xl text-[14px] text-muted hover:border-rose/30 hover:text-ink transition-colors"
            >
              ← {t('prev_question')}
            </button>
          )}
          {currentIndex < questions.length - 1 && (
            <button
              onClick={() => setCurrentIndex(i => i + 1)}
              className="px-4 py-2.5 border border-rose/30 rounded-xl text-[14px] text-rose hover:bg-rose/5 transition-colors"
            >
              {t('next_question')} →
            </button>
          )}
        </div>

        {currentIndex === questions.length - 1 && (
          <button
            onClick={() => handleSubmit(false)}
            className="bg-rose text-white font-semibold text-[14px] px-6 py-3 rounded-xl hover:bg-rose-deep transition-colors shadow-sm"
          >
            {t('submit')}
          </button>
        )}
      </div>
    </div>
  )
}
