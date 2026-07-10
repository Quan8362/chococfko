// ── Poker seat identity — PURE resolution of what an OCCUPIED seat shows ──────────────────────
//
// Single source of truth for the "who sits here" projection used by BOTH the felt seat pods and
// the bottom hero band (cash + tournament). Keeping it pure (no React / DOM / Supabase) makes the
// identity rules — occupancy, public-safe avatar, deterministic initials fallback, and the fact
// that a plate shows the TABLE stack (never the global wallet balance) — unit-testable and
// identical on every surface. Only ever operates on PUBLIC seat fields; no hole cards, email,
// tokens, or wallet balance are accepted here by construction.

export interface SeatIdentityInput {
  readonly userId?: string | null
  readonly displayName?: string | null
  readonly avatarUrl?: string | null
  // The player's stack AT THE TABLE (chips in front of them) — NOT their global coin wallet.
  readonly stack?: number | null
}

function nz(s?: string | null): string | null {
  const v = (s ?? '').trim()
  return v.length > 0 ? v : null
}

// Authoritative occupancy: a seat is taken IFF it carries a real user id. Never inferred from the
// client, a name, or a non-zero stack — mirrors `occupied = s && s.userId` on the felt.
export function isSeatOccupied(seat: SeatIdentityInput): boolean {
  return nz(seat.userId) !== null
}

// A renderable avatar URL, or null when the seat has none (the UI then draws initials). Trims so a
// stored empty string never becomes a broken <img src="">.
export function seatAvatarUrl(seat: SeatIdentityInput): string | null {
  return nz(seat.avatarUrl)
}

// Deterministic 1–2 char initials from the seat's OWN display name — the avatar fallback and the
// a11y label when no image loads. Never derived from another seat's name.
export function seatInitials(name?: string | null): string {
  const n = nz(name)
  if (!n) return '?'
  return n.slice(0, 2).toUpperCase()
}

// The public-safe identity a seat plate renders. `stack` is coerced to a non-negative integer so a
// plate can never show a negative / fractional table stack.
export interface SeatPlate {
  readonly displayName: string | null
  readonly avatarUrl: string | null
  readonly initials: string
  readonly stack: number
}

export function seatPlate(seat: SeatIdentityInput): SeatPlate {
  return {
    displayName: nz(seat.displayName),
    avatarUrl: seatAvatarUrl(seat),
    initials: seatInitials(seat.displayName),
    stack: Math.max(0, Math.trunc(seat.stack ?? 0)),
  }
}
