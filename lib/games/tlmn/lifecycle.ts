// Tiến Lên — match-lifecycle predicates (PURE, no I/O).
//
// The whole TLMN turn loop is client-NUDGED: runBotTurn / tickTurnTimer are called by
// seated browsers (there is no long-lived server). So when EVERY human leaves or
// disconnects mid-round, nothing drives the bot / AFK-takeover seats and the match is
// stranded in 'playing' forever. These predicates decide — from seat presence alone —
// whether a live match still has a real player, and are the single source of truth behind
// the server-side abandonment reaper (reapAbandonedGames). Kept pure so the decision is
// unit-tested in isolation, exactly like the engine / round state machine.

// Reconnection grace window. A human seat is still considered present for this long after
// its last heartbeat, so a page reload or a transient network drop never abandons a match
// (the room heartbeat fires every 15s, so this is ~4 missed beats). Past it — with no
// other human present — the match is treated as genuinely abandoned.
export const ABANDON_GRACE_MS = 60_000

// The minimal seat shape the predicates need (a subset of tlmn_seats columns).
export type SeatPresence = {
  user_id: string | null
  is_bot: boolean
  bot_takeover: boolean
  last_seen: string | null
}

// A seat counts as a LIVE HUMAN — a real participant still present (or within the
// reconnection grace window) — when ALL hold:
//   • it is occupied by a real account (user_id set, not a lobby bot),
//   • it is NOT currently handed to a bot (an explicit leave sets bot_takeover), and
//   • it has heart-beaten within graceMs.
// A reload / transient drop keeps last_seen fresh enough to stay live; an explicit leave
// flips bot_takeover immediately; a silently-closed tab simply goes stale past the grace.
// A null last_seen is treated as not-live (a seat that has never checked in cannot keep a
// match alive on its own).
export function isLiveHuman(seat: SeatPresence, now: number, graceMs: number = ABANDON_GRACE_MS): boolean {
  if (!seat.user_id || seat.is_bot || seat.bot_takeover) return false
  if (!seat.last_seen) return false
  return now - new Date(seat.last_seen).getTime() <= graceMs
}

// A live ('playing') match is ABANDONED when NOT ONE seat is a live human — every real
// player has either explicitly left (bot_takeover) or stopped heart-beating past the grace
// window. Bots / AFK-takeover seats alone must never keep a match "alive", because nothing
// drives them once the last browser is gone.
export function isMatchAbandoned(seats: SeatPresence[], now: number, graceMs: number = ABANDON_GRACE_MS): boolean {
  return !seats.some(s => isLiveHuman(s, now, graceMs))
}
