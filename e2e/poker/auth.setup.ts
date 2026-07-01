// Non-interactive authentication for the poker suite — replaces Google OAuth for tests.
//
// For each of the six throwaway players: sign in if a stable password is supplied, else
// provision/rotate the account via the service role (admin.createUser, email pre-confirmed),
// ensure a funded wallet (ensure_wallet RPC), and materialise the session into a Playwright
// storageState file by letting @supabase/ssr serialise the auth cookies itself (version-proof).
//
// Runs real work ONLY when WRITE_OK (a branch target or an explicit prod ack) — otherwise it
// skips, so `responsive`/`smoke` can run with no writes.
import { test as setup } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import {
  SUPABASE_URL, SUPABASE_ANON_KEY, SERVICE_ROLE_KEY, PLAYERS,
  AUTH_DIR, WRITE_OK, IS_BRANCH_TARGET,
} from './_env'

async function findUserIdByEmail(admin: SupabaseClient, email: string): Promise<string | null> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error || !data?.users?.length) break
    const hit = data.users.find((u) => (u.email || '').toLowerCase() === email.toLowerCase())
    if (hit) return hit.id
    if (data.users.length < 200) break
  }
  return null
}

async function ensureAccount(admin: SupabaseClient, email: string, envPassword: string): Promise<{ id: string; password: string }> {
  const password = envPassword || `Qa!${randomUUID()}`
  if (envPassword) {
    const id = await findUserIdByEmail(admin, email)
    if (!id) throw new Error(`could not locate test user (${email})`)
    return { id, password }
  }
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (!error && created?.user?.id) return { id: created.user.id, password }
  const id = await findUserIdByEmail(admin, email)
  if (!id) throw new Error(`could not create or locate test user (${email})`)
  const { error: upErr } = await admin.auth.admin.updateUserById(id, { password, email_confirm: true })
  if (upErr) throw new Error(`could not rotate test user password (${email})`)
  return { id, password }
}

async function captureStorageState(email: string, password: string, outFile: string): Promise<void> {
  const captured: { name: string; value: string; options?: Record<string, unknown> }[] = []
  const supa = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => [],
      setAll: (cs: { name: string; value: string; options?: Record<string, unknown> }[]) => { for (const c of cs) captured.push(c) },
    },
  })
  const { error } = await supa.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`)
  // Fund a wallet so the player can actually sit down / buy in.
  await supa.rpc('ensure_wallet')
  const origin = new URL(SUPABASE_URL).origin
  const cookies = captured.map((c) => ({
    name: c.name, value: c.value, domain: 'localhost', path: '/',
    expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' as const,
  }))
  fs.writeFileSync(outFile, JSON.stringify({ cookies, origins: [{ origin, localStorage: [] }] }, null, 2))
}

setup('provision six poker test players', async () => {
  if (!WRITE_OK) {
    setup.skip(true, 'poker write suite disabled — target a branch (POKER_E2E_SUPABASE_URL) or set POKER_E2E_ALLOW_PROD=1')
    return
  }
  if (!SERVICE_ROLE_KEY) throw new Error('POKER_E2E_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_ROLE_KEY) required to provision test users')
  if (!IS_BRANCH_TARGET) {
    // Loud reminder if someone opts into prod writes.
    console.warn('[poker-e2e] WRITE suite is targeting the DEFAULT (production) database via POKER_E2E_ALLOW_PROD=1')
  }
  fs.mkdirSync(AUTH_DIR, { recursive: true })
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const manifest: Record<string, { id: string; email: string }> = {}
  for (const p of PLAYERS) {
    const { id, password } = await ensureAccount(admin, p.email, p.password)
    await captureStorageState(p.email, password, `${AUTH_DIR}/player-${p.key}.json`)
    manifest[p.key] = { id, email: p.email }
  }
  // Persist the key→user-id map so UI specs can resolve player identities (table factory,
  // authoritative stack/wallet assertions) without re-querying auth on every run.
  fs.writeFileSync(`${AUTH_DIR}/players.json`, JSON.stringify(manifest, null, 2))
})
