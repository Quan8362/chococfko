// ── Shared multiplayer infra: realtime transport abstraction & subscription lifecycle ─
//
// PURE module — no React, no Supabase. Tested by transport.test.ts.
//
// This is the boundary CONTRACT for realtime, not an implementation. The concrete transport
// is Supabase Realtime via the anon SINGLETON client (lib/supabase/client.ts) — chosen to
// avoid the JWT-refresh races that kill subscriptions (security-model §6, D2). Game hooks
// (e.g. usePokerRealtime) depend on these interfaces so the realtime contract is explicit
// and the lifecycle is testable without a live socket.
//
// The one piece of real logic here is SubscriptionRegistry: a tiny, well-tested helper that
// guarantees every subscription is cleaned up exactly once. Leaked Supabase channels are a
// known footgun (CLAUDE.md §12: "channels need cleanup + mountedRef guard to avoid leaks");
// a centralised registry makes "did we unsubscribe?" a unit-testable fact.

import type { GameEventEnvelope } from './envelope.ts'

// Mirrors the connection-state UX in realtime-model §4 (and TLMN/Caro `connState`).
export type ConnState = 'connecting' | 'connected' | 'reconnecting' | 'error' | 'closed'

// Status of one subscription lifecycle (maps onto Supabase channel statuses).
export type SubscribeStatus = 'SUBSCRIBED' | 'CLOSED' | 'CHANNEL_ERROR' | 'TIMED_OUT'

// Anything that can be torn down. Supabase's channel `.unsubscribe()` returns a Promise; a
// fake/test cleanup may be sync. Both are accepted.
export interface Unsubscribable {
  unsubscribe(): void | Promise<void>
}

export interface RealtimeHandlers<TType extends string = string, TPublic = unknown> {
  // A public, versioned event arrived (postgres_changes on a PUBLIC table only).
  onEvent?: (envelope: GameEventEnvelope<TType, TPublic>) => void
  // Subscription status changed — drives the recovery watchdog + connState.
  onStatus?: (status: SubscribeStatus) => void
}

// The transport a game hook depends on. Kept minimal: subscribe to one channel, get back
// something Unsubscribable. Concrete impl wraps `supabase.channel(...).subscribe()`.
export interface RealtimeTransport {
  subscribe<TType extends string, TPublic>(
    channel: string,
    handlers: RealtimeHandlers<TType, TPublic>,
  ): Unsubscribable
}

// Per-table channel name. One channel per table (realtime-model §1): `poker:${tableId}`.
export function channelName(namespace: string, roomId: string): string {
  if (!namespace || !roomId) throw new Error('channelName: namespace and roomId are required')
  return `${namespace}:${roomId}`
}

// Tracks every active subscription so teardown is centralised and idempotent. A hook adds its
// channel(s) on subscribe and calls `cleanupAll()` on unmount; calling it twice is safe.
// Errors during one teardown never block the others.
export class SubscriptionRegistry {
  private subs = new Set<Unsubscribable>()

  add(sub: Unsubscribable): Unsubscribable {
    this.subs.add(sub)
    return sub
  }

  has(sub: Unsubscribable): boolean {
    return this.subs.has(sub)
  }

  get size(): number {
    return this.subs.size
  }

  // Unsubscribe and forget a single subscription (idempotent — unknown subs are ignored).
  remove(sub: Unsubscribable): void {
    if (!this.subs.has(sub)) return
    this.subs.delete(sub)
    try {
      void sub.unsubscribe()
    } catch {
      // teardown is best-effort; a throwing unsubscribe must not strand other cleanup.
    }
  }

  // Tear down every tracked subscription exactly once. Safe to call repeatedly.
  cleanupAll(): void {
    this.subs.forEach((sub) => {
      try {
        void sub.unsubscribe()
      } catch {
        // swallow — see remove()
      }
    })
    this.subs.clear()
  }
}

// Lightweight presence contract (realtime-model §8 / TLMN presence). Presence carries only
// public, non-secret data (who is connected) — never a game secret (A1).
export interface PresenceMember {
  readonly userId: string
  readonly seatIndex: number | null
  readonly online: boolean
  readonly lastSeen: number
}

export interface PresenceTracker {
  members(): readonly PresenceMember[]
  isOnline(userId: string): boolean
}
