'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import JlptBadge from './JlptBadge'
import type { JapaneseWord } from './WordCard'
import { cleanMeaningText } from '@/lib/sanitize'

export type ProgressStatus = 'learning' | 'review' | 'mastered'

interface VocabularyCardProps {
  word: JapaneseWord
  progress?: ProgressStatus
  isLoggedIn: boolean
  onAction: (wordId: string, action: 'correct' | 'review' | 'wrong') => Promise<void>
  loginMessage: string
}

const POS_LABEL: Record<string, string> = {
  verb: 'V.',
  noun: 'N.',
  adjective: 'Adj.',
  adverb: 'Adv.',
}

const STATUS_STYLE: Record<ProgressStatus, string> = {
  mastered: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  review:   'bg-amber-100 text-amber-800 border-amber-300',
  learning: 'bg-blue-100 text-blue-800 border-blue-300',
}

export default function VocabularyCard({
  word, progress, isLoggedIn, onAction, loginMessage
}: VocabularyCardProps) {
  const t = useTranslations('japanese')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const STATUS_LABEL: Record<ProgressStatus, string> = {
    mastered: `✓ ${t('mastered')}`,
    review:   `↺ ${t('need_review')}`,
    learning: `… ${t('status_learning')}`,
  }

  const firstMeaning = word.meanings?.[0]
  const firstExample = word.examples?.[0]
  const posLabel = word.pos?.map(p => POS_LABEL[p] ?? p).join(' ') ?? ''

  const handleAction = async (action: 'correct' | 'review' | 'wrong') => {
    if (!isLoggedIn) {
      setToast(loginMessage)
      setTimeout(() => setToast(null), 2500)
      return
    }
    setBusy(true)
    await onAction(word.id, action)
    setBusy(false)
  }

  const borderColor = progress === 'mastered'
    ? 'border-emerald-200'
    : progress === 'review'
    ? 'border-amber-200'
    : progress === 'learning'
    ? 'border-blue-200'
    : 'border-line'

  return (
    <div className={`relative bg-paper border-2 ${borderColor} rounded-2xl p-4 transition-all`}>
      {/* Progress badge */}
      {progress && (
        <span className={`absolute top-3 right-3 text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLE[progress]}`}>
          {STATUS_LABEL[progress]}
        </span>
      )}

      {/* Word header */}
      <div className="flex items-start gap-3 pr-16 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[22px] font-bold text-ink leading-none" lang="ja">
              {word.word}
            </span>
            {word.reading && word.reading !== word.word && (
              <span className="text-[12.5px] text-muted" lang="ja">
                {word.reading}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {word.romaji && (
              <span className="text-[12px] text-muted">{word.romaji}</span>
            )}
            {posLabel && (
              <span className="text-[10px] font-semibold text-muted/80 bg-cream border border-line px-1.5 py-0.5 rounded-full">
                {posLabel}
              </span>
            )}
            {word.jlpt_level && <JlptBadge level={word.jlpt_level} />}
          </div>
        </div>
      </div>

      {/* Meanings */}
      {firstMeaning && (
        <div className="mb-3 space-y-0.5">
          {firstMeaning.vi && (
            <p className="text-[14px] text-ink font-medium">{cleanMeaningText(firstMeaning.vi)}</p>
          )}
          {firstMeaning.en && (
            <p className="text-[12.5px] text-muted">{cleanMeaningText(firstMeaning.en)}</p>
          )}
        </div>
      )}

      {/* Example */}
      {firstExample?.ja && (
        <div className="mb-3 pt-2.5 border-t border-line/60">
          <p className="text-[13px] text-ink" lang="ja">{firstExample.ja}</p>
          {firstExample.vi && (
            <p className="text-[11.5px] text-muted/80 italic mt-0.5">{firstExample.vi}</p>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => handleAction('correct')}
          disabled={busy}
          className="flex items-center gap-1 text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors disabled:opacity-50"
        >
          ✓ {t('mastered')}
        </button>
        <button
          onClick={() => handleAction('review')}
          disabled={busy}
          className="flex items-center gap-1 text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors disabled:opacity-50"
        >
          ↺ {t('need_review')}
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className="absolute bottom-3 left-3 right-3 text-[12px] text-center bg-ink/90 text-paper rounded-xl py-2 px-3 z-10">
          {toast}
        </div>
      )}
    </div>
  )
}
