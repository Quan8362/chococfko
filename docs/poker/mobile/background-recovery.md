# Poker — Background, Resume, Network Transitions & Realtime Recovery

Scope: how the live poker table survives backgrounding, screen lock, app-switch, device sleep, PWA
suspension, and every network transition — and how it recovers **without ever replaying stale state,
duplicating a settlement, resending an old action, or leaking a previous user's private state.**
Behaviour only; no authoritative rules, economy, bots, or flags change. Poker ships dark.

The recovery machinery predates 29B and was **audited** here (not rewritten). 29B verified it against
the background/resume and network-transition matrix and added the app-update layer (see `pwa.md`). The
core rule everywhere is: **Postgres is the only source of truth; realtime is a notification, never
state.** Every forward event triggers a re-read of ONE recipient-aware authoritative snapshot, guarded
by a monotonic `state_version`.

Key files:
- `lib/games/poker/realtime.ts` — the **pure** `PokerSyncController` (reconciliation, dedupe,
  ordering, privacy guard, connection-UX derivation). Unit-tested (`realtime.test.ts`).
- `app/games/poker/usePokerRealtime.ts` — the hook that owns the socket, timers, watchdog, and
  listeners and drives the controller.
- `app/games/poker/_design/usePokerAppUpdate.ts` — the app-update watcher (29B).

## No offline gameplay (§4)

By design there is **no** offline poker: no offline table state is fabricated, no
Fold/Check/Call/Bet/Raise/All-in is queued for later replay, no hand is optimistically settled, and no
private state is durably cached (see the SW denylist in `pwa.md`). When offline:

- `navigator.onLine === false` → `deriveConnUx` returns **`offline`**; the HUD shows a clear
  disconnected state (`ConnectionIndicator`, `InlineGameMessage` tone `danger`).
- `canSubmitAction` returns **false** for any non-`connected` state, so the action bar is disabled —
  the UI never claims to accept an action it cannot deliver, and nothing is enqueued.
- On reconnect the client **restores from the authoritative snapshot**; it does not resurrect a local
  guess. An action the UI never accepted is never silently "resent".

## Background / resume sequence (§5)

Triggers wired in the hook: `visibilitychange` (tab hide/show, app-switch, screen lock), `online` /
`offline`, realtime channel `SUBSCRIBED` / `CHANNEL_ERROR` / `TIMED_OUT` / `CLOSED`, a **12 s recovery
watchdog** (a slow safety net, not polling), and `supabase.auth.onAuthStateChange`
(`TOKEN_REFRESHED` / `SIGNED_IN`). On any resume signal the same idempotent path runs:

1. **Revalidate auth** — an hourly token refresh calls `realtime.setAuth(token)` and reconciles,
   closing the brief re-auth gap. (§5.1)
2. **Reconnect Realtime** — a dropped channel re-subscribes; `markReconnectAttempt/Result` record the
   real reconnect success rate. (§5.2)
3. **Request the authoritative snapshot** — `fetchPokerSnapshot` returns the recipient-aware public
   state + (if seated) the viewer's own hole cards + (only on their turn) the legal-action model. (§5.3)
4. **Compare versions** — `shouldApplySnapshot` adopts only newer-or-equal `state_version`; a
   late/duplicate snapshot can never regress newer state. (§5.4)
5. **Restore private state through an authorized path** — own hole cards are re-fetched out-of-band via
   the RLS read-own path (`fetchMyHoleCards`), hand-keyed, and never traverse realtime. (§5.5)
6. **Remove obsolete transient UI** — a **non-contiguous** apply (gap / reconnect / new hand / initial
   load) yields **no presentation cues**, so the UI snaps to truth. (§5.6)
7. **Never replay stale animations** — cues are emitted **only** on a contiguous `+1` same-hand step
   (`diffCues`); after recovery there is nothing to replay. (§5.7)
8. **Never auto-resend an old action** — actions are user-initiated only; recovery re-reads state, it
   does not re-submit intent. (§5.8)
