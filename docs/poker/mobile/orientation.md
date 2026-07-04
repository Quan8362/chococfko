# Poker — Mobile Orientation, Safe Areas, Fullscreen, Wake Lock & Haptics

Scope: the landscape-first mobile/tablet experience for the live poker table
(`app/games/poker/[tableId]/PokerTable.tsx`) and its supporting device layer. This document
describes **behaviour only** — it changes no authoritative rules, economy, bot strategy, or
feature flags. Poker remains hard-OFF (`POKER_ENABLED`) and ships dark.

## Supported orientation behaviour

Poker is **landscape-only** by design (visual spec). The layout bucket is derived from *real
viewport geometry* — width, height, aspect ratio — never user-agent sniffing
(`app/games/poker/_design/useViewportClass.ts`):

| Bucket | Condition (landscape) | Table asset |
|--------|-----------------------|-------------|
| `desktop` | `h ≥ 760 && w ≥ 1024` | `/poker-desktop.webp` (16:9) |
| `tablet` | `h ≥ 560 && w ≥ 900` | `/poker-tablet.webp` (4:3) |
| `mobile` | otherwise (landscape) | `/poker-mobile.webp` (16:9) |
| `portrait` | `aspect < 1.05` | — (rotate fallback) |

Each layout loads **only** its own asset (`_components/TableBackground.tsx`), via
`object-fit: cover` in a "cover box" whose aspect ratio matches the art. All seat pads, card
pockets, board and pot geometry are anchored as a **percentage of that box**, so they stay glued
to the felt at any viewport size — the drift-avoidance lesson carried over from TLMN seat
positioning. The desktop asset is never silently reused for tablet/mobile.

Re-classification runs on `resize`, `orientationchange`, and `visualViewport` `resize` (which
fires when the mobile browser toolbar shows/hides), coalesced through `requestAnimationFrame`.

## Portrait fallback behaviour

In portrait the table is **never** rendered squeezed. Instead a premium full-screen
`RotateDeviceOverlay` (`_components/overlays.tsx`) is shown. It is a *presentation-only* surface —
it **does not mutate authoritative state**:

- the active hand keeps running server-side and is **restored verbatim** on the next landscape
  frame (no reload, no re-deal, no reset of private cards, no action submitted on rotation);
- it surfaces a **read-only action countdown** (`role="timer"`, `aria-live="polite"`) derived from
  the server turn deadline **only when it is the viewer's turn** — it never enforces the timeout;
  the chip turns amber inside the final 5 seconds;
- it offers a **safe Leave control** (a deliberate, explicit user action wired to the existing
  `leaveTable` server action — not an overlay side-effect);
- reconnection remains automatic; the always-reachable floating **Report a problem** button stays
  mounted above the overlay.

A `device_rotated` UX-research signal is recorded (once per portrait entry) so we can measure how
often small-phone players hit the orientation wall.

## Safe-area strategy

The root document sets `viewport-fit=cover` (`app/layout.tsx`), which is what makes the
`env(safe-area-inset-*)` values non-zero on notched / rounded / home-indicator devices. The poker
theme (`_design/poker-theme.css`) exposes them as CSS custom properties scoped under
`.poker-root`:

```
--pk-safe-top / --pk-safe-right / --pk-safe-bottom / --pk-safe-left
  = env(safe-area-inset-*, 0px)
```

Every edge-anchored surface pads off these variables rather than hardcoding device numbers:

- top-left table HUD → `top: calc(var(--pk-safe-top) + 8px); left: calc(var(--pk-safe-left) + 10px)`
- top-right controls (fullscreen / mute / menu) → mirrored with `--pk-safe-right`
- bottom hero band + action bar → `padding-bottom: calc(var(--pk-safe-bottom) + 8px)`
- rotate overlay → padded top & bottom by the safe insets.

Because the buckets read `visualViewport` when present, the table re-fits when the iOS Safari
address bar / toolbar collapses or the Android Chrome chrome changes height. There are **no
device-specific hardcodes** — the same math covers every notch/corner/foldable.

## Fullscreen behaviour

`_design/useFullscreen.ts` wraps the Fullscreen API with the WebKit-prefixed fallback and targets
the **poker root element** (so safe-area padding + all HUD survive the transition):

