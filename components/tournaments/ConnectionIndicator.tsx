'use client'

// A light, accessible realtime connection indicator (Prompt 11). Never color-only — every state carries
// a dot shape AND a text label; the whole strip is an aria-live region so assistive tech is told when the
// live link drops or returns. Includes a manual Refresh affordance for when realtime is unavailable.

import { useTranslations } from 'next-intl'
import type { ConnectionStatus } from './useTournamentRealtime'

// Cyan for the healthy "connected" state keeps live-sync on the brand's status colour (never the
// broadcast-green that read as a live stream). Problem states stay red/amber so trouble still stands out.
const DOT: Record<ConnectionStatus, string> = {
  connecting: 'bg-muted/50',
  connected: 'bg-teal',
  disconnected: 'bg-red-500',
  reconnecting: 'bg-amber-500',
}

// Every status label, so the slot can reserve the widest one and never resize when the text swaps.
const STATUSES: ConnectionStatus[] = ['connecting', 'connected', 'disconnected', 'reconnecting']

export default function ConnectionIndicator({
  status,
  onRefresh,
  className = '',
}: {
  status: ConnectionStatus
  onRefresh?: () => void
  className?: string
}) {
  const t = useTranslations('tournaments')
  const label = t(`realtime.${status}`)
  // Only genuine failure states offer a manual refresh. 'connecting' is a routine transient — it fires
  // on first mount and on every event-switch resubscribe — so surfacing (then hiding) the refresh
  // button there would jolt the right-anchored action bar sideways on each switch.
  const showRefresh = status === 'disconnected' || status === 'reconnecting'

  return (
    <div
      // Width is held stable two ways so an event-switch resubscribe (connected→connecting→connected)
      // can't shift the action bar: the label slot reserves the widest status text via invisible ghosts
      // (below), and this min-width is a floor for the whole strip.
      className={`inline-flex items-center gap-2 text-[12px] text-muted min-w-[104px] ${className}`}
      role="status"
      aria-live="polite"
    >
      <span className="inline-flex items-center gap-1.5">
        {/* A calm static status dot — the textual label already conveys the live-sync state, so there is
            no attention-grabbing pulse. Trouble states carry their own red/amber colour + the refresh link. */}
        <span className="relative inline-flex h-2 w-2" aria-hidden="true">
          <span className={`relative inline-flex h-2 w-2 rounded-full ${DOT[status]}`} />
        </span>
        {/* Stack every possible label as an invisible ghost so the text slot always reserves the widest
            one. The visible label swapping (e.g. connected -> connecting on an event-switch resubscribe)
            then can never change this box's width and shift the action bar. */}
        <span className="grid whitespace-nowrap">
          {STATUSES.map((s) => (
            <span key={s} aria-hidden className="col-start-1 row-start-1 invisible">
              {t(`realtime.${s}`)}
            </span>
          ))}
          <span className="col-start-1 row-start-1">{label}</span>
        </span>
      </span>
      {showRefresh && onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center gap-1 font-semibold text-ink hover:text-rose transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          {t('realtime.refresh')}
        </button>
      )}
    </div>
  )
}
