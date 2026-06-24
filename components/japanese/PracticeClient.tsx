'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import {
  generatePracticeQuestions,
  savePracticeSession,
  type PracticeAvailability,
  type RecentSession,
  type WeakArea,
} from '@/app/japanese/practice-actions'
import { PRACTICE_COUNTS, type PracticeQuestion } from '@/lib/japanese/practice'
import { JLPT_LEVELS } from '@/components/japanese/LevelPicker'

interface PracticeClientProps {
  isLoggedIn: boolean
  availability: PracticeAvailability
  recentSessions: RecentSession[]
  weakAreas: WeakArea[]
}

type Phase = 'setup' | 'loading' | 'quiz' | 'result'
type AnswerRecord = { question: PracticeQuestion; selectedKey: string | null; isCorrect: boolean }

const TYPES = ['vocabulary', 'grammar', 'kanji', 'mixed'] as const

export default function PracticeClient({
  isLoggedIn,
  availability,
  recentSessions,
  weakAreas,
}: PracticeClientProps) {
  const t = useTranslations('japanese')

  const [level, setLevel] = useState<string>('N5')
  const [type, setType] = useState<string>('vocabulary')
  const [count, setCount] = useState<number>(10)

  const [phase, setPhase] = useState<Phase>('setup')
  const [questions, setQuestions] = useState<PracticeQuestion[]>([])
  const [index, setIndex] = useState(0)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [answered, setAnswered] = useState(false)
  const [answers, setAnswers] = useState<AnswerRecord[]>([])
  const [startTime, setStartTime] = useState(0)
  const [elapsedSec, setElapsedSec] = useState(0)
  const [isRetry, setIsRetry] = useState(false)

  const [isSaving, setIsSaving] = useState(false)
  const [isSaved, setIsSaved] = useState<boolean | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  function beginSession(qs: PracticeQuestion[], retry: boolean) {
    setQuestions(qs)
    setIndex(0)
    setSelectedKey(null)
    setAnswered(false)
    setAnswers([])
    setStartTime(Date.now())
    setIsSaved(null)
    setIsRetry(retry)
    setPhase('quiz')
  }

  async function handleStart() {
    setPhase('loading')
    setLoadError(null)
    const { questions: qs, error } = await generatePracticeQuestions(level, type, count)
    if (error || qs.length === 0) {
      setLoadError(error ?? 'empty')
      setPhase('setup')
      return
    }
    beginSession(qs, false)
  }

  function handleRetryWrong() {
    const wrong = answers.filter(a => !a.isCorrect).map(a => a.question)
    if (wrong.length === 0) return
    beginSession([...wrong].sort(() => Math.random() - 0.5), true)
  }

  function handleAnswer(key: string) {
    if (answered) return
    const q = questions[index]
    const correct = key === q.correctKey
    setSelectedKey(key)
    setAnswered(true)
    setAnswers(prev => [...prev, { question: q, selectedKey: key, isCorrect: correct }])
  }

  async function handleNext() {
    const isLast = index + 1 >= questions.length
    if (!isLast) {
      setIndex(i => i + 1)
      setSelectedKey(null)
      setAnswered(false)
      return
    }
    const elapsed = Math.round((Date.now() - startTime) / 1000)
    setElapsedSec(elapsed)
    setPhase('result')
    // Only persist real (non-retry) sessions to avoid double-logging review runs.
    if (isLoggedIn && !isRetry) {
      setIsSaving(true)
      const result = await savePracticeSession({
        level,
        type,
        durationSec: elapsed,
        answers: answers.map(a => {
          const opt = a.question.options.find(o => o.key === a.question.correctKey)
          const sel = a.selectedKey ? a.question.options.find(o => o.key === a.selectedKey) : null
          return {
            sourceType: a.question.sourceType,
            sourceId: a.question.sourceId,
            qType: a.question.qType,
            questionText: a.question.prompt,
            correctAnswer: opt?.text ?? '',
            selectedAnswer: sel?.text ?? null,
            isCorrect: a.isCorrect,
          }
        }),
      })
      setIsSaved(result.success)
      setIsSaving(false)
    }
  }

  /* ════════════ Setup ════════════ */
  if (phase === 'setup' || phase === 'loading') {
    const av = availability[level as keyof PracticeAvailability]
    const selectedAvail =
      type === 'mixed' ? av.vocabulary + av.grammar + av.kanji : av[type as 'vocabulary' | 'grammar' | 'kanji']

    // A table column is "active" when its category is selected (mixed = all three).
    const colActive = (col: 'vocabulary' | 'grammar' | 'kanji') => type === col || type === 'mixed'

    // Shared option-pill styling: clear hover, selected fill + elevation, and a
    // keyboard-visible focus ring (WCAG). `extra` carries per-group padding/weight.
    const pillClass = (active: boolean, extra: string) =>
      `rounded-xl border-2 py-2 text-[14px] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/50 focus-visible:ring-offset-2 focus-visible:ring-offset-paper ${extra} ${
        active
          ? 'bg-rose border-rose text-white shadow-md'
          : 'bg-paper border-line text-ink hover:border-rose/40 hover:bg-rose/5'
      }`

    return (
      <div>
        {/* Intro callout */}
        <div className="flex items-start gap-3 bg-rose/5 border border-rose/15 rounded-2xl p-4 sm:p-5 mb-8">
          <svg className="w-5 h-5 text-rose shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-[13.5px] text-ink leading-relaxed">{t('practice_intro')}</p>
        </div>

        {/* Config (left) + sticky summary (right) */}
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-6 lg:items-start">

          {/* LEFT — control panel card */}
          <div className="bg-paper border border-line rounded-2xl shadow-card p-5 sm:p-6 space-y-6">
            {/* Level */}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-muted mb-3">{t('select_level')}</p>
              <div className="flex flex-wrap gap-2">
                {JLPT_LEVELS.map(l => (
                  <button key={l} onClick={() => setLevel(l)} className={pillClass(level === l, 'font-bold px-5')}>
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {/* Type */}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-muted mb-3">{t('select_category')}</p>
              <div className="flex flex-wrap gap-2">
                {TYPES.map(c => (
                  <button key={c} onClick={() => setType(c)} className={pillClass(type === c, 'font-semibold px-4')}>
                    {t(`category_${c}` as Parameters<typeof t>[0])}
                  </button>
                ))}
              </div>
            </div>

            {/* Count */}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-muted mb-3">{t('select_count')}</p>
              <div className="flex flex-wrap gap-2">
                {PRACTICE_COUNTS.map(n => (
                  <button key={n} onClick={() => setCount(n)} className={pillClass(count === n, 'font-semibold px-4')}>
                    {t(`count_${n}` as Parameters<typeof t>[0])}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT — live summary + CTA, sticky on desktop */}
          <aside className="mt-6 lg:mt-0 lg:sticky lg:top-[90px]">
            <div className="bg-paper border border-line rounded-2xl shadow-card p-5 sm:p-6">
              <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-muted mb-4">{t('practice_summary_title')}</p>

              <dl className="space-y-2.5 mb-4 text-[13.5px]">
                <div className="flex items-center justify-between">
                  <dt className="text-muted">{t('practice_summary_level')}</dt>
                  <dd className="font-bold text-ink">{level}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted">{t('practice_summary_type')}</dt>
                  <dd className="font-semibold text-ink">{t(`category_${type}` as Parameters<typeof t>[0])}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted">{t('practice_summary_count')}</dt>
                  <dd className="font-semibold text-ink tabular-nums">{count}</dd>
                </div>
              </dl>

              {/* Available materials for the current combination (was the orphaned helper line) */}
              <div className="flex items-center justify-between rounded-xl bg-rose/5 border border-rose/15 px-3.5 py-2.5 mb-4">
                <span className="text-[12.5px] text-muted">{t('practice_summary_materials')}</span>
                <span className="text-[18px] font-bold text-rose tabular-nums leading-none">{selectedAvail.toLocaleString()}</span>
              </div>

              {loadError && (
                <p className="text-[13px] text-red-500 mb-3">
                  {loadError === 'empty' ? t('practice_no_enough') : t('practice_error')}
                </p>
              )}

              <button
                onClick={handleStart}
                disabled={phase === 'loading' || selectedAvail === 0}
                className="w-full bg-rose text-white font-semibold text-[15px] px-8 py-3.5 rounded-xl hover:bg-rose-deep active:translate-y-px transition-all duration-150 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/50 focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
              >
                {phase === 'loading' ? `${t('loading')}…` : t('start')}
              </button>
            </div>
          </aside>
        </div>

        {/* Availability matrix — full width, with the active level row + selected type column highlighted live */}
        <div className="mt-12">
          <h2 className="font-serif font-bold text-[16px] text-ink mb-3">{t('practice_availability_title')}</h2>
          <div className="overflow-x-auto border border-line rounded-2xl shadow-card">
            <table className="w-full text-[13px] min-w-[360px]">
              <thead>
                <tr className="bg-cream text-muted">
                  <th className="text-left font-semibold px-4 py-2.5">{t('jlpt_level')}</th>
                  <th className={`text-right font-semibold px-4 py-2.5 transition-colors ${colActive('vocabulary') ? 'text-rose' : ''}`}>{t('category_vocabulary')}</th>
                  <th className={`text-right font-semibold px-4 py-2.5 transition-colors ${colActive('grammar') ? 'text-rose' : ''}`}>{t('category_grammar')}</th>
                  <th className={`text-right font-semibold px-4 py-2.5 transition-colors ${colActive('kanji') ? 'text-rose' : ''}`}>{t('category_kanji')}</th>
                </tr>
              </thead>
              <tbody>
                {JLPT_LEVELS.map(l => {
                  const a = availability[l]
                  const rowActive = l === level
                  const cellClass = (col: 'vocabulary' | 'grammar' | 'kanji') => {
                    const ca = colActive(col)
                    if (rowActive && ca) return 'text-rose font-bold'
                    if (ca) return 'text-ink font-medium'
                    if (rowActive) return 'text-ink'
                    return 'text-muted'
                  }
                  return (
                    <tr key={l} className={`border-t border-line transition-colors ${rowActive ? 'bg-rose/5' : ''}`}>
                      <td className={`px-4 py-2.5 font-bold ${rowActive ? 'text-rose' : 'text-ink'}`}>{l}</td>
                      <td className={`px-4 py-2.5 text-right tabular-nums transition-colors ${cellClass('vocabulary')}`}>{a.vocabulary.toLocaleString()}</td>
                      <td className={`px-4 py-2.5 text-right tabular-nums transition-colors ${cellClass('grammar')}`}>{a.grammar.toLocaleString()}</td>
                      <td className={`px-4 py-2.5 text-right tabular-nums transition-colors ${cellClass('kanji')}`}>{a.kanji.toLocaleString()}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Weak areas */}
        {isLoggedIn && weakAreas.length > 0 && (
          <div className="mt-10">
            <h2 className="font-serif font-bold text-[16px] text-ink mb-3">{t('practice_weak_areas')}</h2>
            <div className="flex flex-wrap gap-2">
              {weakAreas.map(w => (
                <span
                  key={w.source_type}
                  className="inline-flex items-center gap-2 text-[12.5px] bg-amber-50 border border-amber-200 text-amber-800 px-3 py-1.5 rounded-full"
                >
                  {t(`category_${w.source_type}` as Parameters<typeof t>[0])}
                  <span className="font-bold">{w.wrong}/{w.total}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Recent history */}
        {isLoggedIn && (
          <div className="mt-10">
            <h2 className="font-serif font-bold text-[16px] text-ink mb-3">{t('practice_recent_history')}</h2>
            {recentSessions.length === 0 ? (
              <div className="flex flex-col items-center text-center gap-3 border border-dashed border-line rounded-2xl py-10 px-5 bg-cream/40">
                <svg className="w-9 h-9 text-muted/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <p className="text-[13px] text-muted max-w-[280px] leading-relaxed">{t('practice_history_empty_hint')}</p>
              </div>
            ) : (
              <div className="grid gap-2">
                {recentSessions.map(s => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between bg-paper border border-line rounded-xl px-4 py-3"
                  >
                    <div className="flex items-center gap-2.5 text-[13px]">
                      <span className="font-bold text-ink">{s.jlpt_level}</span>
                      <span className="text-muted">·</span>
                      <span className="text-muted">{t(`category_${s.practice_type}` as Parameters<typeof t>[0])}</span>
                      <span className="text-muted">·</span>
                      <span className="text-muted">
                        {s.correct_count}/{s.question_count}
                      </span>
                    </div>
                    <span
                      className={`text-[13px] font-bold ${
                        s.score_percent >= 80 ? 'text-green-600' : s.score_percent >= 60 ? 'text-amber-600' : 'text-red-500'
                      }`}
                    >
                      {s.score_percent}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  /* ════════════ Result ════════════ */
  if (phase === 'result') {
    const correct = answers.filter(a => a.isCorrect).length
    const total = answers.length
    const wrong = answers.filter(a => !a.isCorrect)
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0
    const gradeColor = pct >= 80 ? 'text-green-600' : pct >= 60 ? 'text-amber-600' : 'text-red-500'
    const gradeEmoji = pct >= 80 ? '🎉' : pct >= 60 ? '👍' : '📚'

    return (
      <div className="max-w-[680px] mx-auto">
        <div className="text-center">
          <div className="text-[56px] leading-none mb-4">{gradeEmoji}</div>
          <h2 className={`font-serif font-bold text-[40px] mb-1 ${gradeColor}`}>{pct}%</h2>
          <p className="text-[14.5px] text-muted mb-8">{t('result_heading')}</p>

          <div className="grid grid-cols-3 gap-3 mb-8">
            <div className="bg-green-50 border border-green-100 rounded-2xl py-4 px-2">
              <div className="font-bold text-[22px] text-green-700">{correct}</div>
              <div className="text-[11px] text-green-600 mt-0.5 leading-tight">{t('correct_count')}</div>
            </div>
            <div className="bg-red-50 border border-red-100 rounded-2xl py-4 px-2">
              <div className="font-bold text-[22px] text-red-600">{total - correct}</div>
              <div className="text-[11px] text-red-500 mt-0.5 leading-tight">{t('wrong_count')}</div>
            </div>
            <div className="bg-cream border border-line rounded-2xl py-4 px-2">
              <div className="font-bold text-[18px] text-ink">
                {Math.floor(elapsedSec / 60)}m {elapsedSec % 60}s
              </div>
              <div className="text-[11px] text-muted mt-0.5 leading-tight">{t('duration')}</div>
            </div>
          </div>

          {!isLoggedIn && <p className="text-[12.5px] text-muted mb-5">{t('login_to_save_result')}</p>}
          {isRetry && isLoggedIn && <p className="text-[12.5px] text-muted mb-5">{t('practice_retry_not_saved')}</p>}
          {isSaving && <p className="text-[12.5px] text-muted mb-5">{t('loading')}…</p>}
          {isSaved === true && <p className="text-[12.5px] text-green-600 mb-5">✓ {t('result_saved')}</p>}
          {isSaved === false && <p className="text-[12.5px] text-red-500 mb-5">✗ {t('result_save_failed')}</p>}
        </div>

        {/* Wrong answers review */}
        {wrong.length > 0 && (
          <div className="mb-8">
            <h3 className="font-serif font-bold text-[16px] text-ink mb-3">{t('practice_wrong_list_title')}</h3>
            <div className="grid gap-2.5">
              {wrong.map((a, i) => {
                const correctOpt = a.question.options.find(o => o.key === a.question.correctKey)
                const selOpt = a.selectedKey ? a.question.options.find(o => o.key === a.selectedKey) : null
                return (
                  <div key={`${a.question.id}-${i}`} className="bg-paper border border-line rounded-xl px-4 py-3">
                    <p className="font-serif text-[15px] font-semibold text-ink mb-1.5">{a.question.prompt}</p>
                    <p className="text-[12.5px] text-green-700">
                      {t('practice_correct_answer')}: <span className="font-semibold">{correctOpt?.text}</span>
                    </p>
                    {selOpt && (
                      <p className="text-[12.5px] text-red-500">
                        {t('practice_your_answer')}: <span className="font-semibold">{selOpt.text}</span>
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="flex justify-center gap-3 flex-wrap">
          {wrong.length > 0 && (
            <button
              onClick={handleRetryWrong}
              className="bg-amber-500 text-white font-semibold text-[14px] px-6 py-3 rounded-xl hover:bg-amber-600 transition-colors shadow-sm"
            >
              {t('practice_retry_wrong')}
            </button>
          )}
          <button
            onClick={handleStart}
            className="bg-rose text-white font-semibold text-[14px] px-6 py-3 rounded-xl hover:bg-rose-deep transition-colors shadow-sm"
          >
            {t('practice_practice_again')}
          </button>
          <button
            onClick={() => {
              setPhase('setup')
              setIsSaved(null)
            }}
            className="bg-paper border border-line text-ink font-semibold text-[14px] px-6 py-3 rounded-xl hover:border-rose/30 transition-colors"
          >
            {t('practice_back_to_setup')}
          </button>
        </div>
      </div>
    )
  }

  /* ════════════ Quiz ════════════ */
  const q = questions[index]
  const isLast = index + 1 >= questions.length
  const progressPct = ((index + (answered ? 1 : 0)) / questions.length) * 100

  function optionClass(key: string) {
    if (!answered) {
      return selectedKey === key
        ? 'bg-rose/10 border-rose text-ink'
        : 'bg-paper border-line hover:border-rose/30 hover:bg-rose/5 text-ink cursor-pointer'
    }
    if (key === q.correctKey) return 'bg-green-50 border-green-500 text-green-900'
    if (key === selectedKey) return 'bg-red-50 border-red-400 text-red-900'
    return 'bg-paper border-line text-muted opacity-50'
  }
  function badgeClass(key: string) {
    if (!answered) {
      return selectedKey === key ? 'bg-rose border-rose text-white' : 'border-current bg-transparent'
    }
    if (key === q.correctKey) return 'bg-green-500 border-green-500 text-white'
    if (key === selectedKey) return 'bg-red-400 border-red-400 text-white'
    return 'border-current bg-transparent'
  }

  const isCorrect = answered && selectedKey === q.correctKey

  return (
    <div className="max-w-[680px] mx-auto">
      {/* Progress header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[13px] text-muted">{t('quiz_of', { current: index + 1, total: questions.length })}</span>
        <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-rose/10 text-rose border border-rose/20">
          {level} · {t(`category_${isRetry ? q.sourceType : type}` as Parameters<typeof t>[0])}
        </span>
      </div>
      <div className="h-1.5 bg-line rounded-full mb-7">
        <div className="h-full bg-rose rounded-full transition-all duration-300" style={{ width: `${progressPct}%` }} />
      </div>

      {/* Question */}
      <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-muted mb-2">
        {t(`practice_q_${q.qType}` as Parameters<typeof t>[0])}
      </p>
      <p className="font-serif text-[22px] sm:text-[26px] font-bold text-ink leading-tight mb-1">{q.prompt}</p>
      {q.promptSub && <p className="text-[13.5px] text-muted mb-5">{q.promptSub}</p>}
      {!q.promptSub && <div className="mb-5" />}

      <div className="grid gap-2.5">
        {q.options.map(opt => (
          <button
            key={opt.key}
            onClick={() => handleAnswer(opt.key)}
            disabled={answered}
            className={`flex items-center gap-3 w-full border-2 rounded-xl px-4 py-3.5 text-left transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/50 focus-visible:ring-offset-2 focus-visible:ring-offset-cream ${optionClass(opt.key)}`}
          >
            <span
              className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-bold border-2 transition-colors ${badgeClass(opt.key)}`}
            >
              {opt.key}
            </span>
            <span className="text-[14.5px] leading-snug flex-1">{opt.text}</span>
            {answered && opt.key === q.correctKey && <span className="ml-auto shrink-0 text-green-600 text-[15px]">✓</span>}
            {answered && opt.key === selectedKey && opt.key !== q.correctKey && (
              <span className="ml-auto shrink-0 text-red-500 text-[15px]">✗</span>
            )}
          </button>
        ))}
      </div>

      {/* Feedback */}
      {answered && (
        <div className="mt-5">
          <div
            className={`rounded-xl px-4 py-3 border ${
              isCorrect ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
            }`}
          >
            <p className={`text-[13.5px] font-bold ${isCorrect ? 'text-green-700' : 'text-red-600'}`}>
              {isCorrect ? `✓ ${t('practice_correct')}` : `✗ ${t('practice_wrong')}`}
            </p>
            {!isCorrect && (
              <p className="text-[13px] text-ink mt-1">
                {t('practice_correct_answer')}:{' '}
                <span className="font-semibold">{q.options.find(o => o.key === q.correctKey)?.text}</span>
              </p>
            )}
            {q.explanation && <p className="text-[12.5px] text-muted mt-1.5 leading-relaxed">{q.explanation}</p>}
          </div>

          <button
            onClick={handleNext}
            className="mt-5 bg-rose text-white font-semibold text-[14px] px-6 py-3 rounded-xl hover:bg-rose-deep active:translate-y-px transition-all duration-150 shadow-sm w-full sm:w-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/50 focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
          >
            {isLast ? t('finish') : `${t('next_question')} →`}
          </button>
        </div>
      )}

      {/* Quit to setup */}
      <div className="mt-6">
        <button
          onClick={() => {
            setPhase('setup')
            setIsSaved(null)
          }}
          className="text-[12.5px] text-muted hover:text-rose transition-colors"
        >
          ← {t('practice_back_to_setup')}
        </button>
      </div>
    </div>
  )
}
