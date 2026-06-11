'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import WritingCanvas, { type WritingCanvasApi } from './WritingCanvas'

interface BigWriteModalProps {
  char: string
  title: string
  traceLabel: string
  undoLabel: string
  clearLabel: string
  closeLabel: string
  onClose: () => void
}

export default function BigWriteModal({
  char, title, traceLabel, undoLabel, clearLabel, closeLabel, onClose,
}: BigWriteModalProps) {
  const [mounted, setMounted] = useState(false)
  const [size, setSize] = useState(320)
  const [trace, setTrace] = useState(true)
  const apiRef = useRef<WritingCanvasApi | null>(null)

  useEffect(() => {
    setMounted(true)
    const w = typeof window !== 'undefined' ? window.innerWidth : 360
    const h = typeof window !== 'undefined' ? window.innerHeight : 640
    setSize(Math.max(240, Math.min(380, Math.round(Math.min(w * 0.82, h * 0.6)))))
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  if (!mounted) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={onClose}
    >
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" />
      <div
        className="relative w-full max-w-[440px] bg-paper border border-line rounded-3xl shadow-[0_20px_60px_-12px_rgba(36,26,23,0.35)] p-5 sm:p-6"
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 lang="ja" className="font-serif font-bold text-[16px] text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="-mt-1 -mr-1 p-1.5 rounded-lg text-muted hover:text-ink hover:bg-cream transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex justify-center mb-4">
          <WritingCanvas
            key={trace ? 'trace' : 'free'}
            size={size}
            char={char}
            trace={trace}
            onReady={api => { apiRef.current = api }}
            className="shadow-sm"
          />
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <label className="inline-flex items-center gap-1.5 text-[12.5px] text-ink cursor-pointer select-none">
            <input
              type="checkbox"
              checked={trace}
              onChange={e => setTrace(e.target.checked)}
              className="accent-rose w-3.5 h-3.5"
            />
            {traceLabel}
          </label>
          <button
            type="button"
            onClick={() => apiRef.current?.undo()}
            className="text-[12.5px] font-semibold text-ink bg-cream border border-line px-3 py-1.5 rounded-lg hover:border-rose/30 hover:text-rose transition-colors"
          >
            {undoLabel}
          </button>
          <button
            type="button"
            onClick={() => apiRef.current?.clear()}
            className="text-[12.5px] font-semibold text-ink bg-cream border border-line px-3 py-1.5 rounded-lg hover:border-rose/30 hover:text-rose transition-colors"
          >
            {clearLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
