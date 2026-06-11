'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import KanjiStrokeWriter from '../KanjiStrokeWriter'
import StrokeOrderStrip from './StrokeOrderStrip'
import WritingGrid from './WritingGrid'
import BigWriteModal from './BigWriteModal'
import type { WritingCanvasApi } from './WritingCanvas'

export interface WorkbookKanji {
  character: string
  han_viet: string | null
  meaning: string | null
  onyomi: string[] | null
  kunyomi: string[] | null
  stroke_count: number | null
}

export type WorkbookMode = 'write' | 'trace' | 'quiz'

interface WorkbookRowProps {
  item: WorkbookKanji
  mode: WorkbookMode
  cells: number
  cellSize: number
  traceLead: number
  clearSignal: number
  onStrokeEnd: (api: WritingCanvasApi) => void
  onDrawStart: () => void
}

export default function WorkbookRow({
  item, mode, cells, cellSize, traceLead, clearSignal, onStrokeEnd, onDrawStart,
}: WorkbookRowProps) {
  const t = useTranslations('japanese')
  const [bigOpen, setBigOpen] = useState(false)

  const readings = [
    ...(item.onyomi ?? []),
    ...(item.kunyomi ?? []),
  ].filter(Boolean)

  return (
    <div className="border-b border-line py-4 last:border-b-0">
      {/* Header: Hán Việt + meaning + stroke order strip */}
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            {item.han_viet && (
              <span className="font-serif font-bold text-[15px] sm:text-[16px] text-ink uppercase tracking-wide">
                {item.han_viet}
              </span>
            )}
            {item.stroke_count != null && (
              <span className="text-[11px] text-muted">
                {t('stroke_count')}: {item.stroke_count}
              </span>
            )}
          </div>
          {item.meaning && (
            <p className="text-[12.5px] text-muted leading-snug mt-0.5">{item.meaning}</p>
          )}
          {readings.length > 0 && (
            <p lang="ja" className="text-[11.5px] text-muted/80 mt-0.5">{readings.join('・')}</p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <StrokeOrderStrip char={item.character} />
          {mode !== 'quiz' && (
            <button
              type="button"
              onClick={() => setBigOpen(true)}
              className="hidden sm:inline-flex items-center gap-1 text-[11.5px] font-semibold text-rose bg-rose/10 border border-rose/20 px-2.5 py-1 rounded-lg hover:bg-rose/15 transition-colors whitespace-nowrap print:hidden"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              {t('writing_big')}
            </button>
          )}
        </div>
      </div>

      {/* Practice area */}
      {mode === 'quiz' ? (
        <div className="flex justify-center sm:justify-start">
          <KanjiStrokeWriter
            char={item.character}
            size={Math.min(180, cellSize * 2.6)}
            autoQuiz
            noDataFallback={
              <div
                lang="ja"
                className="flex flex-col items-center justify-center gap-1 rounded-xl border border-line bg-cream/40 text-center px-3"
                style={{ width: 150, minHeight: 150 }}
              >
                <span className="text-[56px] font-bold text-ink leading-none" style={{ fontFamily: "'Noto Serif JP', 'Noto Sans JP', serif" }}>
                  {item.character}
                </span>
                <p className="text-[11px] text-muted leading-tight">{t('kanji_practice_no_stroke')}</p>
              </div>
            }
          />
        </div>
      ) : (
        <WritingGrid
          char={item.character}
          cells={cells}
          cellSize={cellSize}
          traceAll={mode === 'trace'}
          traceLead={traceLead}
          clearCellLabel={t('writing_clear_cell')}
          clearSignal={clearSignal}
          onStrokeEnd={onStrokeEnd}
          onDrawStart={onDrawStart}
        />
      )}

      {/* Mobile write-big button */}
      {mode !== 'quiz' && (
        <button
          type="button"
          onClick={() => setBigOpen(true)}
          className="sm:hidden mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-rose bg-rose/10 border border-rose/20 px-3 py-1.5 rounded-lg print:hidden"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
          {t('writing_big')}
        </button>
      )}

      {bigOpen && (
        <BigWriteModal
          char={item.character}
          title={t('writing_big_title', { char: item.character })}
          traceLabel={t('writing_trace_toggle')}
          undoLabel={t('writing_undo')}
          clearLabel={t('writing_clear_cell')}
          closeLabel={t('kanji_practice_close')}
          onClose={() => setBigOpen(false)}
        />
      )}
    </div>
  )
}
