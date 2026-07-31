'use server'

// Server actions for the tournament MEMBER-MANAGEMENT panel (Site Admin only). Thin wrappers around
// the 15B-1 membership service — the service performs the permission check (members.manage → Site
// Admin), input validation, (id, tournament_id)-scoped resolution (no cross-tournament IDOR), the
// service-role mutation, the audit write and revalidation. These actions add NOTHING that could
// bypass those checks; they exist only so a Client Component can invoke them.

import {
  inviteTournamentMember,
  changeTournamentMemberRole,
  revokeTournamentMember,
  listTournamentMembersForSiteAdmin,
} from '@/lib/tournaments/members/service'
import type { ListMembersResult, MemberMutationResult } from '@/lib/tournaments/members'

export async function inviteMemberAction(
  tournamentId: string,
  input: { email: string; role: string },
): Promise<MemberMutationResult> {
  return inviteTournamentMember(tournamentId, input)
}

export async function changeMemberRoleAction(
  tournamentId: string,
  memberId: string,
  newRole: string,
  expectedVersion: number,
): Promise<MemberMutationResult> {
  return changeTournamentMemberRole(tournamentId, memberId, newRole, expectedVersion)
}

export async function revokeMemberAction(
  tournamentId: string,
  memberId: string,
  expectedVersion: number,
): Promise<MemberMutationResult> {
  return revokeTournamentMember(tournamentId, memberId, expectedVersion)
}

export async function refreshMembersAction(tournamentId: string): Promise<ListMembersResult> {
  return listTournamentMembersForSiteAdmin(tournamentId)
}
