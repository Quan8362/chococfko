// ── Poker quick-reaction catalog + realtime event schema ─────────────────────────────────
//
// PURE module (NO server taint, NO React, NO DB) so the table UI, the receive hook AND the
// server action all import ONE source of truth. Poker reactions are SAFE PRESET phrases +
// emoji only — never free text. The wire carries only an allowlisted `key`; each recipient
// renders that key in THEIR OWN language, so no arbitrary text ever crosses the network.
//
// This mirrors the proven Tiến Lên interaction patterns (rate limiter / seen-cache / schema
// guard) but is kept Poker-local — no cross-game import, its own curated Poker content, and a
// SERVER-AUTHORITATIVE send path (see reaction-actions.ts): the seat is derived server-side
// from the authenticated seated player, so a spectator / unseated / other-table user cannot
// inject a reaction and a sender cannot forge a seat.

export const REACTION_SCHEMA_VERSION = 1

export type ReactionCategory = 'friendly' | 'hand' | 'celebration' | 'emotion'

// One preset reaction. `key` is stable + language-independent (used as the wire `key` AND the
// i18n leaf `reactions.phrase.<key>`); `emoji` is decorative chrome shown in the panel + bubble.
export type ReactionDef = {
  key: string
  category: ReactionCategory
  emoji: string
}

// Curated, positive / neutral, gameplay-focused set. No insults, taunts, threats, profanity,
// gambling encouragement, real-money language, collusion, or messages that reveal cards or ask
// a player to check/fold/call/raise. Edit here to add/remove; add `reactions.phrase.<key>` to
// ALL 5 message files.
export const REACTIONS: ReactionDef[] = [
  // Friendly — Thân thiện
  { key: 'hello', category: 'friendly', emoji: '👋' },
  { key: 'good_luck', category: 'friendly', emoji: '🍀' },
  { key: 'thanks', category: 'friendly', emoji: '🙏' },
  { key: 'next_hand', category: 'friendly', emoji: '🤝' },
  { key: 'well_played', category: 'friendly', emoji: '👏' },
  { key: 'sorry', category: 'friendly', emoji: '🙂' },
  // Hand — Ván bài
  { key: 'nice', category: 'hand', emoji: '👍' },
  { key: 'good_hand', category: 'hand', emoji: '🃏' },
  { key: 'beautiful', category: 'hand', emoji: '✨' },
  { key: 'hard_read', category: 'hand', emoji: '🤔' },
  { key: 'nice_allin', category: 'hand', emoji: '🔥' },
  { key: 'strong_hand', category: 'hand', emoji: '😮' },
  // Celebration — Ăn mừng
  { key: 'clap', category: 'celebration', emoji: '👏' },
  { key: 'wonderful', category: 'celebration', emoji: '🎉' },
  { key: 'congrats', category: 'celebration', emoji: '🏆' },
  { key: 'so_good', category: 'celebration', emoji: '🔥' },
  { key: 'amazing', category: 'celebration', emoji: '💫' },
  { key: 'gg', category: 'celebration', emoji: '🙌' },
  // Emotion — Cảm xúc
  { key: 'lucky', category: 'emotion', emoji: '😅' },
  { key: 'unexpected', category: 'emotion', emoji: '😮' },
  { key: 'intense', category: 'emotion', emoji: '🤯' },
  { key: 'happy', category: 'emotion', emoji: '😄' },
  { key: 'unlucky', category: 'emotion', emoji: '😔' },
  { key: 'respect', category: 'emotion', emoji: '🫡' },
]

export const CATEGORY_ORDER: ReactionCategory[] = ['friendly', 'hand', 'celebration', 'emotion']

const REACTION_BY_KEY = new Map(REACTIONS.map((r) => [r.key, r]))
export const getReaction = (key: string): ReactionDef | undefined => REACTION_BY_KEY.get(key)
// Allowlist gate — the ONLY keys that may cross the wire. Rejects unknown ids AND arbitrary text.
export const isValidReactionKey = (key: unknown): key is string =>
  typeof key === 'string' && REACTION_BY_KEY.has(key)

// ── Anti-spam limits (spec §7) ────────────────────────────────────────────────────────────
export const REACTION_LIMITS = {
  cooldownMs: 4000, // ≥1 reaction / 4s per player (both client + server enforce)
  windowMs: 12000, // rolling burst window
  windowMax: 4, // ≤4 reactions / 12s (short-burst protection)
  bubbleTtlMs: 3200, // how long a bubble stays on a seat (~2.5–3.5s)
  // Receive-side per-seat throttle: even if a sender floods, a recipient renders at most one
  // bubble per this interval per seat (defense-in-depth independent of the sender).
  receiveThrottleMs: 3500,
  seenMax: 200,
} as const

