// ── TLMN player-interaction catalog + realtime event schema ──────────────────────────
// Shared, pure module (NO server taint, NO React) so the table UI, the realtime hook and
// any future server validator can all import the same source of truth. Phase 1 covers
// preset PHRASES (friendly / teasing / celebration / frustrated); the event schema is
// versioned + already carries a `kind` + optional target so Phase 2 throwables and
// Phase 3 coin costs slot in without a breaking change.

export const INTERACTION_SCHEMA_VERSION = 1

// ── Moderation report reasons (Phase 4) — must match the DB CHECK + report_player RPC ──
export const REPORT_REASONS = ['spam', 'harassment', 'offensive', 'cheating', 'other'] as const
export type ReportReason = typeof REPORT_REASONS[number]

export type InteractionCategory = 'friendly' | 'teasing' | 'celebration' | 'frustrated'

// One preset phrase. `key` is stable (used as the i18n leaf `react_phrase_<key>` AND as
// the wire `key`); `emoji` is decorative chrome shown in the panel button + the bubble.
export type PhraseDef = {
  key: string
  category: InteractionCategory
  emoji: string
}

// Curated, gameplay-focused, non-abusive phrase set (spec §24). No profanity, no targets
// at a person's identity/family/appearance — only the match. Edit here to add/remove a
// phrase; remember to add its `react_phrase_<key>` translation to all 5 message files.
export const PHRASES: PhraseDef[] = [
  // Friendly
  { key: 'hello', category: 'friendly', emoji: '👋' },
  { key: 'nice', category: 'friendly', emoji: '👍' },
  { key: 'good_play', category: 'friendly', emoji: '✨' },
  { key: 'good_luck', category: 'friendly', emoji: '🍀' },
  { key: 'thanks', category: 'friendly', emoji: '🙏' },
  { key: 'clap', category: 'friendly', emoji: '👏' },
  // Teasing
  { key: 'think_long', category: 'teasing', emoji: '⏳' },
  { key: 'play_already', category: 'teasing', emoji: '🎴' },
  { key: 'sure', category: 'teasing', emoji: '🤔' },
  { key: 'tense', category: 'teasing', emoji: '😬' },
  { key: 'pity', category: 'teasing', emoji: '😅' },
  { key: 'wrong', category: 'teasing', emoji: '🙈' },
  { key: 'time_up', category: 'teasing', emoji: '⏰' },
  { key: 'calm', category: 'teasing', emoji: '😌' },
  // Celebration
  { key: 'amazing', category: 'celebration', emoji: '🔥' },
  { key: 'wonderful', category: 'celebration', emoji: '🎉' },
  { key: 'lucky', category: 'celebration', emoji: '🍀' },
  { key: 'win', category: 'celebration', emoji: '🏆' },
  { key: 'woohoo', category: 'celebration', emoji: '🙌' },
  { key: 'beautiful', category: 'celebration', emoji: '💯' },
  // Frustrated (playful, non-threatening)
  { key: 'omg', category: 'frustrated', emoji: '😱' },
  { key: 'unbelievable', category: 'frustrated', emoji: '🤯' },
  { key: 'annoyed', category: 'frustrated', emoji: '😤' },
  { key: 'speechless', category: 'frustrated', emoji: '🫠' },
  { key: 'hurry', category: 'frustrated', emoji: '💨' },
]

export const CATEGORY_ORDER: InteractionCategory[] = ['friendly', 'teasing', 'celebration', 'frustrated']

const PHRASE_BY_KEY = new Map(PHRASES.map(p => [p.key, p]))
export const getPhrase = (key: string): PhraseDef | undefined => PHRASE_BY_KEY.get(key)

// ── Throwable items (Phase 2) ─────────────────────────────────────────────────────────
// A targeted item that flies from the sender's seat to a chosen opponent and plays an
// impact effect there. `impact` selects the visual archetype (so 10 items reuse a handful
// of polished effects). `sound` is a TlmnSoundName the table plays at impact. `spin` makes
// the projectile tumble in flight. `cost` is the in-game-coin price — 0 (FREE) in Phase 2;
// Phase 3 makes it admin-configurable + server-validated. `vibrate` fires a haptic on impact.
export type ThrowImpact = 'bloom' | 'hearts' | 'boom' | 'splat' | 'confetti' | 'flash' | 'emoji'
export type ThrowableDef = {
  key: string
  emoji: string
  impact: ThrowImpact
  sound: string       // TlmnSoundName the table maps to a tone at impact
  spin?: boolean
  vibrate?: boolean
  cost: number        // in-game coins (Phase 3); 0 = free in Phase 2
}

