'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { resolveReport, rejectReport, type PlaceReportRow } from '../actions'

export default function ReportRow({ report }: { report: PlaceReportRow }) {
  const t = useTranslations('place_qa')
  const [note, setNote] = useState('')
  const [done, setDone] = useState<string | null>(null)
  const [, start] = useTransition()

  const act = (fn: (id: string, note: string) => Promise<{ ok: boolean }>, label: string) =>
    start(async () => { const r = await fn(report.id, note); if (r.ok) setDone(label) })

  if (done) return <li className="bg-paper border border-line rounded-2xl p-4 text-[13px] text-muted">{t('admin_reviewed')}: {done}</li>

  return (
    <li className="bg-paper border border-line rounded-2xl p-4">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-1.5">
        <span className="text-[13px] font-semibold text-rose">{t(`rk_${report.kind}` as 'rk_other')}</span>
        <span className="text-[11.5px] text-muted">{new Date(report.created_at).toLocaleDateString()}</span>
      </div>
      {report.detail && <p className="text-[13.5px] text-[#3a2d22] mb-2 whitespace-pre-wrap">{report.detail}</p>}
      <div className="flex gap-3 text-[12.5px] mb-3">
        <Link href={`/places/${report.place_slug}`} target="_blank" className="text-teal hover:underline">{t('admin_open_place')}</Link>
        <Link href={`/admin/places/${report.place_slug}`} className="font-semibold text-rose hover:underline">{t('admin_edit_place')}</Link>
        <code className="text-muted">{report.place_slug}</code>
      </div>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('admin_note_ph')} rows={2} className="w-full text-[13px] px-3 py-2 border border-line rounded-lg bg-white resize-y mb-2" />
      <div className="flex gap-2">
        <button type="button" onClick={() => act(resolveReport, t('admin_resolve'))} className="text-[12.5px] font-semibold px-4 py-2 rounded-full bg-emerald-500 text-white">{t('admin_resolve')}</button>
        <button type="button" onClick={() => act(rejectReport, t('admin_reject'))} className="text-[12.5px] font-semibold px-4 py-2 rounded-full border border-line text-muted hover:text-rose">{t('admin_reject')}</button>
      </div>
    </li>
  )
}
