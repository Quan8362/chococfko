// Tests for the PURE poker seat-identity projection (seatIdentity.ts) — the rules shared by the
// felt seat pods and the bottom hero band. Proves: authoritative occupancy, public-safe avatar
// resolution, deterministic initials fallback, and that a plate shows the TABLE stack only.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isSeatOccupied,
  seatAvatarUrl,
  seatInitials,
  seatPlate,
} from './seatIdentity.ts'

test('isSeatOccupied is true ONLY when a real user id is present', () => {
  assert.equal(isSeatOccupied({ userId: '11111111-1111-1111-1111-111111111111' }), true)
  assert.equal(isSeatOccupied({ userId: null }), false)
  assert.equal(isSeatOccupied({ userId: '   ' }), false)
  assert.equal(isSeatOccupied({}), false)
})

test('occupancy is NOT inferred from a stack or a name (authoritative user id only)', () => {
  // A ghost row with chips but no owner must read as empty — mirrors the felt `s && s.userId`.
  assert.equal(isSeatOccupied({ userId: null, stack: 20000, displayName: 'Quan' }), false)
})

test('seatAvatarUrl returns a trimmed URL, or null for missing/blank', () => {
  assert.equal(seatAvatarUrl({ avatarUrl: 'https://cdn/avatar.png' }), 'https://cdn/avatar.png')
  assert.equal(seatAvatarUrl({ avatarUrl: '  https://cdn/a.png  ' }), 'https://cdn/a.png')
  assert.equal(seatAvatarUrl({ avatarUrl: '' }), null)
  assert.equal(seatAvatarUrl({ avatarUrl: '   ' }), null)
  assert.equal(seatAvatarUrl({ avatarUrl: null }), null)
  assert.equal(seatAvatarUrl({}), null)
})

test('seatInitials derives deterministic 1–2 char fallback initials from the OWN name', () => {
  assert.equal(seatInitials('Quan Luong Van'), 'QU')
  assert.equal(seatInitials('a'), 'A')
  assert.equal(seatInitials('  bo  '), 'BO')
  assert.equal(seatInitials(''), '?')
  assert.equal(seatInitials(null), '?')
  assert.equal(seatInitials(undefined), '?')
})

test('seatPlate exposes public-safe identity + the TABLE stack (never negative/fractional)', () => {
  const p = seatPlate({
    userId: 'u1',
    displayName: '  Quan Luong Van  ',
    avatarUrl: 'https://cdn/avatar.png',
    stack: 20000,
  })
  assert.deepEqual(p, {
    displayName: 'Quan Luong Van',
    avatarUrl: 'https://cdn/avatar.png',
    initials: 'QU',
    stack: 20000,
  })
})

test('seatPlate falls back to initials when the avatar is missing', () => {
  const p = seatPlate({ userId: 'u1', displayName: 'Bo', avatarUrl: null, stack: 500 })
  assert.equal(p.avatarUrl, null)
  assert.equal(p.initials, 'BO')
})

test('seatPlate coerces a bad stack to a safe non-negative integer', () => {
  assert.equal(seatPlate({ stack: -5 }).stack, 0)
  assert.equal(seatPlate({ stack: 12.9 }).stack, 12)
  assert.equal(seatPlate({}).stack, 0)
})

test('seatPlate carries ONLY public identity fields (no leakage of extra props)', () => {
  // Even if a caller passes private-looking extras, the plate is built from a fixed field set.
  const p = seatPlate({
    userId: 'u1',
    displayName: 'Quan',
    avatarUrl: 'https://cdn/a.png',
    stack: 100,
    // @ts-expect-error — extras are ignored, never copied onto the plate
    email: 'secret@example.com',
    // @ts-expect-error
    cards: ['As', 'Kd'],
  })
  assert.deepEqual(Object.keys(p).sort(), ['avatarUrl', 'displayName', 'initials', 'stack'])
})
