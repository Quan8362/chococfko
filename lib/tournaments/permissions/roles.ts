// Role → permission mapping — the SINGLE authoritative table. PURE, deterministic, no I/O.
// Any change to what a manager/scorekeeper can do happens HERE and nowhere else.

import {
  TOURNAMENT_PERMISSIONS,
  type TournamentPermission,
  type TournamentRole,
} from './types.ts'

// Site Admin gets every permission — the full token set, frozen so it can't be mutated at runtime.
export const ALL_PERMISSIONS: readonly TournamentPermission[] = Object.freeze([
  ...TOURNAMENT_PERMISSIONS,
])

// Manager: full tournament operation EXCEPT membership administration and hard-delete.
// (No 'members.manage' → cannot invite/change/revoke; no 'tournament.delete'.)
const MANAGER_PERMISSIONS: readonly TournamentPermission[] = Object.freeze([
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
])

// Scorekeeper: view the tournament and record scores — nothing else.
const SCOREKEEPER_PERMISSIONS: readonly TournamentPermission[] = Object.freeze([
  'tournament.view',
  'score.manage',
])

// The deterministic role table. Frozen; keyed by the exact TournamentRole union so adding a role
// without a mapping is a compile error.
export const ROLE_PERMISSIONS: Readonly<Record<TournamentRole, readonly TournamentPermission[]>> =
  Object.freeze({
    manager: MANAGER_PERMISSIONS,
    scorekeeper: SCOREKEEPER_PERMISSIONS,
  })

// Permissions granted to a scoped role. Deterministic and side-effect-free.
export function permissionsForRole(role: TournamentRole): readonly TournamentPermission[] {
  return ROLE_PERMISSIONS[role]
}

// Does a scoped role (ignoring status) include a permission? Callers that also need the ACTIVE
// status gate must use check.ts (subjectCan / assertPermission), which layers status on top.
export function roleGrantsPermission(role: TournamentRole, permission: TournamentPermission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission)
}
