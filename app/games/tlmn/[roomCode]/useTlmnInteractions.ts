'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import {
  INTERACTION_SCHEMA_VERSION, RATE_LIMITS, THROW_TIMING, getPhrase, getThrowable, makeInteractionId,
  newRateLimiter, rateLimitAllow, validateIncoming, makeSeenCache,
  type InteractionEvent,
} from '@/lib/games/tlmn/interactions'

// ── Realtime player-interaction layer (Phase 1) ──────────────────────────────────────
// A dedicated, TRANSIENT broadcast channel `tlmn-fx:<roomId>` carries reaction events,
// kept entirely separate from the authoritative game channel so a reaction can never
// reorder a trick, delay a turn, or trigger a game-state refetch. Phrases are not
// persisted: broadcast has no history replay, so a reconnect/refresh never re-shows an
// old bubble (spec §10). Receiver dedups by event id to absorb network retries.
//
// Sender does NOT receive its own broadcast (config.broadcast.self = false), so we apply
// our own bubble OPTIMISTICALLY on send and broadcast to the others — one render path,
// no double bubble for the sender.

// A live phrase bubble for one seat (max one per seat; a newer phrase replaces it).
export type Bubble = { seat: number; phraseKey: string; emoji: string; nonce: number }
// A live throwable in flight from one seat to another (Phase 2).
export type Throw = { id: string; key: string; fromSeat: number; toSeat: number; nonce: number }

// ── Mute-all preference (module-level singleton, mirrors useTlmnSound) ─────────────────
// Persisted in localStorage so the choice sticks across reloads + syncs across tabs and
// across BOTH consumers (the chrome toggle + the receive path) via useSyncExternalStore.
const LS_MUTE = 'tlmn-react-muted'
let sharedMuted = false
let muteHydrated = false
const muteSubs = new Set<() => void>()
const notifyMute = () => muteSubs.forEach(fn => fn())
function readStoredMute(): boolean {
  try { return localStorage.getItem(LS_MUTE) === '1' } catch { return false }
}
function setMutedShared(next: boolean) {
  sharedMuted = next
  try { localStorage.setItem(LS_MUTE, next ? '1' : '0') } catch { /* ignore */ }
  notifyMute()
}
function subscribeMute(cb: () => void) { muteSubs.add(cb); return () => { muteSubs.delete(cb) } }

// ── Per-player mute (Phase 4) — a CLIENT-ONLY privacy preference ───────────────────────
// Muting a player only changes what THE MUTING USER sees (their interactions are dropped on
// receive), so it lives in localStorage — no server row, no PII. Keyed by the muted user id.
const LS_PMUTE = 'tlmn-muted-players'
let mutedPlayers = new Set<string>()
let pmuteHydrated = false
let pmuteSnapshot: string[] = [] // stable array identity for useSyncExternalStore
const pmuteSubs = new Set<() => void>()
function notifyPmute() { pmuteSnapshot = Array.from(mutedPlayers); pmuteSubs.forEach(fn => fn()) }
function readStoredPmute(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_PMUTE)
    const arr = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(arr) ? (arr as string[]) : [])
  } catch { return new Set() }
}
function togglePlayerMute(id: string) {
  if (!id) return
  if (mutedPlayers.has(id)) mutedPlayers.delete(id); else mutedPlayers.add(id)
  try { localStorage.setItem(LS_PMUTE, JSON.stringify(Array.from(mutedPlayers))) } catch { /* ignore */ }
  notifyPmute()
}
function subscribePmute(cb: () => void) { pmuteSubs.add(cb); return () => { pmuteSubs.delete(cb) } }

export function usePlayerMutes() {
  if (!pmuteHydrated && typeof window !== 'undefined') {
    pmuteHydrated = true; mutedPlayers = readStoredPmute(); pmuteSnapshot = Array.from(mutedPlayers)
  }
  const mutedIds = useSyncExternalStore(subscribePmute, () => pmuteSnapshot, () => pmuteSnapshot)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === LS_PMUTE) { mutedPlayers = readStoredPmute(); notifyPmute() } }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
  const isMuted = useCallback((id: string | null | undefined) => !!id && mutedIds.includes(id), [mutedIds])
  const toggle = useCallback((id: string) => togglePlayerMute(id), [])
  return { mutedIds, isMuted, toggle }
}

type Options = {
  roomId: string
  mySeat: number | null
  // Phrase chime — called when a phrase arrives from someone else. The caller wires it to
  // useTlmnSound (respecting global mute + reduced motion).
  onSound?: () => void
  // Throwable impact — called at the moment of impact with the item key, so the caller can
  // play the item's tone + haptic (respecting global mute). Fires for self + others.
  onThrowImpact?: (key: string) => void
  // Server-validated spend gate (Phase 3). Called with a pre-generated eventId BEFORE the
  // throwable is broadcast; the throw only emits on { ok }. The caller decides free-vs-paid
  // (and may resolve instantly for always-free items). Omitted ⇒ everything is free.
  onSpend?: (key: string, eventId: string, targetSeat: number) => Promise<{ ok: boolean; reason?: string }>
  // Per-player mute (Phase 4): given a sender seat, return true to DROP its incoming events
  // (no bubble/throw/sound) for this user. The caller resolves seat→userId via the seat list.
  isSeatMuted?: (seat: number) => boolean
}

