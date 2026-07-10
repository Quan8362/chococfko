'use client'

// ── Poker quick-reaction realtime layer ──────────────────────────────────────────────────────
//
// Receives reactions on the dedicated TRANSIENT FX channel `poker-fx:<tableId>` (kept entirely
// separate from the authoritative `poker:<tableId>` game channel, so a reaction can never
// reorder a hand, delay a turn, or trigger a state refetch). Reactions are broadcast by the
// SERVER (reaction-actions.ts) with an authoritative seat, so the client only RECEIVES here and
// never sends over the socket — a forged seat / unseated send is impossible.
//
// Broadcast has no history replay, so a reconnect / refresh / late subscriber never re-shows an
// old bubble. Incoming events are validated (schema + allowlist), deduped by id, throttled
// per-seat (flood protection independent of the sender), and dropped entirely when the user has
// turned reactions off ("Tắt tương tác"). Bubbles are one-per-seat with a TTL (a newer reaction
// replaces the seat's current bubble — never stacks).

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { usePokerPrefs } from '../_eco/prefs'
import {
  REACTION_EVENT,
  REACTION_LIMITS,
  getReaction,
  makeReactionId,
  makeSeenCache,
  newRateLimiter,
  rateLimitAllow,
  reactionChannelName,
  validateIncoming,
} from '@/lib/games/poker/reactions'
import { sendPokerReaction } from '../reaction-actions'

// A live reaction bubble for one seat (max one per seat; a newer reaction replaces it). `nonce`
// re-triggers the enter animation when the same seat reacts again.
export type ReactionBubble = { seat: number; key: string; emoji: string; nonce: number }

export type SendReactionOutcome = 'ok' | 'cooldown' | 'noseat' | 'error'

export interface PokerReactionsApi {
  readonly bubbles: readonly ReactionBubble[]
  // The most recent reaction's localized-render key, for the polite a11y live region.
  readonly lastAnnounceKey: string | null
  readonly send: (key: string) => Promise<SendReactionOutcome>
}

export function usePokerReactions(
  tableId: string,
  viewerSeatIndex: number | null,
): PokerReactionsApi {
  const prefs = usePokerPrefs()
  const receiveEnabled = prefs.interactions

  const [bubbles, setBubbles] = useState<ReactionBubble[]>([])
  const [lastAnnounceKey, setLastAnnounceKey] = useState<string | null>(null)

  const nonceRef = useRef(0)
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())
  const seenRef = useRef(makeSeenCache())
  // Per-seat last-render timestamp → recipient-side throttle (a flooding sender still renders at
  // most one bubble per receiveThrottleMs on every other client).
  const seatLastRef = useRef<Map<number, number>>(new Map())
  const channelRef = useRef<RealtimeChannel | null>(null)
  const mountedRef = useRef(true)
  // Client-side send rate limiter (button gate; the server re-decides authoritatively).
  const rateRef = useRef(newRateLimiter())
  // Live refs so the subscription (bound once per table) always sees the latest mute choice.
  const receiveEnabledRef = useRef(receiveEnabled)
  receiveEnabledRef.current = receiveEnabled

  const pushBubble = useCallback((seat: number, key: string, emoji: string) => {
    const nonce = ++nonceRef.current
    setBubbles((prev) => [...prev.filter((b) => b.seat !== seat), { seat, key, emoji, nonce }])
    setLastAnnounceKey(key)
    const timers = timersRef.current
    const existing = timers.get(seat)
    if (existing) clearTimeout(existing)
    timers.set(
      seat,
      setTimeout(() => {
        if (!mountedRef.current) return
        setBubbles((prev) => prev.filter((b) => b.seat !== seat))
        timers.delete(seat)
      }, REACTION_LIMITS.bubbleTtlMs),
    )
  }, [])

  // ── Subscribe to the transient FX channel (receive only) ──────────────────────────────────
  useEffect(() => {
    mountedRef.current = true
    const timers = timersRef.current
    const seatLast = seatLastRef.current // stable Map identity — safe to clear on cleanup
    const sb = createClient()
    const ch = sb
      .channel(reactionChannelName(tableId))
      .on('broadcast', { event: REACTION_EVENT }, ({ payload }) => {
        if (!mountedRef.current) return
        // Muted: drop the event entirely (no bubble). The sender is never told.
        if (!receiveEnabledRef.current) return
        const ev = validateIncoming(payload) // schema + allowlist + seat-range guard
        if (!ev) return
        const now = Date.now()
        if (!seenRef.current.accept(ev.id, now)) return // dedup network retries / self echo
        // Recipient-side per-seat throttle (independent flood protection).
        const last = seatLastRef.current.get(ev.senderSeat) ?? 0
        if (now - last < REACTION_LIMITS.receiveThrottleMs) return
        seatLastRef.current.set(ev.senderSeat, now)
        const def = getReaction(ev.key)
        if (!def) return
        pushBubble(ev.senderSeat, ev.key, def.emoji)
      })
      .subscribe()
    channelRef.current = ch
    return () => {
      mountedRef.current = false
      channelRef.current = null
      timers.forEach(clearTimeout)
      timers.clear()
      seatLast.clear()
      sb.removeChannel(ch)
    }
  }, [tableId, pushBubble])

  // ── Send a preset reaction (client gate → server-authoritative action) ────────────────────
  const send = useCallback(
    async (key: string): Promise<SendReactionOutcome> => {
      if (viewerSeatIndex === null) return 'noseat'
      const def = getReaction(key)
      if (!def) return 'error'
      // Client cooldown + rolling-window gate (synchronous check-and-commit → a double-tap in the
      // same tick is blocked). The server re-checks authoritatively regardless.
      if (!rateLimitAllow(rateRef.current, Date.now())) return 'cooldown'
      const eventId = makeReactionId()
      const res = await sendPokerReaction(tableId, key, eventId)
      if (res.ok) return 'ok'
      if (res.error === 'cooldown') return 'cooldown'
      if (res.error === 'not_seated') return 'noseat'
      return 'error'
    },
    [tableId, viewerSeatIndex],
  )

  return { bubbles, lastAnnounceKey, send }
}
