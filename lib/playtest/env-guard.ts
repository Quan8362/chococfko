// ── Isolated Poker Playtest — FAIL-CLOSED environment guard (PURE) ─────────────────────
//
// Proves at runtime that the app is NOT pointed at production before any bot-playtest
// surface is served. No React, no Supabase, no I/O — safe to import anywhere and unit-tested
// by env-guard.test.ts.
//
// 🔴 NO SECRETS. The production identifiers below are PUBLIC: the prod domain and the prod
// Supabase ref already ship inside the production client bundle (NEXT_PUBLIC_*). They are used
// here ONLY as a deny-list so an isolated deploy refuses to talk to production. Both are
// overridable via env for portability.
//
// Fail-closed contract: anything missing, malformed, or matching production resolves to
// { ok:false }. assertPlaytestEnv() throws — callers should let that 500 rather than serve.

// Public production identifiers (NOT secrets). Override via env if they ever change.
export const PROD_SUPABASE_HOST_DEFAULT = 'kjfnqbzfhymhfodmgyow.supabase.co'
export const PROD_SITE_HOSTS = ['chococfko.com', 'www.chococfko.com'] as const

export type PlaytestEnvName = 'local' | 'staging'
export const ALLOWED_PLAYTEST_ENVS: readonly PlaytestEnvName[] = ['local', 'staging'] as const

export interface EnvGuardResult {
  ok: boolean
  env: string | null
  supabaseHost: string | null
  reasons: string[] // human-readable failure reasons; empty when ok
}

function hostOf(url: string | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).host.toLowerCase()
  } catch {
    return null
  }
}

// Evaluate an env-like record. Pure; returns a structured result (never throws).
export function evaluatePlaytestEnv(env: Record<string, string | undefined>): EnvGuardResult {
  const reasons: string[] = []

  const appEnv = (env.NEXT_PUBLIC_APP_ENV ?? '').trim().toLowerCase()
  if (!ALLOWED_PLAYTEST_ENVS.includes(appEnv as PlaytestEnvName)) {
    reasons.push(
      `NEXT_PUBLIC_APP_ENV must be exactly "local" or "staging" (got "${appEnv || 'unset'}")`,
    )
  }

  const supabaseHost = hostOf(env.NEXT_PUBLIC_SUPABASE_URL)
  const prodSupabaseHost = (env.PLAYTEST_PROD_SUPABASE_HOST ?? PROD_SUPABASE_HOST_DEFAULT)
    .trim()
    .toLowerCase()
  if (!supabaseHost) {
    reasons.push('NEXT_PUBLIC_SUPABASE_URL is missing or not a valid URL')
  } else if (supabaseHost === prodSupabaseHost) {
    reasons.push('NEXT_PUBLIC_SUPABASE_URL points at the PRODUCTION Supabase project — refused')
  }

  const siteHost = hostOf(env.NEXT_PUBLIC_SITE_URL)
  if (siteHost && (PROD_SITE_HOSTS as readonly string[]).includes(siteHost)) {
    reasons.push('NEXT_PUBLIC_SITE_URL points at the PRODUCTION domain — refused')
  }

  return {
    ok: reasons.length === 0,
    env: ALLOWED_PLAYTEST_ENVS.includes(appEnv as PlaytestEnvName) ? appEnv : null,
    supabaseHost,
    reasons,
  }
}

// Throwing wrapper for server entry points. Reads process.env by default.
export function assertPlaytestEnv(
  env: Record<string, string | undefined> = process.env,
): EnvGuardResult {
  const result = evaluatePlaytestEnv(env)
  if (!result.ok) {
    throw new Error('PLAYTEST ENV GUARD (fail-closed): ' + result.reasons.join('; '))
  }
  return result
}
