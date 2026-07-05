import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evaluatePlaytestEnv, assertPlaytestEnv, PROD_SUPABASE_HOST_DEFAULT } from './env-guard.ts'

const ISO_SUPABASE = 'https://abcdisolatedref.supabase.co'
const ISO_ANON = 'anon-key-placeholder'

function base(overrides: Record<string, string | undefined> = {}) {
  return {
    NEXT_PUBLIC_APP_ENV: 'staging',
    NEXT_PUBLIC_SUPABASE_URL: ISO_SUPABASE,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: ISO_ANON,
    NEXT_PUBLIC_SITE_URL: 'https://feature-x-chococfko.vercel.app',
    ...overrides,
  }
}

test('accepts a valid STAGING isolated env', () => {
  const r = evaluatePlaytestEnv(base())
  assert.equal(r.ok, true)
  assert.equal(r.env, 'staging')
  assert.deepEqual(r.reasons, [])
})

test('accepts a valid LOCAL env on localhost', () => {
  const r = evaluatePlaytestEnv(
    base({ NEXT_PUBLIC_APP_ENV: 'local', NEXT_PUBLIC_SITE_URL: 'http://localhost:3000' }),
  )
  assert.equal(r.ok, true)
  assert.equal(r.env, 'local')
})

test('REJECTS the production Supabase URL', () => {
  const r = evaluatePlaytestEnv(
    base({ NEXT_PUBLIC_SUPABASE_URL: `https://${PROD_SUPABASE_HOST_DEFAULT}` }),
  )
  assert.equal(r.ok, false)
  assert.ok(r.reasons.some((x) => x.includes('PRODUCTION Supabase')))
})

test('REJECTS the production site domain', () => {
  const r = evaluatePlaytestEnv(base({ NEXT_PUBLIC_SITE_URL: 'https://chococfko.com' }))
  assert.equal(r.ok, false)
  assert.ok(r.reasons.some((x) => x.includes('PRODUCTION domain')))
})

test('REJECTS an unset / malformed NEXT_PUBLIC_APP_ENV (fail-closed)', () => {
  assert.equal(evaluatePlaytestEnv(base({ NEXT_PUBLIC_APP_ENV: undefined })).ok, false)
  assert.equal(evaluatePlaytestEnv(base({ NEXT_PUBLIC_APP_ENV: 'production' })).ok, false)
  assert.equal(evaluatePlaytestEnv(base({ NEXT_PUBLIC_APP_ENV: 'prod' })).ok, false)
  assert.equal(evaluatePlaytestEnv(base({ NEXT_PUBLIC_APP_ENV: 'STAGING ' })).ok, true) // trimmed+lowered
})

test('REJECTS a missing or invalid Supabase URL', () => {
  assert.equal(evaluatePlaytestEnv(base({ NEXT_PUBLIC_SUPABASE_URL: undefined })).ok, false)
  assert.equal(evaluatePlaytestEnv(base({ NEXT_PUBLIC_SUPABASE_URL: 'not a url' })).ok, false)
})

test('honors a PLAYTEST_PROD_SUPABASE_HOST override', () => {
  const r = evaluatePlaytestEnv(
    base({
      NEXT_PUBLIC_SUPABASE_URL: 'https://someref.supabase.co',
      PLAYTEST_PROD_SUPABASE_HOST: 'someref.supabase.co',
    }),
  )
  assert.equal(r.ok, false)
  assert.ok(r.reasons.some((x) => x.includes('PRODUCTION Supabase')))
})

test('assertPlaytestEnv throws on a production-pointing env', () => {
  assert.throws(
    () => assertPlaytestEnv(base({ NEXT_PUBLIC_SUPABASE_URL: `https://${PROD_SUPABASE_HOST_DEFAULT}` })),
    /PLAYTEST ENV GUARD/,
  )
})

test('assertPlaytestEnv returns the result on a valid isolated env', () => {
  const r = assertPlaytestEnv(base())
  assert.equal(r.ok, true)
})
