'use server'

// Admin CRUD for the standalone Tournament module. EVERY mutation follows the same order:
//   1. authenticate the user → checkIsAdmin()  (Guest = anon OR logged-in non-admin → rejected)
//   2. validate input with the shared pure validator
//   3. verify the row exists + optimistic-concurrency token matches (updated_at)
//   4. mutate via the SERVICE-ROLE client (never trusts client-supplied status/version)
//   5. write an audit-log entry (actor, timestamp, changed fields, status before/after)
//   6. revalidate the affected routes and return a TYPED result (no raw SQL error to the UI)
//
// The tournaments table has no `version` column by schema design (only tournament_events /
// tournament_matches do — see migration_tournament_core.sql §12.3). For the tournament ENTITY we
// therefore use `updated_at` as the optimistic-concurrency token, which the DB updates on every
// UPDATE via the tournaments_updated_at trigger. This is the mechanism the design doc lists for
// the tournament entity (§1.6, §10) — no migration change required.

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { checkIsAdmin, createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { checkTournamentPermission } from '@/lib/tournaments/permissions/server'
import type { TournamentPermission } from '@/lib/tournaments/permissions'
import { createOwnedTournament } from '@/lib/tournaments/create/service'
import {
  validateTournamentInput,
  type TournamentFormValues,
} from '@/lib/tournaments/validation'
import type {
  TournamentMutationResult,
  TournamentStatus,
} from '@/lib/tournaments/admin/types'

const PG_UNIQUE_VIOLATION = '23505'

function revalidateTournamentViews(id?: string) {
  // Both the legacy Site-Admin mount and the scoped management surface render these views.
  for (const base of ['/admin/giai-dau', '/quan-ly-giai-dau']) {
    revalidatePath(base)
    if (id) {
      revalidatePath(`${base}/${id}`)
      revalidatePath(`${base}/${id}/edit`)
    }
  }
}

// Scoped guard for a tournament-entity mutation. Replaces the old blanket checkIsAdmin(): a Site
// Admin still passes everything (short-circuit inside checkTournamentPermission), while a scoped
// manager passes only the permissions their role maps to. The mutation's service-role client is
// created ONLY after this returns true.
async function may(tournamentId: string, permission: TournamentPermission): Promise<boolean> {
  const check = await checkTournamentPermission(tournamentId, permission)
  return check.ok
}

async function currentUserId(): Promise<string | null> {
  try {
    const { data } = await createClient().auth.getUser()
    return data.user?.id ?? null
  } catch {
    return null
  }
}

// Best-effort audit write. Never lets an audit failure break the primary mutation, but the
// service-role insert is expected to succeed. Metadata is limited to actor / changed fields /
// status transition — NEVER tokens, cookies, sessions or secrets.
async function writeAudit(
  admin: SupabaseClient,
  entry: {
    tournamentId: string | null
    actorId: string | null
    action: string
    detail: Record<string, unknown>
  },
): Promise<void> {
  try {
    await admin.from('tournament_audit_log').insert({
      tournament_id: entry.tournamentId,
      actor_id: entry.actorId,
      action: entry.action,
      detail: entry.detail,
    })
  } catch {
    /* audit is best-effort; a failure here must not roll back the user's action */
  }
}

// ── create (SELF-SERVICE — any authenticated user, 15F-1) ──────────────────────────────────
// Creation is NO LONGER Site-Admin-only: any signed-in user may create a DRAFT tournament and
// becomes its OWNER, atomically. The authorization + atomic tournament/owner/audit write live in
// lib/tournaments/create/service.ts (which calls the SECURITY DEFINER RPC). We deliberately do NOT
// use checkIsAdmin() here, and we do NOT use the scoped may() guard (there is no tournament to scope
// to yet). Every mutation AFTER create still goes through the per-tournament scoped permission below.
export async function createTournament(
  values: TournamentFormValues,
): Promise<TournamentMutationResult> {
  return createOwnedTournament(values)
}

// ── update ────────────────────────────────────────────────────────────────────────────────
export async function updateTournament(
  id: string,
  expectedUpdatedAt: string,
  values: TournamentFormValues,
): Promise<TournamentMutationResult> {
  if (!id || !expectedUpdatedAt) return { ok: false, error: 'invalid' }
  if (!(await may(id, 'tournament.update'))) return { ok: false, error: 'forbidden' }

  const parsed = validateTournamentInput(values)
  if (!parsed.ok) return { ok: false, error: 'invalid', fieldErrors: parsed.errors }

  const actorId = await currentUserId()
  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('tournaments')
    .select('id, name, slug, starts_at, ends_at, location, rules_url, updated_at')
    .eq('id', id)
    .maybeSingle()
  if (!existing) return { ok: false, error: 'not_found' }
  if (existing.updated_at !== expectedUpdatedAt) return { ok: false, error: 'version_conflict' }

  const { name, slug, startsAt, endsAt, location, rulesUrl } = parsed.value
  // Guard on (id, updated_at): a concurrent Admin who saved first bumps updated_at → 0 rows here.
  const { data: updated, error } = await admin
    .from('tournaments')
    .update({ name, slug, starts_at: startsAt, ends_at: endsAt, location, rules_url: rulesUrl })
    .eq('id', id)
    .eq('updated_at', expectedUpdatedAt)
    .select('id, slug')

  if (error) {
    if (error.code === PG_UNIQUE_VIOLATION) {
      return { ok: false, error: 'slug_taken', fieldErrors: { slug: 'slug_invalid' } }
    }
    return { ok: false, error: 'unknown' }
  }
  if (!updated || updated.length === 0) return { ok: false, error: 'version_conflict' }

  const changed = (
    [
      ['name', existing.name, name],
      ['slug', existing.slug, slug],
      ['starts_at', existing.starts_at, startsAt],
      ['ends_at', existing.ends_at, endsAt],
      ['location', existing.location, location],
      ['rules_url', existing.rules_url, rulesUrl],
    ] as const
  )
    .filter(([, before, after]) => before !== after)
    .map(([field]) => field)

  await writeAudit(admin, {
    tournamentId: id,
    actorId,
    action: 'tournament_updated',
    detail: { changed },
  })
  revalidateTournamentViews(id)
  return { ok: true, id, slug: updated[0].slug }
}

// Shared helper for the status-transition actions (publish / archive). Re-checks admin, existence
// and the concurrency token, then performs a guarded status UPDATE.
async function transitionStatus(
  id: string,
  expectedUpdatedAt: string,
  opts: {
    allowedFrom: TournamentStatus[]
    to: TournamentStatus
    action: string
    permission: TournamentPermission
    requireEvent?: boolean
  },
): Promise<TournamentMutationResult> {
  if (!id || !expectedUpdatedAt) return { ok: false, error: 'invalid' }
  if (!(await may(id, opts.permission))) return { ok: false, error: 'forbidden' }

  const actorId = await currentUserId()
  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('tournaments')
    .select('id, status, updated_at, tournament_events(count)')
    .eq('id', id)
    .maybeSingle()
  if (!existing) return { ok: false, error: 'not_found' }
  if (existing.updated_at !== expectedUpdatedAt) return { ok: false, error: 'version_conflict' }

  const statusBefore = existing.status as TournamentStatus
  if (!opts.allowedFrom.includes(statusBefore)) return { ok: false, error: 'invalid' }

  if (opts.requireEvent) {
    const rows = existing.tournament_events as { count: number }[] | null
    const eventCount = Array.isArray(rows) && rows.length > 0 ? rows[0]?.count ?? 0 : 0
    if (eventCount < 1) return { ok: false, error: 'needs_event' }
  }

  const { data: updated } = await admin
    .from('tournaments')
    .update({ status: opts.to })
    .eq('id', id)
    .eq('updated_at', expectedUpdatedAt)
    .eq('status', statusBefore)
    .select('id')

  if (!updated || updated.length === 0) return { ok: false, error: 'version_conflict' }

  await writeAudit(admin, {
    tournamentId: id,
    actorId,
    action: opts.action,
    detail: { status_before: statusBefore, status_after: opts.to },
  })
  revalidateTournamentViews(id)
  return { ok: true, id }
}

// ── publish (draft → published; requires ≥1 event) ─────────────────────────────────────────
export async function publishTournament(
  id: string,
  expectedUpdatedAt: string,
): Promise<TournamentMutationResult> {
  return transitionStatus(id, expectedUpdatedAt, {
    allowedFrom: ['draft'],
    to: 'published',
    action: 'tournament_published',
    permission: 'tournament.publish',
    requireEvent: true,
  })
}

// ── unpublish (published → draft) ──────────────────────────────────────────────────────────
// The reverse of publish: takes a live tournament off the public listing and back to an editable
// draft. No child data is touched — only the entity status flips, so it is always reversible.
export async function unpublishTournament(
  id: string,
  expectedUpdatedAt: string,
): Promise<TournamentMutationResult> {
  return transitionStatus(id, expectedUpdatedAt, {
    allowedFrom: ['published'],
    to: 'draft',
    action: 'tournament_unpublished',
    permission: 'tournament.publish',
  })
}

// ── restore from archive (archived → draft | published) ────────────────────────────────────
// Brings an archived tournament back. `to: 'draft'` restores it as an editable, non-public draft;
// `to: 'published'` restores it straight to the public listing (requires ≥1 event, like publish).
export async function restoreTournament(
  id: string,
  expectedUpdatedAt: string,
  to: 'draft' | 'published' = 'draft',
): Promise<TournamentMutationResult> {
  return transitionStatus(id, expectedUpdatedAt, {
    allowedFrom: ['archived'],
    to,
    action: to === 'published' ? 'tournament_restored_published' : 'tournament_restored',
    permission: to === 'published' ? 'tournament.publish' : 'tournament.archive',
    requireEvent: to === 'published',
  })
}

// ── archive (draft/published/completed → archived) ─────────────────────────────────────────
export async function archiveTournament(
  id: string,
  expectedUpdatedAt: string,
): Promise<TournamentMutationResult> {
  return transitionStatus(id, expectedUpdatedAt, {
    allowedFrom: ['draft', 'published', 'completed'],
    to: 'archived',
    action: 'tournament_archived',
    permission: 'tournament.archive',
  })
}

// ── hard-delete (draft + no child data only) ───────────────────────────────────────────────
export async function deleteDraftTournament(
  id: string,
  expectedUpdatedAt: string,
): Promise<TournamentMutationResult> {
  if (!id || !expectedUpdatedAt) return { ok: false, error: 'invalid' }
  if (!(await may(id, 'tournament.delete'))) return { ok: false, error: 'forbidden' }

  const actorId = await currentUserId()
  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('tournaments')
    .select('id, name, slug, status, updated_at, tournament_events(count)')
    .eq('id', id)
    .maybeSingle()
  if (!existing) return { ok: false, error: 'not_found' }
  if (existing.updated_at !== expectedUpdatedAt) return { ok: false, error: 'version_conflict' }

  const statusBefore = existing.status as TournamentStatus
  if (statusBefore !== 'draft') return { ok: false, error: 'not_draft' }

  const rows = existing.tournament_events as { count: number }[] | null
  const eventCount = Array.isArray(rows) && rows.length > 0 ? rows[0]?.count ?? 0 : 0
  if (eventCount > 0) return { ok: false, error: 'has_children' }

  // Audit BEFORE deleting, and with tournament_id = NULL: the audit FK is ON DELETE CASCADE, so a
  // row pointing at this tournament would be wiped by the delete. Keep the id inside `detail`.
  await writeAudit(admin, {
    tournamentId: null,
    actorId,
    action: 'tournament_deleted',
    detail: { tournament_id: id, name: existing.name, slug: existing.slug, status_before: statusBefore },
  })

  const { data: deleted, error } = await admin
    .from('tournaments')
    .delete()
    .eq('id', id)
    .eq('status', 'draft')
    .eq('updated_at', expectedUpdatedAt)
    .select('id')

  if (error) return { ok: false, error: 'unknown' }
  if (!deleted || deleted.length === 0) return { ok: false, error: 'version_conflict' }

  revalidateTournamentViews(id)
  return { ok: true, id }
}

// ── home-promo toggle (SITE ADMIN ONLY) ─────────────────────────────────────────────────────
// Opt a tournament in/out of the home-page activity-promo strip. Deliberately NOT gated by the
// scoped may() permission engine: a tournament Owner/Manager/Scorekeeper must NEVER be able to
// promote their own tournament site-wide. The ONLY caller allowed here is a Site Admin (decided from
// ADMIN_EMAILS by checkIsAdmin, which re-reads the caller's own auth user). This is the server-side
// re-check — hiding the control in the UI is never the security boundary.
//
// The flag is a display eligibility hint, independent of publish/archive: it can be set at any
// status. The public promo query still gates the actual render (public + ongoing/upcoming only), so
// enabling it on a draft/completed tournament simply has no visible effect until it is both public
// and live/upcoming. Uses the same updated_at optimistic-concurrency token as the other entity
// mutations, and revalidates the home page so the change is reflected on next render.
export async function setTournamentHomePromo(
  id: string,
  expectedUpdatedAt: string,
  enabled: boolean,
): Promise<TournamentMutationResult> {
  if (!id || !expectedUpdatedAt) return { ok: false, error: 'invalid' }
  // Site-Admin-only. No membership/role can satisfy this.
  if (!(await checkIsAdmin())) return { ok: false, error: 'forbidden' }

  const actorId = await currentUserId()
  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('tournaments')
    .select('id, home_promo_enabled, updated_at')
    .eq('id', id)
    .maybeSingle()
  if (!existing) return { ok: false, error: 'not_found' }
  if (existing.updated_at !== expectedUpdatedAt) return { ok: false, error: 'version_conflict' }

  // No-op guard: if it's already in the requested state, report success without a redundant write
  // (avoids bumping updated_at and writing a meaningless audit row).
  if (existing.home_promo_enabled === enabled) {
    revalidateHomePromo(id)
    return { ok: true, id }
  }

  const { data: updated } = await admin
    .from('tournaments')
    .update({ home_promo_enabled: enabled })
    .eq('id', id)
    .eq('updated_at', expectedUpdatedAt)
    .select('id')
  if (!updated || updated.length === 0) return { ok: false, error: 'version_conflict' }

  await writeAudit(admin, {
    tournamentId: id,
    actorId,
    action: enabled ? 'tournament_home_promo_enabled' : 'tournament_home_promo_disabled',
    detail: { home_promo_enabled: enabled },
  })
  revalidateHomePromo(id)
  return { ok: true, id }
}

// Revalidate the management views AND the site home page (where the promo strip lives) so an Admin's
// toggle takes effect on the next render rather than serving a stale promo.
function revalidateHomePromo(id: string) {
  revalidateTournamentViews(id)
  revalidatePath('/')
}
