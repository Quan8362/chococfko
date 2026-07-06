'use client'

// ── useTournamentTable — realtime transport for the internal-alpha tournament live table ──────
//
// Mirrors the hardened cash-poker pattern (usePokerRealtime): realtime is NOTIFICATION-ONLY. Every
// relevant postgres_changes event triggers a re-read of ONE viewer-safe snapshot
// (getTournamentTableView) which is the single source of truth. A missed / duplicated / out-of-order
// event can never corrupt state, and recovery never needs a manual page reload.
//
// It subscribes ONLY to the NON-SECRET published tables (poker_tournament_table_state / _seats /
// _entries). The seed-bearing tournament + hand rows are never read by the browser and never
// traverse realtime — the viewer's own hole cards arrive solely inside the server snapshot.
//
// It also keeps play flowing. Advancement is SERVER-authoritative: reading the table
// (getTournamentTableView) opens the next hand once the showdown grace passes, idempotently. So the
// client never fires a one-shot "start next hand" request that could be lost — it simply RECONCILES
// on a short cadence while the table is idle-but-playable, and each read advances the hand. A missed,
// aborted, or duplicated read is harmless; the next tick (or a refresh/reopen) retries. This is what
// makes next-hand advancement wedge-proof (27G-F1) — no single request can strand the table.

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { PokerActionType } from '@/lib/games/poker/types'
import { toAppliedAction, type TournamentTableView } from '@/lib/games/poker/tournament/tableView'
import { getTournamentTableView, submitTournamentAction } from '../../../tournament-actions'

const WATCHDOG_MS = 12000
// While a table is idle-but-playable (hand complete / none open), reconcile on this faster cadence so
// the server read-path opens the next hand promptly after the showdown grace. Retry-safe by design.
const ADVANCE_PUMP_MS = 1500

export type TnmtConnUx = 'connecting' | 'connected' | 'reconnecting' | 'offline'

export interface TournamentTableApi {
  readonly view: TournamentTableView | null
  readonly connUx: TnmtConnUx
  readonly reconciledOnce: boolean
  // Submit ONE authoritative action. Identity, turn, legality, amount and action-seq are all
  // re-validated server-side; this only sends intent + the expected action-seq (stale-action CAS).
  readonly act: (action: PokerActionType, amount?: number) => Promise<{ ok: boolean; error?: string }>
  readonly reconcileNow: () => void
}

export function useTournamentTable(tournamentId: string): TournamentTableApi {
  const [view, setView] = useState<TournamentTableView | null>(null)
  const viewRef = useRef<TournamentTableView | null>(null)
  const [reconciledOnce, setReconciledOnce] = useState(false)
  const [transport, setTransport] = useState<'connecting' | 'connected' | 'reconnecting'>('connecting')
  const [online, setOnline] = useState(true)

  const mountedRef = useRef(true)
  const inFlightRef = useRef(false)
  const dirtyRef = useRef(false)

  const applySnapshot = useCallback((next: TournamentTableView) => {
    const cur = viewRef.current
    // Within the SAME hand, drop a strictly older snapshot (an overlapping fetch that resolved late).
    // A different handId (new hand, elimination → table-less, champion/complete) always applies so
    // transitions are never suppressed by a high in-hand version.
    if (cur && cur.handId === next.handId && next.version < cur.version) return
    viewRef.current = next
    setView(next)
  }, [])

  const reconcile = useCallback(() => {
    if (inFlightRef.current) { dirtyRef.current = true; return }
    inFlightRef.current = true
    dirtyRef.current = false
    getTournamentTableView(tournamentId)
      .then((res) => {
        if (!mountedRef.current) return
        if (res.ok) { applySnapshot(res.view); setReconciledOnce(true) }
      })
      .catch(() => { /* transient; watchdog retries */ })
      .finally(() => {
        inFlightRef.current = false
        if (dirtyRef.current && mountedRef.current) reconcile()
      })
  }, [tournamentId, applySnapshot])

  // ── Realtime subscription (NON-SECRET tables only) ──────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true
    const supabase = createClient()
    const onChange = () => { if (mountedRef.current) reconcile() }
    const channel = supabase
      .channel(`tnmt:${tournamentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poker_tournament_table_state', filter: `tournament_id=eq.${tournamentId}` }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poker_tournament_seats', filter: `tournament_id=eq.${tournamentId}` }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poker_tournament_entries', filter: `tournament_id=eq.${tournamentId}` }, onChange)
      .subscribe((status) => {
        if (!mountedRef.current) return
        if (status === 'SUBSCRIBED') { setTransport('connected'); reconcile() }
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') { setTransport('reconnecting'); reconcile() }
      })

    // Keep the socket authenticated across token refreshes (closes the brief re-auth gap).
    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
        if (session?.access_token) supabase.realtime.setAuth(session.access_token)
        if (mountedRef.current) reconcile()
      }
    })

    return () => {
      mountedRef.current = false
      authSub.unsubscribe()
      supabase.removeChannel(channel)
    }
  }, [tournamentId, reconcile])

  // ── Recovery watchdog + tab-resume / network-restore ───────────────────────────────────
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') reconcile() }
    const onOnline = () => { setOnline(true); reconcile() }
    const onOffline = () => setOnline(false)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    setOnline(typeof navigator === 'undefined' ? true : navigator.onLine)
    const interval = setInterval(() => { if (document.visibilityState === 'visible') reconcile() }, WATCHDOG_MS)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      clearInterval(interval)
    }
  }, [reconcile])

  // ── Keep play flowing: reconcile on a short cadence while idle-but-playable ───────────────
  // No one-shot "start next hand" request that could be lost — the server read-path advances the
  // hand. A missed/aborted tick is harmless; the next one retries. When a new hand opens (or the
  // table can no longer play) the deps change and the interval clears. Multi-client-safe: both
  // players' reconciles hit the same idempotent server path and converge on exactly one hand.
  useEffect(() => {
    if (!view) return
    const seatedHere = view.viewerSeatIndex !== null
    const idlePlayable = view.canContinue && (view.handId === null || view.complete)
    if (!seatedHere || !idlePlayable) return
    const id = window.setInterval(() => { if (mountedRef.current) reconcile() }, ADVANCE_PUMP_MS)
    return () => window.clearInterval(id)
    // Only the idle-playable signal (not every snapshot) should (re)arm the pump.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.handId, view?.complete, view?.canContinue, view?.viewerSeatIndex, view?.meta.state, reconcile])

  const act = useCallback(async (action: PokerActionType, amount?: number) => {
    const cur = viewRef.current
    if (!cur || cur.handId === null) return { ok: false, error: 'no_hand' }
    const applied = toAppliedAction(action, amount)
    if (!applied) return { ok: false, error: 'bad_action' }
    const res = await submitTournamentAction(tournamentId, cur.handId, applied, cur.actionSeq)
    // Pull authoritative truth whatever the outcome (the realtime echo also will).
    reconcile()
    return res.ok ? { ok: true } : { ok: false, error: res.error }
  }, [tournamentId, reconcile])

  const reconcileNow = useCallback(() => reconcile(), [reconcile])

  const connUx: TnmtConnUx = !online ? 'offline'
    : transport === 'reconnecting' ? 'reconnecting'
    : !reconciledOnce ? 'connecting'
    : 'connected'

  return { view, connUx, reconciledOnce, act, reconcileNow }
}
