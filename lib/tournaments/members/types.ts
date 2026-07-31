// Typed shapes for the tournament membership service. PURE types — safe to import anywhere.
import type { MembershipStatus, TournamentRole } from '@/lib/tournaments/permissions'
import type { PermissionDenialCode } from '@/lib/tournaments/permissions'

// A membership row as the Site Admin management view sees it (service-role read).
export interface TournamentMemberRow {
  id: string
  tournamentId: string
  userId: string | null
  email: string // email_normalized
  // Display name of the bound user (once they've claimed), resolved from profiles. Null until claimed.
  displayName: string | null
  role: TournamentRole
  status: MembershipStatus
  invitedAt: string
  acceptedAt: string | null
  revokedAt: string | null
  version: number
  updatedAt: string
}

// The current viewer's own membership summary (self-read).
export interface TournamentMembershipSummary {
  tournamentId: string
  role: TournamentRole
  status: MembershipStatus
}

// The current viewer's resolved role in one tournament (+ whether they are a global Site Admin).
export interface CurrentUserTournamentRole {
  role: TournamentRole | null
  siteAdmin: boolean
}

// A tournament the viewer may manage, with the role that grants that access. Site Admins see every
// tournament (viewerRole 'site_admin'); scoped members see only their ACTIVE-membership tournaments.
export interface ManageableTournament {
  id: string
  slug: string
  name: string
  status: string
  startsAt: string | null
  endsAt: string | null
  location: string | null
  eventCount: number
  updatedAt: string
  viewerRole: 'site_admin' | TournamentRole
}

// Error vocabulary for membership mutations. Reuses the permission denial codes and adds the
// service-layer/validation ones. Never leaks a raw SQL/auth error.
export type MemberErrorCode =
  | PermissionDenialCode // NOT_AUTHENTICATED | FORBIDDEN | INVALID_ROLE | INVALID_PERMISSION
  | 'invalid'
  | 'invalid_email'
  | 'invalid_role'
  | 'not_found'
  | 'already_active'
  | 'cannot_modify_owner' // owner rows are never re-roled/revoked via the member panel (15F-1)
  | 'version_conflict'
  | 'unknown'

export type MemberMutationResult =
  | { ok: true; id: string }
  | { ok: false; error: MemberErrorCode }

export interface ClaimedInvitation {
  tournamentId: string
  role: TournamentRole
}

export type ClaimInvitationsResult =
  | { ok: true; claimed: ClaimedInvitation[] }
  | { ok: false; error: PermissionDenialCode }

export type ListMembersResult =
  | { ok: true; members: TournamentMemberRow[] }
  | { ok: false; error: PermissionDenialCode }
