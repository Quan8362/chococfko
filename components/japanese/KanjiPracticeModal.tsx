'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import JlptBadge from './JlptBadge'
import KanjiStrokeWriter from './KanjiStrokeWriter'
import type { JapaneseKanji } from './KanjiCard'

interface KanjiPracticeModalProps {
  char: string
  kanji: JapaneseKanji | null
  locale: string
  onClose: () => void
}

function ReadingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[10px] font-bold text-muted uppercase tracking-wide shrink-0 w-[48px]">
        {label}
      </span>
      <span lang="ja" className="text-[13px] text-ink font-medium break-words min-w-0">
        {value}
      </span>
    </div>
  )
}

export default function KanjiPracticeModal({ char, kanji, locale, onClose }: KanjiPracticeModalProps) {
  const t = useTranslations('japanese')
  const [mounted, setMounted] = useState(false)
  const [size, setSize] = useState(280)

  useEffect(() => {
    setMounted(true)
    const w = typeof window !== 'undefined' ? window.innerWidth : 360
    setSize(Math.max(220, Math.min(300, Math.round(w * 0.72))))

    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  if (!mounted) return null

  const meaning = kanji?.meanings?.[0]
  const meaningText = (locale === 'en' ? meaning?.en : meaning?.vi) || meaning?.en || meaning?.vi

  const noDataFallback = (
    <div
      className="flex flex-col items-center justify-center gap-2 rounded-xl border border-line bg-cream/40 text-center px-4"
      style={{ width: size, minHeight: size }}
    >
      <span
        lang="ja"
        className="font-bold text-ink leading-none"
        style={{ fontSize: Math.round(size * 0.5), fontFamily: "'Noto Serif JP', 'Noto Sans JP', serif" }}
      >
        {char}
      </span>
      <p className="text-[12px] text-muted leading-snug">{t('kanji_practice_no_stroke')}</p>
    </div>
  )

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('kanji_practice_title')}
      onMouseDown={onClose}
    >
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" />

      <div
        className="relative w-full max-w-[380px] max-h-[90vh] overflow-y-auto bg-paper border border-line rounded-3xl shadow-[0_20px_60px_-12px_rgba(36,26,23,0.35)] p-5 sm:p-6"
        onMouseDown={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <h2 className="font-serif font-bold text-[16px] text-ink flex items-center gap-1.5">
            <svg className="w-4 h-4 text-rose shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            {t('kanji_practice_title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('kanji_practice_close')}
            className="shrink-0 -mt-1 -mr-1 p-1.5 rounded-lg text-muted hover:text-ink hover:bg-cream transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Large writing canvas (starts in practice/quiz mode) */}
        <div className="flex justify-center mb-5">
          <KanjiStrokeWriter char={char} size={size} autoQuiz noDataFallback={noDataFallback} />
        </div>

        {/* Kanji info */}
        <div className="border-t border-line pt-4 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-baseline gap-2 flex-wrap min-w-0">
              <span lang="ja" className="text-[24px] font-bold text-ink leading-none">{char}</span>
              {kanji?.han_viet && (
                <span className="text-[12px] font-bold text-rose uppercase tracking-wide">
                  {t('kanji_practice_hanviet')}: {kanji.han_viet}
                </span>
              )}
            </div>
            {kanji?.jlpt_level && <JlptBadge level={kanji.jlpt_level} />}
          </div>

          {meaningText && <p className="text-[13.5px] text-ink leading-snug">{meaningText}</p>}

          {kanji?.onyomi && kanji.onyomi.length > 0 && (
            <ReadingRow label={t('onyomi')} value={kanji.onyomi.join('・')} />
          )}
          {kanji?.kunyomi && kanji.kunyomi.length > 0 && (
            <ReadingRow label={t('kunyomi')} value={kanji.kunyomi.join('・')} />
          )}

          {kanji?.stroke_count != null && (
            <span className="inline-flex items-center self-start text-[11px] text-muted bg-cream px-2 py-0.5 rounded-full">
              {t('stroke_count')}: {kanji.stroke_count}
            </span>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
