'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import WorkbookRow, { type WorkbookKanji, type WorkbookMode } from '@/components/japanese/workbook/WorkbookRow'
import type { WritingCanvasApi } from '@/components/japanese/workbook/WritingCanvas'

interface WorkbookClientProps {
  /** Route + localStorage key, e.g. 'n5', 'joyo-1'. */
  storageKey: string
  /** Human label shown in the print heading, e.g. 'N5' or 'Jōyō · Lớp 1'. */
  title: string
  pages: WorkbookKanji[][]
}

const PRACTICE_CELLS = 10
const TRACE_LEAD = 3
const SWIPE_THRESHOLD = 56

function cellSizeFor(width: number) {
  if (width < 420) return 48
  if (width < 640) return 54
  if (width < 1024) return 60
  return 64
}

export default function WorkbookClient({ storageKey, title, pages }: WorkbookClientProps) {
  const t = useTranslations('japanese')
  const total = pages.length

  const pageKey = `chococfko_tapviet_page_${storageKey}`
  const doneKey = `chococfko_tapviet_done_${storageKey}`

  const [page, setPage] = useState(0)
  const [mode, setMode] = useState<WorkbookMode>('write')
  const [clearSignal, setClearSignal] = useState(0)
  const [cellSize, setCellSize] = useState(60)
  const [done, setDone] = useState<Set<number>>(new Set())

  const undoStackRef = useRef<WritingCanvasApi[]>([])

  // Restore persisted page + completion on mount.
  useEffect(() => {
    try {
      const savedPage = parseInt(localStorage.getItem(pageKey) ?? '', 10)
      if (!Number.isNaN(savedPage) && savedPage >= 0 && savedPage < total) setPage(savedPage)
      const savedDone = JSON.parse(localStorage.getItem(doneKey) ?? '[]')
      if (Array.isArray(savedDone)) setDone(new Set(savedDone.filter((n: unknown) => typeof n === 'number')))
    } catch { /* noop */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Responsive cell size.
  useEffect(() => {
    const update = () => setCellSize(cellSizeFor(window.innerWidth))
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const goTo = useCallback((next: number) => {
    const clamped = Math.max(0, Math.min(total - 1, next))
    setPage(clamped)
    undoStackRef.current = []
    try { localStorage.setItem(pageKey, String(clamped)) } catch { /* noop */ }
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [total, pageKey])

  // Keyboard arrows.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement
      if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA')) return
      if (e.key === 'ArrowLeft') goTo(page - 1)
      else if (e.key === 'ArrowRight') goTo(page + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [page, goTo])

  // Swipe (only fires from non-drawing areas; canvases capture their own pointer).
  const swipeRef = useRef<{ x: number; y: number } | null>(null)
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-draw], button, a, input, select, label')) return
    swipeRef.current = { x: e.clientX, y: e.clientY }
  }
  const onPointerUp = (e: React.PointerEvent) => {
    const start = swipeRef.current
    swipeRef.current = null
    if (!start) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.4) {
      goTo(dx < 0 ? page + 1 : page - 1)
    }
  }

  const handleUndo = () => {
    const api = undoStackRef.current.pop()
    api?.undo()
  }
  const handleClearPage = () => {
    undoStackRef.current = []
    setClearSignal(s => s + 1)
  }
  const handleStrokeEnd = useCallback((api: WritingCanvasApi) => {
    undoStackRef.current.push(api)
  }, [])

  const toggleDone = () => {
    setDone(prev => {
      const next = new Set(prev)
      if (next.has(page)) next.delete(page)
      else next.add(page)
      try { localStorage.setItem(doneKey, JSON.stringify(Array.from(next))) } catch { /* noop */ }
      return next
    })
  }

  const items = pages[page] ?? []
  const isDone = done.has(page)

  const modeBtn = (m: WorkbookMode, label: string) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      className={`text-[12.5px] font-semibold px-3 py-1.5 rounded-lg transition-colors ${
        mode === m ? 'bg-rose text-white' : 'bg-cream text-muted hover:text-ink hover:bg-line'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-4 print:hidden">
        <div className="flex items-center gap-1 bg-paper border border-line rounded-xl p-1">
          {modeBtn('write', t('writing_mode_write'))}
          {modeBtn('trace', t('writing_mode_trace'))}
          {modeBtn('quiz', t('writing_mode_quiz'))}
        </div>

        <div className="flex-1" />

        {mode !== 'quiz' && (
          <>
            <button
              type="button"
              onClick={handleUndo}
              className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-ink bg-cream border border-line px-3 py-1.5 rounded-lg hover:border-rose/30 hover:text-rose transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a4 4 0 014 4v2m-14-6l4-4m-4 4l4 4" />
              </svg>
              {t('writing_undo')}
            </button>
            <button
              type="button"
              onClick={handleClearPage}
              className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-ink bg-cream border border-line px-3 py-1.5 rounded-lg hover:border-rose/30 hover:text-rose transition-colors"
            >
              {t('writing_clear_page')}
            </button>
          </>
        )}

        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-ink bg-cream border border-line px-3 py-1.5 rounded-lg hover:border-rose/30 hover:text-rose transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          {t('writing_print')}
        </button>
      </div>

      {/* Swipe hint + progress */}
      <div className="flex items-center justify-between gap-3 mb-3 text-[12px] text-muted print:hidden">
        <span className="inline-flex items-center gap-1.5">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7l-4 5 4 5m8-10l4 5-4 5" />
          </svg>
          {t('writing_swipe_hint')}
        </span>
        <span>{t('writing_progress', { done: done.size, total })}</span>
      </div>

      {/* Print-only worksheet heading */}
      <div className="hidden print:block mb-4">
        <h2 className="font-serif font-bold text-[20px] text-ink">
          {t('writing_heading')} · {title} · {t('writing_page_indicator', { current: page + 1, total })}
        </h2>
      </div>

      {/* Worksheet page (swipeable). key remounts cells with a fresh surface per page. */}
      <div
        key={page}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        className="bg-paper border border-line rounded-2xl px-3 sm:px-5 py-1 select-none"
        style={{ touchAction: 'pan-y' }}
      >
        {items.map((item, i) => (
          <WorkbookRow
            key={`${page}-${i}-${item.character}`}
            item={item}
            mode={mode}
            cells={PRACTICE_CELLS}
            cellSize={cellSize}
            traceLead={TRACE_LEAD}
            clearSignal={clearSignal}
            onStrokeEnd={handleStrokeEnd}
            onDrawStart={() => { swipeRef.current = null }}
          />
        ))}
      </div>

      {/* Bottom navigation */}
      <div className="flex items-center justify-between gap-3 mt-5 print:hidden">
        <button
          type="button"
          onClick={() => goTo(page - 1)}
          disabled={page === 0}
          className="inline-flex items-center gap-1 text-[13px] font-semibold text-ink bg-cream border border-line px-4 py-2 rounded-xl hover:border-rose/30 hover:text-rose transition-colors disabled:opacity-40"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          {t('writing_prev_page')}
        </button>

        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="wb-jump">{t('writing_jump_page')}</label>
          <select
            id="wb-jump"
            value={page}
            onChange={e => goTo(parseInt(e.target.value, 10))}
            className="text-[12.5px] font-semibold text-ink bg-paper border border-line rounded-lg px-2 py-1.5 focus:outline-none focus:border-rose/40"
          >
            {pages.map((_, i) => (
              <option key={i} value={i}>
                {t('writing_page_indicator', { current: i + 1, total })}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={toggleDone}
            className={`text-[12.5px] font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
              isDone
                ? 'bg-teal/10 text-teal border-teal/30'
                : 'bg-cream text-muted border-line hover:text-ink'
            }`}
          >
            {isDone ? t('writing_marked_done') : t('writing_mark_done')}
          </button>
        </div>

        <button
          type="button"
          onClick={() => goTo(page + 1)}
          disabled={page === total - 1}
          className="inline-flex items-center gap-1 text-[13px] font-semibold text-ink bg-cream border border-line px-4 py-2 rounded-xl hover:border-rose/30 hover:text-rose transition-colors disabled:opacity-40"
        >
          {t('writing_next_page')}
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  )
}
