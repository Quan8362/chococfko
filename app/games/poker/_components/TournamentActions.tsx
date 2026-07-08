'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { registerForTournament, unregisterFromTournament } from '../tournament-actions'

const ERROR_KEYS = new Set([
  'not_authenticated', 'tournament_unavailable', 'not_operator', 'already_registered', 'field_full',
  'insufficient_balance', 'registration_closed', 'too_late_to_unregister', 'illegal_transition',
  'not_found', 'invalid_config', 'rate_limited',
])

// Participant register / unregister. Waits for authoritative server confirmation, blocks double
// submits while pending, and only refreshes on ok — never infers success optimistically.
export default function TournamentActions({
  tournamentId, canRegister, canUnregister,
}: { tournamentId: string; canRegister: boolean; canUnregister: boolean }) {
  const t = useTranslations('games.poker.tournaments')
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const msg = (code: string) => (ERROR_KEYS.has(code) ? t(`error.${code}`) : t('error.generic'))

  async function register() {
    if (busy) return
    setBusy(true); setError(null)
    const res = await registerForTournament(tournamentId)
    if (res.ok) { router.refresh(); setBusy(false); return }
    setError(msg(res.error)); setBusy(false)
  }
  async function unregister() {
    if (busy) return
    if (!window.confirm(t('register.confirm_unregister'))) return
    setBusy(true); setError(null)
    const res = await unregisterFromTournament(tournamentId)
    if (res.ok) { router.refresh(); setBusy(false); return }
    setError(msg(res.error)); setBusy(false)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-2">
        {canRegister && (
          <button type="button" onClick={register} disabled={busy}
            className="inline-flex items-center justify-center rounded-lg bg-rose px-5 py-2.5 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60">
            {busy ? t('register.registering') : t('register.cta')}
          </button>
        )}
        {canUnregister && (
          <button type="button" onClick={unregister} disabled={busy}
            className="inline-flex items-center justify-center rounded-lg border border-line bg-paper px-5 py-2.5 font-medium text-ink transition-opacity hover:opacity-90 disabled:opacity-60">
            {busy ? t('register.unregistering') : t('register.unregister')}
          </button>
        )}
      </div>
      {error && <p role="alert" className="text-sm text-rose">{error}</p>}
    </div>
  )
}
