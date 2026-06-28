'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { updateReportStatus } from './actions'

export type ReportRow = {
  id: string
  reported_user_id: string | null
  room_id: string | null
  reason: string
  status: string
  recent_event_data: { keys?: { key: string; kind: string }[] } | null
  created_at: string
}

const STATUSES = ['open', 'reviewed', 'dismissed', 'actioned'] as const

export default function ReportsTable({ rows }: { rows: ReportRow[] }) {
  const t = useTranslations('admin_tlmn_react')
  if (rows.length === 0) {
    return <p className="text-[13px] text-muted rounded-xl border border-line bg-paper px-4 py-6 text-center">{t('r_none')}</p>
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full text-[13px] min-w-[760px]">
        <thead className="bg-cream text-ink"><tr className="text-left">
          <th className="px-3 py-2 font-bold">{t('r_when')}</th>
          <th className="px-3 py-2 font-bold">{t('r_reported')}</th>
          <th className="px-3 py-2 font-bold">{t('r_reason')}</th>
          <th className="px-3 py-2 font-bold">{t('r_keys')}</th>
          <th className="px-3 py-2 font-bold">{t('r_status')}</th>
          <th className="px-3 py-2 font-bold" />
        </tr></thead>
        <tbody>
          {rows.map(r => <Row key={r.id} row={r} t={t} />)}
        </tbody>
      </table>
    </div>
  )
}

function Row({ row, t }: { row: ReportRow; t: ReturnType<typeof useTranslations> }) {
  const [status, setStatus] = useState(row.status)
  const [pending, start] = useTransition()
  const keys = (row.recent_event_data?.keys ?? []).map(k => k.key).join(', ')
  const set = (s: string) => start(async () => { const res = await updateReportStatus(row.id, s); if (res.ok) setStatus(s) })
  return (
    <tr className="border-t border-line/70 align-top">
      <td className="px-3 py-2 whitespace-nowrap text-muted">{new Date(row.created_at).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
      <td className="px-3 py-2 font-mono text-[11px] text-ink">{row.reported_user_id ? row.reported_user_id.slice(0, 8) : '—'}</td>
      <td className="px-3 py-2"><span className="rounded-full bg-rose/10 text-rose font-bold text-[11px] px-2 py-0.5">{t(`react_report_${row.reason}` as Parameters<ReturnType<typeof useTranslations>>[0])}</span></td>
      <td className="px-3 py-2 text-[11px] text-muted max-w-[180px] truncate">{keys || '—'}</td>
      <td className="px-3 py-2"><span className="font-semibold text-[12px]">{t(`st_${status}` as Parameters<ReturnType<typeof useTranslations>>[0])}</span></td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {STATUSES.filter(s => s !== status).map(s => (
            <button key={s} type="button" onClick={() => set(s)} disabled={pending}
              className="text-[11px] font-semibold rounded-md border border-line px-2 py-1 hover:bg-rose/10 disabled:opacity-50">
              {t(`st_${s}` as Parameters<ReturnType<typeof useTranslations>>[0])}
            </button>
          ))}
        </div>
      </td>
    </tr>
  )
}
