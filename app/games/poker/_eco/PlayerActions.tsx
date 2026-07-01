'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { reportPlayer, blockPlayer } from '../ecosystem'

const REASONS = ['cheating', 'abuse', 'collusion', 'spam', 'other'] as const
type Reason = (typeof REASONS)[number]

// Report / block affordance for another player. Self-scoped & degrade-safe (the server returns
// feature_unavailable if the social migration isn't applied yet — shown as a friendly notice).
export default function PlayerActions({
  userId,
  displayName,
  tableId,
}: {
  userId: string
  displayName: string | null
  tableId?: string
}) {
  const t = useTranslations('games.poker')
  const [open, setOpen] = useState<null | 'menu' | 'report'>(null)

  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen(open ? null : 'menu')}
        aria-label={t('report.title')}
        className="rounded-md px-2 py-1 text-muted hover:bg-cream hover:text-ink"
      >
        ⋯
      </button>
      {open === 'menu' && (
        <div className="absolute right-0 z-30 mt-1 w-40 overflow-hidden rounded-lg border border-line bg-paper shadow-lg">
          <button onClick={() => setOpen('report')} className="block w-full px-3 py-2 text-left text-sm hover:bg-cream">
            {t('report.title')}
          </button>
          <BlockButton userId={userId} />
        </div>
      )}
      {open === 'report' && (
        <ReportDialog userId={userId} displayName={displayName} tableId={tableId} onClose={() => setOpen(null)} />
      )}
    </div>
  )
}

function BlockButton({ userId }: { userId: string }) {
  const t = useTranslations('games.poker')
  const [pending, start] = useTransition()
  const [done, setDone] = useState<string | null>(null)
  return (
    <button
      onClick={() => {
        if (!confirm(t('block.block_confirm'))) return
        start(async () => {
          const res = await blockPlayer(userId)
          setDone(res.ok ? 'blocked_success' : res.error === 'feature_unavailable' ? 'feature_unavailable' : 'block_failed')
        })
      }}
      disabled={pending || !!done}
      className="block w-full px-3 py-2 text-left text-sm text-rose hover:bg-cream disabled:opacity-60"
    >
      {done === 'blocked_success'
        ? t('block.blocked_success')
        : done === 'feature_unavailable'
          ? t('err.feature_unavailable')
          : done === 'block_failed'
            ? t('err.block_failed')
            : t('block.block')}
    </button>
  )
}

function ReportDialog({
  userId,
  displayName,
  tableId,
  onClose,
}: {
  userId: string
  displayName: string | null
  tableId?: string
  onClose: () => void
}) {
  const t = useTranslations('games.poker')
  const [reason, setReason] = useState<Reason>('cheating')
  const [note, setNote] = useState('')
  const [pending, start] = useTransition()
  const [result, setResult] = useState<string | null>(null)

  function submit() {
    start(async () => {
      const res = await reportPlayer(userId, reason, note, tableId)
      setResult(res.ok ? 'success' : res.error)
    })
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-2xl bg-paper p-6 text-ink shadow-xl">
        <h3 className="font-serif text-lg font-semibold">{t('report.title')}</h3>
        <p className="mt-1 text-sm text-muted">{displayName ?? t('profile.anonymous')} · {t('report.subtitle')}</p>

        {result === 'success' ? (
          <p className="mt-4 text-sm text-emerald-600">{t('report.success')}</p>
        ) : (
          <>
            <div className="mt-4 space-y-1.5">
              {REASONS.map((r) => (
                <label key={r} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} className="accent-rose" />
                  {t(`report.reason_${r}`)}
                </label>
              ))}
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('report.note_ph')}
              maxLength={1000}
              rows={3}
              className="mt-3 w-full rounded-lg border border-line bg-cream px-3 py-2 text-sm outline-none focus:border-rose"
            />
            {result && result !== 'success' && (
              <p className="mt-2 text-sm text-rose">
                {result === 'self'
                  ? t('report.self')
                  : result === 'login_required'
                    ? t('report.login_required')
                    : result === 'feature_unavailable'
                      ? t('err.feature_unavailable')
                      : t('err.report_failed')}
              </p>
            )}
          </>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm hover:border-rose">
            {result === 'success' ? t('nav.back') : t('report.cancel')}
          </button>
          {result !== 'success' && (
            <button
              onClick={submit}
              disabled={pending}
              className="rounded-lg bg-rose px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              {pending ? t('report.submitting') : t('report.submit')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
