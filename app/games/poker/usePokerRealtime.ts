'use client'

// ── usePokerRealtime — Caro-grade realtime transport for a Poker table ──────────────────
//
// This hook owns the socket, the timers, and the recovery watchdog; ALL reconciliation logic
// lives in the pure PokerSyncController (lib/games/poker/realtime.ts) so it stays unit-tested.
// Realtime is NOTIFICATION only: every relevant postgres_changes event triggers a re-read of
// ONE recipient-aware authoritative snapshot (fetchPokerSnapshot), guarded by the monotonic
// state_version. This is the deliberate upgrade over TLMN's nudge-polling and matches the
// hardened Caro pattern (memory caro-realtime-sync): a missed/duplicated/out-of-order event can
// never corrupt money-bearing state, and recovery never needs a manual full-page reload.
//
// Subscribes to the PUBLIC tables only (poker_hands / poker_seats / poker_tables). Private hole
// cards never traverse realtime — after each new hand the caller re-fetches its OWN cards via
// the RLS read-own path (fetchMyHoleCards) and merges them into the controller.

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { trackEvent } from '@/lib/analytics'
import { RECONNECT_EVENTS } from '@/lib/games/poker/perf'
import {
  PokerSyncController,
  deriveConnUx,
  canSubmitAction,
  turnSecondsLeft,
  shouldNudgeTimeout,
  type PokerConnUx,
  type PokerLegalView,
  type TransitionCues,
} from '@/lib/games/poker/realtime'
import type { PublicTableState, MyHoleCardsState, PokerActionType } from '@/lib/games/poker/types'
import {
  fetchPokerSnapshot,
  fetchMyHoleCards,
  pokerAct,
  tickActionTimer,
  setSeatConnection,
} from './actions'
import { notePokerReconnect } from './social'

// Recovery watchdog cadence — a slow safety net, NOT polling. Realtime stays primary; this only
// repairs a silently-missed event (mobile tab freeze, brief network loss that never surfaces as
// CLOSED, the re-auth gap after an hourly token refresh).
const WATCHDOG_MS = 12000
// Presence heartbeat: refresh the seat's connected flag so a transient drop is visible to the
// table without releasing the seat or stack (RECONNECT-001).
const HEARTBEAT_MS = 20000
// Turn-clock display cap (base action time). The server owns the real deadline; this only caps
// the countdown ring when no live deadline is set.
const TURN_CAP_SECONDS = 20
// Nudge authoritative timeout resolution this long after the displayed deadline (a touch beyond
// the server's own grace) so a skewed/slow client still lands; the server re-validates expiry.
const TIMEOUT_NUDGE_GRACE_MS = 2500
const TIMEOUT_NUDGE_THROTTLE_MS = 3000

export interface PokerRealtimeView {
  readonly publicState: PublicTableState | null
  readonly ownHole: MyHoleCardsState | null
  readonly legal: PokerLegalView | null
  readonly viewerSeatIndex: number | null
  readonly isSpectator: boolean
  readonly isMyTurn: boolean
  readonly connUx: PokerConnUx
  readonly canAct: boolean
  readonly secondsLeft: number
  // The most recent presentation cues (animation-safe — null on snapshot recovery). Carries an
  // incrementing id so a consumer can react to a NEW cue and ignore unrelated re-renders.
  readonly cues: { readonly id: number; readonly data: TransitionCues } | null
}

export interface PokerRealtimeApi extends PokerRealtimeView {
  // Submit ONE minimal intent. Identity, legality, amount bounds, and turn order are all decided
  // server-side; this only sends intent + the expected action-seq for the stale-action CAS.
  readonly act: (action: PokerActionType, amount?: number) => Promise<{ ok: boolean; error?: string }>
  // Force an authoritative reconcile (e.g. after the user taps a "refresh" affordance).
  readonly reconcileNow: () => void
}

