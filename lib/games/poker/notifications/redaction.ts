// Poker push-notification REDACTION guard — PURE, no I/O, no server imports.
//
// A push notification is delivered to the OS and can be read on a LOCKED device,
// cached by the platform, and shown in a system tray outside our control. It is
// therefore the single most dangerous surface for leaking private Poker state.
// This module is the last line of defence: every notification the Poker feature
// ever emits MUST pass `assertSafeNotification` before it reaches `web-push`.
//
// The guard is deliberately allow-nothing-by-default about STRUCTURE (only the
// four safe fields exist) and deny-by-scan about CONTENT (it actively hunts for
// anything that smells like a secret and refuses to send). Both layers must hold.
//
// Prohibited forever (Prompt 29C §3): hole cards, hidden/community cards, folded
// cards, deck order, shuffle seed, full private-table snapshot, private-table
// password, auth/session token, service-role secret, internal incident data,
// private Realtime payload, hidden bot state.

export type SafePokerNotification = {
  // Discriminator so telemetry / tests can reason about the category without
  // re-parsing the copy.
  kind: string
  // OS notification title + body. Already localized by the caller. Scanned here.
  title: string
  body: string
  // A SAME-ORIGIN, secret-free relative path. The click handler navigates here
  // and the destination route re-authorizes server-side (§5). Never an absolute
  // URL (open-redirect) and never carries a password/token query.
  url: string
  // Collapse key so re-sends replace rather than stack.
  tag: string
}

export class PokerNotificationRedactionError extends Error {
  readonly reasons: string[]
  constructor(reasons: string[]) {
    super('poker notification blocked by redaction guard: ' + reasons.join('; '))
    this.name = 'PokerNotificationRedactionError'
    this.reasons = reasons
  }
}

// Hard limits — a notification body is a one-line teaser, not a data channel.
// Anything longer is suspicious (someone is smuggling state) and is also just
// bad UX on a lock screen.
const MAX_TITLE = 80
const MAX_BODY = 140
const MAX_URL = 512

// Words that must never appear in notification copy. Case-insensitive substring
// match. These are the human-language handles for the prohibited categories.
const FORBIDDEN_WORDS: readonly string[] = [
  'password', 'passcode', 'pass code', 'mật khẩu',
  'token', 'jwt', 'bearer', 'access_token', 'refresh_token',
  'service_role', 'service-role', 'secret', 'api_key', 'apikey',
  'seed', 'shuffle', 'deck order', 'rng',
  'hole card', 'hole cards', 'pocket cards',
  'session', 'cookie', 'authorization',
]

// Token-shaped substrings: JWTs, long hex/base64 blobs. A notification about a
// friend inviting you never contains a 24+ char opaque string; if one is present
// it is almost certainly a leaked key/endpoint/seed.
const JWT_RE = /eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}/
const LONG_HEX_RE = /\b[0-9a-fA-F]{32,}\b/
const LONG_B64_RE = /[A-Za-z0-9+/_-]{40,}={0,2}/

// Query params that must never ride along in a notification URL.
const FORBIDDEN_QUERY_KEYS: readonly string[] = [
  'password', 'pass', 'pw', 'pwd', 'token', 'access_token', 'refresh_token',
  'auth', 'secret', 'seed', 'jwt', 'session', 'sig', 'signature', 'key',
]

// Scan a piece of user-facing copy. Returns a list of reasons it is unsafe
// (empty ⇒ safe). Never throws.
export function scanText(label: string, value: string): string[] {
  const reasons: string[] = []
  if (typeof value !== 'string') return [`${label}: not a string`]
  const lower = value.toLowerCase()
  for (const w of FORBIDDEN_WORDS) {
    if (lower.includes(w)) reasons.push(`${label}: contains forbidden word "${w}"`)
  }
  if (JWT_RE.test(value)) reasons.push(`${label}: contains a JWT-shaped token`)
  if (LONG_HEX_RE.test(value)) reasons.push(`${label}: contains a long hex blob`)
  if (LONG_B64_RE.test(value)) reasons.push(`${label}: contains a long opaque blob`)
  return reasons
}

// Is `url` a safe SAME-ORIGIN, secret-free relative path?
//   • must be a non-empty string
//   • must start with a single "/" (a real path, not "//host" or "/\host" which
//     browsers treat as protocol-relative → cross-origin)
//   • must not contain a scheme ("://") or backslashes or control chars
//   • must not carry any forbidden query key or a token-shaped value
export function isSafeInternalPath(url: unknown): boolean {
  if (typeof url !== 'string' || url.length === 0 || url.length > MAX_URL) return false
  if (url[0] !== '/') return false
  if (url[1] === '/' || url[1] === '\\') return false // protocol-relative / UNC
  if (url.includes('\\')) return false
  if (url.includes('://')) return false
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(url)) return false // control chars (incl. CR/LF header injection)

  const qIndex = url.indexOf('?')
  const query = qIndex === -1 ? '' : url.slice(qIndex + 1)
  if (query) {
    const params = new URLSearchParams(query)
    let bad = false
    params.forEach((v, k) => {
      if (FORBIDDEN_QUERY_KEYS.includes(k.toLowerCase())) bad = true
      if (JWT_RE.test(v) || LONG_HEX_RE.test(v) || LONG_B64_RE.test(v)) bad = true
    })
    if (bad) return false
  }
  return true
}

// The single enforcement point. Throws PokerNotificationRedactionError if ANY
// field is unsafe. Returns the (same, now-verified) notification on success so
// callers can `return assertSafeNotification(n)`.
export function assertSafeNotification(n: SafePokerNotification): SafePokerNotification {
  const reasons: string[] = []

  if (!n || typeof n !== 'object') throw new PokerNotificationRedactionError(['not an object'])
  if (typeof n.kind !== 'string' || n.kind.length === 0) reasons.push('kind: missing')
  if (typeof n.title !== 'string' || n.title.trim().length === 0) reasons.push('title: empty')
  if (typeof n.tag !== 'string' || n.tag.trim().length === 0) reasons.push('tag: missing')
  if (typeof n.title === 'string' && n.title.length > MAX_TITLE) reasons.push('title: too long')
  if (typeof n.body === 'string' && n.body.length > MAX_BODY) reasons.push('body: too long')

  reasons.push(...scanText('title', n.title ?? ''))
  reasons.push(...scanText('body', n.body ?? ''))
  reasons.push(...scanText('tag', n.tag ?? ''))
  if (!isSafeInternalPath(n.url)) reasons.push('url: not a safe same-origin secret-free path')

  if (reasons.length > 0) throw new PokerNotificationRedactionError(reasons)
  return n
}

// Non-throwing variant for call sites that prefer to drop-and-log rather than
// crash (push is best-effort). Returns null on any violation.
export function safeOrNull(n: SafePokerNotification): SafePokerNotification | null {
  try {
    return assertSafeNotification(n)
  } catch {
    return null
  }
}
