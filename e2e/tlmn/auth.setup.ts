// Non-interactive two-player authentication — replaces Google OAuth for tests.
//
// Strategy (priority order, matching the QA brief):
//   1. If stable email+password are supplied via env → sign in (no writes).
//   2. Else (WRITE_OK) → provision two dedicated test users via the service role
//      (admin.createUser, email pre-confirmed) and rotate their passwords for this run.
// In both cases the session is materialised into Playwright storageState by letting
// @supabase/ssr serialise the auth cookies itself (version-proof — we never hand-craft
// cookie formats). Secrets/tokens are kept in memory only and never logged or written
// to the report.
//
// Two SEPARATE storageState files → two fully isolated contexts (cookies, localStorage,
// session) for Player A and Player B.
import { test as setup, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import {
  SUPABASE_URL, SUPABASE_ANON_KEY, SERVICE_ROLE_KEY, BASE_URL,
  PLAYER_A, PLAYER_B, STATE_A, STATE_B, AUTH_DIR, WRITE_OK,
} from './_env'

async function findUserIdByEmail(admin: ReturnType<typeof createClient>, email: string): Promise<string | null> {
  // listUsers is paginated; this project is small, but page through to be safe.
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error || !data?.users?.length) break
    const hit = data.users.find(u => (u.email || '').toLowerCase() === email.toLowerCase())
    if (hit) return hit.id
    if (data.users.length < 200) break
  }
  return null
}

// Returns a usable password for the account, provisioning/rotating via service role when needed.
async function ensureAccount(email: string, envPassword: string): Promise<string> {
  if (envPassword) return envPassword // stable account supplied — no writes
  if (!WRITE_OK) throw new Error('no stable password and WRITE flags not set')
  if (!SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY required to provision test users')

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const password = `Qa!${randomUUID()}`
  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) {
    // Already exists → rotate its password to this run's value.
    const id = await findUserIdByEmail(admin, email)
    if (!id) throw new Error(`could not create or locate test user (${email})`)
    const { error: upErr } = await admin.auth.admin.updateUserById(id, { password, email_confirm: true })
    if (upErr) throw new Error(`could not rotate test user password (${email})`)
  }
  return password
}

async function captureStorageState(email: string, password: string, outFile: string): Promise<void> {
  const captured: { name: string; value: string; options?: { path?: string; maxAge?: number } }[] = []
  const supa = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: { getAll: () => [], setAll: (cs) => { for (const c of cs) captured.push(c) } },
  })
  const { error } = await supa.auth.signInWithPassword({ email, password })
  expect(error, `sign-in for ${email}`).toBeNull()
  expect(captured.length, `auth cookies captured for ${email}`).toBeGreaterThan(0)

  const origin = new URL(BASE_URL)
  const now = Math.floor(Date.now() / 1000)
  const cookies = captured.map(c => ({
    name: c.name,
    value: c.value,
    domain: origin.hostname,
    path: c.options?.path || '/',
    expires: c.options?.maxAge ? now + c.options.maxAge : now + 60 * 60 * 24 * 7,
    httpOnly: false,
    secure: origin.protocol === 'https:',
    sameSite: 'Lax' as const,
  }))
  fs.mkdirSync(AUTH_DIR, { recursive: true })
  fs.writeFileSync(outFile, JSON.stringify({ cookies, origins: [] }, null, 2))
}

setup('authenticate Player A and Player B (no OAuth)', async () => {
  setup.skip(!SUPABASE_URL || !SUPABASE_ANON_KEY, 'Supabase URL/anon key required')
  // Provisioning OR running the write flow both imply prod writes for this project.
  setup.skip(!WRITE_OK && (!PLAYER_A.password || !PLAYER_B.password),
    'Set TLMN_E2E_WRITE=1 TLMN_E2E_ALLOW_PROD=1 (or supply stable TLMN_E2E_*_EMAIL/PASSWORD) to authenticate test players')

  const pwA = await ensureAccount(PLAYER_A.email, PLAYER_A.password)
  const pwB = await ensureAccount(PLAYER_B.email, PLAYER_B.password)
  await captureStorageState(PLAYER_A.email, pwA, STATE_A)
  await captureStorageState(PLAYER_B.email, pwB, STATE_B)
})
