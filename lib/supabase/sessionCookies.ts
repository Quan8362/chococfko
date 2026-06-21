// Pure, dependency-free helpers for reasoning about Supabase auth cookies and
// auth errors. Kept free of `next/*` and `@supabase/*` imports so they can be
// unit-tested directly with `node --test`.

// Supabase stores the session under `sb-<project-ref>-auth-token`, optionally
// split into numbered chunks (`...-auth-token.0`, `.1`). The mid-OAuth PKCE
// verifier (`...-auth-token-code-verifier`) is NOT a session and must not count.
const SESSION_COOKIE_RE = /^sb-.+-auth-token(\.\d+)?$/

/**
 * True when the request carries an actual Supabase session cookie (not just the
 * PKCE code-verifier). Lets middleware skip the GoTrue round-trip for anonymous
 * visitors entirely.
 */
export function hasSupabaseSessionCookie(cookies: { name: string }[]): boolean {
  return cookies.some((c) => SESSION_COOKIE_RE.test(c.name))
}

export type AuthErrorCategory = 'refresh_token_invalid' | 'network' | 'none' | 'unknown'

/**
 * Classify an auth error for *diagnostics only* — never used to delete cookies.
 * Returns a coarse category and never touches token values.
 */
export function categorizeAuthError(error: unknown): AuthErrorCategory {
  if (!error) return 'none'
  const e = error as { code?: string; status?: number; message?: string; name?: string }
  const msg = (e.message ?? '').toLowerCase()
  if (e.name === 'AuthRetryableFetchError' || msg.includes('fetch') || msg.includes('network'))
    return 'network'
  if (e.code === 'refresh_token_not_found' || /refresh token/i.test(e.message ?? ''))
    return 'refresh_token_invalid'
  return 'unknown'
}