// Full §3 item set. The four Phase-2 core items (flower/heart/bomb/tomato) each get a
// distinct impact; the rest reuse an archetype. Order = panel order.
export const THROWABLES: ThrowableDef[] = [
  { key: 'flower',    emoji: '🌸', impact: 'bloom',    sound: 'sparkle', cost: 0 },
  { key: 'heart',     emoji: '❤️', impact: 'hearts',   sound: 'pop',     cost: 0 },
  { key: 'applause',  emoji: '👏', impact: 'hearts',   sound: 'react',   cost: 0 },
  { key: 'confetti',  emoji: '🎊', impact: 'confetti', sound: 'react',   cost: 0 },
  { key: 'laugh',     emoji: '😂', impact: 'emoji',    sound: 'pop',     cost: 0 },
  { key: 'tomato',    emoji: '🍅', impact: 'splat',    sound: 'splat',   spin: true, cost: 0 },
  { key: 'egg',       emoji: '🥚', impact: 'splat',    sound: 'splat',   spin: true, cost: 0 },
  { key: 'bomb',      emoji: '💣', impact: 'boom',     sound: 'chat',    spin: true, vibrate: true, cost: 0 },
  { key: 'lightning', emoji: '⚡', impact: 'flash',    sound: 'chat',    cost: 0 },
  { key: 'angry',     emoji: '😡', impact: 'emoji',    sound: 'splat',   cost: 0 },
]
const THROWABLE_BY_KEY = new Map(THROWABLES.map(x => [x.key, x]))
export const getThrowable = (key: string): ThrowableDef | undefined => THROWABLE_BY_KEY.get(key)

// ── Admin-configurable economy config (Phase 3) ──────────────────────────────────────
// The DB (game_interaction_catalog) owns cost / free-limit / enabled; the static defs above
// own the visuals. A key ABSENT from the config map ⇒ enabled + free (a newly-added code
// item works before it's seeded), matching the spend_interaction RPC's fallback.
export type CatalogConfig = { key: string; coin_cost: number; free_daily_limit: number; is_enabled: boolean }

export type ResolvedConfig = { cost: number; freeLimit: number; enabled: boolean; alwaysFree: boolean }
export function resolveConfig(key: string, configs: Map<string, CatalogConfig>): ResolvedConfig {
  const c = configs.get(key)
  if (!c) return { cost: 0, freeLimit: 0, enabled: true, alwaysFree: true }
  return {
    cost: c.coin_cost,
    freeLimit: c.free_daily_limit,
    enabled: c.is_enabled,
    // "Always free" items skip the server round-trip entirely (instant throw).
    alwaysFree: c.coin_cost === 0 && c.free_daily_limit === 0,
  }
}

// Pure spend decision — mirrors spend_interaction() so the client can preview/label an item
// and so the logic is unit-testable independently of the DB. NOT authoritative (the RPC
// re-decides server-side); used only for display + the "skip spend when free" optimization.
export function decideSpend(o: { cost: number; freeLimit: number; usedFreeToday: number; balance: number }): 'free' | 'paid' | 'insufficient' {
  if (o.cost === 0) return 'free'
  if (o.freeLimit > 0 && o.usedFreeToday < o.freeLimit) return 'free'
  return o.balance >= o.cost ? 'paid' : 'insufficient'
}

// ── Realtime event (transient broadcast — never persisted in Phase 1) ────────────────
// Sent on the dedicated `tlmn-fx:<roomId>` channel. `kind` is open for Phase 2
// 'throwable'; `targetSeat` is optional (phrases are table-wide / sender-anchored).
export type InteractionEvent = {
  v: number                 // schema version (INTERACTION_SCHEMA_VERSION)
  id: string                // uuid — receiver dedup key (network retries / double-send)
  kind: 'phrase' | 'throwable'
  key: string               // PhraseDef.key | ThrowableDef.key
  senderSeat: number        // felt-relative seat index of the sender
  targetSeat?: number | null // required for throwables; null for phrases
  at: number                // client send timestamp (ms) — display/ordering only, untrusted
}

