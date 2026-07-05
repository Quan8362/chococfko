// ── Two-account LOCAL poker practice playtest — shared env + hard safety gates ───────────
//
// Prompt 27F-B3. This suite drives the ISOLATED practice-bot mode through two independent,
// fully-isolated browser contexts against the LOCAL environment ONLY. It NEVER targets
// production, and it refuses to run if the environment does not describe a loopback playtest.
//
// Playwright does not auto-load Next's env files, so we parse .env.playtest.local here into
// process.env (without overriding anything already set). Secrets are read into memory only —
// the tester password / service key are NEVER logged, serialised, or written to an artifact.
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd() // npm scripts run from the web/ root
const ENV_FILE = path.resolve(ROOT, '.env.playtest.local')

export function loadPlaytestEnv(): void {
  if (!fs.existsSync(ENV_FILE)) {
    throw new Error(`[two-account] required env file missing: ${ENV_FILE}`)
  }
  for (const raw of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 0) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1)
    if (!(key in process.env)) process.env[key] = val
  }
}
loadPlaytestEnv()

const hostOf = (u: string | undefined): string | null => {
  try {
    return new URL(u ?? '').host.toLowerCase()
  } catch {
    return null
  }
}
const isLoopback = (h: string | null): boolean => !!h && (h.startsWith('127.0.0.1') || h.startsWith('localhost'))

export const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://127.0.0.1:3000'
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
export const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
export const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
// The single shared tester password — read from the local env ONLY. Never printed.
export const TESTER_PASSWORD = process.env.PLAYTEST_TESTER_PASSWORD || ''

// Tester identities come from the git-ignored .env.playtest.local ONLY — never hardcoded here, so
// no personal account address is committed to the repo. The suite fails closed below if unset.
export const TESTERS = {
  A: { email: process.env.PLAYTEST_TESTER_A_EMAIL || '' },
  B: { email: process.env.PLAYTEST_TESTER_B_EMAIL || '' },
} as const

export const PROD_SUPABASE_HOST = process.env.PLAYTEST_PROD_SUPABASE_HOST || 'kjfnqbzfhymhfodmgyow.supabase.co'
export const PROD_SITE_HOSTS = ['chococfko.com', 'www.chococfko.com']

export const HERE = path.resolve(ROOT, 'e2e', 'poker', 'two-account')
export const ARTIFACT_DIR = path.resolve(HERE, '.artifacts')

// ── Hard fail-closed gate: the process env MUST describe a loopback playtest, never prod ──────
export function assertLoopbackOrThrow(): void {
  const supaHost = hostOf(SUPABASE_URL)
  const siteHost = hostOf(BASE_URL)
  const problems: string[] = []
  if ((process.env.NEXT_PUBLIC_APP_ENV || '').toLowerCase() !== 'local') problems.push('NEXT_PUBLIC_APP_ENV is not "local"')
  if (!isLoopback(supaHost)) problems.push(`Supabase host is not loopback (${supaHost})`)
  if (!isLoopback(siteHost)) problems.push(`Site host is not loopback (${siteHost})`)
  if (supaHost === PROD_SUPABASE_HOST || SUPABASE_URL.includes('kjfnqbzfhymhfodmgyow')) problems.push('production Supabase ref present')
  if (siteHost && PROD_SITE_HOSTS.includes(siteHost)) problems.push('production domain present')
  if (!TESTER_PASSWORD) problems.push('PLAYTEST_TESTER_PASSWORD is not set in .env.playtest.local')
  if (!TESTERS.A.email || !TESTERS.B.email) problems.push('PLAYTEST_TESTER_A_EMAIL / PLAYTEST_TESTER_B_EMAIL are not set in .env.playtest.local')
  if (problems.length) {
    throw new Error(`[two-account] BLOCKED — LOCAL AUTOMATION ENVIRONMENT UNAVAILABLE:\n  - ${problems.join('\n  - ')}`)
  }
}

// Host classification for the per-context network guard.
export const ALLOWED_FONT_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com'])
export function classifyHost(host: string): 'loopback' | 'font' | 'forbidden' {
  const h = host.toLowerCase()
  if (h.startsWith('127.0.0.1') || h.startsWith('localhost') || h === '::1') return 'loopback'
  if (ALLOWED_FONT_HOSTS.has(h)) return 'font'
  return 'forbidden'
}
