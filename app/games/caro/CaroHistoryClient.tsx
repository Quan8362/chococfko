'use client'

import { useState, useMemo } from 'react'
import { useTranslations } from 'next-intl'

export type CaroHistoryRow = {
  id: string
  winner: 'X' | 'O' | 'draw' | null
  player_x: string | null
  player_o: string | null
  player_x_name: string
  player_o_name: string
  time_label: string
}

const PAGE_SIZES = [10, 20, 50]

export default function CaroHistoryClient({
  rows,
  userId,
}: {
  rows: CaroHistoryRow[]
  userId: string | null
}) {
  const t = useTranslations('games.caro')
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
    <div className="mt-12">
      <h2 className="font-serif font-bold text-[20px] text-ink mb-4 flex items-center gap-2">
        📜 {t('history_heading')}
        <span className="text-[12px] font-normal text-muted/60 font-sans">({rows.length})</span>
      </h2>
      <div className="bg-paper border border-line rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          {/* Header */}
          <div className="grid grid-cols-[minmax(0,1fr)_64px_minmax(0,1fr)_100px_80px] gap-x-3 px-4 py-2.5 bg-cream/80 border-b border-line text-[11px] font-bold text-muted/60 uppercase tracking-widest min-w-[480px]">
            <span className="flex items-center gap-1.5">
              <span className="text-[9px] font-black text-blue-500">✕</span>
              {t('history_player_x')}
            </span>
            <span className="flex items-center justify-center text-center">{t('history_vs')}</span>
            <span className="flex items-center gap-1.5 pl-2">
              <span className="text-[9px] font-black text-rose">○</span>
              {t('history_player_o')}
            </span>
            <span className="text-center">{t('history_result')}</span>
            <span className="text-center">{t('history_time')}</span>
          </div>
          {/* Rows */}
          {pageItems.map((row, idx) => {
            const isXWin = row.winner === 'X'
            const isOWin = row.winner === 'O'
            const isDraw = row.winner === 'draw'
            const myRow = userId && (row.player_x === userId || row.player_o === userId)
            return (
              <div
                key={row.id}
                className={`grid grid-cols-[minmax(0,1fr)_64px_minmax(0,1fr)_100px_80px] gap-x-3 px-4 py-3.5 items-center text-[13px] transition-colors hover:bg-cream/60 min-w-[480px]
                  ${myRow ? 'bg-rose/[0.03]' : ''}
                  ${idx < pageItems.length - 1 ? 'border-b border-line/50' : ''}
                `}
              >
                <div className={`flex items-center gap-1.5 min-w-0 ${isXWin ? 'font-semibold text-blue-700' : 'text-ink/90'}`}>
                  <span className="text-[10px] font-black text-blue-500 flex-none">✕</span>
                  <span className="truncate">{row.player_x_name}</span>
                  {isXWin && <span className="text-[13px] flex-none leading-none">🏆</span>}
                </div>
                <div className="flex items-center justify-center">
                  <span className="text-[10px] font-bold text-muted/50 bg-line/70 px-2 py-0.5 rounded-md tracking-wide">{t('history_vs')}</span>
                </div>
                <div className={`flex items-center gap-1.5 min-w-0 pl-2 ${isOWin ? 'font-semibold text-rose' : 'text-ink/90'}`}>
                  <span className="text-[10px] font-black text-rose flex-none">○</span>
                  <span className="truncate">{row.player_o_name}</span>
                  {isOWin && <span className="text-[13px] flex-none leading-none">🏆</span>}
                </div>
                <div className="flex justify-center">
                  {isDraw ? (
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200 whitespace-nowrap">{t('draw')}</span>
                  ) : isXWin ? (
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 border border-blue-200 whitespace-nowrap">{t('win_x')}</span>
                  ) : (
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-rose/10 text-rose border border-rose/20 whitespace-nowrap">{t('win_o')}</span>
                  )}
                </div>
                <div className="text-center text-[11.5px] text-muted/60 whitespace-nowrap">
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
