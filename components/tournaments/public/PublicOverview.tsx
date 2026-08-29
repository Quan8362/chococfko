'use client'

import { useTranslations } from 'next-intl'
import type { PublicEventSummary } from '@/lib/tournaments/public/types'
import { completionPercent } from '@/lib/tournaments/public/format'
import EmptyState from './EmptyState'

// Tournament overview: the list of events with format, live status, progress and counts. Selecting an
// event switches the workspace (handled by the parent via onSelectEvent).
export default function PublicOverview({
  events,
  selectedEventId,
  onSelectEvent,
}: {
  events: PublicEventSummary[]
  selectedEventId: string
  onSelectEvent: (id: string) => void
}) {
  const t = useTranslations('tournaments')

  if (events.length === 0) {
    return <EmptyState title={t('overview.no_events')} hint={t('empty.no_events_hint')} />
  }

  return (
    <div className="space-y-4">
      <h2 className="font-serif font-bold text-[18px] text-ink">{t('overview.events_heading')}</h2>
      {/* A balanced 2-up grid: single column on mobile, two wide columns from the small breakpoint up so
          four events read as a calm 2×2 instead of leaving a lone card stranded on a third column. */}
      <ul className="grid gap-4 sm:grid-cols-2">
        {events.map((ev) => {
          const pct = completionPercent(ev.completedMatchCount, ev.matchCount)
          const active = ev.id === selectedEventId
          return (
            <li key={ev.id}>
              <button
                type="button"
                onClick={() => onSelectEvent(ev.id)}
                aria-pressed={active}
                className={`group w-full h-full text-left rounded-2xl border p-5 sm:p-6 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${
                  active
                    ? 'border-rose bg-rose-soft/50 ring-1 ring-rose/20'
                    : 'border-line bg-paper hover:border-rose/30 hover:bg-cream/40'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  {/* The competition name is the focal point of the card — largest, tightest, ink. */}
                  <h3 className="font-semibold text-[16px] sm:text-[17px] text-ink leading-snug tracking-[-0.01em]">{ev.name}</h3>
                  <span className="flex-none text-[11px] font-semibold text-teal bg-teal-soft px-2 py-0.5 rounded-full">
                    {t(`overview.format_${ev.format}`)}
                  </span>
                </div>
                {/* Primary stats (competitors · matches) carry weight; the secondary line (played ·
                    stage) recedes into muted text — a clear two-tier hierarchy (design §10). */}
                <div className="mt-3.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-ink font-semibold">
                  <span>{t('overview.competitors_n', { count: ev.competitorCount })}</span>
                  <span aria-hidden className="text-line font-normal">·</span>
                  <span>{t('overview.matches_n', { count: ev.matchCount })}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
                  <span>{t('overview.completed_n', { count: ev.completedMatchCount })}</span>
                  <span aria-hidden className="text-line">·</span>
                  <span>{t(`overview.event_status_${ev.status}`)}</span>
                </div>
                {pct !== null && (
                  <div className="mt-4">
                    <div className="h-2 rounded-full bg-line/60 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                      <div className="h-full bg-gradient-to-r from-rose to-rose-medium rounded-full transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[12px] text-muted mt-1.5 inline-block">{t('overview.progress', { pct })}</span>
                  </div>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
