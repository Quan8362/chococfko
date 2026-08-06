'use client'

import Link from 'next/link'
import StatusPill from './StatusPill'
import type { DiscoveryItem } from '@/lib/tournaments/public/listFilter'

// Premium tournament card for the public discovery grid. Presentational only — all data is
// pre-resolved server-side (phase, formatted date label, event count). The WHOLE card is a single
// link (the visible "Xem chi tiết" affordance is decorative, kept for scent) so there are no nested
// interactive elements. Accessible name comes from the heading via `aria-labelledby`.
export default function TournamentCard({
  item,
  labels,
}: {
  item: DiscoveryItem
  labels: {
    statusLabel: string
    viewDetail: string
    datesTbd: string
    locationTbd: string
    eventsCount: string
  }
}) {
  const headingId = `trn-card-${item.slug}`
  return (
    <Link
      href={`/giai-dau/${item.slug}`}
      aria-labelledby={headingId}
      className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-paper p-5 transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-1 hover:border-rose/40 hover:shadow-[0_18px_40px_-16px_rgba(194,24,91,0.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/60 focus-visible:ring-offset-2 focus-visible:ring-offset-cream motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      {/* Brand top accent — subtle, strengthens on hover/focus. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-rose to-transparent opacity-60 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
      />

      <div className="mb-3 flex items-start justify-between gap-3">
        <h2
          id={headingId}
          title={item.name}
          className="min-w-0 font-serif text-[18px] font-bold leading-snug text-ink transition-colors line-clamp-2 group-hover:text-rose"
        >
          {item.name}
        </h2>
        <span className="flex-none">
          <StatusPill phase={item.phase} label={labels.statusLabel} />
        </span>
      </div>

      <div className="space-y-1.5 text-[13px] text-muted">
        <p className="flex items-center gap-2">
          <CalendarIcon />
          <span className="min-w-0 truncate">{item.dateLabel || labels.datesTbd}</span>
        </p>
        <p className="flex items-center gap-2">
          <PinIcon />
          <span className="min-w-0 truncate" title={item.location ?? undefined}>
            {item.location || labels.locationTbd}
          </span>
        </p>
        <p className="flex items-center gap-2">
          <GridIcon />
          <span className="min-w-0 truncate">{labels.eventsCount}</span>
        </p>
      </div>

      <span className="mt-4 inline-flex items-center gap-1 pt-3 text-[12.5px] font-semibold text-rose">
        {labels.viewDetail}
        <svg
          className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </span>
    </Link>
  )
}

function CalendarIcon() {
  return (
    <svg className="h-4 w-4 flex-none text-muted/70" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    </svg>
  )
}
function PinIcon() {
  return (
    <svg className="h-4 w-4 flex-none text-muted/70" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
    </svg>
  )
}
function GridIcon() {
  return (
    <svg className="h-4 w-4 flex-none text-muted/70" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25a2.25 2.25 0 01-2.25-2.25v-2.25z" />
    </svg>
  )
}
