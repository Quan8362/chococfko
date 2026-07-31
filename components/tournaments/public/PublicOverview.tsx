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
    <div className="space-y-3">
      <h2 className="font-serif font-bold text-[16px] text-ink">{t('overview.events_heading')}</h2>
      <ul className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
        {events.map((ev) => {
          const pct = completionPercent(ev.completedMatchCount, ev.matchCount)
          const active = ev.id === selectedEventId
          return (
            <li key={ev.id}>
              <button
                type="button"
                onClick={() => onSelectEvent(ev.id)}
                aria-pressed={active}
                className={`w-full text-left rounded-2xl border p-4 transition-colors ${
                  active ? 'border-rose/50 bg-rose-soft/40' : 'border-line bg-paper hover:border-rose/30 hover:bg-cream/50'
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h3 className="font-semibold text-[14.5px] text-ink">{ev.name}</h3>
                  <span className="flex-none text-[11px] font-bold text-teal bg-teal-soft px-2 py-0.5 rounded-full">
                    {t(`overview.format_${ev.format}`)}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted">
                  <span>{t('overview.competitors_n', { count: ev.competitorCount })}</span>
                  <span>{t('overview.matches_n', { count: ev.matchCount })}</span>
                  <span>{t('overview.completed_n', { count: ev.completedMatchCount })}</span>
                  <span className="text-muted/80">{t(`overview.event_status_${ev.status}`)}</span>
                </div>
                {pct !== null && (
                  <div className="mt-2.5">
                    <div className="h-1.5 rounded-full bg-cream overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                      <div className="h-full bg-gradient-to-r from-rose to-fuchsia-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[11px] text-muted mt-1 inline-block">{t('overview.progress', { pct })}</span>
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
