'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { resolveJp60Report, disableJp60Item, invalidateJp60Session } from './actions'

export type ReportDTO = {
  id: string
  sessionId: string | null
  sourceType: string
  sourceId: string
  qType: string
  questionText: string
  correctAnswer: string
  reason: string
  note: string | null
  locale: string | null
  createdAt: string
}

export function ReportRow({ r }: { r: ReportDTO }) {
  const t = useTranslations('admin_jp60')
  const tg = useTranslations('games.jp60')
  const [gone, setGone] = useState(false)
  const [busy, setBusy] = useState(false)
  if (gone) return null

  const act = async (fn: () => Promise<unknown>) => { setBusy(true); await fn(); setBusy(false); setGone(true) }

  return (
    <div className="bg-paper border border-line rounded-xl p-4">
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="font-serif font-bold text-[16px] text-ink">{r.questionText}</p>
        <span className="text-[10px] text-muted shrink-0">{r.sourceType}:{r.sourceId}</span>
      </div>
      <p className="text-[12px] text-muted mb-1">→ {r.correctAnswer} · {r.qType}</p>
      <p className="text-[13px] text-ink"><span className="font-semibold">{t('reason')}:</span> {tg(`reason_${r.reason}`)}</p>
      {r.note && <p className="text-[13px] text-muted mt-0.5"><span className="font-semibold">{t('note')}:</span> {r.note}</p>}
      <div className="flex flex-wrap gap-2 mt-3">
        <button disabled={busy} onClick={() => act(() => resolveJp60Report(r.id, 'reviewed'))} className="text-[12px] px-3 py-1.5 rounded-lg border border-line text-ink">{t('mark_reviewed')}</button>
        <button disabled={busy} onClick={() => act(() => resolveJp60Report(r.id, 'dismissed'))} className="text-[12px] px-3 py-1.5 rounded-lg border border-line text-muted">{t('dismiss')}</button>
        <button disabled={busy} onClick={() => act(async () => { await disableJp60Item(r.sourceType, r.sourceId, `report:${r.reason}`); await resolveJp60Report(r.id, 'reviewed') })} className="text-[12px] px-3 py-1.5 rounded-lg bg-rose text-white">{t('disable_item')}</button>
        {r.sessionId && <button disabled={busy} onClick={() => act(() => invalidateJp60Session(r.sessionId!))} className="text-[12px] px-3 py-1.5 rounded-lg border border-rose text-rose">{t('invalidate')}</button>}
      </div>
    </div>
  )
}
