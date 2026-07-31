// Typed permission vocabulary for the tournament module — PURE TypeScript, no I/O, no React,
// no browser/server-only imports. This is the single shared source of truth for:
//   • the two SCOPED tournament roles (manager / scorekeeper) that live in tournament_members;
//   • the typed PERMISSION tokens every mutation is gated on;
//   • the resolved "subject" a permission check runs against.
//
// The global Site Admin is NOT a tournament role and is NEVER stored in tournament_members — it is
// resolved from ADMIN_EMAILS at request time (see lib/tournaments/permissions/server.ts) and is
// modelled here only as the `siteAdmin` boolean on PermissionSubject.

// ── Scoped roles (stored in tournament_members.role) ─────────────────────────────────────────
// There is intentionally NO 'admin' membership role: site-wide admin comes from ADMIN_EMAILS only.
export const TOURNAMENT_ROLES = ['manager', 'scorekeeper'] as const
export type TournamentRole = (typeof TOURNAMENT_ROLES)[number]

// ── Membership status (stored in tournament_members.status) ──────────────────────────────────
// Only `active` grants any permission; pending/revoked never do.
export const MEMBERSHIP_STATUSES = ['pending', 'active', 'revoked'] as const
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number]

// ── Typed permission tokens ──────────────────────────────────────────────────────────────────
// Every server mutation names exactly one of these. Never gate on a broad boolean like
// `isTournamentManager` — always name the concrete capability so role→permission stays the ONE
// mapping in roles.ts.
export const TOURNAMENT_PERMISSIONS = [
  'tournament.view',
  'tournament.update',
  'tournament.publish',
  'tournament.archive',
  'event.manage',
  'competitor.manage',
  'group.manage',
  'bracket.manage',
  'rules.manage',
  'score.manage',
  'tie.manage',
  'members.manage',
  'tournament.delete',
] as const
export type TournamentPermission = (typeof TOURNAMENT_PERMISSIONS)[number]

// ── The subject a permission check runs against ──────────────────────────────────────────────
// Resolved server-side from the authenticated request. `siteAdmin` short-circuits to "all
// permissions"; otherwise `membership` (if any) decides. A subject with no membership and no
// site-admin flag has NO tournament permissions.
export interface PermissionMembership {
  readonly role: TournamentRole
  readonly status: MembershipStatus
}

export interface PermissionSubject {
  // True when the request's authenticated email is in ADMIN_EMAILS. Never derived from membership.
  readonly siteAdmin: boolean
  // The caller's membership in the tournament being checked, or null if none. Only an ACTIVE
  // membership confers permissions — the status is carried so check.ts, not the caller, decides.
  readonly membership: PermissionMembership | null
}

// ── Type guards for untrusted values (form/DB strings) ───────────────────────────────────────
export function isTournamentRole(value: unknown): value is TournamentRole {
  return typeof value === 'string' && (TOURNAMENT_ROLES as readonly string[]).includes(value)
}

export function isMembershipStatus(value: unknown): value is MembershipStatus {
  return typeof value === 'string' && (MEMBERSHIP_STATUSES as readonly string[]).includes(value)
}

export function isTournamentPermission(value: unknown): value is TournamentPermission {
  return typeof value === 'string' && (TOURNAMENT_PERMISSIONS as readonly string[]).includes(value)
}
