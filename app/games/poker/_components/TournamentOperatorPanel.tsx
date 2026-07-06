'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { operatorControlsFor } from '@/lib/games/poker/tournament/uiModel'
import type { TournamentState } from '@/lib/games/poker/tournament'
import {
  transitionTournament, drawSeats, advanceLevel, settleTournament,
} from '../tournament-actions'

const ERROR_KEYS = new Set([
  'not_authenticated', 'tournament_unavailable', 'not_operator', 'illegal_transition',
  'not_found', 'not_enough_players', 'seat_draw_failed', 'advance_level_failed',
  'transition_failed', 'settle_failed', 'already_settled', 'conservation_failed', 'not_heads_up_complete',
])

// Operator-only lifecycle controls. Renders ONLY the controls legal for the current state (the pure
// FSM model), confirms destructive actions, and re-checks everything server-side. Never shown to a
// non-operator (the parent gates on pokerAccessTournamentOperator).
export default function TournamentOperatorPanel({
  tournamentId, state, currentLevelIndex,
}: { tournamentId: string; state: TournamentState; currentLevelIndex: number }) {
  const t = useTranslations('games.poker.tournaments')
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const controls = operatorControlsFor(state)

  const msg = (code: string) => (ERROR_KEYS.has(code) ? t(`error.${code}`) : t('error.generic'))

  async function run(key: string, fn: () => Promise<{ ok: true } | { ok: false; error: string }>, confirmMsg?: string) {
    if (busy) return
    if (confirmMsg && !window.confirm(confirmMsg)) return
    setBusy(key); setError(null)
    const res = await fn()
    if (res.ok) { router.refresh(); setBusy(null); return }
    setError(msg(res.error)); setBusy(null)
  }

  return (
    <section className="rounded-xl border border-line bg-paper p-4" aria-label={t('operator.panel')}>
      <h3 className="mb-3 text-sm font-semibold text-ink">{t('operator.panel')}</h3>
      <div className="flex flex-wrap gap-2">
        {controls.map((c) => {
          const label = t(`operator.${c.key}`)
          const onClick = () => {
            if (c.op === 'draw_seats') return run(c.key, () => drawSeats(tournamentId))
            if (c.op === 'advance_level') return run(c.key, () => advanceLevel(tournamentId, currentLevelIndex + 1))
            if (c.op === 'settle') return run(c.key, () => settleTournament(tournamentId))
            return run(c.key, () => transitionTournament(tournamentId, c.to!), c.destructive ? t('operator.confirm_cancel') : undefined)
          }
          return (
            <button key={c.key} type="button" onClick={onClick} disabled={!!busy}
              className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-60 ${
                c.destructive ? 'border border-rose text-rose' : 'bg-ink text-paper'}`}>
              {busy === c.key ? t('operator.working') : label}
            </button>
          )
        })}
        {controls.length === 0 && <p className="text-sm text-ink/60">—</p>}
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-rose">{error}</p>}
    </section>
  )
}
