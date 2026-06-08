'use client'

import { useState, useCallback } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import type { JapaneseWord } from './WordCard'
import type { ProgressStatus } from './VocabularyCard'
import ProgressBar from './ProgressBar'
import { cleanMeaningText } from '@/lib/sanitize'

type FlashAction = 'correct' | 'review' | 'wrong'

interface SessionStats {
  correct: number
  review: number
  wrong: number
}

interface FlashcardViewerProps {
  words: JapaneseWord[]
  isLoggedIn: boolean
  onSave: (wordId: string, action: FlashAction) => Promise<void>
  loginMessage: string
}

export default function FlashcardViewer({ words, isLoggedIn, onSave, loginMessage }: FlashcardViewerProps) {
  const t = useTranslations('japanese')
  const locale = useLocale()
  const [index, setIndex]   = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [busy, setBusy]     = useState(false)
  const [stats, setStats]   = useState<SessionStats>({ correct: 0, review: 0, wrong: 0 })
  const [done, setDone]     = useState(false)
  const [loginHint, setLoginHint] = useState(false)
  const [localProgress, setLocalProgress] = useState<Record<string, ProgressStatus>>({})

  const total = words.length
  const current = words[index]

  const handleAction = useCallback(async (action: FlashAction) => {
    if (!isLoggedIn) {
      setLoginHint(true)
      setTimeout(() => setLoginHint(false), 2500)
    } else {
      setBusy(true)
      await onSave(current.id, action)
      setBusy(false)
    }

    const status: ProgressStatus = action === 'correct' ? 'mastered' : action === 'review' ? 'review' : 'learning'
    setLocalProgress(p => ({ ...p, [current.id]: status }))
    setStats(s => ({ ...s, [action]: s[action] + 1 }))

    if (index + 1 >= total) {
      setDone(true)
    } else {
      setIndex(i => i + 1)
      setFlipped(false)
    }
  }, [index, total, current, isLoggedIn, onSave])

  const restart = () => {
    setIndex(0)
    setFlipped(false)
    setDone(false)
    setStats({ correct: 0, review: 0, wrong: 0 })
    setLocalProgress({})
  }

  if (total === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-[16px] text-muted">{t('no_vocabulary')}</p>
      </div>
    )
  }

  /* ── Session complete screen ── */
  if (done) {
    return (
      <div className="max-w-[440px] mx-auto text-center py-10">
        <div className="text-[56px] mb-4">🎉</div>
        <h2 className="font-serif font-bold text-[24px] text-ink mb-6">
          {t('session_complete')}
        </h2>
        <div className="bg-paper border border-line rounded-2xl p-6 mb-6 space-y-3 text-left">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-[14px] text-emerald-700 font-medium">
              <span className="w-3 h-3 rounded-full bg-emerald-500" />
              {t('mastered')}
            </span>
            <span className="font-bold text-emerald-700">{stats.correct}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-[14px] text-amber-700 font-medium">
              <span className="w-3 h-3 rounded-full bg-amber-400" />
              {t('need_review')}
            </span>
            <span className="font-bold text-amber-700">{stats.review}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-[14px] text-rose font-medium">
              <span className="w-3 h-3 rounded-full bg-rose" />
              {t('i_forgot')}
            </span>
            <span className="font-bold text-rose">{stats.wrong}</span>
          </div>
        </div>
        <ProgressBar
          total={total}
          mastered={stats.correct}
          review={stats.review}
          learning={stats.wrong}
        />
        <div className="flex gap-3 justify-center mt-6">
          <button
            onClick={restart}
            className="px-5 py-2.5 rounded-xl bg-rose text-white font-semibold text-[14px] hover:bg-rose-deep transition-colors"
          >
            {t('restart_session')}
          </button>
        </div>
      </div>
    )
  }

  const progressPct = Math.round((index / total) * 100)

  /* ── Main card ── */
  return (
    <div className="max-w-[520px] mx-auto">
      {/* Header — progress */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[13px] text-muted font-medium">
          {t('card_n_of_m', { n: index + 1, m: total })}
        </span>
        <div className="flex items-center gap-2 text-[12px] text-muted">
          <span className="text-emerald-600">✓ {stats.correct}</span>
          <span className="text-amber-600">↺ {stats.review}</span>
          <span className="text-rose">✗ {stats.wrong}</span>
        </div>
      </div>

      {/* Thin progress bar */}
      <div className="h-1.5 bg-line rounded-full mb-6 overflow-hidden">
        <div
          className="h-full bg-rose rounded-full transition-all duration-300"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* 3-D flip card */}
      <div style={{ perspective: '1200px' }} className="mb-6">
        <div
          className="relative transition-transform duration-500"
          style={{
            transformStyle: 'preserve-3d',
            transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
            minHeight: '280px',
          }}
        >
          {/* Front — word */}
          <div
            className="absolute inset-0 bg-paper border-2 border-line rounded-3xl flex flex-col items-center justify-center p-8 select-none"
            style={{ backfaceVisibility: 'hidden' }}
          >
            <div className="text-[48px] sm:text-[56px] font-bold text-ink mb-3 leading-none" lang="ja">
              {current.word}
            </div>
            {current.reading && current.reading !== current.word && (
              <div className="text-[20px] text-muted" lang="ja">{current.reading}</div>
            )}
          </div>

          {/* Back — answer */}
          <div
            className="absolute inset-0 bg-gradient-to-br from-cream to-paper border-2 border-rose/20 rounded-3xl p-6 overflow-y-auto"
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          >
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="text-[28px] font-bold text-ink" lang="ja">{current.word}</span>
              {current.jlpt_level && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose/10 text-rose border border-rose/20">
                  {current.jlpt_level}
                </span>
              )}
            </div>
            {current.romaji && (
              <p className="text-[14px] text-muted mb-3">{current.romaji}</p>
            )}
            {current.meanings?.[0] && (
              <div className="mb-4 space-y-1">
                {locale === 'en' ? (
                  <>
                    {(current.meanings[0].en || current.meanings[0].vi) && (
                      <p className="text-[16px] font-semibold text-ink">
                        {cleanMeaningText(current.meanings[0].en || current.meanings[0].vi)}
                      </p>
                    )}
                    {current.meanings[0].en && current.meanings[0].vi && (
                      <p className="text-[13.5px] text-muted">{cleanMeaningText(current.meanings[0].vi)}</p>
                    )}
                  </>
                ) : (
                  <>
                    {current.meanings[0].vi ? (
                      <>
                        <p className="text-[16px] font-semibold text-ink">{cleanMeaningText(current.meanings[0].vi)}</p>
                        {current.meanings[0].en && (
                          <p className="text-[13.5px] text-muted">{cleanMeaningText(current.meanings[0].en)}</p>
                        )}
                      </>
                    ) : (
                      current.meanings[0].en && (
                        <p className="text-[16px] font-semibold text-ink">{cleanMeaningText(current.meanings[0].en)}</p>
                      )
                    )}
                  </>
                )}
              </div>
            )}
            {current.examples?.[0] && (
              <div className="pt-3 border-t border-line/60">
                <p className="text-[13px] text-ink" lang="ja">{current.examples[0].ja}</p>
                {(locale === 'en'
                  ? (current.examples[0].en || current.examples[0].vi)
                  : (current.examples[0].vi || current.examples[0].en)
                ) && (
                  <p className="text-[12px] text-muted italic mt-0.5">
                    {locale === 'en'
                      ? (current.examples[0].en || current.examples[0].vi)
                      : (current.examples[0].vi || current.examples[0].en)}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Login hint */}
      {loginHint && (
        <p className="text-center text-[12.5px] text-rose mb-3">{loginMessage}</p>
      )}

      {/* Actions */}
      {!flipped ? (
        <div className="flex justify-center">
          <button
            onClick={() => setFlipped(true)}
            className="px-8 py-3 rounded-xl bg-ink text-paper font-semibold text-[15px] hover:bg-ink/90 transition-colors"
          >
            {t('show_answer')}
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <button
            onClick={() => handleAction('wrong')}
            disabled={busy}
            className="flex-1 max-w-[130px] py-3 rounded-xl bg-rose/10 text-rose border border-rose/30 font-semibold text-[14px] hover:bg-rose/20 transition-colors disabled:opacity-50"
          >
            ✗ {t('i_forgot')}
          </button>
          <button
            onClick={() => handleAction('review')}
            disabled={busy}
            className="flex-1 max-w-[130px] py-3 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 font-semibold text-[14px] hover:bg-amber-100 transition-colors disabled:opacity-50"
          >
            ↺ {t('need_review')}
          </button>
          <button
            onClick={() => handleAction('correct')}
            disabled={busy}
            className="flex-1 max-w-[130px] py-3 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold text-[14px] hover:bg-emerald-100 transition-colors disabled:opacity-50"
          >
            ✓ {t('i_know')}
          </button>
        </div>
      )}
    </div>
  )
}
