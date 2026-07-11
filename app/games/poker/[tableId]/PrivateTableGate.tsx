'use client'

// ── PrivateTableGate — the password prompt shown before a private table is revealed ────────────
//
// Direct navigation (a shared/invite link, a refresh, or a hand-typed URL) to a PRIVATE table the
// viewer has not yet unlocked lands here instead of the live table. It submits the password to the
// authoritative joinTable server action (which verifies it server-side and records membership);
// on success it refreshes the route so the server re-renders the now-authorized table. The browser
// never sees the stored password and never decides validity — it only relays the attempt.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { joinTable } from '../actions'

export default function PrivateTableGate({ tableId, tableName }: { tableId: string; tableName: string }) {
  const t = useTranslations('games.poker')
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function submit() {
    setError(null)
    start(async () => {
      const res = await joinTable(tableId, password)
      if (res.ok) router.refresh()
      else setError(res.error)
    })
  }

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-2xl bg-paper p-6 shadow-xl">
        <h3 className="font-serif text-lg font-semibold">{t('join.title')}</h3>
        <p className="mt-1 text-sm text-muted">{tableName}</p>
        <p className="mt-2 text-sm text-muted">{t('join.prompt')}</p>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && password && submit()}
          placeholder={t('join.password_ph')}
          className="mt-3 w-full rounded-lg border border-line bg-cream px-3 py-2 outline-none focus-visible:border-rose focus-visible:ring-2 focus-visible:ring-rose/25"
        />
        {error && (
          <p className="mt-2 text-sm text-rose">
            {error === 'wrong_password'
              ? t('error.wrong_password')
              : error === 'password_required'
                ? t('error.password_required')
                : error === 'table_not_open'
                  ? t('error.table_not_open')
                  : error === 'poker_joins_frozen'
                    ? t('error.poker_joins_frozen')
                    : error === 'poker_feature_off'
                      ? t('error.poker_feature_off')
                      : t('error.generic')}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={() => { window.location.href = '/games/poker' }}
            className="rounded-lg border border-line px-4 py-2 text-sm hover:border-rose"
          >
            {t('join.cancel')}
          </button>
          <button
            onClick={submit}
            disabled={pending || !password}
            className="rounded-lg bg-rose px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {t('join.submit')}
          </button>
        </div>
      </div>
    </div>
  )
}
