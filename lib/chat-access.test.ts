// Framework-free tests for the pure chat-scope helpers.
// Run with:  npm run test   (node --test, type-stripping)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  canViewRoom,
  canSendToRoom,
  canEnterDm,
  canCreateInternalDm,
  resolveNewRoomScope,
  roomScopeForTab,
  showsScopeTabs,
  type UserAccess,
} from './chat-access.ts'

const anon: UserAccess = { userId: null, isInternal: false, isAdmin: false }
const community: UserAccess = { userId: 'u1', isInternal: false, isAdmin: false }
const internal: UserAccess = { userId: 'u2', isInternal: true, isAdmin: false }
const admin: UserAccess = { userId: 'u3', isInternal: false, isAdmin: true }

// ── Public rooms ────────────────────────────────────────────────────────────
test('public community room: every authenticated viewer can view', () => {
  const room = { scope: 'community' as const, isPrivate: false, isMember: false }
  for (const a of [community, internal, admin]) {
    assert.equal(canViewRoom(room, a), true)
  }
})

test('public internal room: only internal members / admins', () => {
  const room = { scope: 'fko_internal' as const, isPrivate: false, isMember: false }
  assert.equal(canViewRoom(room, community), false)
  assert.equal(canViewRoom(room, anon), false)
  assert.equal(canViewRoom(room, internal), true)
  assert.equal(canViewRoom(room, admin), true)
})

// ── Private rooms: scope AND membership both required ────────────────────────
test('private community room needs membership even for an internal member', () => {
  const notMember = { scope: 'community' as const, isPrivate: true, isMember: false }
  const member = { scope: 'community' as const, isPrivate: true, isMember: true }
  assert.equal(canViewRoom(notMember, internal), false)
  assert.equal(canViewRoom(notMember, community), false)
  assert.equal(canViewRoom(member, community), true)
})

test('private internal room: internal membership alone is NOT enough', () => {
  const notMember = { scope: 'fko_internal' as const, isPrivate: true, isMember: false }
  const member = { scope: 'fko_internal' as const, isPrivate: true, isMember: true }
  // internal member who is not in the group cannot view it
  assert.equal(canViewRoom(notMember, internal), false)
  // community user can never view it, even as a "member" row (defense in depth)
  assert.equal(canViewRoom(member, community), false)
  // internal member who IS in the group can view it
  assert.equal(canViewRoom(member, internal), true)
})

test('canSendToRoom mirrors canViewRoom', () => {
  const room = { scope: 'fko_internal' as const, isPrivate: false, isMember: false }
  assert.equal(canSendToRoom(room, community), false)
  assert.equal(canSendToRoom(room, internal), true)
})

// ── Direct messages ──────────────────────────────────────────────────────────
test('canEnterDm: participant + scope both checked', () => {
  const internalDm = { scope: 'fko_internal' as const }
  const communityDm = { scope: 'community' as const }
  // non-participant denied regardless of scope/role
  assert.equal(canEnterDm(internalDm, internal, false), false)
  assert.equal(canEnterDm(communityDm, community, false), false)
  // participant + scope-ok
  assert.equal(canEnterDm(internalDm, internal, true), true)
  // community participant cannot enter an existing internal DM
  assert.equal(canEnterDm(internalDm, community, true), false)
  // a revoked member (now community) loses access to the internal DM
  assert.equal(canEnterDm(internalDm, community, true), false)
  // community DM is open to its participants
  assert.equal(canEnterDm(communityDm, community, true), true)
})

test('canCreateInternalDm requires both participants internal', () => {
  assert.equal(canCreateInternalDm(true, true), true)
  assert.equal(canCreateInternalDm(true, false), false)
  assert.equal(canCreateInternalDm(false, true), false)
  assert.equal(canCreateInternalDm(false, false), false)
})

// ── Scope resolution from untrusted input ────────────────────────────────────
test('resolveNewRoomScope never lets a non-member create an internal room', () => {
  assert.equal(resolveNewRoomScope('fko_internal', community), 'community')
  assert.equal(resolveNewRoomScope('fko_internal', anon), 'community')
  assert.equal(resolveNewRoomScope('fko_internal', internal), 'fko_internal')
  assert.equal(resolveNewRoomScope('fko_internal', admin), 'fko_internal')
  assert.equal(resolveNewRoomScope('community', internal), 'community')
  assert.equal(resolveNewRoomScope(undefined, internal), 'community')
})

test('roomScopeForTab parses safely (forged tab cannot select internal alone)', () => {
  assert.equal(roomScopeForTab('fko_internal'), 'fko_internal')
  assert.equal(roomScopeForTab('community'), 'community')
  assert.equal(roomScopeForTab('FKO_INTERNAL'), 'community')
  assert.equal(roomScopeForTab('garbage'), 'community')
  assert.equal(roomScopeForTab(undefined), 'community')
})

// ── Tab visibility ────────────────────────────────────────────────────────────
test('only internal members / admins see the scope tabs', () => {
  assert.equal(showsScopeTabs(community), false)
  assert.equal(showsScopeTabs(anon), false)
  assert.equal(showsScopeTabs(internal), true)
  assert.equal(showsScopeTabs(admin), true)
})