// Bounded seat index sanity cap (2..6 seats → indexes 0..5). Anything outside is malformed.
export const MAX_SEAT_INDEX = 9

// ── Realtime event (transient broadcast — NEVER persisted) ──────────────────────────────────
// Carries ONLY public-safe data: an allowlisted key, the AUTHORITATIVE sender seat index (set
// server-side), a dedup id, and a display timestamp. No user id / email / cards / tokens.
export type ReactionEvent = {
  v: number // schema version
  id: string // dedup id (network retries / self echo)
  key: string // ReactionDef.key (allowlisted)
  senderSeat: number // AUTHORITATIVE felt seat index (server-derived)
  at: number // send timestamp (ms) — display/ordering only, untrusted
}

// Dedicated transient FX channel — separate from the authoritative `poker:<tableId>` game
// channel so a reaction can never reorder a hand, delay a turn, or trigger a state refetch.
export const reactionChannelName = (tableId: string): string => `poker-fx:${tableId}`
export const REACTION_EVENT = 'reaction' as const

// Tiny dependency-free id (crypto.randomUUID when available).
export function makeReactionId(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  } catch {
    /* ignore */
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

// ── Pure anti-spam gate (check-and-commit; injected `now` for deterministic tests) ──────────
// The SAME limiter enforces both the per-action cooldown and the rolling-window cap. Used on the
// client (button gate) AND server-side (authoritative best-effort) so it never relies solely on
// disabling the button.
export type RateLimiter = { last: number; window: number[] }
export const newRateLimiter = (): RateLimiter => ({ last: -Infinity, window: [] })
export function rateLimitAllow(rl: RateLimiter, now: number): boolean {
  if (now - rl.last < REACTION_LIMITS.cooldownMs) return false
  rl.window = rl.window.filter((ts) => now - ts < REACTION_LIMITS.windowMs)
  if (rl.window.length >= REACTION_LIMITS.windowMax) return false
  rl.last = now
  rl.window.push(now)
  return true
}

// ── Pure incoming-event validator (schema-version + shape + allowlist guard) ────────────────
// Rejects anything not matching the current schema version, malformed, of an unknown/absent key,
// or with a non-finite / out-of-range seat — so a stray, old, or forged broadcast can never
// render. Returns a normalized event or null.
export function validateIncoming(payload: unknown): ReactionEvent | null {
  if (!payload || typeof payload !== 'object') return null
  const ev = payload as Record<string, unknown>
  if (ev.v !== REACTION_SCHEMA_VERSION) return null
  if (typeof ev.id !== 'string' || ev.id.length === 0 || ev.id.length > 64) return null
  if (!isValidReactionKey(ev.key)) return null
  if (typeof ev.senderSeat !== 'number' || !Number.isInteger(ev.senderSeat)) return null
  if (ev.senderSeat < 0 || ev.senderSeat > MAX_SEAT_INDEX) return null
  return {
    v: REACTION_SCHEMA_VERSION,
    id: ev.id,
    key: ev.key,
    senderSeat: ev.senderSeat,
    at: typeof ev.at === 'number' && Number.isFinite(ev.at) ? ev.at : 0,
  }
}

// ── Pure dedup cache (event-id idempotency for network retries / self echo) ──────────────────
export function makeSeenCache(max = REACTION_LIMITS.seenMax) {
  const seen = new Map<string, number>()
  return {
    accept(id: string, now: number): boolean {
      if (seen.has(id)) return false
      seen.set(id, now)
      if (seen.size > max) {
        const cutoff = now - REACTION_LIMITS.bubbleTtlMs * 2
        for (const [k, ts] of Array.from(seen.entries())) if (ts < cutoff) seen.delete(k)
      }
      return true
    },
    get size() {
      return seen.size
    },
  }
}

// ── Server-side rate limiter (best-effort, in-memory) ───────────────────────────────────────
// Authoritative anti-spam that does NOT depend on the client button. In-memory per-process (a
// serverless instance may hold a subset of users) — combined with the client gate AND the
// recipient-side per-seat throttle, floods are well contained without any DB write. Bounded so
// it never grows without limit.
const serverLimiters = new Map<string, RateLimiter>()
export function serverReactionRateLimit(userId: string, now: number): boolean {
  let rl = serverLimiters.get(userId)
  if (!rl) {
    rl = newRateLimiter()
    serverLimiters.set(userId, rl)
  }
  const ok = rateLimitAllow(rl, now)
  // Opportunistic prune of stale limiters (users idle beyond the window) to cap memory.
  if (serverLimiters.size > 5000) {
    for (const [k, v] of Array.from(serverLimiters.entries())) {
      if (now - v.last > REACTION_LIMITS.windowMs * 4) serverLimiters.delete(k)
    }
  }
  return ok
}