- exposed as an optional **top-right HUD pill**, rendered **only** when `fullscreenSupported()` is
  true (hidden entirely on iPhone Safari, which does not expose element fullscreen);
- **user-initiated only** — entered from the tap gesture, **never auto-forced**;
- **never a trap** — the pill flips its glyph/label between enter (`⛶`) and exit (`🡼`) and reflects
  the live `fullscreenchange` state, so exit is always one tap away;
- a rejected request (no gesture / permission denied) is swallowed and the app stays windowed;
- degrades to *no control shown* where unsupported.

## Wake-lock behaviour

`_design/useWakeLock.ts` (pure eligibility in `lib/games/poker/mobileSession.ts`,
`shouldHoldWakeLock`) keeps the screen awake during play:

- **opt-in** via the poker setting **Keep screen awake** (`wakeLock`, default ON);
- held **only** while `enabled && supported && seated && document visible` — i.e. active seated
  gameplay on a visible tab; spectators and the lobby never hold it;
- **released** on leaving the table, tab hide, and unmount;
- **self-healing** — the OS releases the sentinel when the tab is backgrounded, so the hook
  re-acquires on the next `visibilitychange` while still eligible;
- **fails silently** on unsupported browsers (iOS < 16.4) and on `NotAllowedError` (low battery,
  embedded frame). Gameplay never depends on the wake lock.

## Haptic behaviour

Haptics use `navigator.vibrate` (`_design/usePokerSound.ts` → `pokerVibrate`), gated on the
independent **Vibration** setting (`vibration`, default ON) and platform support (no-op on iOS
Safari). Patterns are a fixed, bounded taxonomy (`lib/games/poker/mobileSession.ts`,
`HAPTIC_PATTERN`):

| Event | Pattern (ms) |
|-------|--------------|
| Your turn | `20` |
| Timer warning | `[40, 60, 40]` |
| Action accepted | `12` |
| All-in confirmation | `[30, 40, 30, 40, 60]` |
| Pot won (viewer is a winner) | `[25, 50, 25]` |

Rules enforced: never continuous (every pattern ≤ 300 ms total, unit-tested), never required for
gameplay, and — critically — **`actionAccepted` is a single fixed buzz for every action regardless
of the cards**, so vibration can never encode private hand strength.

## Accessibility

- Controls do not depend on hover; all are real focusable `<button>`s in natural tab order.
- Reduced motion is honoured two ways: the OS `prefers-reduced-motion` media query **and** the
  in-game **Reduced motion / Animation** toggles (mirrored via `data-pk-reduce-motion` on
  `.poker-root`). State still updates instantly; only presentation animation is neutralised.
- A thick, offset champagne-gold focus ring (`:focus-visible`) is visible on the dark felt and
  never relies on colour alone.
- Touch targets: HUD pills 40×40, bet-slider thumb 26×26, sit/leave controls generously sized.
- The action bar guards against accidental double-submit: a single in-flight `pending` action
  blocks re-entry until the server responds.

## Unsupported-platform fallbacks

| Capability | Missing on | Fallback |
|------------|-----------|----------|
| Fullscreen API | iPhone Safari | HUD pill hidden; table plays windowed |
| Wake Lock API | iOS < 16.4, some desktop | Setting inert; screen may dim (no gameplay impact) |
| `navigator.vibrate` | iOS Safari, most desktop | Haptics silently no-op |
| WebAudio | rare/blocked | Sound silently no-op (gesture-unlock retained) |

## Known limitations

- Wake lock cannot keep the screen awake on iOS < 16.4; those users should raise their device
  auto-lock timeout manually.
- Haptics are unavailable on all iOS browsers (no `navigator.vibrate`) — this is a platform
  limit, not a bug.
- Fullscreen on iPhone Safari is not offered at all (no element-fullscreen support).
- The live-table fullscreen pill and wake lock are exercised through the design showcase
  (`/games/poker/preview`) and unit tests for their pure logic; end-to-end coverage of the
  *authenticated* live table is gated behind the poker feature flags remaining OFF.
- There is no in-table text chat in this release, so the "collapsible chat" requirement is N/A on
  the live table; the only expandable secondary surface (side-pot detail) is a collapsed
  `<details>` and never covers gameplay.
