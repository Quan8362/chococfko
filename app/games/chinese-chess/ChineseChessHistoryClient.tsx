'use client'

import { useState, useMemo } from 'react'
import { useTranslations } from 'next-intl'

export type ChessHistoryRow = {
  id: string
  winner: 'red' | 'black' | 'draw' | null
  player_red: string | null
  player_black: string | null
  player_red_name: string
  player_black_name: string
  time_label: string
}

const PAGE_SIZES = [10, 20, 50]

export default function ChineseChessHistoryClient({
  rows,
  userId,
}: {
  rows: ChessHistoryRow[]
  userId: string | null
}) {
  const t = useTranslations('games.chinese_chess')
  const tc = useTranslations('common')

  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pageItems = useMemo(
    () => rows.slice((safePage - 1) * pageSize, safePage * pageSize),
    [rows, safePage, pageSize],
  )

  function handlePageSize(newSize: number) {
    setPageSize(newSize)
    setPage(1)
  }

  if (rows.length === 0) return null

  return (
    <div>
      <h2 className="font-serif font-bold text-[20px] text-ink mb-4 flex items-center gap-2">
        📜 {t('history_heading')}
        <span className="text-[12px] font-normal text-muted/50 font-sans">({rows.length})</span>
      </h2>
      <div className="bg-paper border border-line rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          {/* Header */}
          <div className="grid grid-cols-[minmax(0,1fr)_64px_minmax(0,1fr)_80px_64px] gap-x-2 px-4 py-2.5 bg-cream/60 border-b border-line text-[11px] font-bold text-muted/60 uppercase tracking-widest min-w-[480px]">
            <span>{t('history_red')}</span>
            <span className="text-center">vs</span>
            <span className="pl-2">{t('history_black')}</span>
            <span className="text-center">{t('history_result')}</span>
            <span className="text-center">{t('history_time')}</span>
          </div>
          {/* Rows */}
          {pageItems.map((row, idx) => {
            const isRW = row.winner === 'red'
            const isBW = row.winner === 'black'
            const isDraw = row.winner === 'draw'
            const myRow = userId && (row.player_red === userId || row.player_black === userId)
            return (
              <div
                key={row.id}
                className={[
                  'grid grid-cols-[minmax(0,1fr)_64px_minmax(0,1fr)_80px_64px] gap-x-2 px-4 py-3 items-center text-[12.5px] min-w-[480px]',
                  myRow ? 'bg-rose/[0.03]' : '',
                  idx < pageItems.length - 1 ? 'border-b border-line/50' : '',
                ].join(' ')}
              >
                <div className={`flex items-center gap-1.5 min-w-0 ${isRW ? 'font-semibold text-red-700' : 'text-ink'}`}>
                  <span className="w-2 h-2 rounded-full bg-red-500 flex-none" />
                  <span className="truncate">{row.player_red_name}</span>
                  {isRW && <span className="flex-none text-[13px]">🏆</span>}
                </div>
                <div className="flex items-center justify-center">
                  <span className="text-[10px] font-bold text-muted/50 bg-line/70 px-2 py-0.5 rounded-md tracking-wide">vs</span>
                </div>
                <div className={`flex items-center gap-1.5 min-w-0 pl-2 ${isBW ? 'font-semibold text-ink' : 'text-ink'}`}>
                  <span className="w-2 h-2 rounded-full bg-zinc-700 flex-none" />
                  <span className="truncate">{row.player_black_name}</span>
                  {isBW && <span className="flex-none text-[13px]">🏆</span>}
                </div>
                <div className="flex justify-center">
                  {isDraw ? (
                    <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 whitespace-nowrap">{t('draw')}</span>
                  ) : isRW ? (
                    <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200 whitespace-nowrap">{t('win_red')}</span>
                  ) : (
                    <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-zinc-200 text-zinc-700 border border-zinc-300 whitespace-nowrap">{t('win_black')}</span>
                  )}
                </div>
                <div className="text-center text-[11px] text-muted/55 whitespace-nowrap">
                  {row.time_label}
                </div>
              </div>
            )
          })}
        </div>

        {/* Pagination footer */}
        <div className="px-4 py-3 border-t border-line/60 flex items-center justify-between flex-wrap gap-2 bg-cream/30">
          <div className="flex items-center gap-2">
            <select
              value={pageSize}
              onChange={e => handlePageSize(Number(e.target.value))}
              className="text-[12px] px-2 py-1 rounded-lg border border-line bg-paper text-ink focus:outline-none focus:border-rose/50 transition-colors"
            >
              {PAGE_SIZES.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <span className="text-[12px] text-muted/60">{tc('per_page')}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={safePage === 1}
              className="text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-line bg-paper hover:bg-cream/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ← {tc('page_prev')}
            </button>
            <span className="text-[12px] text-muted min-w-[80px] text-center">
              {tc('page_label')} {safePage} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              className="text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-line bg-paper hover:bg-cream/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {tc('page_next')} →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
