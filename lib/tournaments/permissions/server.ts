import 'server-only'
// Server-side permission RESOLVER + CHECKER for the tournament module. This is the ONLY place that
// touches auth / ADMIN_EMAILS / the DB to build a PermissionSubject; the decision itself is the pure
// check.ts. Importing this pulls in next/headers + the service-role client — never import it from a
// client component. Pure helpers/types live in lib/tournaments/permissions (index.ts).

import { checkIsAdmin, createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {
  isMembershipStatus,
  isTournamentRole,
  resolvePermissions,
  subjectCan,
  type MembershipStatus,
  type PermissionMembership,
  type PermissionSubject,
  type TournamentPermission,
  type TournamentRole,
} from './index.ts'
import type { PermissionDenialCode } from './errors.ts'

// The authenticated identity behind a request (or the anonymous sentinel).
interface Identity {
  userId: string | null
  email: string | null
}

async function resolveIdentity(): Promise<Identity> {
  try {
    const { data } = await createClient().auth.getUser()
    return { userId: data.user?.id ?? null, email: data.user?.email ?? null }
  } catch {
    return { userId: null, email: null }
  }
}

// Resolve the caller's ACTIVE membership in ONE specific tournament, via the service-role client so
// the check never depends on the caller's own RLS grant. Filtering by (tournament_id, user_id)
// makes cross-tournament IDOR impossible — a membership in tournament B can never satisfy a check
// for tournament A. Only an ACTIVE row confers anything (see check.ts); pending/revoked resolve to
// that membership object and are denied by the pure checker's status gate.
async function resolveMembership(
  tournamentId: string,
  userId: string,
): Promise<PermissionMembership | null> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('tournament_members')
      .select('role, status')
      .eq('tournament_id', tournamentId)
      .eq('user_id', userId)
      .maybeSingle()
    if (!data) return null
    if (!isTournamentRole(data.role) || !isMembershipStatus(data.status)) return null
    return { role: data.role, status: data.status }
  } catch {
    return null
  }
}

// Build the PermissionSubject for the current request against a tournament. Follows the mandated
// order: authenticate → Site Admin short-circuit → else resolve this tournament's membership.
export async function resolveTournamentSubject(
  tournamentId: string,
): Promise<{ subject: PermissionSubject; identity: Identity }> {
  const identity = await resolveIdentity()

  // Site Admin is decided from ADMIN_EMAILS (checkIsAdmin re-reads the caller's own auth user); a
  // Site Admin needs NO membership row and short-circuits to "all permissions".
  const siteAdmin = await checkIsAdmin()
  if (siteAdmin) {
    return { subject: { siteAdmin: true, membership: null }, identity }
  }

  // Not a Site Admin and not signed in → no permissions.
  if (!identity.userId) {
    return { subject: { siteAdmin: false, membership: null }, identity }
  }

  const membership = await resolveMembership(tournamentId, identity.userId)
  return { subject: { siteAdmin: false, membership }, identity }
}

// The viewer's resolved capabilities in ONE tournament — for CONVENIENCE UI gating only (which
// buttons/tabs to render). The server STILL re-checks every mutation via checkTournamentPermission;
// hiding a control is never the security boundary. `permissions` is the exact granted set (Site
// Admin → all; active member → role set; otherwise empty).
export interface TournamentCapabilities {
  siteAdmin: boolean
  role: TournamentRole | null
  status: MembershipStatus | null
  permissions: ReadonlySet<TournamentPermission>
  can: (p: TournamentPermission) => boolean
  // True when the viewer may open the management workspace for this tournament at all.
  canView: boolean
}

// Resolve the viewer's capabilities in a tournament (Site Admin short-circuit → all). Used by the
// scoped management routes to gate the page (canView) and tailor the UI to the viewer's role.
export async function resolveTournamentCapabilities(
  tournamentId: string,
): Promise<TournamentCapabilities> {
  const { subject } = await resolveTournamentSubject(tournamentId)
  const permissions = resolvePermissions(subject)
  const role = subject.membership && subject.membership.status === 'active' ? subject.membership.role : null
  const status = subject.membership?.status ?? null
  return {
    siteAdmin: subject.siteAdmin,
    role,
    status,
    permissions,
    can: (p: TournamentPermission) => permissions.has(p),
    canView: permissions.has('tournament.view'),
  }
}

// Result of a server permission check. On success the resolved actor id is returned so the caller
// can attribute the audit log; the mutation creates its admin client ONLY after `ok: true`.
export type TournamentPermissionCheck =
  | { ok: true; actorId: string | null; siteAdmin: boolean }
  | { ok: false; error: PermissionDenialCode }

// The server-only permission checker. Order:
//   1. authenticate,
//   2. resolve Site Admin (allow-all short-circuit),
//   3. otherwise resolve THIS tournament's active membership + apply the pure role→permission check,
//   4. return a TYPED denial when the permission is missing.
// Callers MUST NOT create a service-role client for the mutation before this returns ok.
export async function checkTournamentPermission(
  tournamentId: string,
  permission: TournamentPermission,
): Promise<TournamentPermissionCheck> {
  if (!tournamentId) return { ok: false, error: 'FORBIDDEN' }

  const { subject, identity } = await resolveTournamentSubject(tournamentId)

  if (subjectCan(subject, permission)) {
    return { ok: true, actorId: identity.userId, siteAdmin: subject.siteAdmin }
  }

  // Distinguish "no identity at all" from "signed in but not allowed" for the caller/UI.
  if (!subject.siteAdmin && !identity.userId) {
    return { ok: false, error: 'NOT_AUTHENTICATED' }
  }
  return { ok: false, error: 'FORBIDDEN' }
}