export function usePokerRealtime(tableId: string): PokerRealtimeApi {
  const controllerRef = useRef<PokerSyncController | null>(null)
  if (controllerRef.current === null) controllerRef.current = new PokerSyncController()

  const mountedRef = useRef(true)
  const tableIdRef = useRef(tableId)
  tableIdRef.current = tableId

  // Authoritative-reconcile plumbing (mirrors Caro): collapse overlapping fetches into one, and
  // re-run once if events arrived while a fetch was in flight (so we never miss the latest).
  const reconcileInFlightRef = useRef(false)
  const reconcileDirtyRef = useRef(false)

  // Reconnect telemetry: persist attempt/success/failure signals to analytics_events (via the
  // existing trackEvent path) so the metrics dashboard can compute a real reconnect success RATE.
  // `reconnectingRef` is true while we are recovering from a dropped channel so we only attribute
  // a success/failure to an actual reconnect (not the initial connect or a routine watchdog fetch).
  const reconnectingRef = useRef(false)
  const markReconnectAttempt = useCallback(() => {
    if (reconnectingRef.current) return
    reconnectingRef.current = true
    void trackEvent(RECONNECT_EVENTS.attempt, { path: '/games/poker', metadata: { tableId: tableIdRef.current } })
  }, [])
  const markReconnectResult = useCallback((ok: boolean) => {
    if (!reconnectingRef.current) return
    reconnectingRef.current = false
    void trackEvent(ok ? RECONNECT_EVENTS.success : RECONNECT_EVENTS.failure, { path: '/games/poker', metadata: { tableId: tableIdRef.current } })
  }, [])

  // Transport + network + sync health → user-facing connection state.
  const [transport, setTransport] = useState<'connecting' | 'connected' | 'reconnecting' | 'error' | 'closed'>('connecting')
  const [online, setOnline] = useState(true)
  const [syncFailing, setSyncFailing] = useState(false)
  const [reconciledOnce, setReconciledOnce] = useState(false)

  // A monotonically increasing render token bumped whenever the controller's view changes.
  const [, forceRender] = useState(0)
  const cuesRef = useRef<{ id: number; data: TransitionCues } | null>(null)
  const cueSeq = useRef(0)
  const [nowMs, setNowMs] = useState(() => Date.now())

  const bump = useCallback(() => {
    if (mountedRef.current) forceRender((n) => n + 1)
  }, [])

  // ── Reconcile: fetch the recipient-aware snapshot and apply it through the controller ──
  const reconcile = useCallback(() => {
    if (reconcileInFlightRef.current) {
      reconcileDirtyRef.current = true
      return
    }
    reconcileInFlightRef.current = true
    reconcileDirtyRef.current = false

    // Capture BEFORE markReconnectResult clears it: was this reconcile resolving a real reconnect?
    const wasReconnecting = reconnectingRef.current
    fetchPokerSnapshot(tableIdRef.current)
      .then(async (res) => {
        if (!mountedRef.current) return
        if (!res.ok) { setSyncFailing(true); markReconnectResult(false); return }
        const ctrl = controllerRef.current!
        const applied = ctrl.applySnapshot(res.snapshot)
        if (applied.applied && applied.cues) {
          cueSeq.current += 1
          cuesRef.current = { id: cueSeq.current, data: applied.cues }
        }
        // After a new hand (or any time we're seated without current cards), re-fetch OWN cards
        // via the RLS read-own path. Never broadcast; merged locally, hand-keyed.
        if (ctrl.viewerSeatIndex !== null && (applied.newHand || ctrl.ownHole === null) && ctrl.handId) {
          const holeRes = await fetchMyHoleCards(tableIdRef.current)
          if (mountedRef.current && holeRes.ok) ctrl.setOwnHole(holeRes.hole)
        }
        setSyncFailing(false)
        setReconciledOnce(true)
        markReconnectResult(true)
        // Cosmetic: if we just recovered a dropped channel while seated in a live hand, mark a
        // reconnect for THIS hand so the settlement recorder can award `reconnect_finish`. Purely
        // best-effort, self-scoped, never blocks reconciliation (degrade-safe if the flag/table is off).
        if (wasReconnecting && ctrl.viewerSeatIndex !== null && ctrl.handId) {
          void notePokerReconnect(ctrl.handId)
        }
        bump()
      })
      .catch(() => { if (mountedRef.current) { setSyncFailing(true); markReconnectResult(false) } })
      .finally(() => {
        reconcileInFlightRef.current = false
        // An event landed mid-fetch → run exactly once more to capture the latest version.
        if (reconcileDirtyRef.current && mountedRef.current) reconcile()
      })
  }, [bump, markReconnectResult])

  // ── Realtime subscription (PUBLIC tables only) ─────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true
    const supabase = createClient()
    const ctrl = controllerRef.current!

    // A hand-row change carries the authoritative state_version → feed the ordering reducer; a
    // forward/gap event reconciles, a stale/duplicate is dropped (no wasted fetch).
    const onHand = (row: { state_version?: unknown } | null) => {
      if (!mountedRef.current) return
      const v = typeof row?.state_version === 'number' ? row.state_version : NaN
      const result = ctrl.ingestEvent({ stateVersion: v })
      if (result.decision === 'reconcile') reconcile()
    }
    // Seat / table rows have no per-hand version; any change (sit/leave/disconnect, lobby) just
    // reconciles. Cheap and always correct — the snapshot is the source of truth.
    const onSeatOrTable = () => { if (mountedRef.current) reconcile() }

    const channel = supabase
      .channel(`poker:${tableId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poker_hands', filter: `table_id=eq.${tableId}` },
        (p) => onHand(p.new as { state_version?: unknown } | null))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poker_seats', filter: `table_id=eq.${tableId}` },
        onSeatOrTable)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'poker_tables', filter: `id=eq.${tableId}` },
        onSeatOrTable)
      .subscribe((status) => {
        if (!mountedRef.current) return
        if (status === 'SUBSCRIBED') {
          setTransport('connected')
          reconcile() // catch anything missed between server render and channel establishment
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setTransport('reconnecting')
          markReconnectAttempt()
          reconcile()
        }
      })

    // Keep the realtime socket authenticated across token refreshes; supabase-js does this
    // internally too, but doing it explicitly + reconciling closes the brief re-auth gap (D2).
    // Never log the token.
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
  }, [tableId, reconcile, markReconnectAttempt])

  // ── Recovery watchdog + tab-resume / network-restore ───────────────────────────────────
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') reconcile() }
    const onOnline = () => { setOnline(true); reconcile() }
    const onOffline = () => setOnline(false)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    setOnline(typeof navigator === 'undefined' ? true : navigator.onLine)

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') reconcile()
    }, WATCHDOG_MS)

    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      clearInterval(interval)
    }
  }, [reconcile])

  // ── Presence heartbeat — keep the seat's connected flag fresh while seated ─────────────
  const seatIndex = controllerRef.current.viewerSeatIndex
  useEffect(() => {
    if (seatIndex === null) return
    const tid = tableIdRef.current
    let cancelled = false
    const beat = () => { if (!cancelled) void setSeatConnection(tid, seatIndex, true) }
    beat()
    const interval = setInterval(beat, HEARTBEAT_MS)
    // On unmount / tab close, best-effort mark disconnected so peers see it promptly (the seat
    // and stack are preserved server-side regardless — RECONNECT-001).
    return () => {
      cancelled = true
      clearInterval(interval)
      void setSeatConnection(tid, seatIndex, false)
    }
  }, [seatIndex])

  // ── Turn clock (presentation only) + server-authoritative timeout nudge ────────────────
  const lastNudgeRef = useRef(0)
  useEffect(() => {
    const id = setInterval(() => {
      if (!mountedRef.current) return
      const now = Date.now()
      setNowMs(now)
      const ps = controllerRef.current?.publicState
      const deadline = ps?.turnDeadline ?? null
      // Any open client may nudge once the deadline (+grace) passes; the server only acts if ITS
      // clock agrees. Background-tab throttling cannot extend the deadline (it's a server instant).
      if (
        ps && ps.turnSeat !== null && deadline !== null &&
        document.visibilityState === 'visible' &&
        shouldNudgeTimeout(deadline, now, TIMEOUT_NUDGE_GRACE_MS) &&
        now - lastNudgeRef.current > TIMEOUT_NUDGE_THROTTLE_MS
      ) {
        lastNudgeRef.current = now
        void tickActionTimer(tableIdRef.current)
      }
    }, 500)
    return () => clearInterval(id)
  }, [])

  // ── Derived view ───────────────────────────────────────────────────────────────────────
  const ctrl = controllerRef.current
  const connUx = deriveConnUx({ online, transport, syncFailing, reconciledOnce })
  const publicState = ctrl.publicState
  const isMyTurn =
    ctrl.viewerSeatIndex !== null &&
    publicState?.turnSeat === ctrl.viewerSeatIndex &&
    publicState?.phase === 'BETTING'
  const secondsLeft = turnSecondsLeft(publicState?.turnDeadline ?? null, nowMs, TURN_CAP_SECONDS)

  const act = useCallback(async (action: PokerActionType, amount?: number) => {
    const c = controllerRef.current!
    const expectedSeq = c.legal?.stateVersion
    const res = await pokerAct(tableIdRef.current, action, amount, undefined, expectedSeq)
    // Whatever the outcome, pull authoritative truth (the realtime echo also will, but this makes
    // the local view snap immediately on success and surfaces a rejection cleanly).
    reconcile()
    return res.ok ? { ok: true } : { ok: false, error: res.error }
  }, [reconcile])

  const reconcileNow = useCallback(() => reconcile(), [reconcile])

  return {
    publicState,
    ownHole: ctrl.ownHole,
    legal: ctrl.legal,
    viewerSeatIndex: ctrl.viewerSeatIndex,
    isSpectator: ctrl.hasState && ctrl.viewerSeatIndex === null,
    isMyTurn: !!isMyTurn,
    connUx,
    canAct: canSubmitAction(connUx) && !!isMyTurn,
    secondsLeft,
    cues: cuesRef.current,
    act,
    reconcileNow,
  }
}
