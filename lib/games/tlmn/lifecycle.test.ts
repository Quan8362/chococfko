// Tiến Lên — match-lifecycle abandonment predicate tests.
//
// Reproduces the confirmed YXWLK failure at the decision level: a 'playing' match whose
// every human has left / disconnected must be detected as ABANDONED so the server reaper
// (reapAbandonedGames) can finalize it without any open browser. Covers the reconnection
// grace window, the single-remaining-human keep-alive, simultaneous departure, and the
// bots-alone case. Pure logic — the DB orchestration around it (reapAbandonedGames) is a
// thin, status='playing'-guarded conditional write reused verbatim from the same pattern
// as caro's finalizeStaleGames.
//
// Run with:  node --test lib/games/tlmn/lifecycle.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isLiveHuman, isMatchAbandoned, ABANDON_GRACE_MS, type SeatPresence } from './lifecycle.ts'

const NOW = Date.UTC(2026, 5, 30, 12, 0, 0) // fixed clock so the tests are deterministic

// Convenience builders.
function ageSec(seconds: number): string {
  return new Date(NOW - seconds * 1000).toISOString()
}
function human(over: Partial<SeatPresence> = {}): SeatPresence {
  return { user_id: 'u-' + Math.random().toString(36).slice(2), is_bot: false, bot_takeover: false, last_seen: ageSec(5), ...over }
}
function lobbyBot(over: Partial<SeatPresence> = {}): SeatPresence {
  return { user_id: null, is_bot: true, bot_takeover: false, last_seen: null, ...over }
}

// ── isLiveHuman ───────────────────────────────────────────────────────────────────
test('a freshly heart-beating human is live', () => {
  assert.equal(isLiveHuman(human({ last_seen: ageSec(5) }), NOW), true)
})

test('a human within the grace window (e.g. mid-reload) is still live', () => {
  const justInside = (ABANDON_GRACE_MS / 1000) - 1
  assert.equal(isLiveHuman(human({ last_seen: ageSec(justInside) }), NOW), true)
})

test('a human stale past the grace window is NOT live', () => {
  const justOutside = (ABANDON_GRACE_MS / 1000) + 1
  assert.equal(isLiveHuman(human({ last_seen: ageSec(justOutside) }), NOW), false)
})

test('an explicitly-left human (bot_takeover) is never live, even with a fresh heartbeat', () => {
  assert.equal(isLiveHuman(human({ bot_takeover: true, last_seen: ageSec(1) }), NOW), false)
})

test('a lobby bot is never a live human', () => {
  assert.equal(isLiveHuman(lobbyBot(), NOW), false)
})

test('a seat that has never checked in (null last_seen) is not live', () => {
  assert.equal(isLiveHuman(human({ last_seen: null }), NOW), false)
})

// ── isMatchAbandoned — the 10 required lifecycle scenarios ───────────────────────────

// (1) Reload within grace period does not abandon the match.
test('(1) a sole player mid-reload (recent last_seen) does NOT abandon', () => {
  const seats = [human({ last_seen: ageSec(8) }), lobbyBot(), lobbyBot()]
  assert.equal(isMatchAbandoned(seats, NOW), false)
})

// (2) One remaining human keeps the match active.
test('(2) one live human among left/stale seats keeps the match active', () => {
  const seats = [
    human({ bot_takeover: true, last_seen: ageSec(3) }), // left → handed to a bot
    human({ last_seen: ageSec(4) }),                      // still here
    lobbyBot(),
  ]
  assert.equal(isMatchAbandoned(seats, NOW), false)
})

// (3) Zero active humans beyond the grace period marks the match abandoned.
test('(3) all humans gone (left or stale past grace) ⇒ abandoned — the YXWLK case', () => {
  const seats = [
    human({ bot_takeover: true, last_seen: ageSec(120) }), // Player A left
    human({ bot_takeover: true, last_seen: ageSec(120) }), // Player B left
  ]
  assert.equal(isMatchAbandoned(seats, NOW), true)
})

test('(3b) both humans silently disconnected (no explicit leave) past grace ⇒ abandoned', () => {
  const stale = (ABANDON_GRACE_MS / 1000) + 30
  const seats = [human({ last_seen: ageSec(stale) }), human({ last_seen: ageSec(stale) })]
  assert.equal(isMatchAbandoned(seats, NOW), true)
})

// (6) Both players disconnect nearly simultaneously — within grace NOT abandoned, after grace abandoned.
test('(6) two simultaneous disconnects are kept alive within grace, abandoned after', () => {
  const within = [human({ last_seen: ageSec(20) }), human({ last_seen: ageSec(22) })]
  assert.equal(isMatchAbandoned(within, NOW), false, 'within grace ⇒ keep (reconnect window)')

  const after = (ABANDON_GRACE_MS / 1000) + 5
  const beyond = [human({ last_seen: ageSec(after) }), human({ last_seen: ageSec(after) })]
  assert.equal(isMatchAbandoned(beyond, NOW), true, 'past grace ⇒ abandoned')
})

// (5)/(bots) A match driven only by bots / AFK-takeover seats must NOT count as alive.
test('(5) bots + AFK-takeover seats alone do NOT keep a match alive', () => {
  const seats = [
    lobbyBot(),
    lobbyBot(),
    human({ bot_takeover: true, last_seen: ageSec(2) }), // AFK takeover, fresh beat but not driving
  ]
  assert.equal(isMatchAbandoned(seats, NOW), true)
})

// Reconnect AFTER grace: the lone returning player was stale past grace at sweep time ⇒
// the match is (correctly) abandonable; their client showing the abandoned state is right.
test('a returning player stale past grace at sweep time ⇒ match still abandoned', () => {
  const lateReturn = (ABANDON_GRACE_MS / 1000) + 10
  const seats = [human({ last_seen: ageSec(lateReturn) }), human({ bot_takeover: true, last_seen: ageSec(200) })]
  assert.equal(isMatchAbandoned(seats, NOW), true)
})

// Idempotency / determinism: the predicate is a pure function of (seats, now) — repeated
// evaluation never changes its mind, which is what makes the guarded reaper write safe to
// run on any cadence (cron + lobby nudge) and concurrently.
test('the predicate is deterministic for repeated evaluation', () => {
  const seats = [human({ bot_takeover: true, last_seen: ageSec(120) }), human({ bot_takeover: true, last_seen: ageSec(120) })]
  const a = isMatchAbandoned(seats, NOW)
  const b = isMatchAbandoned(seats, NOW)
  assert.equal(a, b)
  assert.equal(a, true)
})

// An empty room (every seat row already cleaned up) is trivially abandoned.
test('a room with no seats is abandoned', () => {
  assert.equal(isMatchAbandoned([], NOW), true)
})
