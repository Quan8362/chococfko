'use client'

import { Fragment, useState } from 'react'

export interface HoursRow {
  label: string
  slots: string
  isToday: boolean
  /** Day is closed (or hours unknown) — render the closed label, not a time range. */
  closed?: boolean
}

/**
 * Opening-hours block for the visit-info rail card: a single computed
 * open/closed status line, with the full week behind a collapsible
 * disclosure (collapsed by default, today's row highlighted).
 */
export default function HoursDisclosure({
  stateLabel,
  stateColor,
  detail,
  rows,
  weekLabel,
  hideLabel,
  closedLabel,
  notes,
  dailySummary,
}: {
  stateLabel: string
  stateColor: string
  detail: string
  rows: HoursRow[]
  weekLabel: string
  hideLabel: string
  closedLabel: string
  notes?: string | null
  /** When set, all 7 days share identical hours: show this one-line summary instead of the week table + toggle. */
  dailySummary?: string | null
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="flex items-start gap-2.5">
      <span className="text-[15px] leading-none mt-px w-[18px] text-center shrink-0" aria-hidden>🕒</span>
      <div className="flex-1 min-w-0">
        <p className="leading-snug">
          <span className={`font-semibold ${stateColor}`}>{stateLabel}</span>
          {detail && <span className="text-[#5c4d44]"> · {detail}</span>}
        </p>
        {dailySummary ? (
          <p className="mt-1 text-[12.5px] text-muted tabular-nums">{dailySummary}</p>
        ) : (
        <>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-rose hover:underline"
        >
          {open ? hideLabel : weekLabel}
          <span className="text-[8px] leading-none">{open ? '▲' : '▼'}</span>
        </button>
        {open && (
          <div className="mt-1.5 grid grid-cols-[auto_auto] gap-x-6 gap-y-1 w-fit text-[12.5px]">
            {rows.map((r) => (
              <Fragment key={r.label}>
                <span className={r.isToday ? 'text-ink font-semibold' : 'text-muted'}>{r.label}</span>
                <span className={`text-right tabular-nums ${r.closed ? 'text-muted' : r.isToday ? 'text-ink font-semibold' : 'text-muted'}`}>
                  {r.closed ? closedLabel : r.slots}
                </span>
              </Fragment>
            ))}
          </div>
        )}
        </>
        )}
        {notes && <p className="text-[12px] text-muted mt-1.5">{notes}</p>}
      </div>
    </div>
  )
}
