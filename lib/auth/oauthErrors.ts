// Stable, machine-readable error codes for the auth callback routes.
//
// These codes travel in the URL (`/login?authError=<code>`), so they must stay
// stable and must NEVER contain raw provider/Supabase text. The login page maps
// the code to a translation key and renders it in the user's active locale, so
// the visible message is always localized. Raw technical errors stay server-side
// (logged for diagnostics only) and are never exposed to the browser.
//
// Pure module — no `next/*` or `@supabase/*` imports — so it is unit-testable.

export const AUTH_ERROR_CODES = [
  'oauth_access_denied',
  'oauth_provider_error',
  'oauth_invalid_state',
  'oauth_code_exchange_failed',
  'oauth_session_not_created',
  'oauth_provider_cancelled',
  'oauth_callback_failed',
  'link_expired',
  'already_confirmed',
  'confirm_link_invalid',
  'confirm_failed',
  'oauth_unknown_error',
] as const

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number]

const FALLBACK_CODE: AuthErrorCode = 'oauth_unknown_error'

// code → flat translation key inside the `auth` next-intl namespace.
export const AUTH_ERROR_TRANSLATION_KEYS: Record<AuthErrorCode, string> = {
  oauth_access_denied:        'oauth_err_access_denied',
  oauth_provider_error:       'oauth_err_provider',
  oauth_invalid_state:        'oauth_err_state',
  oauth_code_exchange_failed: 'oauth_err_code_exchange',
  oauth_session_not_created:  'oauth_err_session',
  oauth_provider_cancelled:   'oauth_err_cancelled',
  oauth_callback_failed:      'oauth_err_callback',
  link_expired:               'oauth_err_link_expired',
  already_confirmed:          'oauth_err_already_confirmed',
  confirm_link_invalid:       'oauth_err_confirm_invalid',
  confirm_failed:             'oauth_err_confirm_failed',
  oauth_unknown_error:        'oauth_err_unknown',
}

export function isAuthErrorCode(value: unknown): value is AuthErrorCode {
  return typeof value === 'string' && (AUTH_ERROR_CODES as readonly string[]).includes(value)
}

/**
 * Resolve a raw `?authError=` query value to a guaranteed-valid translation key.
 * Unknown / malformed codes fall back to the generic "unknown error" key, so the
 * UI never renders a raw code or breaks on a tampered parameter.
 */
export function resolveAuthErrorKey(raw: string | null | undefined): string {
  const code = isAuthErrorCode(raw) ? raw : FALLBACK_CODE
  return AUTH_ERROR_TRANSLATION_KEYS[code]
}

/**
 * Map an OAuth provider's `error` / `error_description` (Google, Facebook, …) to
 * a stable code without leaking the raw text. Provider "user cancelled / denied"
 * is reported as access-denied; everything else is a generic provider error.
 */
export function mapOAuthProviderError(
  error: string | null,
  description: string | null,
): AuthErrorCode {
  const code = (error ?? '').toLowerCase()
  const desc = (description ?? '').toLowerCase()
  if (code === 'access_denied' || desc.includes('denied') || desc.includes('cancel'))
    return 'oauth_access_denied'
  if (desc.includes('expired') || desc.includes('invalid') || desc.includes('otp'))
    return 'link_expired'
  if (desc.includes('already confirmed') || desc.includes('already registered'))
    return 'already_confirmed'
  return 'oauth_provider_error'
}

/** Map a Supabase `exchangeCodeForSession` failure to a stable code. */
export function mapCodeExchangeError(message: string | null): AuthErrorCode {
  const m = (message ?? '').toLowerCase()
  if (m.includes('expired') || m.includes('invalid') || m.includes('otp'))
    return 'link_expired'
  return 'oauth_code_exchange_failed'
}

/** Map a Supabase `verifyOtp` (email confirmation) failure to a stable code. */
export function mapConfirmError(message: string | null): AuthErrorCode {
  const m = (message ?? '').toLowerCase()
  if (m.includes('expired') || m.includes('invalid') || m.includes('otp'))
    return 'link_expired'
  if (m.includes('already confirmed') || m.includes('already registered'))
    return 'already_confirmed'
  return 'confirm_failed'
}

/**
 * Validate a `next` redirect target so OAuth can only return users to an internal
 * path on this site. Rejects absolute URLs, protocol-relative (`//host`),
 * backslash tricks (`/\\host`), control characters and anything not starting with
 * a single `/`. Falls back to `/`. Prevents open-redirect abuse.
 *
 * Expects the already-decoded value from `URLSearchParams.get('next')`.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || typeof next !== 'string') return '/'
  if (!next.startsWith('/')) return '/'
  if (next.startsWith('//') || next.startsWith('/\\')) return '/'
  if (next.includes('://')) return '/'
  if (/[\x00-\x1f]/.test(next)) return '/'
  return next
}
