// Shared env + hard safety gates for the TOURNAMENT E2E suite (Prompt 13).
//
// This suite targets a LOCAL Supabase stack ONLY (WSL2 + Docker; Kong on :54421, DB on :54422).
// It provisions test users and writes tournament data, so it REFUSES to run against anything that
// is not unambiguously local. There is deliberately NO "allow prod" override — production is never
// a valid target for this suite.
//
// Playwright loads this module both as ESM (specs) and CJS (config). Avoid `import.meta` /
// `__dirname` (each breaks in one mode) and resolve everything from the repo root (cwd), which is
// where the npm scripts run.
import fs from 'node:fs'
import path from 'node:path'

const HERE = path.resolve(process.cwd(), 'e2e', 'tournaments')

// Load a dotenv-style file without overriding anything already in the shell. Values may be quoted.
function loadEnvFile(file: string): void {
  if (!fs.existsSync(file)) return
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
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
// The gitignored stack file wins; the app's .env.local is a last-resort fallback (never for prod use).
loadEnvFile(path.resolve(HERE, '.env.stack.local'))

export const SUPABASE_URL = process.env.TNMT_E2E_SUPABASE_URL || 'http://127.0.0.1:54421'
export const SUPABASE_ANON_KEY = process.env.TNMT_E2E_ANON_KEY || ''
export const SERVICE_ROLE_KEY = process.env.TNMT_E2E_SERVICE_ROLE_KEY || ''
export const BASE_URL = process.env.TNMT_E2E_BASE_URL || 'http://localhost:3100'

export const ADMIN_EMAIL = process.env.TNMT_E2E_ADMIN_EMAIL || 'tourn.admin@chococfko.test'
export const USER_EMAIL = process.env.TNMT_E2E_USER_EMAIL || 'tourn.user@chococfko.test'
// Scoped-role identities (15B-2E). NONE of these are in ADMIN_EMAILS (the config passes only
// ADMIN_EMAIL) — so Site-Admin status can ONLY come from the admin identity, never from a membership.
export const MANAGER_EMAIL = process.env.TNMT_E2E_MANAGER_EMAIL || 'tourn.manager@chococfko.test'
export const SCOREKEEPER_EMAIL = process.env.TNMT_E2E_SCOREKEEPER_EMAIL || 'tourn.scorekeeper@chococfko.test'
// A membership-less identity used only for the invitation-claim flow (starts with no active role).
export const INVITEE_EMAIL = process.env.TNMT_E2E_INVITEE_EMAIL || 'tourn.invitee@chococfko.test'
export const TEST_PASSWORD = process.env.TNMT_E2E_PASSWORD || 'Tnmt!e2e-local-2026'

// Every row this suite creates is tagged with this run id so cleanup only ever removes its own data
// and re-runs never collide. Names are prefixed `E2E <RUN_ID> …`.
export const RUN_ID = process.env.TNMT_E2E_RUN_ID || `r${Date.now().toString(36)}`
export const RUN_PREFIX = `E2E-${RUN_ID}`

export const AUTH_DIR = path.resolve(HERE, '.auth')
export const ARTIFACT_DIR = path.resolve(HERE, '.artifacts')
export const SCREENSHOT_DIR = path.resolve(ARTIFACT_DIR, 'screenshots')
export const adminStateFile = path.join(AUTH_DIR, 'admin.json')
export const userStateFile = path.join(AUTH_DIR, 'user.json')
export const managerStateFile = path.join(AUTH_DIR, 'manager.json')
export const scorekeeperStateFile = path.join(AUTH_DIR, 'scorekeeper.json')
export const inviteeStateFile = path.join(AUTH_DIR, 'invitee.json')

// ── HARD LOCAL-ONLY SAFETY GATE ───────────────────────────────────────────────────────────────
// A hostname is "local" only if it is localhost / 127.0.0.1 / ::1 / *.local. Anything else — most
// importantly a *.supabase.co / *.supabase.in production host — must abort the run before any write.
export function hostOf(url: string): string {
  try { return new URL(url).hostname.toLowerCase() } catch { return '' }
}
export function isLocalHostname(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]' || host.endsWith('.local')
}
export function looksLikeProdSupabase(url: string): boolean {
  const h = hostOf(url)
  return /supabase\.(co|in|net)$/.test(h) || h.endsWith('.chococfko.com') || h === 'chococfko.com'
}

// Called by anything that WRITES (seed, auth.setup). Throws (does not skip) so a misconfigured run
// fails loudly instead of silently touching a remote DB.
export function assertLocalTarget(): void {
  const host = hostOf(SUPABASE_URL)
  if (looksLikeProdSupabase(SUPABASE_URL) || !isLocalHostname(host)) {
    throw new Error(
      `[tnmt-e2e] REFUSING to run: Supabase target "${SUPABASE_URL}" is not a local stack. ` +
        `This suite only ever targets a local WSL/Docker Supabase (localhost/127.0.0.1). ` +
        `Fix e2e/tournaments/.env.stack.local (TNMT_E2E_SUPABASE_URL).`,
    )
  }
  if (!SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
    throw new Error('[tnmt-e2e] missing TNMT_E2E_ANON_KEY / TNMT_E2E_SERVICE_ROLE_KEY (run supabase status -o env)')
  }
}
