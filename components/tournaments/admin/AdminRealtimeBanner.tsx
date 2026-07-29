'use client'

// Admin event-workspace realtime awareness (Prompt 11). Watches THIS event's tables so an admin sees
// when ANOTHER admin changes a score / seed / status / override / podium. It NEVER silently overwrites
// or auto-refreshes an open form: on a change it raises a non-blocking "data changed — reload" banner
// and lets the admin reload when ready (the optimistic-concurrency version guards in every RPC remain
// the real safety net). Also renders the light connection indicator. Scoped + cleaned up per event.

import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useTournamentRealtime, type RealtimeSubscription } from '@/components/tournaments/useTournamentRealtime'
import ConnectionIndicator from '@/components/tournaments/ConnectionIndicator'

export default function AdminRealtimeBanner({
  tournamentId,
  eventId,
}: {
  tournamentId: string
  eventId: string
}) {
  const t = useTranslations('admin_connection_status')
  const router = useRouter()
  const [changed, setChanged] = useState(false)

  // First subscribe frames can fire before the channel settles; ignore signals until connected once.
  const armed = useRef(false)

  const subscriptions: RealtimeSubscription[] = [
    { table: 'tournaments', filter: `id=eq.${tournamentId}` },
    { table: 'tournament_events', filter: `tournament_id=eq.${tournamentId}` },
    { table: 'tournament_matches', filter: `event_id=eq.${eventId}` },
    { table: 'tournament_match_games' },
    { table: 'tournament_qualification_overrides', filter: `event_id=eq.${eventId}` },
    { table: 'tournament_podium', filter: `event_id=eq.${eventId}` },
  ]

  const onSignal = useCallback(() => {
    if (armed.current) setChanged(true)
  }, [])

  const { status } = useTournamentRealtime({
    channelName: `admin-giai-dau:${tournamentId}:${eventId}`,
    subscriptions,
    onSignal,
  })

  // Arm once we have ever connected, so the initial snapshot doesn't look like a remote change.
  if (status === 'connected') armed.current = true

  const reload = () => {
    setChanged(false)
    router.refresh()
  }

  return (
    <div className="mb-4">
      <div className="flex items-center justify-end">
        <ConnectionIndicator status={status} />
      </div>
      {changed && (
        <div
          role="alert"
          className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5"
        >
          <div className="flex items-center gap-2 text-[13px] text-amber-900">
            <svg className="w-4 h-4 flex-none" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <span>{t('data_changed')}</span>
          </div>
          <button
            type="button"
            onClick={reload}
            className="flex-none font-semibold text-[12.5px] px-3.5 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors"
          >
            {t('reload')}
          </button>
        </div>
      )}
    </div>
  )
}
