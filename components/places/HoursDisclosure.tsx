'use client'

import { useState } from 'react'

export interface HoursRow {
  label: string
  slots: string
  isToday: boolean
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
  notes,
}: {
  stateLabel: string
  stateColor: string
  detail: string
  rows: HoursRow[]
  weekLabel: string
  hideLabel: string
  notes?: string | null
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
          <table className="mt-1.5 w-full max-w-[200px] text-[12.5px]">
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className={r.isToday ? 'text-ink font-semibold' : 'text-muted'}>
                  <td className="pr-4 py-[3px]">{r.label}</td>
                  <td className="py-[3px] text-right tabular-nums">{r.slots}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {notes && <p className="text-[12px] text-muted mt-1.5">{notes}</p>}
      </div>
    </div>
  )
}
