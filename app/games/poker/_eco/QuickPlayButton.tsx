'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { quickPlay } from '../ecosystem'

// Deterministic server-side matching: the SERVER picks the table (never a private one); the
// client only navigates to the chosen table where the authoritative buy-in happens.
export default function QuickPlayButton({
  preferredBigBlind,
  className,
  label,
}: {
  preferredBigBlind?: number
  className?: string
  label?: string
}) {
  const t = useTranslations('games.poker')
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function go() {
    if (busy) return
    setBusy(true)
    setError(null)
    const res = await quickPlay(preferredBigBlind)
    if (res.ok) {
      router.push(`/games/poker/${res.tableId}`)
      return
    }
    setBusy(false)
    const key = ['no_open_table', 'below_entry_gate', 'not_authenticated'].includes(res.error)
      ? res.error
      : 'quick_failed'
    setError(key)
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={go}
        disabled={busy}
        className={
          className ??
          'inline-flex items-center justify-center gap-2 rounded-lg bg-rose px-5 py-2.5 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60'
        }
      >
        {busy ? t('quick.searching') : label ?? t('lobby.quick_play')}
      </button>
      {error && (
        <p className="text-sm text-rose">
          {error === 'no_open_table'
            ? t('quick.no_table')
            : error === 'below_entry_gate'
              ? t('error.below_entry_gate')
              : error === 'not_authenticated'
                ? t('error.not_authenticated')
                : t('err.quick_failed')}
        </p>
      )}
    </div>
  )
}
