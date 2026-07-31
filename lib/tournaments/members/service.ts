import 'server-only'
// Tournament membership SERVICE — invite / change-role / revoke / claim + safe reads. Server-only
// (service-role + next/headers). Every ADMINISTRATIVE mutation follows the module's order:
//   1. checkTournamentPermission(tournamentId, 'members.manage')  — Site Admin only in 15B-1
//   2. validate input (role enum + email shape) with the PURE helpers
//   3. resolve the row scoped to (id, tournament_id)  — cross-tournament IDOR impossible
//   4. mutate via the SERVICE-ROLE client, created ONLY after the check passed
//   5. write an audit-log entry (actor, target, role/status before→after)  — never secrets
//   6. return a TYPED result (no raw SQL/auth error to the caller)
//
// There is NO route/UI yet (15B-2). These are server contracts a future 'use server' action or
// route handler calls directly.

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { checkTournamentPermission } from '@/lib/tournaments/permissions/server.ts'
import { isInvitableRole, isTournamentRole, type TournamentRole } from '@/lib/tournaments/permissions'
import { normalizeAndValidateEmail } from './email.ts'
import type {
  ClaimInvitationsResult,
  CurrentUserTournamentRole,
  ListMembersResult,
  ManageableTournament,
  MemberMutationResult,
  TournamentMemberRow,
  TournamentMembershipSummary,
} from './types.ts'

const PG_UNIQUE_VIOLATION = '23505'

function revalidateMemberViews(tournamentId: string) {
  // The future member-management surface (15B-2) lives under /quan-ly-giai-dau/<id>/thanh-vien.
  revalidatePath(`/quan-ly-giai-dau/${tournamentId}/thanh-vien`)
}

// Best-effort audit write — never lets an audit failure roll back the primary mutation. Metadata is
// limited to actor / target / role+status transition. NEVER tokens, cookies, sessions or secrets.
async function writeAudit(
  admin: SupabaseClient,
  entry: {
    tournamentId: string
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
    /* audit is best-effort */
  }
}

