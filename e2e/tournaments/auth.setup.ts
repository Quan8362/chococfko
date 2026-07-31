// Non-interactive auth for the tournament suite. Provisions two throwaway LOCAL users — an admin
// (email must be in ADMIN_EMAILS, wired by the config's webServer) and a plain user — then
// materialises each session into a Playwright storageState by letting @supabase/ssr serialise the
// auth cookies itself (version-proof). Runs only against the local stack (assertLocalTarget).
import { test as setup } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import fs from 'node:fs'
import {
  SUPABASE_URL, SUPABASE_ANON_KEY, SERVICE_ROLE_KEY, BASE_URL,
  ADMIN_EMAIL, USER_EMAIL, MANAGER_EMAIL, SCOREKEEPER_EMAIL, INVITEE_EMAIL, TEST_PASSWORD,
  AUTH_DIR, adminStateFile, userStateFile, managerStateFile, scorekeeperStateFile, inviteeStateFile,
  assertLocalTarget,
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

async function ensureUser(admin: SupabaseClient, email: string): Promise<void> {
  const { error } = await admin.auth.admin.createUser({ email, password: TEST_PASSWORD, email_confirm: true })
  if (!error) return
  // Already exists → rotate the password so sign-in is deterministic across runs.
  const id = await findUserIdByEmail(admin, email)
  if (!id) throw new Error(`could not create or locate test user (${email})`)
  const { error: upErr } = await admin.auth.admin.updateUserById(id, { password: TEST_PASSWORD, email_confirm: true })
  if (upErr) throw new Error(`could not rotate password (${email}): ${upErr.message}`)
}

async function captureStorageState(email: string, outFile: string): Promise<void> {
  const captured: { name: string; value: string }[] = []
  const supa = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => [],
      setAll: (cs: { name: string; value: string }[]) => { for (const c of cs) captured.push({ name: c.name, value: c.value }) },
    },
  })
  const { error } = await supa.auth.signInWithPassword({ email, password: TEST_PASSWORD })
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`)
  const appHost = new URL(BASE_URL).hostname // localhost
  const cookies = captured.map((c) => ({
    name: c.name, value: c.value, domain: appHost, path: '/',
    expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' as const,
  }))
  fs.writeFileSync(outFile, JSON.stringify({ cookies, origins: [] }, null, 2))
}

// Every identity this suite signs in as. Only ADMIN_EMAIL is wired into ADMIN_EMAILS (see the
// config's webServer), so the manager / scorekeeper / invitee are strictly non-admin — a scoped
// membership is the ONLY thing that can grant them anything.
const IDENTITIES: { email: string; state: string }[] = [
  { email: ADMIN_EMAIL, state: adminStateFile },
  { email: USER_EMAIL, state: userStateFile },
  { email: MANAGER_EMAIL, state: managerStateFile },
  { email: SCOREKEEPER_EMAIL, state: scorekeeperStateFile },
  { email: INVITEE_EMAIL, state: inviteeStateFile },
]

setup('provision test identities (local only)', async () => {
  assertLocalTarget()
  fs.mkdirSync(AUTH_DIR, { recursive: true })
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  for (const id of IDENTITIES) {
    await ensureUser(admin, id.email)
    await captureStorageState(id.email, id.state)
  }
})
