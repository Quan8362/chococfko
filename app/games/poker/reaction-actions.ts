'use server'

// ── Poker quick-reaction — the SERVER-AUTHORITATIVE send boundary ────────────────────────────
//
// The browser sends only INTENT (an allowlisted reaction key + a client dedup id). Everything
// safety-critical is decided here and CANNOT be forged by the client:
//   • authenticated              — anon / signed-out is rejected
//   • seated AT THIS table       — a spectator, unseated user, or a user seated at another table
//                                  has no seat row for this table ⇒ rejected (so they cannot inject
//                                  a reaction, and cannot target another table)
//   • allowlisted key            — arbitrary free text / unknown ids are rejected
//   • cooldown                   — best-effort in-memory rate limit (independent of the client)
//   • seat is SERVER-DERIVED     — the broadcast carries the authoritative seat index, never a
//                                  client-claimed one, so a sender cannot spoof another seat
//
// The event is a TRANSIENT broadcast on the dedicated `poker-fx:<tableId>` FX channel (separate
// from the authoritative game channel). It is NEVER persisted — no DB write, no replay — so a
// reconnect / late subscriber never re-shows an old bubble.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  REACTION_SCHEMA_VERSION,
  REACTION_EVENT,
  isValidReactionKey,
  reactionChannelName,
  serverReactionRateLimit,
  type ReactionEvent,
} from '@/lib/games/poker/reactions'

export type SendReactionResult = { ok: true } | { ok: false; error: string }

export async function sendPokerReaction(
  tableId: string,
  reactionKey: string,
  eventId: string,
): Promise<SendReactionResult> {
  // Cheap shape / allowlist guards first (reject arbitrary text before any I/O).
  if (typeof tableId !== 'string' || tableId.length === 0 || tableId.length > 64) {
    return { ok: false, error: 'invalid' }
  }
  if (!isValidReactionKey(reactionKey)) return { ok: false, error: 'invalid' }
  if (typeof eventId !== 'string' || eventId.length === 0 || eventId.length > 64) {
    return { ok: false, error: 'invalid' }
  }

  // Identity — must be an authenticated user.
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'unauthenticated' }

  // Seated at THIS table? (service-role read is authoritative + RLS-independent). The seat row is
  // keyed by (table_id, user_id); a spectator/unseated user or a user seated elsewhere has none.
  const admin = createAdminClient()
  const { data: seat, error: seatErr } = await admin
    .from('poker_seats')
    .select('seat_index, status')
    .eq('table_id', tableId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (seatErr) return { ok: false, error: 'error' }
  if (!seat || typeof seat.seat_index !== 'number') return { ok: false, error: 'not_seated' }

  // Authoritative cooldown — independent of the client button.
  if (!serverReactionRateLimit(user.id, Date.now())) return { ok: false, error: 'cooldown' }

  // Broadcast the minimal, public-safe payload (no user id / email / cards). The seat is the
  // SERVER-DERIVED one, so it is trustworthy on every recipient.
  const payload: ReactionEvent = {
    v: REACTION_SCHEMA_VERSION,
    id: eventId,
    key: reactionKey,
    senderSeat: seat.seat_index,
    at: Date.now(),
  }
  try {
    const channel = admin.channel(reactionChannelName(tableId))
    await channel.send({ type: 'broadcast', event: REACTION_EVENT, payload })
    await admin.removeChannel(channel)
  } catch {
    return { ok: false, error: 'error' }
  }
  return { ok: true }
}
