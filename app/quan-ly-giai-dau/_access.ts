import 'server-only'
// Shared server-side access helpers for the SCOPED tournament management surface
// (/quan-ly-giai-dau). Unlike /admin/giai-dau (Site-Admin only), these routes admit Site Admins AND
// scoped members (manager / scorekeeper). Every page gates with these helpers; every MUTATION is
// re-checked server-side in the action layer — the UI gate is convenience only.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { TournamentCapabilities } from '@/lib/tournaments/permissions/server'
import type { EventWorkspaceCaps } from '@/components/tournaments/admin/EventWorkspace'
import type { KnockoutWorkspaceCaps } from '@/components/tournaments/admin/KnockoutWorkspace'
import type { ManageableTournament } from '@/lib/tournaments/members'

// The route prefix the shared workspace components are mounted under here.
export const MANAGEMENT_BASE = '/quan-ly-giai-dau'

// Redirect anonymous callers to login (returning them here after). Returns the signed-in user id.
export async function requireManagementUser(nextPath: string = MANAGEMENT_BASE): Promise<string> {
  const { data } = await createClient().auth.getUser()
  if (!data.user) redirect(`/login?next=${encodeURIComponent(nextPath)}`)
  return data.user.id
}

// Whether the caller is signed in at all (for choosing login-redirect vs not-found on a denial).
export async function isSignedIn(): Promise<boolean> {
  const { data } = await createClient().auth.getUser()
  return !!data.user
}

// Map a viewer's per-tournament capabilities → the EventWorkspace tab capabilities. A scorekeeper
// (score.manage only) collapses to a score-only workspace; a manager/Site-Admin gets everything.
export function eventWorkspaceCaps(caps: TournamentCapabilities): EventWorkspaceCaps {
  return {
    competitors: caps.can('competitor.manage'),
    groups: caps.can('group.manage'),
    score: caps.can('score.manage'),
    ties: caps.can('tie.manage'),
    bracket: caps.can('bracket.manage'),
  }
}

// Same mapping for the pure-knockout workspace.
export function knockoutWorkspaceCaps(caps: TournamentCapabilities): KnockoutWorkspaceCaps {
  return {
    competitors: caps.can('competitor.manage'),
    bracket: caps.can('bracket.manage'),
    score: caps.can('score.manage'),
  }
}

// The status-action button capabilities (publish / archive / hard-delete) for the list + detail.
export function statusActionCaps(caps: TournamentCapabilities): {
  publish: boolean
  archive: boolean
  delete: boolean
} {
  return {
    publish: caps.can('tournament.publish'),
    archive: caps.can('tournament.archive'),
    delete: caps.can('tournament.delete'),
  }
}

// Convenience status-action caps derived from the LIST viewerRole (avoids a per-row permission
// resolve). Site Admin → all; manager → publish/archive (no hard-delete); scorekeeper → none.
export function listRowStatusCaps(role: ManageableTournament['viewerRole']): {
  publish: boolean
  archive: boolean
  delete: boolean
  canEdit: boolean
  showActions: boolean
} {
  // Owner has the SAME row actions as a Site Admin (incl. delete-draft), scoped to their tournament.
  if (role === 'site_admin' || role === 'owner')
    return { publish: true, archive: true, delete: true, canEdit: true, showActions: true }
  if (role === 'manager') return { publish: true, archive: true, delete: false, canEdit: true, showActions: true }
  // scorekeeper: view only
  return { publish: false, archive: false, delete: false, canEdit: false, showActions: false }
}
