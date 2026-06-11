'use client'

import { useRef } from 'react'
import WritingCanvas, { type WritingCanvasApi } from './WritingCanvas'

interface WritingGridProps {
  char: string
  /** Number of writable practice cells. */
  cells: number
  /** Pixel size of each cell. */
  cellSize: number
  /** Show the faded glyph in every practice cell (trace mode). */
  traceAll: boolean
  /** In write mode, how many leading cells still show the faded glyph as a lead-in. */
  traceLead: number
  clearCellLabel: string
  /** Page-level clear signal forwarded to every cell. */
  clearSignal: number
  onStrokeEnd: (api: WritingCanvasApi) => void
  onDrawStart: () => void
}

export default function WritingGrid({
  char,
  cells,
  cellSize,
  traceAll,
  traceLead,
  clearCellLabel,
  clearSignal,
  onStrokeEnd,
  onDrawStart,
}: WritingGridProps) {
  const apisRef = useRef<(WritingCanvasApi | null)[]>([])

  return (
    <div className="flex flex-wrap gap-1.5">
      {/* Reference model cell */}
      <div
        lang="ja"
        className="shrink-0 flex items-center justify-center rounded-md border-2 border-rose/40 bg-rose-soft/40 font-bold text-ink leading-none select-none"
        style={{ width: cellSize, height: cellSize, fontSize: cellSize * 0.74, fontFamily: "'Noto Serif JP', 'Noto Sans JP', serif" }}
      >
        {char}
      </div>

      {/* Writable practice cells */}
      {Array.from({ length: cells }).map((_, i) => {
        const trace = traceAll || i < traceLead
        return (
          <div key={i} className="relative group">
            <WritingCanvas
              size={cellSize}
              char={char}
              trace={trace}
              clearSignal={clearSignal}
              onReady={api => { apisRef.current[i] = api }}
              onStrokeEnd={onStrokeEnd}
              onDrawStart={onDrawStart}
            />
            <button
              type="button"
              aria-label={clearCellLabel}
              title={clearCellLabel}
              onClick={() => apisRef.current[i]?.clear()}
              className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-paper border border-line text-muted opacity-40 hover:opacity-100 hover:text-rose hover:border-rose/40 transition-opacity flex items-center justify-center leading-none"
            >
              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )
      })}
    </div>
  )
}
