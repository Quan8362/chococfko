'use client'

import { useLocale, useTranslations } from 'next-intl'
import type { QuizQuestion as QuizQuestionType } from '@/app/japanese/quiz-actions'

interface QuizQuestionProps {
  question: QuizQuestionType
  selectedAnswer: string | null
  isAnswered: boolean
  onAnswer: (key: string) => void
}

export default function QuizQuestion({
  question,
  selectedAnswer,
  isAnswered,
  onAnswer,
}: QuizQuestionProps) {
  const t = useTranslations('japanese')
  const locale = useLocale()

  const questionText =
    locale === 'en'
      ? (question.question_en ?? question.question)
      : (question.question_vi ?? question.question)

  const explanationText =
    locale === 'en'
      ? (question.explanation_en ?? question.explanation_vi)
      : (question.explanation_vi ?? question.explanation_en)

  function getOptionClass(key: string) {
    if (!isAnswered) {
      return selectedAnswer === key
        ? 'bg-rose/10 border-rose text-ink'
        : 'bg-paper border-line hover:border-rose/30 hover:bg-rose/5 text-ink cursor-pointer'
    }
    if (key === question.correct_answer) return 'bg-green-50 border-green-500 text-green-900'
    if (key === selectedAnswer) return 'bg-red-50 border-red-400 text-red-900'
    return 'bg-paper border-line text-muted opacity-50'
  }

  function getBadgeClass(key: string) {
    if (!isAnswered) {
      return selectedAnswer === key
        ? 'bg-rose border-rose text-white'
        : 'border-current bg-transparent'
    }
    if (key === question.correct_answer) return 'bg-green-500 border-green-500 text-white'
    if (key === selectedAnswer) return 'bg-red-400 border-red-400 text-white'
    return 'border-current bg-transparent'
  }

  return (
    <div>
      <p className="font-serif text-[17px] sm:text-[19px] font-semibold text-ink leading-relaxed mb-1">
        {question.question}
      </p>
      {questionText !== question.question && (
        <p className="text-[13.5px] text-muted mb-5">{questionText}</p>
      )}
      {questionText === question.question && <div className="mb-5" />}

      <div className="grid gap-2.5">
        {question.options.map(opt => (
          <button
            key={opt.key}
            onClick={() => !isAnswered && onAnswer(opt.key)}
            disabled={isAnswered}
            className={`flex items-center gap-3 w-full border-2 rounded-xl px-4 py-3.5 text-left transition-all ${getOptionClass(opt.key)}`}
          >
            <span
              className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-bold border-2 transition-colors ${getBadgeClass(opt.key)}`}
            >
              {opt.key}
            </span>
            <span className="text-[14px] leading-snug flex-1">{opt.text}</span>
            {isAnswered && opt.key === question.correct_answer && (
              <span className="ml-auto shrink-0 text-green-600 text-[15px]">✓</span>
            )}
            {isAnswered && opt.key === selectedAnswer && opt.key !== question.correct_answer && (
              <span className="ml-auto shrink-0 text-red-500 text-[15px]">✗</span>
            )}
          </button>
        ))}
      </div>

      {isAnswered && explanationText && (
        <div className="mt-5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-amber-600 mb-1.5">
            {t('explanation')}
          </p>
          <p className="text-[13.5px] text-amber-900 leading-relaxed">{explanationText}</p>
        </div>
      )}
    </div>
  )
}
