'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  canTransitionIncident, transitionRequiresResolution,
  type IncidentStatus,
} from '@/lib/games/poker/admin'
import ReasonAction from '../../_components/ReasonAction'
import { addIncidentNote, transitionIncident, refundHand, restrictPlayer, liftRestriction } from '../../actions'
import type { RestrictionRow } from '../../data'

const TARGETS: Exclude<IncidentStatus, 'REFUNDED'>[] = ['INVESTIGATING', 'OPEN', 'RESOLVED', 'DISMISSED']
const KINDS = ['no_join', 'no_sit', 'full_ban'] as const

export default function IncidentControls({
  caseId, status, handId, tableId, relatedUserIds, restrictions,
}: {
  caseId: string
  status: string
  handId: string | null
  tableId: string | null
  relatedUserIds: string[]
  restrictions: RestrictionRow[]
}) {
  const t = useTranslations('admin_poker')
  const router = useRouter()
  const [note, setNote] = useState('')
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  const cur = status as IncidentStatus
  const reachable = TARGETS.filter((to) => canTransitionIncident(cur, to))

  function submitNote() {
    setErr(null)
    if (!note.trim()) { setErr(t('err_note_required')); return }
    start(async () => {
      const res = await addIncidentNote(caseId, note.trim())
      if (!res.ok) { setErr(res.error); return }
      setNote(''); router.refresh()
    })
  }

  return (
    <section className="rounded-xl border border-line bg-paper p-4 space-y-4">
      <h2 className="font-serif font-bold text-[16px] text-ink">{t('case_controls')}</h2>

      {/* Add note */}
      <div className="space-y-2">
        <h3 className="text-[12px] font-semibold text-ink">{t('add_note')}</h3>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
          placeholder={t('note_placeholder')}
          className="w-full rounded-md border border-line bg-cream px-2 py-1 text-[12px]" />
        {err && <div className="text-[11px] text-red-600">{t('err_prefix')}: {err}</div>}
        <button type="button" disabled={pending} onClick={submitNote}
          className="rounded-md bg-rose px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50">{t('add_note')}</button>
      </div>

      {/* Transitions */}
      {reachable.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-[12px] font-semibold text-ink">{t('transition')}</h3>
          <div className="flex flex-wrap gap-2 items-start">
            {reachable.map((to) => (
              <Transition key={to} caseId={caseId} to={to} requiresResolution={transitionRequiresResolution(to)} label={t(`istatus_${to}` as 'istatus_OPEN')} />
            ))}
          </div>
        </div>
      )}

      {/* Refund (ties the case → REFUNDED) */}
      {handId && tableId && status !== 'REFUNDED' && (
        <div className="space-y-1">
          <h3 className="text-[12px] font-semibold text-ink">{t('cmd_refund')}</h3>
          <ReasonAction danger label={t('cmd_refund')}
            action={(reason) => refundHand(tableId, handId, reason, caseId)} />
        </div>
      )}

      {/* Restrict related players */}
      {relatedUserIds.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-[12px] font-semibold text-ink">{t('restrict_player')}</h3>
          {relatedUserIds.map((uid) => (
            <div key={uid} className="flex flex-wrap items-start gap-2">
              <span className="font-mono text-[12px] py-1">{uid.slice(0, 8)}</span>
              {KINDS.map((kind) => (
                <ReasonAction key={kind} small label={kind}
                  action={(reason) => restrictPlayer(uid, kind, reason, null, caseId)} />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Lift restrictions tied to this case */}
      {restrictions.filter((r) => r.active).length > 0 && (
        <div className="space-y-2">
          <h3 className="text-[12px] font-semibold text-ink">{t('lift_restriction')}</h3>
          {restrictions.filter((r) => r.active).map((r) => (
            <div key={r.id} className="flex items-center gap-2">
              <span className="font-mono text-[12px]">{r.userId.slice(0, 8)} · {r.kind}</span>
              <ReasonAction small label={t('lift_restriction')} action={(reason) => liftRestriction(r.id, reason)} />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function Transition({ caseId, to, requiresResolution, label }: {
  caseId: string; to: Exclude<IncidentStatus, 'REFUNDED'>; requiresResolution: boolean; label: string
}) {
  const t = useTranslations('admin_poker')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [resolution, setResolution] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function run() {
    setErr(null)
    if (!reason.trim()) { setErr(t('err_reason_required')); return }
    if (requiresResolution && !resolution.trim()) { setErr(t('err_resolution_required')); return }
    start(async () => {
      const res = await transitionIncident(caseId, to, reason.trim(), resolution.trim() || undefined)
      if (!res.ok) { setErr(res.error); return }
      setOpen(false); router.refresh()
    })
  }

  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-semibold hover:bg-cream">→ {label}</button>
  }
  const input = 'w-full rounded-md border border-line bg-cream px-2 py-1 text-[12px]'
  return (
    <div className="rounded-lg border border-line bg-paper p-2 space-y-2 min-w-[240px]">
      <div className="text-[12px] font-semibold">→ {label}</div>
      <textarea className={input} rows={2} placeholder={t('reason_placeholder')} value={reason} onChange={(e) => setReason(e.target.value)} />
      {requiresResolution && <textarea className={input} rows={2} placeholder={t('resolution_placeholder')} value={resolution} onChange={(e) => setResolution(e.target.value)} />}
      {err && <div className="text-[11px] text-red-600">{t('err_prefix')}: {err}</div>}
      <div className="flex gap-2">
        <button type="button" disabled={pending} onClick={run} className="rounded-md bg-rose px-3 py-1 text-[12px] font-semibold text-white disabled:opacity-50">{pending ? t('working') : t('confirm')}</button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-line px-3 py-1 text-[12px] text-muted">{t('cancel')}</button>
      </div>
    </div>
  )
}
