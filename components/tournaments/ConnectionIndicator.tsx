'use client'

// A light, accessible realtime connection indicator (Prompt 11). Never color-only — every state carries
// a dot shape AND a text label; the whole strip is an aria-live region so assistive tech is told when the
// live link drops or returns. Includes a manual Refresh affordance for when realtime is unavailable.

import { useTranslations } from 'next-intl'
import type { ConnectionStatus } from './useTournamentRealtime'

const DOT: Record<ConnectionStatus, string> = {
  connecting: 'bg-muted/50',
  connected: 'bg-emerald-500',
  disconnected: 'bg-red-500',
  reconnecting: 'bg-amber-500',
}

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
  const live = status === 'connected'
  // Only genuine failure states offer a manual refresh. 'connecting' is a routine transient — it fires
  // on first mount and on every event-switch resubscribe — so surfacing (then hiding) the refresh
  // button there would jolt the right-anchored action bar sideways on each switch.
  const showRefresh = status === 'disconnected' || status === 'reconnecting'

  return (
    <div
      // Reserve a stable min-width so the label swapping between 'connecting' and 'connected' during
      // an event switch can't change this element's box and shift its neighbours in the action bar.
      className={`inline-flex items-center gap-2 text-[12px] text-muted min-w-[104px] ${className}`}
      role="status"
      aria-live="polite"
    >
      <span className="inline-flex items-center gap-1.5">
        <span className="relative inline-flex h-2 w-2" aria-hidden="true">
          {live && (
            <span className={`absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping ${DOT[status]}`} />
          )}
          <span className={`relative inline-flex h-2 w-2 rounded-full ${DOT[status]}`} />
        </span>
        <span>{label}</span>
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
