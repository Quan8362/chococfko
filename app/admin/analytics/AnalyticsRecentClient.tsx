'use client'

import { useState, useMemo } from 'react'
import { useTranslations } from 'next-intl'

export type RecentEvent = {
  event_name: string
  path: string | null
  user_id: string | null
  created_at: string
  formatted_time: string
}

const PAGE_SIZE = 20

export default function AnalyticsRecentClient({ events }: { events: RecentEvent[] }) {
  const t = useTranslations('admin')

  const [search, setSearch] = useState('')
  const [filterEvent, setFilterEvent] = useState('')
  const [page, setPage] = useState(1)

  const uniqueEvents = useMemo(() => {
    const s = new Set(events.map(e => e.event_name))
    return Array.from(s).sort()
  }, [events])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return events.filter(e => {
      const matchEvent = !filterEvent || e.event_name === filterEvent
      const matchSearch = !q ||
        e.event_name.toLowerCase().includes(q) ||
        (e.path ?? '').toLowerCase().includes(q)
      return matchEvent && matchSearch
    })
  }, [events, search, filterEvent])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  function handleSearch(v: string) {
    setSearch(v)
    setPage(1)
  }
  function handleFilter(v: string) {
    setFilterEvent(v)
    setPage(1)
  }

  return (
    <div className="bg-paper border border-line rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 bg-cream/60 border-b border-line flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-serif font-bold text-[16px] text-ink">
          🕐 {t('analytics_recent')}
        </h2>
        <span className="text-[11px] text-muted/60">
          {filtered.length.toLocaleString()} / {events.length.toLocaleString()}
        </span>
      </div>

      {/* Filters */}
      <div className="px-5 py-3 border-b border-line/60 flex flex-wrap gap-2">
        <input
          type="text"
          value={search}
          onChange={e => handleSearch(e.target.value)}
          placeholder={t('analytics_search_placeholder')}
          className="flex-1 min-w-[180px] text-[12.5px] px-3 py-1.5 rounded-lg border border-line bg-cream/40 text-ink placeholder:text-muted/40 focus:outline-none focus:border-rose/50 focus:bg-paper transition-colors"
        />
        <select
          value={filterEvent}
          onChange={e => handleFilter(e.target.value)}
          className="text-[12.5px] px-3 py-1.5 rounded-lg border border-line bg-cream/40 text-ink focus:outline-none focus:border-rose/50 transition-colors"
        >
          <option value="">{t('analytics_filter_all_events')}</option>
          {uniqueEvents.map(ev => (
            <option key={ev} value={ev}>{ev}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {pageItems.length === 0 ? (
        <p className="px-5 py-8 text-center text-[13px] text-muted/60">{t('analytics_no_activity')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead>
              <tr className="text-[11px] font-bold text-muted/60 uppercase tracking-widest border-b border-line/60">
                <th className="px-5 py-2 text-left">{t('analytics_event')}</th>
                <th className="px-5 py-2 text-left">{t('analytics_path')}</th>
                <th className="px-5 py-2 text-left">{t('analytics_user_type')}</th>
                <th className="px-5 py-2 text-right">{t('analytics_time')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/40">
              {pageItems.map((ev, i) => (
                <tr key={i} className="hover:bg-cream/30 transition-colors text-[12.5px]">
                  <td className="px-5 py-2.5 font-mono text-ink/80 whitespace-nowrap">{ev.event_name}</td>
                  <td className="px-5 py-2.5 text-muted/70 truncate max-w-[200px]">{ev.path ?? '—'}</td>
                  <td className="px-5 py-2.5">
                    {ev.user_id
                      ? <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 whitespace-nowrap">logged in</span>
                      : <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200 whitespace-nowrap">anon</span>
                    }
                  </td>
                  <td className="px-5 py-2.5 text-right text-muted/60 whitespace-nowrap">{ev.formatted_time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-5 py-3 border-t border-line/60 flex items-center justify-between flex-wrap gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={safePage === 1}
            className="text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-line bg-paper hover:bg-cream/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            ← {t('page_prev')}
          </button>
          <span className="text-[12px] text-muted">
            {t('page_label')} {safePage} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={safePage === totalPages}
            className="text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-line bg-paper hover:bg-cream/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {t('page_next')} →
          </button>
        </div>
      )}
    </div>
  )
}
