import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  AUTH_ERROR_CODES,
  AUTH_ERROR_TRANSLATION_KEYS,
  isAuthErrorCode,
  resolveAuthErrorKey,
  mapOAuthProviderError,
  mapCodeExchangeError,
  mapConfirmError,
  safeNextPath,
} from './oauthErrors.ts'
import vi from '../../messages/vi.json' with { type: 'json' }
import en from '../../messages/en.json' with { type: 'json' }
import ja from '../../messages/ja.json' with { type: 'json' }
import ko from '../../messages/ko.json' with { type: 'json' }
import zh from '../../messages/zh.json' with { type: 'json' }

// ── Provider errors ──────────────────────────────────────────
test('provider access_denied maps to access denied', () => {
  assert.equal(mapOAuthProviderError('access_denied', 'User denied'), 'oauth_access_denied')
})

test('provider unknown error maps to generic provider error', () => {
  assert.equal(mapOAuthProviderError('server_error', 'boom'), 'oauth_provider_error')
})

test('provider expired description maps to link_expired', () => {
  assert.equal(mapOAuthProviderError('x', 'Link has expired'), 'link_expired')
})

// ── Code exchange ────────────────────────────────────────────
test('code exchange failure maps to code_exchange_failed', () => {
  assert.equal(mapCodeExchangeError('PKCE grant failed'), 'oauth_code_exchange_failed')
})

test('code exchange expired maps to link_expired', () => {
  assert.equal(mapCodeExchangeError('code is invalid or expired'), 'link_expired')
})

// ── Email confirm ────────────────────────────────────────────
test('confirm already-confirmed maps correctly', () => {
  assert.equal(mapConfirmError('User already confirmed'), 'already_confirmed')
})

test('confirm generic failure maps to confirm_failed', () => {
  assert.equal(mapConfirmError('something odd'), 'confirm_failed')
})

// ── Code → key resolution ────────────────────────────────────
test('every code maps to a translation key', () => {
  for (const code of AUTH_ERROR_CODES) {
    assert.ok(AUTH_ERROR_TRANSLATION_KEYS[code], `missing key for ${code}`)
  }
})

test('unknown / malformed authError falls back safely', () => {
  assert.equal(resolveAuthErrorKey('not_a_real_code'), 'oauth_err_unknown')
  assert.equal(resolveAuthErrorKey(undefined), 'oauth_err_unknown')
  assert.equal(resolveAuthErrorKey('"><script>'), 'oauth_err_unknown')
})

test('isAuthErrorCode guards correctly', () => {
  assert.equal(isAuthErrorCode('oauth_access_denied'), true)
  assert.equal(isAuthErrorCode('bogus'), false)
  assert.equal(isAuthErrorCode(42), false)
})

// ── Every resolved key exists in all five locales ────────────
test('all error keys exist in all five locales', () => {
  const locales = { vi, en, ja, ko, zh } as Record<string, { auth: Record<string, string> }>
  for (const code of AUTH_ERROR_CODES) {
    const key = AUTH_ERROR_TRANSLATION_KEYS[code]
    for (const [name, msgs] of Object.entries(locales)) {
      assert.ok(msgs.auth[key], `${name} missing auth.${key}`)
    }
  }
})

// ── Redirect validation (open-redirect protection) ───────────
test('safeNextPath accepts internal paths', () => {
  assert.equal(safeNextPath('/'), '/')
  assert.equal(safeNextPath('/login?confirmed=1'), '/login?confirmed=1')
  assert.equal(safeNextPath('/reset-password'), '/reset-password')
})

test('safeNextPath rejects external and protocol-relative URLs', () => {
  assert.equal(safeNextPath('https://evil.com'), '/')
  assert.equal(safeNextPath('//evil.com'), '/')
  assert.equal(safeNextPath('/\\evil.com'), '/')
  assert.equal(safeNextPath('http://evil.com'), '/')
  assert.equal(safeNextPath('javascript:alert(1)'), '/')
  assert.equal(safeNextPath(null), '/')
  assert.equal(safeNextPath(''), '/')
})
