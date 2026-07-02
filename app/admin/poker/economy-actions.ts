'use server'

// ── Poker ADMIN ECONOMY-CONFIG workflow (preview → validate → publish → activate → rollback) ─
//
// The ONLY way the admin UI manages the versioned economy config. Every action:
//   1. re-checks checkIsAdmin() (defense in depth beyond the /admin layout gate),
//   2. resolves the acting admin's user id + email from the session (never trusts the client),
//   3. requires a mandatory reason for any state change, then
//   4. calls a SECURITY DEFINER config RPC that changes ONLY which tuning is active AND writes
//      an immutable audit row in ONE transaction. NEVER moves coins, NEVER rewrites a balance.
//
// The RPCs are service_role-only. Config bodies are published from the COMPILED registry
// (lib/games/poker/economyConfig.ts) — the single source of truth — so the DB can never hold a
// version the code doesn't know how to enforce. Degrade-safe: if the config migration is not yet
// applied, publish/activate return a coded error instead of throwing.

import { revalidatePath } from 'next/cache'
import { checkIsAdmin, createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {
  POKER_ECONOMY_VERSIONS,
  getEconomyConfig,
  validateEconomyConfig,
  type PokerEconomyConfig,
  type EconomyConfigError,
} from '@/lib/games/poker/economyConfig'

export type EconomyAdminResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string }

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error }
}

async function requireActor(): Promise<{ ok: true; actorId: string; email: string } | { ok: false; error: string }> {
  if (!(await checkIsAdmin())) return fail('not_admin')
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('not_authenticated')
  return { ok: true, actorId: user.id, email: user.email ?? '' }
}

// ── PREVIEW — a compiled registry version + its validation result (read-only, pure) ─────
export interface EconomyVersionPreview {
  version: string
  effectiveFrom: string
  note: string
  valid: boolean
  errors: EconomyConfigError[]
  config: PokerEconomyConfig
}

export async function previewEconomyConfig(version: string): Promise<EconomyAdminResult<{ preview: EconomyVersionPreview }>> {
  if (!(await checkIsAdmin())) return fail('not_admin')
  let cfg: PokerEconomyConfig
  try { cfg = getEconomyConfig(version) } catch { return fail('unknown_version') }
  const v = validateEconomyConfig(cfg)
  return {
    ok: true,
    preview: {
      version: cfg.version,
      effectiveFrom: cfg.effectiveFrom,
      note: cfg.note,
      valid: v.ok,
      errors: v.ok ? [] : [...v.errors],
      config: cfg,
    },
  }
}

// ── VALIDATE — explicit validation gate (used before publish/activate) ──────────────────
export async function validateEconomyVersion(version: string): Promise<EconomyAdminResult<{ valid: boolean; errors: EconomyConfigError[] }>> {
  if (!(await checkIsAdmin())) return fail('not_admin')
  let cfg: PokerEconomyConfig
  try { cfg = getEconomyConfig(version) } catch { return fail('unknown_version') }
  const v = validateEconomyConfig(cfg)
  return { ok: true, valid: v.ok, errors: v.ok ? [] : [...v.errors] }
}

// ── LIST — registry versions + the currently-active DB version (degrade-safe) ───────────
export interface EconomyOverview {
  versions: { version: string; effectiveFrom: string; note: string; valid: boolean }[]
  activeVersion: string | null
  dbAvailable: boolean
}

export async function listEconomyConfig(): Promise<EconomyAdminResult<{ overview: EconomyOverview }>> {
  if (!(await checkIsAdmin())) return fail('not_admin')
  const versions = POKER_ECONOMY_VERSIONS.map((c) => ({
    version: c.version,
    effectiveFrom: c.effectiveFrom,
    note: c.note,
    valid: validateEconomyConfig(c).ok,
  }))
  let activeVersion: string | null = null
  let dbAvailable = false
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.rpc('poker_get_active_economy_config')
    if (!error) {
      dbAvailable = true
      if (data && typeof data === 'object') activeVersion = (data as { version?: string }).version ?? null
    }
  } catch { /* migration not applied → dbAvailable stays false */ }
  return { ok: true, overview: { versions, activeVersion, dbAvailable } }
}

// ── PUBLISH — write a compiled registry version to the DB as an immutable row (no activate) ─
export async function publishEconomyConfig(version: string, reason: string): Promise<EconomyAdminResult> {
  const actor = await requireActor(); if (!actor.ok) return actor
  const r = (reason ?? '').trim(); if (!r) return fail('reason_required')
  let cfg: PokerEconomyConfig
  try { cfg = getEconomyConfig(version) } catch { return fail('unknown_version') }
  const v = validateEconomyConfig(cfg)
  if (!v.ok) return fail('config_invalid')

  const admin = createAdminClient()
  const { error } = await admin.rpc('poker_publish_economy_config', {
    p_version: cfg.version,
    p_config: cfg,
    p_effective_from: cfg.effectiveFrom,
    p_actor: actor.actorId,
    p_actor_email: actor.email,
    p_reason: r,
  })
  if (error) return fail(error.message || 'publish_failed')
  revalidatePath('/admin/poker/economy')
  return { ok: true }
}

// ── ACTIVATE — make a published version active (activating an older one = rollback) ─────
export async function activateEconomyConfig(version: string, reason: string): Promise<EconomyAdminResult> {
  const actor = await requireActor(); if (!actor.ok) return actor
  const r = (reason ?? '').trim(); if (!r) return fail('reason_required')

  const admin = createAdminClient()
  const { error } = await admin.rpc('poker_activate_economy_config', {
    p_version: version,
    p_actor: actor.actorId,
    p_actor_email: actor.email,
    p_reason: r,
  })
  if (error) return fail(error.message || 'activate_failed')
  revalidatePath('/admin/poker/economy')
  return { ok: true }
}

// ── ROLLBACK — explicit alias: re-activate a prior version with a mandatory reason ─────
export async function rollbackEconomyConfig(toVersion: string, reason: string): Promise<EconomyAdminResult> {
  return activateEconomyConfig(toVersion, reason)
}
