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
  revalidatePath('/admin/giai-dau')
  if (id) {
    revalidatePath(`/admin/giai-dau/${id}`)
    revalidatePath(`/admin/giai-dau/${id}/edit`)
  }
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

// ── create ────────────────────────────────────────────────────────────────────────────────
export async function createTournament(
  values: TournamentFormValues,
): Promise<TournamentMutationResult> {
  if (!(await checkIsAdmin())) return { ok: false, error: 'forbidden' }

  const parsed = validateTournamentInput(values)
  if (!parsed.ok) return { ok: false, error: 'invalid', fieldErrors: parsed.errors }

  const actorId = await currentUserId()
  const admin = createAdminClient()
  const { name, slug, startsAt, endsAt, location, rulesUrl } = parsed.value

  const { data, error } = await admin
    .from('tournaments')
    .insert({
      slug,
      name,
      starts_at: startsAt,
      ends_at: endsAt,
      location,
      rules_url: rulesUrl,
      status: 'draft', // ALWAYS draft on create — never accept a client-chosen status.
      created_by: actorId,
    })
    .select('id, slug')
    .single()

  if (error) {
    if (error.code === PG_UNIQUE_VIOLATION) {
      return { ok: false, error: 'slug_taken', fieldErrors: { slug: 'slug_invalid' } }
    }
    return { ok: false, error: 'unknown' }
  }

  await writeAudit(admin, {
    tournamentId: data.id,
    actorId,
    action: 'tournament_created',
    detail: { name, slug, status_after: 'draft' },
  })
  revalidateTournamentViews(data.id)
  return { ok: true, id: data.id, slug: data.slug }
}

// ── update ────────────────────────────────────────────────────────────────────────────────
export async function updateTournament(
  id: string,
  expectedUpdatedAt: string,
  values: TournamentFormValues,
): Promise<TournamentMutationResult> {
  if (!(await checkIsAdmin())) return { ok: false, error: 'forbidden' }
  if (!id || !expectedUpdatedAt) return { ok: false, error: 'invalid' }

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
    requireEvent?: boolean
  },
): Promise<TournamentMutationResult> {
  if (!(await checkIsAdmin())) return { ok: false, error: 'forbidden' }
  if (!id || !expectedUpdatedAt) return { ok: false, error: 'invalid' }

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
    requireEvent: true,
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
  })
}

// ── hard-delete (draft + no child data only) ───────────────────────────────────────────────
export async function deleteDraftTournament(
  id: string,
  expectedUpdatedAt: string,
): Promise<TournamentMutationResult> {
  if (!(await checkIsAdmin())) return { ok: false, error: 'forbidden' }
  if (!id || !expectedUpdatedAt) return { ok: false, error: 'invalid' }

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
