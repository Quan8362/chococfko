import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hasSupabaseSessionCookie, categorizeAuthError } from './sessionCookies.ts'

test('hasSupabaseSessionCookie detects the session token cookie', () => {
  assert.equal(hasSupabaseSessionCookie([{ name: 'sb-abcd1234-auth-token' }]), true)
})

test('hasSupabaseSessionCookie detects chunked session cookies', () => {
  assert.equal(
    hasSupabaseSessionCookie([
      { name: 'sb-abcd1234-auth-token.0' },
      { name: 'sb-abcd1234-auth-token.1' },
    ]),
    true,
  )
})

test('hasSupabaseSessionCookie ignores the PKCE code-verifier alone', () => {
  // Mid-OAuth there is a verifier but no session yet — must not trigger a refresh.
  assert.equal(
    hasSupabaseSessionCookie([{ name: 'sb-abcd1234-auth-token-code-verifier' }]),
    false,
  )
})

test('hasSupabaseSessionCookie ignores unrelated cookies', () => {
  assert.equal(
    hasSupabaseSessionCookie([{ name: 'NEXT_LOCALE' }, { name: 'theme' }]),
    false,
  )
})

test('categorizeAuthError classifies a stale refresh token', () => {
  assert.equal(
    categorizeAuthError({ code: 'refresh_token_not_found', message: 'Refresh Token Not Found' }),
    'refresh_token_invalid',
  )
})

test('categorizeAuthError classifies a transient network failure', () => {
  assert.equal(
    categorizeAuthError({ name: 'AuthRetryableFetchError', message: 'Failed to fetch' }),
    'network',
  )
})

test('categorizeAuthError returns none for no error', () => {
  assert.equal(categorizeAuthError(null), 'none')
})
