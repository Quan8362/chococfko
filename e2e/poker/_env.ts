// Shared env + safety gates for the POKER E2E suite.
//
// Unlike the TLMN suite (which can only ever target the single production DB), the poker
// suite is designed to target a THROWAWAY Supabase preview branch, so it can provision test
// users and write game data WITHOUT ever touching production. Point it at a branch with:
//
//   POKER_E2E_SUPABASE_URL / POKER_E2E_ANON_KEY / POKER_E2E_SERVICE_ROLE_KEY
//
// Playwright does NOT auto-load Next's .env.local, so we parse it here (without overriding
// anything already in the shell). Secrets are read into memory only — never logged.
import fs from 'node:fs'
import path from 'node:path'

// Playwright loads this module both as ESM (specs) and CJS (config). Avoid `import.meta` /
// `__dirname` (each breaks in one mode) and resolve everything from the repo root (cwd), which
// is where the npm scripts run. HERE is the suite dir under the web/ root.
const HERE = path.resolve(process.cwd(), 'e2e', 'poker')

function loadEnvLocal(): void {
  const candidates = [
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(HERE, '../../.env.local'),
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

// Poker-specific overrides win; otherwise fall back to the app's public env (production).
export const SUPABASE_URL = process.env.POKER_E2E_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
export const SUPABASE_ANON_KEY = process.env.POKER_E2E_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
export const SERVICE_ROLE_KEY = process.env.POKER_E2E_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
export const BASE_URL = process.env.POKER_E2E_BASE_URL || 'http://localhost:3000'
export const PROJECT_REF = (() => { try { return new URL(SUPABASE_URL).hostname.split('.')[0] } catch { return '' } })()

export const RUN_ID = process.env.GITHUB_RUN_ID || `local-${Date.now()}`
export const RUN_ATTEMPT = process.env.GITHUB_RUN_ATTEMPT || '1'
export const RUN_TAG = `AUTO_POKER_${RUN_ID}_${RUN_ATTEMPT}`

// ── SAFETY GATE ───────────────────────────────────────────────────────────────────────
// The write / integration specs provision users and move (play-money) coins. They REFUSE to
// run against production unless the operator explicitly targets a preview branch OR overrides
// the guard. `isBranchTarget` is true when POKER_E2E_SUPABASE_URL is set (a deliberate,
// non-default DB). Set POKER_E2E_ALLOW_PROD=1 only if you truly mean to hit the prod DB.
export const IS_BRANCH_TARGET = !!process.env.POKER_E2E_SUPABASE_URL
export const ALLOW_PROD = process.env.POKER_E2E_ALLOW_PROD === '1'
export const WRITE_OK = IS_BRANCH_TARGET || ALLOW_PROD

// Six dedicated throwaway accounts (6-max). Passwords may be supplied via env; otherwise
// auth.setup.ts provisions/rotates them via the service role on the target (branch) DB.
export const PLAYERS = Array.from({ length: 6 }, (_, i) => {
  const letter = String.fromCharCode(97 + i) // a..f
  return {
    key: letter,
    email: process.env[`POKER_E2E_EMAIL_${letter.toUpperCase()}`] || `qa.poker.player.${letter}@chococfko.test`,
    password: process.env[`POKER_E2E_PASSWORD_${letter.toUpperCase()}`] || '',
  }
})

export const AUTH_DIR = path.resolve(HERE, '.auth')
export const ARTIFACT_DIR = path.resolve(HERE, '.artifacts')
export const stateFileFor = (key: string) => path.join(AUTH_DIR, `player-${key}.json`)
// key → { id, email } map written by auth.setup.ts (only present after a branch setup run).
export const MANIFEST_FILE = path.join(AUTH_DIR, 'players.json')
