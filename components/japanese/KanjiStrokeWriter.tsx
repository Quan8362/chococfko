'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

// Japanese-correct stroke order data (KanjiVG-derived) served from jsDelivr.
const JP_DATA_CDN = 'https://cdn.jsdelivr.net/npm/hanzi-writer-data-jp@0'

interface KanjiStrokeWriterProps {
  char: string
  /** Square pixel size of the writing canvas. */
  size?: number
  /** Rendered when this Kanji has no stroke data in KanjiVG. */
  noDataFallback: React.ReactNode
  /** When provided, the "Practice" button calls this (e.g. opens a popup) instead of quizzing inline. */
  onPractice?: () => void
  /** Start directly in writing-practice (quiz) mode instead of just animating. */
  autoQuiz?: boolean
}

type Status = 'loading' | 'ready' | 'error'

export default function KanjiStrokeWriter({ char, size = 150, noDataFallback, onPractice, autoQuiz = false }: KanjiStrokeWriterProps) {
  const t = useTranslations('japanese')
  const containerRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const writerRef = useRef<any>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [quizzing, setQuizzing] = useState(false)

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let writer: any = null
    setStatus('loading')
    setQuizzing(false)

    ;(async () => {
      const mod = await import('hanzi-writer')
      const HanziWriter = mod.default
      if (cancelled || !containerRef.current) return
      containerRef.current.innerHTML = ''

      writer = HanziWriter.create(containerRef.current, char, {
        width: size,
        height: size,
        padding: 5,
        showOutline: true,
        showCharacter: true,
        strokeAnimationSpeed: 1,
        delayBetweenStrokes: 160,
        strokeColor: '#241a17',
        radicalColor: '#c2185b',
        outlineColor: '#e8ddcf',
        drawingColor: '#1f8fa6',
        charDataLoader: (c: string) =>
          fetch(`${JP_DATA_CDN}/${encodeURIComponent(c)}.json`).then(res => {
            if (!res.ok) throw new Error('no kanji data')
            return res.json()
          }),
        onLoadCharDataSuccess: () => {
          if (!cancelled) setStatus('ready')
        },
        onLoadCharDataError: () => {
          if (!cancelled) setStatus('error')
        },
      })
      writerRef.current = writer
      if (autoQuiz) {
        setQuizzing(true)
        writer.quiz({
          showHintAfterMisses: 3,
          onComplete: () => {
            if (writerRef.current) setQuizzing(false)
          },
        })
      } else {
        writer.animateCharacter()
      }
    })()

    return () => {
      cancelled = true
      try {
        writer?.cancelQuiz?.()
      } catch {
        /* noop */
      }
      if (containerRef.current) containerRef.current.innerHTML = ''
      writerRef.current = null
    }
  }, [char, size, autoQuiz])

  const handleReplay = () => {
    const w = writerRef.current
    if (!w) return
    w.cancelQuiz?.()
    setQuizzing(false)
    w.showCharacter()
    w.animateCharacter()
  }

  const handlePractice = () => {
    const w = writerRef.current
    if (!w) return
    setQuizzing(true)
    w.quiz({
      showHintAfterMisses: 3,
      onComplete: () => {
        if (writerRef.current) setQuizzing(false)
      },
    })
  }

  if (status === 'error') {
    return <>{noDataFallback}</>
  }

  return (
    <div className="flex flex-col items-center gap-2" style={{ width: size }}>
      <div className="relative" style={{ width: size, height: size }}>
        <div
          ref={containerRef}
          className="rounded-xl border border-line bg-cream/40"
          style={{ width: size, height: size }}
        />
        {status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center text-[11px] text-muted">
            {t('kanji_stroke_loading')}
          </div>
        )}
      </div>

      <div className="flex flex-wrap justify-center gap-1.5 w-full">
        <button
          type="button"
          onClick={handleReplay}
          disabled={status !== 'ready'}
          className="inline-flex flex-1 min-w-[68px] items-center justify-center gap-1 text-[11px] font-semibold text-ink bg-cream border border-line px-2 py-1 rounded-lg hover:border-rose/30 hover:text-rose transition-colors disabled:opacity-40"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {t('kanji_stroke_replay')}
        </button>
        <button
          type="button"
          onClick={() => (onPractice ? onPractice() : handlePractice())}
          disabled={status !== 'ready' || (!onPractice && quizzing)}
          className="inline-flex flex-1 min-w-[68px] items-center justify-center gap-1 text-[11px] font-semibold text-white bg-rose px-2 py-1 rounded-lg hover:bg-rose-deep transition-colors disabled:opacity-40"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
          {!onPractice && quizzing ? t('kanji_stroke_practicing') : t('kanji_stroke_practice')}
        </button>
      </div>
    </div>
  )
}
