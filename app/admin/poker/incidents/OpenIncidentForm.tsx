'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { openIncident } from '../actions'

const SEVERITIES = ['info', 'warn', 'error', 'critical'] as const
const CATEGORIES = ['chip_dumping', 'collusion', 'frozen_hand', 'abuse', 'other'] as const

export default function OpenIncidentForm() {
  const t = useTranslations('admin_poker')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [reason, setReason] = useState('')
  const [severity, setSeverity] = useState<string>('warn')
  const [category, setCategory] = useState<string>('other')
  const [tableId, setTableId] = useState('')
  const [handId, setHandId] = useState('')
  const [related, setRelated] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function submit() {
    setError(null)
    if (!title.trim()) { setError(t('err_title_required')); return }
    if (!reason.trim()) { setError(t('err_reason_required')); return }
    start(async () => {
      const res = await openIncident({
        title, reason, severity, category,
        tableId: tableId.trim() || null, handId: handId.trim() || null,
        relatedUserIds: related.split(',').map((s) => s.trim()).filter(Boolean),
      })
      if (!res.ok) { setError(res.error); return }
      setOpen(false); setTitle(''); setReason(''); setTableId(''); setHandId(''); setRelated('')
      router.refresh()
    })
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded-lg bg-rose px-4 py-2 text-[13px] font-semibold text-white">
        {t('open_incident')}
      </button>
    )
  }

  const input = 'w-full rounded-md border border-line bg-cream px-2 py-1 text-[12px]'
  return (
    <div className="rounded-xl border border-line bg-paper p-4 space-y-2 max-w-[560px]">
      <h2 className="font-serif font-bold text-[15px] text-ink">{t('open_incident')}</h2>
      <input className={input} placeholder={t('title')} value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea className={input} rows={2} placeholder={t('reason_placeholder')} value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className="flex gap-2">
        <select className={input} value={severity} onChange={(e) => setSeverity(e.target.value)}>
          {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className={input} value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <input className={input} placeholder={t('table_id_optional')} value={tableId} onChange={(e) => setTableId(e.target.value)} />
      <input className={input} placeholder={t('hand_id_optional')} value={handId} onChange={(e) => setHandId(e.target.value)} />
      <input className={input} placeholder={t('related_users_optional')} value={related} onChange={(e) => setRelated(e.target.value)} />
      {error && <div className="text-[11px] text-red-600">{t('err_prefix')}: {error}</div>}
      <div className="flex gap-2">
        <button type="button" disabled={pending} onClick={submit} className="rounded-md bg-rose px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50">{pending ? t('working') : t('confirm')}</button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-line px-3 py-1.5 text-[12px] text-muted">{t('cancel')}</button>
      </div>
    </div>
  )
}
