// Shared env + safety gates for the TLMN E2E suite.
//
// Playwright does NOT auto-load Next's .env.local, so we parse it here (without
// overriding anything already exported in the shell). Secrets are read into memory
// only — never logged, never written to the report.
import fs from 'node:fs'
import path from 'node:path'

// Directory of THIS file. Playwright always runs from web/ (every npm script + the CI
// job set that cwd), so resolve from the project root — this is CJS/ESM-agnostic, unlike
// import.meta.url (which breaks Playwright's TypeScript config loader) or __dirname
// (undefined in an ES module scope).
const HERE = path.resolve(process.cwd(), 'e2e/tlmn')

function loadEnvLocal(): void {
  const candidates = [
    path.resolve(HERE, '../../.env.local'),
    path.resolve(process.cwd(), '.env.local'),
  ]
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue
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
    return
  }
}
loadEnvLocal()

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
export const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
export const BASE_URL = process.env.TLMN_E2E_BASE_URL || 'http://localhost:3000'
export const PROJECT_REF = (() => { try { return new URL(SUPABASE_URL).hostname.split('.')[0] } catch { return '' } })()

// ── Run identity (for run-scoped test-data isolation + cleanup) ───────────────────
// Every CI run is uniquely tagged. Only data recorded under this run's manifest is
// ever cleaned up — the teardown can never touch another run's or a real user's data.
export const RUN_ID = process.env.GITHUB_RUN_ID || `local-${Date.now()}`
export const RUN_ATTEMPT = process.env.GITHUB_RUN_ATTEMPT || '1'
export const RUN_TAG = `AUTO_TLMN_${RUN_ID}_${RUN_ATTEMPT}`

// ── SAFETY GATES ────────────────────────────────────────────────────────────────
// This project has exactly ONE Supabase database (production). The app at ANY URL
// (localhost, staging, chococfko.com) connects to it. Therefore any test that writes
// game data necessarily writes to production. The write suite refuses to run unless
// BOTH flags are set, so it can never fire by accident:
//   TLMN_E2E_WRITE=1        — opt in to the live UI write-flow suite
//   TLMN_E2E_ALLOW_PROD=1   — explicit acknowledgement that writes hit production
export const WRITE_ENABLED = process.env.TLMN_E2E_WRITE === '1'
export const ALLOW_PROD = process.env.TLMN_E2E_ALLOW_PROD === '1'
export const WRITE_OK = WRITE_ENABLED && ALLOW_PROD

// Dedicated, clearly-named throwaway accounts. Passwords may be supplied via env for
// stable accounts; otherwise auth.setup.ts provisions/rotates them via the service role.
export const PLAYER_A = {
  email: process.env.TLMN_E2E_EMAIL_A || process.env.TLMN_E2E_A_EMAIL || 'qa.tlmn.player.a@chococfko.test',
  password: process.env.TLMN_E2E_PASSWORD_A || process.env.TLMN_E2E_A_PASSWORD || '',
}
export const PLAYER_B = {
  email: process.env.TLMN_E2E_EMAIL_B || process.env.TLMN_E2E_B_EMAIL || 'qa.tlmn.player.b@chococfko.test',
  password: process.env.TLMN_E2E_PASSWORD_B || process.env.TLMN_E2E_B_PASSWORD || '',
}

// ── Output locations ──────────────────────────────────────────────────────────────
// Playwright artifacts (traces / screenshots / reports) live under e2e/tlmn/.artifacts
// so the CI job can upload the whole folder. The per-player storageState files (written
// by auth.setup.ts, consumed by multiplayer.spec.ts) live alongside under .auth.
export const ARTIFACT_DIR = path.resolve(HERE, '.artifacts')
export const AUTH_DIR = path.resolve(HERE, '.auth')
export const STATE_A = path.join(AUTH_DIR, 'player-a.json')
export const STATE_B = path.join(AUTH_DIR, 'player-b.json')
