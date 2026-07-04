# Poker Push Notifications (Prompt 29C)

Status: **foundation only — nothing is wired to fire, no real push is sent.**
Poker flags remain OFF, tournaments remain hard-off, no migration was applied.

This document describes the safe push-notification foundation added in Prompt 29C
and the guarantees that must hold before any poker notification is ever dispatched.

---

## 1. Reused existing infrastructure (no parallel system)

Chợ Cóc FKO already has a mature, site-wide Web Push stack. Poker **reuses it
verbatim** — we did not invent a second notification system.

| Concern | Existing module | Notes |
|---|---|---|
| Subscription storage | `supabase/migration_push_subscriptions.sql` | `push_subscriptions` table, RLS own-row, unique per `endpoint`. Already applied in prod. |
| Save / remove subscription | `lib/push/actions.ts` | `savePushSubscription` (service-role upsert by endpoint), `removePushSubscription` (own-row delete). |
| Client subscribe | `lib/push/subscribe.ts` | Registers `/sw.js`, `userVisibleOnly:true`, no-ops when unsupported / not granted / no VAPID key. |
| Permission UI | `components/NotificationPermissionBanner.tsx` | User-initiated, respects denial, dismiss persisted. |
| Server dispatch | `lib/push/send.ts` | VAPID web-push, best-effort, prunes 404/410 dead subs, never throws. |
| Higher-level triggers | `lib/notifications/user.ts`, `comments.ts` | `notifyUsers` writes a bell row + optional push, respects per-user prefs (`lib/notifications/prefs.ts`). |
| Service worker | `public/sw.js` | `push` + `notificationclick` handlers (unchanged). Cache policy is allowlist-only (29B). |

