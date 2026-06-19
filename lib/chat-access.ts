// Chat-specific scope decisions — PURE helpers + types.
// NO server-only imports here, so this is safe to import from client components
// (the ChatClient scope tabs / create-room modal). Server-side membership lookups
// live in `@/lib/access-server`; the database independently enforces the same
// rules via RLS (migration_chat_internal_access.sql).
//
// This mirrors the shared community vs fko_internal model in `@/lib/access`. We
// import the TYPES from there (type-only imports are erased at runtime, so the
// `node --test` type-stripping runner never has to resolve the `@/` alias) and
// re-state the few trivial scope predicates locally, keeping behaviour identical
// to `canAccessScope` / `parseScopeParam` / `resolvePostScope`.

import type { Scope, UserAccess } from '@/lib/access'

export type { Scope, UserAccess }

// The two chat tabs map 1:1 to the two scopes.
export type ChatTab = 'community' | 'fko_internal'

// Mirrors lib/access.ts: admins implicitly get internal access so they can moderate.
function canAccessScope(access: UserAccess, scope: Scope): boolean {
  if (scope === 'community') return true
  return access.isInternal || access.isAdmin
}

// Mirrors lib/access.ts parseScopeParam: anything but the exact internal token → community.
function parseScopeParam(raw: string | undefined | null): Scope {
  return raw === 'fko_internal' ? 'fko_internal' : 'community'
}

// A room/conversation as far as access decisions are concerned. Scope lives on
// the parent (room or DM conversation); messages inherit it.
export interface RoomScopeInfo {
  scope: Scope
  isPrivate: boolean
  isMember: boolean
}

// Can the viewer SEE/ENTER this room?
//   - scope must be allowed (community = everyone; internal = active member/admin)
//   - private rooms additionally require actual membership in that room
//     (internal membership alone never reveals every private internal group)
export function canViewRoom(room: RoomScopeInfo, access: UserAccess): boolean {
  if (!canAccessScope(access, room.scope)) return false
  if (room.isPrivate && !room.isMember) return false
  return true
}

// Can the viewer post into a room they can view? (Same gate — kept separate so
// callers read clearly; a viewer who cannot view cannot send.)
export function canSendToRoom(room: RoomScopeInfo, access: UserAccess): boolean {
  return canViewRoom(room, access)
}

// Direct-message access: the caller must be a participant AND the scope must be
// allowed. An internal DM additionally requires both participants be active
// internal members — that pairing rule is enforced where the DM is created /
// in the DB; here we gate the *viewer's* access to an existing conversation.
export function canEnterDm(
  dm: { scope: Scope },
  access: UserAccess,
  isParticipant: boolean,
): boolean {
  if (!isParticipant) return false
  return canAccessScope(access, dm.scope)
}

// Is a brand-new internal DM allowed between these two users? Both must be
// active internal members. Community DMs are always allowed between eligible
// authenticated users.
export function canCreateInternalDm(
  user1IsInternal: boolean,
  user2IsInternal: boolean,
): boolean {
  return user1IsInternal && user2IsInternal
}

// Resolve the scope a viewer is allowed to CREATE a room with from an untrusted
// client value. A non-member can never create an internal room (forced down to
// community — never silently escalated).
export function resolveNewRoomScope(
  raw: string | undefined | null,
  access: UserAccess,
): Scope {
  const requested = parseScopeParam(raw)
  return canAccessScope(access, requested) ? requested : 'community'
}

// Tab <-> scope is identity, but go through a parser so a forged tab string can
// never select internal for an ineligible viewer (caller still validates via
// validateRequestedScope for reads).
export function roomScopeForTab(tab: string | undefined | null): Scope {
  return parseScopeParam(tab)
}

// Should the scope tab bar be shown at all? Only active internal members (and
// admins, who have internal access) ever see the second tab. Community users
// get a plain heading — never a one-item tab bar or a locked placeholder.
export function showsScopeTabs(access: UserAccess): boolean {
  return access.isInternal || access.isAdmin
}
