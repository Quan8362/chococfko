'use client'

// One realtime subscription CONTROLLER shared by the public tournament detail and the admin event
// workspace (Prompt 11). A single Supabase channel watches the relevant tournament tables scoped to the
// open tournament/event. A realtime event is only a SIGNAL: the controller debounces + coalesces a burst
// (a mutation touches match + games + podium at once) into ONE `onSignal()` call, and the caller refetches
// the safe read model — the payloads are never trusted as the source of truth. When the channel drops it
// is NOT a page error: the last data stays, a light fallback poll kicks in (only while the tab is visible
// and disconnected), and it stops the moment realtime reconnects. Cleanup on unmount / scope change avoids
// duplicate channels after navigation or reconnect.

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting'

export interface RealtimeSubscription {
  readonly table: string
  readonly filter?: string // PostgREST filter, e.g. 'event_id=eq.<uuid>'
}

export interface UseTournamentRealtimeOptions {
  readonly channelName: string
  readonly subscriptions: readonly RealtimeSubscription[]
  readonly onSignal: () => void
  readonly debounceMs?: number
  readonly pollMs?: number
  readonly enabled?: boolean
}

export function useTournamentRealtime({
  channelName,
  subscriptions,
  onSignal,
  debounceMs = 400,
  pollMs = 45000,
  enabled = true,
}: UseTournamentRealtimeOptions): { status: ConnectionStatus; refreshNow: () => void } {
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const statusRef = useRef<ConnectionStatus>('connecting')
  const setConn = useCallback((s: ConnectionStatus) => {
    statusRef.current = s
    setStatus(s)
  }, [])

  // Keep the latest onSignal without re-subscribing the channel every render.
  const signalRef = useRef(onSignal)
  signalRef.current = onSignal

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const emitSignal = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      debounceTimer.current = null
      signalRef.current()
    }, debounceMs)
  }, [debounceMs])

  const refreshNow = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = null
    signalRef.current()
  }, [])

  // Serialize the subscription set so the effect only re-runs when the SCOPE actually changes.
  const subsKey = subscriptions.map((s) => `${s.table}:${s.filter ?? ''}`).join('|')

  useEffect(() => {
    if (!enabled) {
      setConn('disconnected')
      return
    }
    setConn('connecting')
    const supabase = createClient()
    const channel = supabase.channel(channelName)

    for (const sub of subscriptions) {
      channel.on(
        'postgres_changes',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { event: '*', schema: 'public', table: sub.table, ...(sub.filter ? { filter: sub.filter } : {}) } as any,
        () => emitSignal(),
      )
    }

    channel.subscribe((s: string) => {
      if (s === 'SUBSCRIBED') setConn('connected')
      else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') setConn('reconnecting')
      else if (s === 'CLOSED') {
        // A deliberate unsubscribe also reports CLOSED; only surface it when we did not tear down.
        if (statusRef.current !== 'connecting') setConn('disconnected')
      }
    })

    // Light fallback poll: only while disconnected/reconnecting AND the tab is visible. Never a request
    // loop — one refetch per interval, and it self-cancels once realtime is back.
    const poll = setInterval(() => {
      const st = statusRef.current
      if ((st === 'disconnected' || st === 'reconnecting') && document.visibilityState === 'visible') {
        emitSignal()
      }
    }, Math.max(30000, pollMs))

    // Coming back to a foregrounded tab that is not currently connected → refetch once immediately.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && statusRef.current !== 'connected') emitSignal()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearInterval(poll)
      document.removeEventListener('visibilitychange', onVisible)
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      debounceTimer.current = null
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName, subsKey, enabled, emitSignal, setConn])

  return { status, refreshNow }
}