Env config (names only — values live in `.env.local`, never in code):
`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
If VAPID keys are absent, `sendPushToUsers` reports `vapid_not_configured` and
sends nothing — **local validation never needs production secrets.**

---

## 2. What Prompt 29C added (all pure, all dark)

Two pure, unit-tested modules under `lib/games/poker/notifications/`:

- **`redaction.ts`** — the security core. `assertSafeNotification()` is the single
  enforcement point every poker notification must pass before reaching web-push.
- **`catalog.ts`** — the exhaustive allowlist of poker notification *kinds*, with
  safe URL + tag construction and the tournament inert-gate.

Plus:
- i18n copy under `games.poker.notif.*` in all 5 locales (`messages/*.json`).
- An open-redirect guard on the shared notification-click navigation
  (`components/MentionNotificationProvider.tsx`).

Nothing calls `buildPokerNotification` from a live code path. The foundation
ships **dark**: it exists and is tested, but produces zero notifications until a
future phase wires a trigger behind the (still-OFF) flags.

---

## 3. Allowed notification categories (§2)

Defined by `PokerNotificationKind` in `catalog.ts` — adding a member here is the
**only** way to introduce a poker notification.

| Kind | When | Destination URL (same-origin) | Collapse tag |
|---|---|---|---|
| `friend_table_invite` | a friend invites you to their cash table | `/games/poker/{tableId}` | `poker-invite-{tableId}` |
| `private_table_invite` | invited to a password-protected table | `/games/poker/{tableId}` (**no password**) | `poker-invite-{tableId}` |
| `beta_invite` | admitted to the poker closed beta | `/games/poker` | `poker-beta-invite` |
| `maintenance_complete` | poker maintenance finished | `/games/poker` | `poker-maintenance` |
| `tournament_reminder` | a scheduled tournament is about to start | `/games/poker/tournaments/{id}` | `poker-tournament-{id}` |

`tournament_reminder` requires an explicit `tournamentsEnabled: true` input. While
tournaments are hard-off, `buildPokerNotification` **returns `null`** for it — the
code exists but is inert. No per-turn / per-action notifications exist by design.

---

## 4. Prohibited content (§3) — enforced, not just documented

`assertSafeNotification()` rejects a notification if **any** field:

- contains a forbidden word (case-insensitive): `password`/`mật khẩu`, `token`,
  `jwt`, `bearer`, `access_token`, `refresh_token`, `service_role`, `secret`,
  `api_key`, `seed`, `shuffle`, `deck order`, `rng`, `hole card`, `pocket cards`,
  `session`, `cookie`, `authorization`;
- contains a token-shaped blob: JWT (`eyJ….…`), 32+ char hex, 40+ char base64;
- has a title > 80 chars or body > 140 chars (state-smuggling guard);
- has a URL that is not a safe same-origin secret-free path (see §5).

By construction the input types carry **no field** for a card, snapshot, password,
token, or seed — a caller physically cannot pass private state in. The content
scan is the second line of defence for the case where localized copy accidentally
interpolates a secret (e.g. a mistaken `body: "Mật khẩu bàn: …"` → **blocked**,
tested in `catalog.test.ts`).

Therefore the following are impossible in a poker notification: hole cards,
hidden/community/folded cards, deck order, shuffle seed, private-table snapshot,
private-table password, auth/session token, service-role secret, internal
incident data, private Realtime payload, hidden bot state. Content is safe to
render on a **locked device**.

---

## 5. Notification click authorization (§5)

The click path never trusts the notification payload as authority.

1. **URL is data, not capability.** `catalog.ts` only ever emits a same-origin
   *relative path* to a route that performs its own server-side authorization:
   - table invites → `/games/poker/{tableId}` where the table page runs the
     public seat gate / `PrivateTableGate` (`app/games/poker/access.ts`,
     `lib/games/poker/tableAccess.ts`). An unauthorized user still cannot see a
     private table or auto-join; the private-table password is collected at the
     gate, never carried in the URL.
   - beta / maintenance → `/games/poker`, fully governed by the flags + Alpha/Beta
     allowlists.
2. **No secret ever rides in the URL.** `isSafeInternalPath()` rejects any
   `password`/`pw`/`token`/`access_token`/`seed`/`session`/`sig`/`key` query and
   any token-shaped query value. Table ids are `encodeURIComponent`-escaped so an
   odd id cannot inject a query or break the path.
3. **No auto-action.** The click only *navigates*. It never submits a game action
   and never auto-joins with a password. Expired invitations simply land on a page
   whose access gate declines — the safe fallback route.
4. **Open-redirect defence.** The shared client handler
   (`MentionNotificationProvider`) now resolves the target against
   `window.location.origin` and refuses anything off-site (absolute cross-origin,
   protocol-relative `//host`, `javascript:`), falling back to `/`. This hardens
   **all** site notifications, not just poker.

---

## 6. Permission & unsubscribe experience (§4)

Provided by the existing, unchanged UX:

- **User-initiated** — permission is requested only from the banner's *Enable*
  button (a clear gesture). `MentionNotificationProvider` explicitly does **not**
  auto-prompt on first load.
- **Respects denial** — a denied state shows an explanatory hint and hides the
  Enable button; we never re-prompt programmatically (impossible anyway).
- **Respects existing state** — if already `granted`, the browser is silently
  (re)subscribed; if dismissed, the banner stays hidden (`notif-perm-dismissed`).
- **Unsupported browsers** — `subscribe.ts` no-ops when `serviceWorker` /
  `PushManager` / `Notification` are absent, or no VAPID key is configured.
- **Expired / invalid subscriptions** — `sendPushToUsers` prunes any endpoint that
  returns 404/410; `subscribeToPush(forceFresh)` re-subscribes after an unregister.
- **Safe unsubscribe** — `removePushSubscription(endpoint)` deletes the own-row.
- **Never blocks gameplay** — push is best-effort end to end; poker plays fully
  with notifications denied or unavailable.

---

## 7. Testing

`node --test lib/games/poker/notifications/*.test.ts` — **20 tests, all green**:
- `redaction.test.ts` (12): same-origin path acceptance/rejection, control-char /
  CRLF injection rejection, secret-query rejection, forbidden-word + token-blob
  scanning, over-long body, throw-vs-null behaviour.
- `catalog.test.ts` (8): per-kind URL/tag, private-invite carries no password,
  id percent-encoding, tournament inert-when-off / active-when-enabled, leaked
  secret in copy rejected, i18n mapping completeness.

---

## 8. Known limitations & future work

- **No live trigger is wired.** A future phase must add the server-side dispatch
  (friend-invite action, beta admission, maintenance banner) behind the OFF flags,
  authorize the *recipient* (only send `private_table_invite` to a user the host
  actually invited), and localize copy per recipient via `getTranslations`.
- **Existing site pushes compose copy server-side in Vietnamese.** The poker
  catalog is locale-agnostic (copy passed in), so the dispatch site should resolve
  `games.poker.notif.*` per recipient locale.
- **iOS web push** requires the site be installed to the home screen (A2HS) and
  iOS ≥ 16.4; unsupported devices degrade silently (§6).
- **No delivery/read receipts** — Web Push is fire-and-forget; do not treat a sent
  push as a read confirmation.