// ── invite ──────────────────────────────────────────────────────────────────────────────────
// Site Admin invites an email to a scoped role. Creates (or re-opens) a PENDING membership. Never
// trusts a client-supplied user_id — binding happens only when the invitee claims it.
export async function inviteTournamentMember(
  tournamentId: string,
  input: { email: string; role: string },
): Promise<MemberMutationResult> {
  const check = await checkTournamentPermission(tournamentId, 'members.manage')
  if (!check.ok) return { ok: false, error: check.error }

  // Only manager/scorekeeper are invitable — 'owner' is granted solely by creating the tournament
  // (15F-1: at most one owner, no transfer/second-owner flow yet). isInvitableRole rejects 'owner'.
  if (!isInvitableRole(input.role)) return { ok: false, error: 'invalid_role' }
  const role: TournamentRole = input.role
  const email = normalizeAndValidateEmail(input.email ?? '')
  if (!email) return { ok: false, error: 'invalid_email' }

  const admin = createAdminClient()

  // Tournament must exist (FK would catch it, but a clean typed error is nicer than 23503).
  const { data: t } = await admin.from('tournaments').select('id').eq('id', tournamentId).maybeSingle()
  if (!t) return { ok: false, error: 'not_found' }

  // One row per (tournament, email). If an invite already exists, re-open pending/revoked to a
  // fresh pending invitation; refuse to duplicate an ACTIVE member.
  const { data: existing } = await admin
    .from('tournament_members')
    .select('id, status, role, version')
    .eq('tournament_id', tournamentId)
    .eq('email_normalized', email)
    .maybeSingle()

  if (existing) {
    if (existing.status === 'active') return { ok: false, error: 'already_active' }
    const { data: reopened, error } = await admin
      .from('tournament_members')
      .update({
        role,
        status: 'pending',
        user_id: null,
        accepted_at: null,
        revoked_at: null,
        invited_by: check.actorId,
        invited_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .eq('tournament_id', tournamentId)
      .select('id')
      .maybeSingle()
    if (error || !reopened) return { ok: false, error: 'unknown' }
    await writeAudit(admin, {
      tournamentId,
      actorId: check.actorId,
      action: 'tournament_member_invited',
      detail: {
        member_id: reopened.id, target_email: email, role,
        status_before: existing.status, status_after: 'pending', reinvited: true,
      },
    })
    revalidateMemberViews(tournamentId)
    return { ok: true, id: reopened.id }
  }

  const { data: created, error } = await admin
    .from('tournament_members')
    .insert({
      tournament_id: tournamentId,
      email_normalized: email,
      role,
      status: 'pending',
      invited_by: check.actorId,
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === PG_UNIQUE_VIOLATION) return { ok: false, error: 'already_active' }
    return { ok: false, error: 'unknown' }
  }

  await writeAudit(admin, {
    tournamentId,
    actorId: check.actorId,
    action: 'tournament_member_invited',
    detail: { member_id: created.id, target_email: email, role, status_after: 'pending' },
  })
  revalidateMemberViews(tournamentId)
  return { ok: true, id: created.id }
}

// ── change role ─────────────────────────────────────────────────────────────────────────────
export async function changeTournamentMemberRole(
  tournamentId: string,
  memberId: string,
  newRole: string,
  expectedVersion: number,
): Promise<MemberMutationResult> {
  const check = await checkTournamentPermission(tournamentId, 'members.manage')
  if (!check.ok) return { ok: false, error: check.error }
  if (!memberId || !Number.isInteger(expectedVersion)) return { ok: false, error: 'invalid' }
  // Target role must be an INVITABLE role — nobody can be promoted to 'owner' (no second owner).
  if (!isInvitableRole(newRole)) return { ok: false, error: 'invalid_role' }

  const admin = createAdminClient()
  // Scope to (id, tournament_id): a member id from ANOTHER tournament resolves to not_found.
  const { data: existing } = await admin
    .from('tournament_members')
    .select('id, role, status, version')
    .eq('id', memberId)
    .eq('tournament_id', tournamentId)
    .maybeSingle()
  if (!existing) return { ok: false, error: 'not_found' }
  // The owner's row is never re-roled here (no owner transfer flow yet).
  if (existing.role === 'owner') return { ok: false, error: 'cannot_modify_owner' }
  if (existing.version !== expectedVersion) return { ok: false, error: 'version_conflict' }
  const roleBefore = existing.role as TournamentRole

  const { data: updated } = await admin
    .from('tournament_members')
    .update({ role: newRole })
    .eq('id', memberId)
    .eq('tournament_id', tournamentId)
    .eq('version', expectedVersion)
    .select('id')
  if (!updated || updated.length === 0) return { ok: false, error: 'version_conflict' }

  await writeAudit(admin, {
    tournamentId,
    actorId: check.actorId,
    action: 'tournament_member_role_changed',
    detail: { member_id: memberId, role_before: roleBefore, role_after: newRole },
  })
  revalidateMemberViews(tournamentId)
  return { ok: true, id: memberId }
}

// ── revoke ──────────────────────────────────────────────────────────────────────────────────
export async function revokeTournamentMember(
  tournamentId: string,
  memberId: string,
  expectedVersion: number,
): Promise<MemberMutationResult> {
  const check = await checkTournamentPermission(tournamentId, 'members.manage')
  if (!check.ok) return { ok: false, error: check.error }
  if (!memberId || !Number.isInteger(expectedVersion)) return { ok: false, error: 'invalid' }

  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('tournament_members')
    .select('id, status, role, version')
    .eq('id', memberId)
    .eq('tournament_id', tournamentId)
    .maybeSingle()
  if (!existing) return { ok: false, error: 'not_found' }
  // The owner cannot be revoked — a tournament must always keep its single active owner (15F-1 has
  // no owner-transfer flow, so revoking would leave it ownerless). Site Admin manages such cases
  // out of band via service-role if ever needed.
  if (existing.role === 'owner') return { ok: false, error: 'cannot_modify_owner' }
  // Idempotent: revoking an already-revoked membership is a success no-op.
  if (existing.status === 'revoked') return { ok: true, id: memberId }
  if (existing.version !== expectedVersion) return { ok: false, error: 'version_conflict' }

  const statusBefore = existing.status
  const { data: updated } = await admin
    .from('tournament_members')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('id', memberId)
    .eq('tournament_id', tournamentId)
    .eq('version', expectedVersion)
    .neq('status', 'revoked')
    .select('id')
  if (!updated || updated.length === 0) return { ok: false, error: 'version_conflict' }

  await writeAudit(admin, {
    tournamentId,
    actorId: check.actorId,
    action: 'tournament_member_revoked',
    detail: { member_id: memberId, role: existing.role, status_before: statusBefore, status_after: 'revoked' },
  })
  revalidateMemberViews(tournamentId)
  return { ok: true, id: memberId }
}

// ── claim (invitee binds their own invitations) ───────────────────────────────────────────────
// Runs the SECURITY DEFINER RPC with the CALLER'S session (auth.uid() + verified JWT email inside
// the function). No email/user id is trusted from the client. The RPC writes the claim audit rows.
// `revalidate` defaults true for action/route-handler callers. Pass false when calling during an RSC
// render (revalidatePath is not allowed there) — the page re-reads live DB state after the claim, so
// the freshly-active memberships appear without an explicit cache bust.
export async function claimCurrentUserTournamentInvitations(
  opts: { revalidate?: boolean } = {},
): Promise<ClaimInvitationsResult> {
  const supabase = createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { ok: false, error: 'NOT_AUTHENTICATED' }

  const { data, error } = await supabase.rpc('tournament_claim_member_invitations')
  if (error) return { ok: false, error: 'NOT_AUTHENTICATED' }

  const rows = Array.isArray(data) ? data : []
  const claimed = rows
    .filter((r): r is { tournament_id: string; role: string } =>
      !!r && isTournamentRole((r as { role?: unknown }).role))
    .map((r) => ({ tournamentId: r.tournament_id, role: r.role as TournamentRole }))
  // Revalidate any surfaces a freshly-active member can now manage (skipped during render).
  if (opts.revalidate !== false) {
    for (const c of claimed) revalidateMemberViews(c.tournamentId)
  }
  return { ok: true, claimed }
}

// ── safe reads ────────────────────────────────────────────────────────────────────────────────
// The current viewer's OWN memberships (self-read via RLS). Anonymous → []. Never lists others.
export async function listCurrentUserTournamentMemberships(): Promise<TournamentMembershipSummary[]> {
  const supabase = createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return []
  const { data } = await supabase
    .from('tournament_members')
    .select('tournament_id, role, status')
  const rows = Array.isArray(data) ? data : []
  return rows
    .filter((r): r is { tournament_id: string; role: TournamentRole; status: TournamentMembershipSummary['status'] } =>
      isTournamentRole((r as { role?: unknown }).role))
    .map((r) => ({ tournamentId: r.tournament_id, role: r.role, status: r.status }))
}

// The tournaments the CURRENT viewer may manage, for the /quan-ly-giai-dau list. Site Admin → every
// tournament (service-role read, any status). Scoped member → ONLY the tournaments where they hold an
// ACTIVE membership (self-read via RLS resolves the ids; the tournament rows are then fetched with the
// service-role client so a manager sees draft/archived detail too). Anonymous / no-membership → [].
// Security is enforced by the membership set, NOT by client-side filtering.
export async function listManageableTournaments(): Promise<ManageableTournament[]> {
  const { checkIsAdmin } = await import('@/lib/supabase/admin')
  const siteAdmin = await checkIsAdmin()
  const admin = createAdminClient()

  function mapRows(
    rows: {
      id: string
      slug: string
      name: string
      status: string
      starts_at: string | null
      ends_at: string | null
      location: string | null
      updated_at: string
      tournament_events: { count: number }[] | null
    }[],
    roleFor: (id: string) => 'site_admin' | TournamentRole,
  ): ManageableTournament[] {
    return rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      status: r.status,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      location: r.location,
      eventCount: Array.isArray(r.tournament_events) && r.tournament_events.length > 0 ? r.tournament_events[0]?.count ?? 0 : 0,
      updatedAt: r.updated_at,
      viewerRole: roleFor(r.id),
    }))
  }

  if (siteAdmin) {
    const { data } = await admin
      .from('tournaments')
      .select('id, slug, name, status, starts_at, ends_at, location, updated_at, tournament_events(count)')
      .order('updated_at', { ascending: false })
    return mapRows((data as never[]) ?? [], () => 'site_admin')
  }

  // Scoped: resolve the viewer's ACTIVE memberships (self-read RLS), then load just those tournaments.
  const supabase = createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return []
  const { data: memberships } = await supabase
    .from('tournament_members')
    .select('tournament_id, role, status')

  const roleByTournament = new Map<string, TournamentRole>()
  for (const m of (memberships as { tournament_id: string; role: string; status: string }[] | null) ?? []) {
    if (m.status === 'active' && isTournamentRole(m.role)) roleByTournament.set(m.tournament_id, m.role)
  }
  const ids = Array.from(roleByTournament.keys())
  if (ids.length === 0) return []

  const { data } = await admin
    .from('tournaments')
    .select('id, slug, name, status, starts_at, ends_at, location, updated_at, tournament_events(count)')
    .in('id', ids)
    .order('updated_at', { ascending: false })
  return mapRows((data as never[]) ?? [], (id) => roleByTournament.get(id) ?? 'scorekeeper')
}