export function useTlmnInteractions({ roomId, mySeat, onSound, onThrowImpact, onSpend, isSeatMuted }: Options) {
  // Hydrate the persisted mute once (client only) before the first read.
  if (!muteHydrated && typeof window !== 'undefined') { muteHydrated = true; sharedMuted = readStoredMute() }
  const muted = useSyncExternalStore(subscribeMute, () => sharedMuted, () => false)

  const [bubbles, setBubbles] = useState<Bubble[]>([])
  const [throws, setThrows] = useState<Throw[]>([])
  // A monotonically increasing nonce so a repeated phrase on the SAME seat still
  // re-triggers the bubble animation (React keys off seat, animation keys off nonce).
  const nonceRef = useRef(0)
  // Per-seat expiry timers so a fresh phrase resets its own seat's countdown only.
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())
  // Per-throw timers (impact sound + removal); cleared on unmount so nothing fires late.
  const throwTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>[]>>(new Map())
  const seenRef = useRef(makeSeenCache()) // event-id idempotency (dedup network retries)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const mountedRef = useRef(true)
  const mySeatRef = useRef(mySeat)
  mySeatRef.current = mySeat
  const mutedRef = useRef(muted)
  mutedRef.current = muted
  const onSoundRef = useRef(onSound)
  onSoundRef.current = onSound
  const onThrowImpactRef = useRef(onThrowImpact)
  onThrowImpactRef.current = onThrowImpact
  const onSpendRef = useRef(onSpend)
  onSpendRef.current = onSpend
  const isSeatMutedRef = useRef(isSeatMuted)
  isSeatMutedRef.current = isSeatMuted
  // Recent received events (keys/seats only — no content) so a report can attach the recent
  // interaction keys from the reported player. Bounded ring buffer.
  const recentRef = useRef<{ seat: number; key: string; kind: string; at: number }[]>([])
  // In-flight guard for the async paid-throw path: prevents a double-tap from issuing two
  // spends (each with its own eventId) before the first resolves.
  const throwSendingRef = useRef(false)

  // Client-side rate-limit bookkeeping (spec §11) — pure limiter, see interactions.ts.
  const rateRef = useRef(newRateLimiter())

  // Drop a bubble onto a seat (replacing any existing one there) + arm its expiry.
  const pushBubble = useCallback((seat: number, phraseKey: string, emoji: string) => {
    const nonce = ++nonceRef.current
    setBubbles(prev => [...prev.filter(b => b.seat !== seat), { seat, phraseKey, emoji, nonce }])
    const timers = timersRef.current
    const existing = timers.get(seat)
    if (existing) clearTimeout(existing)
    timers.set(seat, setTimeout(() => {
      if (!mountedRef.current) return
      setBubbles(prev => prev.filter(b => b.seat !== seat))
      timers.delete(seat)
    }, RATE_LIMITS.bubbleTtlMs))
  }, [])

  // Launch a throwable animation (sender → target) + schedule its impact sound/haptic and
  // its removal. Concurrency is capped (spec §19) by dropping the oldest active throw.
  const pushThrow = useCallback((ev: InteractionEvent) => {
    if (ev.targetSeat == null) return
    const nonce = ++nonceRef.current
    const id = ev.id
    setThrows(prev => {
      const next = [...prev, { id, key: ev.key, fromSeat: ev.senderSeat, toSeat: ev.targetSeat as number, nonce }]
      return next.length > THROW_TIMING.maxConcurrent ? next.slice(next.length - THROW_TIMING.maxConcurrent) : next
    })
    const tSound = setTimeout(() => {
      if (!mountedRef.current || mutedRef.current) return
      onThrowImpactRef.current?.(ev.key) // impact sound + haptic (gated by global mute)
    }, THROW_TIMING.flyMs)
    const tDone = setTimeout(() => {
      if (!mountedRef.current) return
      setThrows(prev => prev.filter(x => x.id !== id))
      throwTimersRef.current.delete(id)
    }, THROW_TIMING.flyMs + THROW_TIMING.impactMs)
    throwTimersRef.current.set(id, [tSound, tDone])
  }, [])

  // Apply a received/own event → phrase bubble or throwable, plus the gated sound.
  const apply = useCallback((ev: InteractionEvent, fromSelf: boolean) => {
    // Receiver-side mute: mute-all OR a per-player mute of this sender drops the event.
    // Own optimistic effects always render (the local player chose to send them).
    if (!fromSelf && (mutedRef.current || isSeatMutedRef.current?.(ev.senderSeat))) return
    if (ev.kind === 'phrase') {
      const phrase = getPhrase(ev.key)
      if (!phrase) return
      pushBubble(ev.senderSeat, ev.key, phrase.emoji)
      if (!fromSelf && !mutedRef.current) onSoundRef.current?.()
    } else if (ev.kind === 'throwable') {
      if (!getThrowable(ev.key)) return
      pushThrow(ev)
    }
  }, [pushBubble, pushThrow])

  // ── Subscribe to the transient FX channel ──────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true
    const timers = timersRef.current // stable Map identity — safe to clear on cleanup
    const sb = createClient()
    const ch = sb.channel(`tlmn-fx:${roomId}`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'interaction' }, ({ payload }) => {
        if (!mountedRef.current) return
        const ev = validateIncoming(payload) // schema-version + shape + known-key guard
        if (!ev) return
        if (!seenRef.current.accept(ev.id, Date.now())) return // dedup network retries
        // Log recent keys/seats (no content) for the report flow — even from muted senders.
        const r = recentRef.current
        r.push({ seat: ev.senderSeat, key: ev.key, kind: ev.kind, at: ev.at })
        if (r.length > 12) r.splice(0, r.length - 12)
        apply(ev, false)
      })
      .subscribe()
    channelRef.current = ch
    const throwTimers = throwTimersRef.current
    return () => {
      mountedRef.current = false
      channelRef.current = null
      timers.forEach(clearTimeout)
      timers.clear()
      throwTimers.forEach(arr => arr.forEach(clearTimeout))
      throwTimers.clear()
      sb.removeChannel(ch)
    }
  }, [roomId, apply])

  // ── Send a preset phrase ────────────────────────────────────────────────────────────
  // Returns 'ok' on success, 'cooldown' when rate-limited, 'noseat' when not seated.
  const sendPhrase = useCallback((phraseKey: string): 'ok' | 'cooldown' | 'noseat' => {
    const seat = mySeatRef.current
    if (seat == null) return 'noseat'
    const phrase = getPhrase(phraseKey)
    if (!phrase) return 'noseat'
    const now = Date.now()
    // Combined cooldown + rolling-window gate (check-and-commit; synchronous, so a
    // double-tap in the same tick is blocked — the second call sees the recorded send).
    if (!rateLimitAllow(rateRef.current, now)) return 'cooldown'

    const ev: InteractionEvent = {
      v: INTERACTION_SCHEMA_VERSION,
      id: makeInteractionId(),
      kind: 'phrase',
      key: phraseKey,
      senderSeat: seat,
      targetSeat: null,
      at: now,
    }
    apply(ev, true) // optimistic local bubble (sender is excluded from broadcast echo)
    channelRef.current?.send({ type: 'broadcast', event: 'interaction', payload: ev })
    return 'ok'
  }, [apply])

  // ── Send a targeted throwable item (Phase 2 + Phase 3 coin gate) ────────────────────
  // 'invalid' (bad item/target incl. self); 'cooldown' (rate-limited or a send in flight);
  // 'noseat'; 'insufficient'/'error' (server spend rejected); 'ok'. Async: a paid item is
  // server-validated (onSpend) BEFORE it is broadcast — never emitted on a failed spend.
  const sendThrowable = useCallback(async (
    key: string, targetSeat: number,
  ): Promise<'ok' | 'cooldown' | 'noseat' | 'invalid' | 'insufficient' | 'error'> => {
    const seat = mySeatRef.current
    if (seat == null) return 'noseat'
    if (!getThrowable(key)) return 'invalid'
    if (typeof targetSeat !== 'number' || targetSeat === seat) return 'invalid'
    if (throwSendingRef.current) return 'cooldown' // a send is already in flight
    const now = Date.now()
    if (!rateLimitAllow(rateRef.current, now, RATE_LIMITS.throwableCooldownMs)) return 'cooldown'

    const id = makeInteractionId()
    throwSendingRef.current = true
    try {
      if (onSpendRef.current) {
        const res = await onSpendRef.current(key, id, targetSeat)
        if (!res.ok) return (res.reason === 'insufficient' ? 'insufficient' : 'error')
      }
      if (!mountedRef.current) return 'error'
      const ev: InteractionEvent = {
        v: INTERACTION_SCHEMA_VERSION, id, kind: 'throwable', key,
        senderSeat: seat, targetSeat, at: now,
      }
      apply(ev, true) // optimistic local flight (sender excluded from broadcast echo)
      channelRef.current?.send({ type: 'broadcast', event: 'interaction', payload: ev })
      return 'ok'
    } finally {
      throwSendingRef.current = false
    }
  }, [apply])

  const toggleMuted = useCallback(() => { setMutedShared(!sharedMuted) }, [])

  // Cross-tab / cross-consumer sync of the persisted mute.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_MUTE) { sharedMuted = e.newValue === '1'; notifyMute() }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // Recent interaction keys received from a given seat (for attaching to a report).
  const getRecentForSeat = useCallback((seat: number) =>
    recentRef.current.filter(e => e.seat === seat).slice(-8).map(e => ({ key: e.key, kind: e.kind, at: e.at })), [])

  return { bubbles, throws, sendPhrase, sendThrowable, muted, toggleMuted, getRecentForSeat }
}
