// Run with: node --test lib/tournaments/permissions/permissions.test.ts
// Unit coverage for the PURE permission engine (types / roles / check / errors). No I/O.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ALL_PERMISSIONS,
  ROLE_PERMISSIONS,
  TOURNAMENT_PERMISSIONS,
  TOURNAMENT_ROLES,
  isMembershipStatus,
  isTournamentPermission,
  isTournamentRole,
  isInvitableRole,
  permissionsForRole,
  resolvePermissions,
  roleGrantsPermission,
  subjectCan,
  assertSubjectCan,
  isTournamentPermissionError,
  type PermissionSubject,
  type TournamentPermission,
} from './index.ts'

const admin = (): PermissionSubject => ({ siteAdmin: true, membership: null })
const owner = (status: 'pending' | 'active' | 'revoked' = 'active'): PermissionSubject => ({
  siteAdmin: false,
  membership: { role: 'owner', status },
})
const manager = (status: 'pending' | 'active' | 'revoked' = 'active'): PermissionSubject => ({
  siteAdmin: false,
  membership: { role: 'manager', status },
})
const scorekeeper = (status: 'pending' | 'active' | 'revoked' = 'active'): PermissionSubject => ({
  siteAdmin: false,
  membership: { role: 'scorekeeper', status },
})
const nobody = (): PermissionSubject => ({ siteAdmin: false, membership: null })

// (1) Site Admin has EVERY permission — with no membership at all.
test('site admin holds every permission without a membership', () => {
  const a = admin()
  for (const p of TOURNAMENT_PERMISSIONS) {
    assert.equal(subjectCan(a, p), true, `admin should have ${p}`)
  }
  assert.equal(resolvePermissions(a).size, TOURNAMENT_PERMISSIONS.length)
})

// (6) Site Admin needs no membership row (already covered above, asserted explicitly).
test('site admin decision never consults membership', () => {
  const a: PermissionSubject = { siteAdmin: true, membership: { role: 'scorekeeper', status: 'revoked' } }
  assert.equal(subjectCan(a, 'tournament.delete'), true)
  assert.equal(subjectCan(a, 'members.manage'), true)
})

// (2) Manager mapping is exactly the expected set.
test('manager has operational permissions but NOT members.manage or tournament.delete', () => {
  const expected: TournamentPermission[] = [
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
  ]
  assert.deepEqual([...permissionsForRole('manager')].sort(), [...expected].sort())
  assert.equal(subjectCan(manager(), 'members.manage'), false)
  assert.equal(subjectCan(manager(), 'tournament.delete'), false)
  for (const p of expected) assert.equal(subjectCan(manager(), p), true, `manager should have ${p}`)
})

// (3) Scorekeeper is view + score only.
test('scorekeeper has exactly tournament.view + score.manage', () => {
  assert.deepEqual([...permissionsForRole('scorekeeper')].sort(), ['score.manage', 'tournament.view'])
  assert.equal(subjectCan(scorekeeper(), 'tournament.view'), true)
  assert.equal(subjectCan(scorekeeper(), 'score.manage'), true)
  for (const p of TOURNAMENT_PERMISSIONS) {
    if (p === 'tournament.view' || p === 'score.manage') continue
    assert.equal(subjectCan(scorekeeper(), p), false, `scorekeeper must NOT have ${p}`)
  }
})

// Owner holds EVERY per-tournament permission (scoped to their tournament by membership).
test('owner holds every tournament permission (like a Site Admin but scoped by membership)', () => {
  for (const p of TOURNAMENT_PERMISSIONS) {
    assert.equal(subjectCan(owner(), p), true, `owner should have ${p}`)
  }
  assert.equal(subjectCan(owner(), 'members.manage'), true)
  assert.equal(subjectCan(owner(), 'tournament.delete'), true)
  assert.equal(resolvePermissions(owner()).size, TOURNAMENT_PERMISSIONS.length)
})

// (4) Invalid role values are rejected by the guard (never coerced into a role).
test('isTournamentRole accepts the three scoped roles and rejects "admin"', () => {
  assert.equal(isTournamentRole('owner'), true)
  assert.equal(isTournamentRole('manager'), true)
  assert.equal(isTournamentRole('scorekeeper'), true)
  assert.equal(isTournamentRole('admin'), false) // there is NO admin membership role
  assert.equal(isTournamentRole(''), false)
  assert.equal(isTournamentRole(null), false)
  assert.equal(isTournamentRole(42), false)
})