// ── Client-side anti-spam limits (spec §11) ──────────────────────────────────────────
// Phase 1 enforces these in the sending client (the realtime layer is broadcast-only with
// no coin cost yet). Phase 3 re-validates server-side when coins/usage are introduced.
export const RATE_LIMITS = {
  phraseCooldownMs: 3000,   // ≥1 phrase / 3s
  throwableCooldownMs: 4000, // ≥1 throwable / 4s (spec §11)
  windowMs: 20000,          // rolling window (shared across phrases + throwables)
  windowMax: 5,             // ≤5 interactions / 20s
  bubbleTtlMs: 3200,        // how long a phrase bubble stays on a seat
} as const

// Throwable animation timing + concurrency cap (spec §19: ≤3 active throws at once).
export const THROW_TIMING = {
  flyMs: 660,               // sender → target flight
  impactMs: 720,            // impact burst at the target
  maxConcurrent: 3,         // drop the oldest when a 4th arrives
} as const

// Tiny, dependency-free id for event dedup (crypto.randomUUID when available).
export function makeInteractionId(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  } catch { /* ignore */ }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

// ── Pure anti-spam gate (extracted so it's unit-testable + reusable server-side) ──────
// Combined check-and-commit: returns true and records the send when within limits, false
// (recording nothing) when rate-limited. The same instance enforces BOTH the per-action
// cooldown and the rolling-window cap. now is injected so tests are deterministic.
export type RateLimiter = { last: number; window: number[] }
// last = -Infinity so the very first send always clears the cooldown, regardless of
// what timestamp it carries (avoids a "0 means never sent" sentinel ambiguity).
export const newRateLimiter = (): RateLimiter => ({ last: -Infinity, window: [] })
// cooldownMs is per-action (phrases 3s, throwables 4s); the rolling-window cap is shared
// across all interaction types (≤windowMax per windowMs), so one limiter governs both.
export function rateLimitAllow(rl: RateLimiter, now: number, cooldownMs: number = RATE_LIMITS.phraseCooldownMs): boolean {
  if (now - rl.last < cooldownMs) return false
  rl.window = rl.window.filter(ts => now - ts < RATE_LIMITS.windowMs)
  if (rl.window.length >= RATE_LIMITS.windowMax) return false
  rl.last = now
  rl.window.push(now)
  return true
}

// ── Pure incoming-event validator (schema-version + shape guard) ──────────────────────
// Rejects anything not matching the current schema version, malformed, of an unknown
// kind, or referencing an unknown phrase key — so a stray/old/forged broadcast can never
// render. Returns a normalized event (target defaulted to null) or null.
export function validateIncoming(payload: unknown): InteractionEvent | null {
  if (!payload || typeof payload !== 'object') return null
  const ev = payload as Record<string, unknown>
  if (ev.v !== INTERACTION_SCHEMA_VERSION) return null
  if (typeof ev.id !== 'string' || ev.id.length === 0) return null
  if (typeof ev.key !== 'string') return null
  if (typeof ev.senderSeat !== 'number' || !Number.isFinite(ev.senderSeat)) return null
  if (ev.kind === 'phrase') {
    if (!getPhrase(ev.key)) return null
    return {
      v: INTERACTION_SCHEMA_VERSION, id: ev.id, kind: 'phrase', key: ev.key,
      senderSeat: ev.senderSeat, targetSeat: null,
      at: typeof ev.at === 'number' ? ev.at : Date.now(),
    }
  }
  if (ev.kind === 'throwable') {
    if (!getThrowable(ev.key)) return null
    // A throwable MUST carry a finite target seat distinct from the sender.
    if (typeof ev.targetSeat !== 'number' || !Number.isFinite(ev.targetSeat)) return null
    if (ev.targetSeat === ev.senderSeat) return null
    return {
      v: INTERACTION_SCHEMA_VERSION, id: ev.id, kind: 'throwable', key: ev.key,
      senderSeat: ev.senderSeat, targetSeat: ev.targetSeat,
      at: typeof ev.at === 'number' ? ev.at : Date.now(),
    }
  }
  return null
}

// ── Pure dedup cache (event-id idempotency for network retries / self-echo) ────────────
// accept(id) returns true the FIRST time an id is seen and false thereafter; bounded so
// it never grows without limit (prunes entries older than 2× a bubble lifetime).
export function makeSeenCache(max = 200) {
  const seen = new Map<string, number>()
  return {
    accept(id: string, now: number): boolean {
      if (seen.has(id)) return false
      seen.set(id, now)
      if (seen.size > max) {
        const cutoff = now - RATE_LIMITS.bubbleTtlMs * 2
        for (const [k, ts] of Array.from(seen.entries())) if (ts < cutoff) seen.delete(k)
      }
      return true
    },
    get size() { return seen.size },
  }
}