9. **Never duplicate a settlement** — settlement is server-authoritative and idempotent on
   `state_version`; applying the same version twice is a no-op. (§5.9)
10. **Never expose a previous user's private state** — `assertSnapshotPrivacy` rejects any snapshot
    carrying a foreign hole card, a deck card, or a spectator receiving private state; a new hand
    discards the prior hand's own cards. (§5.10)

## Network transitions (§6)

| Transition | Behaviour |
|------------|-----------|
| Wi-Fi ↔ mobile data | `offline`→`online` fires a reconcile; the snapshot wins, stale local state is discarded |
| Temporary packet loss | Realtime may not surface a CLOSED; the 12 s watchdog reconciles anyway |
| Short offline period | `offline` UX + disabled actions; auto-reconnect on `online` |
| Long offline period | Same, plus the auth-refresh path revalidates on resume; snapshot fully rebuilds the view |
| Realtime disconnect | `CHANNEL_ERROR`/`TIMED_OUT`/`CLOSED` → `reconnecting` UX + reconcile |
| Realtime reconnect | `SUBSCRIBED` reconciles to catch anything missed between server render and channel establishment |
| Auth expiry during suspension | `TOKEN_REFRESHED` re-auths the socket and reconciles |

Guarantees enforced by construction:
- **Authoritative snapshot always wins**; a stale action sequence is rejected server-side via the
  expected-seq CAS (`pokerAct` sends the expected `state_version`).
- **Duplicate subscriptions are cleaned up** — the subscription effect removes the channel and
  unsubscribes the auth listener on unmount / tableId change, so a reconnect never stacks channels or
  reconnect loops.
- **Leaving the table cleans up recovery work** — the heartbeat effect marks the seat disconnected and
  clears its interval; all watchdog/clock/visibility/online/offline listeners and the app-update poll
  are removed on unmount.

## Subscription & memory cleanup (§8)

| Resource | Owner | Teardown |
|----------|-------|----------|
| Realtime channel + auth listener | subscription effect | `removeChannel` + `authSub.unsubscribe()` on unmount / tableId change |
| Recovery watchdog + `visibility`/`online`/`offline` listeners | watchdog effect | `clearInterval` + `removeEventListener` |
| Presence heartbeat | heartbeat effect | `clearInterval` + best-effort `setSeatConnection(false)` |
| Turn-clock interval + timeout nudge | clock effect | `clearInterval` |
| Reconcile fan-in | `reconcileInFlightRef` / `reconcileDirtyRef` | overlapping fetches collapse into one; a mid-fetch event re-runs exactly once |
| App-update poll + probe | `usePokerAppUpdate` | `clearInterval` + `AbortController.abort()` + `removeEventListener` |

No unbounded timers, no cross-table or cross-user state leakage: the controller is constructed
per-table (`useRef`), the dedupe buffer is bounded (`EnvelopeDedupe`, capacity 512), and every snapshot
is recipient-scoped.

## App update during a session

See `pwa.md` §"App update experience". In brief: a newer deploy is detected via `/api/version`,
surfaced non-blocking **between hands** (urgent + action-blocking on a protocol mismatch), and applied
by a deliberate user tap that reloads into a coherent, content-hashed build.

## Known risks / limitations

- Background-tab throttling can delay the 12 s watchdog while hidden; this is harmless because the
  turn deadline is a fixed **server** instant — a throttled client cannot extend or shorten it, and it
  reconciles immediately on becoming visible.
- iOS Safari may terminate a backgrounded tab/PWA entirely; on relaunch the full resume sequence runs
  from step 1, so the outcome is identical to a cold load — the authoritative snapshot rebuilds the
  table and the RLS path restores own cards.
- End-to-end coverage of the *authenticated* live recovery paths is gated behind the poker flags
  staying OFF; the pure reconciliation rules are covered by `realtime.test.ts`, and the new
  cache/version rules by `pwa/swCachePolicy.test.ts` + `pwa/version.test.ts`.