// True when the signed-in viewer holds at least one ACTIVE scoped membership (any tournament). Drives
// the "Quản lý giải đấu" navigation entry for non-admins. Self-read via RLS; anon → false.
export async function viewerHasActiveTournamentRole(): Promise<boolean> {
  const supabase = createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return false
  const { data } = await supabase
    .from('tournament_members')
    .select('tournament_id')
    .eq('status', 'active')
    .limit(1)
  return Array.isArray(data) && data.length > 0
}

// The current viewer's scoped role in ONE tournament (+ their global Site-Admin flag). Site Admins
// have full access without a membership row, so `role` may be null while access is total.
export async function getCurrentUserTournamentRole(
  tournamentId: string,
): Promise<CurrentUserTournamentRole> {
  const { checkIsAdmin } = await import('@/lib/supabase/admin')
  const siteAdmin = await checkIsAdmin()

  const supabase = createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { role: null, siteAdmin }

  const { data } = await supabase
    .from('tournament_members')
    .select('role, status')
    .eq('tournament_id', tournamentId)
    .maybeSingle()
  const role =
    data && data.status === 'active' && isTournamentRole(data.role) ? (data.role as TournamentRole) : null
  return { role, siteAdmin }
}

// Site Admin's per-tournament member list. Gated by members.manage (Site Admin only in 15B-1) so a
// scoped manager/scorekeeper can never enumerate the whole membership table.
export async function listTournamentMembersForSiteAdmin(
  tournamentId: string,
): Promise<ListMembersResult> {
  const check = await checkTournamentPermission(tournamentId, 'members.manage')
  if (!check.ok) return { ok: false, error: check.error }

  const admin = createAdminClient()
  const { data } = await admin
    .from('tournament_members')
    .select('id, tournament_id, user_id, email_normalized, role, status, invited_at, accepted_at, revoked_at, version, updated_at')
    .eq('tournament_id', tournamentId)
    .order('invited_at', { ascending: true })

  const rows = (Array.isArray(data) ? data : []).filter((r) => isTournamentRole((r as { role?: unknown }).role))

  // Resolve display names for the bound (claimed) users in ONE query — no per-row fan-out.
  const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter((id): id is string => !!id)))
  const nameById = new Map<string, string | null>()
  if (userIds.length > 0) {
    const { data: profiles } = await admin.from('profiles').select('id, display_name').in('id', userIds)
    for (const p of (profiles as { id: string; display_name: string | null }[] | null) ?? []) {
      nameById.set(p.id, p.display_name ?? null)
    }
  }

  const members: TournamentMemberRow[] = rows.map((r) => ({
    id: r.id,
    tournamentId: r.tournament_id,
    userId: r.user_id ?? null,
    email: r.email_normalized,
    displayName: r.user_id ? nameById.get(r.user_id) ?? null : null,
    role: r.role as TournamentRole,
    status: r.status,
    invitedAt: r.invited_at,
    acceptedAt: r.accepted_at ?? null,
    revokedAt: r.revoked_at ?? null,
    version: r.version,
    updatedAt: r.updated_at,
  }))
  return { ok: true, members }
}
