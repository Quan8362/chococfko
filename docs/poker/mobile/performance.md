# Poker Mobile Performance & Battery (Prompt 29C)

Evidence-based audit of the poker table runtime for frame rate, timer/event
frequency, subscription/listener lifecycle, and battery behaviour. No strategy,
economy, authoritative rule, or realtime-timing change was made — this phase
**validates and documents**; it does not trade correctness for speed.

---

## 1. Timer & loop inventory (per mounted `/games/poker/[tableId]`)

Sourced from `app/games/poker/usePokerRealtime.ts` and the 29A/29B `_design` hooks.

| Loop | Cadence | Gated on visibility? | Cleanup | Cost |
|---|---|---|---|---|
| Recovery watchdog (`usePokerRealtime`) | `setInterval` 12 s | **yes** — only reconciles when `visibilityState==='visible'` | `clearInterval` on unmount | 1 snapshot fetch worst-case / 12 s |
| Presence heartbeat | `setInterval` 20 s | no (cheap flag write); only while **seated** | `clearInterval` + mark-disconnected on unmount | 1 tiny RPC / 20 s |
| Turn clock (`nowMs` tick) | `setInterval` 500 ms (2 Hz) | tick always; the **nudge** is visibility-gated + throttled 3 s | `clearInterval` on unmount | `Date.now()` + one `setState` |
| App-update poll (`usePokerAppUpdate`) | `setInterval` 5 min | **yes** — skips fetch when hidden; also re-checks on `visible` | `clearInterval` + `AbortController.abort()` on unmount | 1 tiny `/api/version` GET / 5 min |
| Wake lock (`useWakeLock`) | event-driven (`visibilitychange`) | acquires only while enabled+seated+visible | `release()` + `removeEventListener` on unmount | none between events |
| Fullscreen (`useFullscreen`) | event-driven | n/a | `removeEventListener` on unmount | none between events |

**No `requestAnimationFrame` loop runs in the poker table JS.** Card/chip motion
is CSS-driven (`_design/poker-theme.css`, `tokens.ts`) and honours reduced-motion
(OS + in-game `data-pk-reduce-motion`), so the compositor — not the main thread —
drives animation and it stops when motion is reduced.

## 2. Realtime frequency

Realtime is **notification-only** (`usePokerRealtime` header): each relevant
`postgres_changes` event triggers **one** recipient-aware snapshot re-read, not a
stream of row deltas. Overlapping reconciles collapse into a single in-flight
fetch (`reconcileInFlightRef`) with a one-shot re-run if an event lands mid-fetch
(`reconcileDirtyRef`) — so a burst of events cannot fan out into a burst of
fetches. The monotonic `state_version` drops stale/duplicate/out-of-order events
before any fetch. Exactly **one** channel is opened per table (`poker:{tableId}`).

## 3. Battery behaviour

The design is already battery-conscious and this audit confirms it:

- **Work stops when the tab is hidden.** The watchdog and app-update poll both
  early-return while `visibilityState!=='visible'`; the wake lock is released by
  the OS on hide and we don't re-acquire until visible+eligible. A backgrounded
  table does no fetching and holds no screen lock.
- **Background-tab throttling is safe.** The 500 ms turn tick is throttled by the
  browser when hidden; correctness does not depend on it (the server owns the
  deadline; the timeout nudge is a best-effort hint the server re-validates), so
  throttling saves power without hiding authoritative updates.
- **Wake lock is opt-in and scoped.** Held only while `enabled && seated &&
  visible` (`shouldHoldWakeLock`, pure + tested), self-heals on resume, degrades
  silently on iOS < 16.4. It never keeps the screen on at the lobby or when folded
  out of a hand.
- **Audio is lazy & singleton.** `usePokerSound` owns ONE module-level
  `AudioContext`, gesture-unlocked via three globally-**bound-once** passive
  listeners (no per-mount growth); tones are transient WebAudio nodes with decay
  envelopes that self-release. Nothing decodes audio files.

## 4. Subscription & listener cleanup (§8)

Every effect has **symmetric teardown** — this is the core of long-session safety:

| Resource | Registered in | Torn down |
|---|---|---|
| `poker:{tableId}` realtime channel | subscription effect | `supabase.removeChannel(channel)` |
| `auth.onAuthStateChange` | subscription effect | `authSub.unsubscribe()` |
| `visibilitychange` / `online` / `offline` | watchdog effect | `removeEventListener` ×3 |
| watchdog / heartbeat / turn-clock / update intervals | respective effects | `clearInterval` |
| in-flight version fetch | `usePokerAppUpdate` | `AbortController.abort()` |
| wake-lock sentinel + `visibilitychange` | `useWakeLock` | `release()` + `removeEventListener` |

Post-unmount `setState` is prevented by `mountedRef` / `cancelled` guards
throughout. Because the channel is keyed by `tableId` and removed on unmount,
navigating table→lobby→table does **not** accumulate channels, listeners, or
timers — the steady-state count is constant across an arbitrarily long session.

## 5. Evidence-based findings

| # | Finding | Severity | Action |
|---|---|---|---|
| P1 | Every timer/listener/subscription/fetch has symmetric cleanup + mount guards. | ✅ good | none |
| P2 | Hidden-tab work is suppressed (watchdog, poll, wake lock). | ✅ good | none |
| P3 | Realtime is coalesced snapshot re-reads, capped at one in-flight fetch. | ✅ good | none |
| P4 | Turn clock re-renders the table subtree at 2 Hz while mounted **even between hands / with no active deadline**. Bounded (`Date.now()`+`setState`, no layout thrash), pre-existing in `usePokerRealtime`. | low | **Not changed** (out of 29C scope; altering realtime timing is risk). Candidate future optimization: gate the tick on an active `turnDeadline` so it idles between hands. |
| P5 | No `rAF` loop; motion is CSS + reduced-motion aware. | ✅ good | none |

No high/medium-severity performance defect was found. P4 is the only optimization
candidate and is deliberately deferred to avoid touching money-adjacent realtime
timing in a validation-only phase.

## 6. Long-session validation

See the long-session methodology and results in the final report (§7). The static
guarantee — symmetric cleanup + constant steady-state resource count — is the
structural reason a long session does not leak; the report records the runtime
checks that could and could not be executed in this environment.

## 7. What was intentionally NOT touched

Strategy, economy, authoritative rules, realtime state-version logic, the 500 ms
turn cadence, bot/tournament code, and production flags. Preserved verbatim from
29A/29B: fullscreen, wake lock, haptics, safe-area handling, portrait fallback,
PWA cache policy, background recovery, app-update flow.
