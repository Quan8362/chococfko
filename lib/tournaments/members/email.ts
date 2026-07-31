// PURE email helpers for tournament invitations — no I/O. The DB stores email_normalized in this
// exact normalized form (lowercase + trimmed) and CHECK-enforces it; the server must normalize with
// the SAME rule before writing, and the claim RPC normalizes the caller's JWT email identically.

// Lowercase + trim. This is the single normalization rule shared by the app and the DB CHECK.
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

// Minimal structural validation — mirrors the DB CHECK (email_normalized LIKE '%_@_%.__%'):
// a local part, '@', a domain with a dot and a ≥2-char TLD. We deliberately keep this permissive
// (RFC-complete validation belongs to the delivery step, not to an invitation gate). Operates on
// the ALREADY-normalized value.
export function isValidNormalizedEmail(normalized: string): boolean {
  if (normalized.length === 0 || normalized.length > 254) return false
  // exactly one '@', non-empty local part, domain with a dot-separated ≥2-char final label.
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalized)
}

// Normalize + validate in one step. Returns the normalized email or null when invalid.
export function normalizeAndValidateEmail(raw: string): string | null {
  const normalized = normalizeEmail(raw)
  return isValidNormalizedEmail(normalized) ? normalized : null
}
