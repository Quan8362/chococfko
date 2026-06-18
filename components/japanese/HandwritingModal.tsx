'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import HandwritingCanvas from './HandwritingCanvas'

interface Props {
  /** When provided, searching the composed word calls this instead of navigating. */
  onPick?: (word: string) => void
  className?: string
}

function PenIcon() {
  return (
    <svg aria-hidden className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.85} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l7-7a2 2 0 000-3l-1-1a2 2 0 00-3 0l-7 7-1.5 5 5-1.5zM4 21h6" />
    </svg>
  )
}

export default function HandwritingModal({ onPick, className }: Props) {
  const t = useTranslations('japanese')
  const [open, setOpen] = useState(false)
  const closeBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeBtnRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open])

  function handlePick(word: string) {
    onPick?.(word)
    setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          'inline-flex items-center gap-1.5 bg-white text-ink font-semibold text-[13.5px] px-4 py-2.5 rounded-xl border border-line hover:border-rose/40 hover:text-rose transition-colors'
        }
      >
        <PenIcon />
        {t('hw_draw_kanji')}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center p-3 sm:p-6 bg-black/40 overflow-y-auto"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={t('hw_title')}
        >
          <div
            className="relative bg-paper border border-line rounded-2xl shadow-xl w-full max-w-[640px] my-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-line">
              <h2 className="font-serif font-bold text-[17px] text-ink">{t('hw_title')}</h2>
              <button
                ref={closeBtnRef}
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t('hw_close')}
                className="w-8 h-8 grid place-items-center rounded-lg text-muted hover:text-ink hover:bg-line transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/40"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-5">
              <HandwritingCanvas onPick={handlePick} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