// Owner is NOT invitable — it is granted only by creating the tournament (no second owner / transfer).
test('isInvitableRole allows only manager/scorekeeper (never owner)', () => {
  assert.equal(isInvitableRole('manager'), true)
  assert.equal(isInvitableRole('scorekeeper'), true)
  assert.equal(isInvitableRole('owner'), false)
  assert.equal(isInvitableRole('admin'), false)
  assert.equal(isInvitableRole(null), false)
})

// (5) Invalid permission tokens are rejected (fail-closed).
test('unknown permission tokens are never granted and throw INVALID_PERMISSION', () => {
  assert.equal(isTournamentPermission('score.manage'), true)
  assert.equal(isTournamentPermission('score.destroy'), false)
  // subjectCan is fail-closed for unknown tokens, even for a site admin.
  assert.equal(subjectCan(admin(), 'score.destroy' as TournamentPermission), false)
  assert.throws(
    () => assertSubjectCan(admin(), 'score.destroy' as TournamentPermission),
    (e: unknown) => isTournamentPermissionError(e) && e.code === 'INVALID_PERMISSION',
  )
})

// (7) Pending / revoked membership grants NOTHING.
test('pending and revoked memberships grant no permissions', () => {
  for (const status of ['pending', 'revoked'] as const) {
    assert.equal(resolvePermissions(manager(status)).size, 0, `manager/${status} should have none`)
    assert.equal(subjectCan(manager(status), 'score.manage'), false)
    assert.equal(subjectCan(scorekeeper(status), 'tournament.view'), false)
  }
})

test('a subject with no membership and not site-admin has nothing', () => {
  assert.equal(resolvePermissions(nobody()).size, 0)
  assert.equal(subjectCan(nobody(), 'tournament.view'), false)
})

// (8) Cross-tournament isolation is expressed at the subject boundary: the checker only ever sees
// the membership for the tournament under test. A subject built with membership=null (the caller
// had no membership in THAT tournament) is denied, even if the same user manages another.
test('membership resolved for a different tournament does not leak (null membership → denied)', () => {
  // The server resolves membership per-tournament; a non-member of this tournament arrives as null.
  const outsider: PermissionSubject = { siteAdmin: false, membership: null }
  assert.equal(subjectCan(outsider, 'score.manage'), false)
  assert.throws(
    () => assertSubjectCan(outsider, 'score.manage', { tournamentId: 't-other' }),
    (e: unknown) => isTournamentPermissionError(e) && e.code === 'FORBIDDEN',
  )
})

// Structural guarantees on the mapping tables.
test('ROLE_PERMISSIONS covers exactly the three scoped roles and is frozen', () => {
  assert.deepEqual(Object.keys(ROLE_PERMISSIONS).sort(), ['manager', 'owner', 'scorekeeper'])
  assert.deepEqual([...TOURNAMENT_ROLES], ['owner', 'manager', 'scorekeeper'])
  assert.equal(Object.isFrozen(ROLE_PERMISSIONS), true)
})

test('ALL_PERMISSIONS equals the full vocabulary', () => {
  assert.deepEqual([...ALL_PERMISSIONS].sort(), [...TOURNAMENT_PERMISSIONS].sort())
})

test('roleGrantsPermission matches the mapping (status-independent)', () => {
  assert.equal(roleGrantsPermission('manager', 'rules.manage'), true)
  assert.equal(roleGrantsPermission('manager', 'members.manage'), false)
  assert.equal(roleGrantsPermission('scorekeeper', 'score.manage'), true)
  assert.equal(roleGrantsPermission('scorekeeper', 'tie.manage'), false)
})

test('isMembershipStatus guards the status enum', () => {
  assert.equal(isMembershipStatus('active'), true)
  assert.equal(isMembershipStatus('pending'), true)
  assert.equal(isMembershipStatus('revoked'), true)
  assert.equal(isMembershipStatus('deleted'), false)
  assert.equal(isMembershipStatus(null), false)
})
