'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

type Result = { ok: true } | { ok: false; error: string } | Record<string, unknown>

// A command button that REQUIRES a typed reason before it runs (every admin action is audited
// with a justification). Expands an inline panel with a reason textarea + confirm. The `action`
// is a server action already bound with its target ids; it receives only the reason string.
export default function ReasonAction({
  action,
  label,
  danger = false,
  placeholder,
  small = false,
}: {
  action: (reason: string) => Promise<Result>
  label: string
  danger?: boolean
  placeholder?: string
  small?: boolean
}) {
  const t = useTranslations('admin_poker')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function run() {
    setError(null)
    if (reason.trim().length === 0) { setError(t('err_reason_required')); return }
    start(async () => {
      const res = await action(reason.trim())
      if (res && typeof res === 'object' && 'ok' in res && res.ok === false) {
        setError((res as { error: string }).error)
        return
      }
      setOpen(false); setReason('')
      router.refresh()
    })
  }

  const base = small ? 'text-[11px] px-2 py-1' : 'text-[12px] px-3 py-1.5'
  const tone = danger
    ? 'border-red-300 text-red-700 hover:bg-red-50'
    : 'border-line text-ink hover:bg-cream'

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={`rounded-lg border font-semibold ${base} ${tone}`}>
        {label}
      </button>
    )
  }
  return (
    <div className="rounded-lg border border-line bg-paper p-2 space-y-2 min-w-[240px]">
      <div className="text-[12px] font-semibold text-ink">{label}</div>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={placeholder ?? t('reason_placeholder')}
        rows={2}
        className="w-full rounded-md border border-line bg-cream px-2 py-1 text-[12px] text-ink"
      />
      {error && <div className="text-[11px] text-red-600">{t('err_prefix')}: {error}</div>}
      <div className="flex gap-2">
        <button type="button" disabled={pending} onClick={run}
          className={`rounded-md px-3 py-1 text-[12px] font-semibold text-white disabled:opacity-50 ${danger ? 'bg-red-600' : 'bg-rose'}`}>
          {pending ? t('working') : t('confirm')}
        </button>
        <button type="button" onClick={() => { setOpen(false); setError(null) }}
          className="rounded-md border border-line px-3 py-1 text-[12px] text-muted">
          {t('cancel')}
        </button>
      </div>
    </div>
  )
}
