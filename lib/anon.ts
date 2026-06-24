/**
 * Generate a short, consistent anonymous display ID from any UUID.
 * Uses the first 4 hex characters of the UUID (dashes removed), uppercased.
 * Example: "a12f39b8-..." → "Anonymous #A12F"
 */
export function anonHex(id: string): string {
  return id.replace(/-/g, '').slice(0, 4).toUpperCase()
}

export function generateAnonId(id: string): string {
  return `Anonymous #${anonHex(id)}`
}

// Deterministic, on-brand avatar palette. Soft warm rose / teal / amber / sand
// tones that harmonize with the cream theme — no new hues are introduced, only
// gentle tints/shades of the existing rose, teal and gold tokens.
const ANON_PALETTE: { bg: string; fg: string }[] = [
  { bg: '#fbdbe8', fg: '#9d1248' }, // rose
  { bg: '#d4ebef', fg: '#15707f' }, // teal
  { bg: '#f6e4c6', fg: '#8a5a1f' }, // amber / gold
  { bg: '#f3d9cf', fg: '#a14a32' }, // terracotta
  { bg: '#e9dcc6', fg: '#6b5b3a' }, // sand
  { bg: '#f7d6dd', fg: '#9c3b4b' }, // dusty rose
]

/** Deterministic background/foreground pair derived from the confession id. */
export function anonAvatarColor(id: string): { bg: string; fg: string } {
  const hex = id.replace(/-/g, '')
  let h = 0
  for (let i = 0; i < hex.length; i++) h = (h * 31 + hex.charCodeAt(i)) >>> 0
  return ANON_PALETTE[h % ANON_PALETTE.length]
}
