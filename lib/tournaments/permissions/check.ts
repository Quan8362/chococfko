// The pure permission decision function. Given a resolved PermissionSubject and a required
// permission, decide allow/deny — deterministically, with NO I/O. All authentication, Site-Admin
// detection and membership lookup happens in the server layer (server.ts); this module only
// computes the answer so it is fully unit-testable.
//
// Decision order (mirrors the server checker, minus the I/O steps):
//   1. Site Admin        → all permissions.
//   2. Active membership → role's permission set (roles.ts).
//   3. Otherwise         → nothing (pending/revoked/no-membership grant NO permission).

import { ALL_PERMISSIONS, permissionsForRole } from './roles.ts'
import {
  isTournamentPermission,
  type PermissionSubject,
  type TournamentPermission,
} from './types.ts'
import { TournamentPermissionError } from './errors.ts'

// The full, resolved permission set for a subject. Site Admin gets everything; an ACTIVE member
// gets its role's set; anyone else gets an empty set. Non-active membership (pending/revoked)
// contributes nothing — the status gate lives here, not in the caller.
export function resolvePermissions(subject: PermissionSubject): ReadonlySet<TournamentPermission> {
  if (subject.siteAdmin) {
    return new Set<TournamentPermission>(ALL_PERMISSIONS)
  }
  const m = subject.membership
  if (m && m.status === 'active') {
    return new Set<TournamentPermission>(permissionsForRole(m.role))
  }
  return new Set<TournamentPermission>()
}

// Boolean check: does the subject hold `permission`? An unknown permission token can never be
// granted (fail-closed).
export function subjectCan(subject: PermissionSubject, permission: TournamentPermission): boolean {
  if (!isTournamentPermission(permission)) return false
  return resolvePermissions(subject).has(permission)
}

// Throwing variant for server call-sites that want a typed denial. An unknown permission token is
// rejected as INVALID_PERMISSION; a valid-but-missing one as FORBIDDEN.
export function assertSubjectCan(
  subject: PermissionSubject,
  permission: TournamentPermission,
  ctx: { tournamentId?: string | null } = {},
): void {
  if (!isTournamentPermission(permission)) {
    throw new TournamentPermissionError(
      'INVALID_PERMISSION',
      `Unknown permission: ${String(permission)}`,
      { permission: String(permission), tournamentId: ctx.tournamentId ?? null },
    )
  }
  if (subjectCan(subject, permission)) return
  throw new TournamentPermissionError('FORBIDDEN', `Missing permission: ${permission}`, {
    permission,
    tournamentId: ctx.tournamentId ?? null,
  })
}
