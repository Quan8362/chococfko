// TLMN — pure avatar & identity resolution shared by the server (seat/leaderboard
// hydration in actions.ts) and the client (table / room / lobby rendering).
//
// SINGLE SOURCE OF TRUTH: the application profile (profiles.display_name /
// profiles.avatar_url). When that row pre-dates OAuth-avatar onboarding (the
// handle_new_user trigger historically copied only display_name), the user's
// avatar still lives in their auth metadata, so we fall back to it — never to
// another player's avatar, a hardcoded URL, or the current browser user. The
// resulting avatar is always resolved from the player's OWN identity.
//
// No server-only imports here so both runtimes can use it.

export type ProfileLike = {
  display_name?: string | null
  avatar_url?: string | null
}

export type AuthMetaLike = {
  display_name?: string | null
  name?: string | null
  full_name?: string | null
  avatar_url?: string | null
  picture?: string | null
  email?: string | null
}

function nz(s?: string | null): string | null {
  const v = (s ?? '').trim()
  return v.length > 0 ? v : null
}

// Authoritative avatar priority: app profile → OAuth avatar_url → OAuth picture → null.
// Returns null (NOT a fallback image) when the user genuinely has no avatar — the UI
// then renders deterministic initials from this same user's name.
export function resolveAvatarUrl(
  profile?: ProfileLike | null,
  meta?: AuthMetaLike | null,
): string | null {
  return nz(profile?.avatar_url) ?? nz(meta?.avatar_url) ?? nz(meta?.picture) ?? null
}

// Authoritative display name: app profile → OAuth display_name/name/full_name →
// the local-part of the email → '' (the caller substitutes a localized fallback).
export function resolveDisplayName(
  profile?: ProfileLike | null,
  meta?: AuthMetaLike | null,
): string {
  return (
    nz(profile?.display_name) ??
    nz(meta?.display_name) ??
    nz(meta?.name) ??
    nz(meta?.full_name) ??
    (meta?.email ? meta.email.split('@')[0] : null) ??
    ''
  )
}

// ── Bots ─────────────────────────────────────────────────────────────────────────
// Bots are NEVER given a profile avatar. Each bot is a fixed card-suit emblem,
// resolved from its OWN bot number (NOT the seat index, name string, or array order):
//   Bot 1 → spade · Bot 2 → diamond · Bot 3 → club · Bot 4 → heart
// Suit ids match SuitGlyph / SUIT_KEY in the table: 0 spade · 1 club · 2 diamond · 3 heart.
export const BOT_SUITS = [0, 2, 1, 3] as const

// Parse the stable bot number from its label ("Bot 1" → 1). 0 when absent.
export function botNumberFromName(name?: string | null): number {
  const m = /(\d+)/.exec(name ?? '')
  return m ? parseInt(m[1], 10) : 0
}

// Stable 0-based theme/suit index for a bot. Keyed on the bot number when present so
// the suit follows the bot — not where it happens to sit — and falls back to the seat
// index only as a legacy last resort. Always in range for BOT_SUITS / BOT themes.
export function botThemeIndex(name?: string | null, seatIndex = 0): number {
  const n = botNumberFromName(name)
  const raw = n > 0 ? n - 1 : Math.max(0, seatIndex - 1)
  return ((raw % BOT_SUITS.length) + BOT_SUITS.length) % BOT_SUITS.length
}
