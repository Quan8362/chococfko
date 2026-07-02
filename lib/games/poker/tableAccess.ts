// ── Private-table access rules + password hashing (pure) ─────────────────────────────────
//
// PURE module — no Supabase, no React, no browser API. Tested by tableAccess.test.ts.
//
// This is the SINGLE source of truth for two authoritative facts the poker server relies on:
//   1. How a private-table password is hashed and verified (scrypt, salted, never plaintext).
//   2. Whether a caller is allowed to take a seat at / view a private table.
//
// 🔴 SECURITY (security-model §A1/A2): the stored value is a salted scrypt hash — the plaintext
// password is NEVER stored and NEVER returned to any client. Verification is constant-time.
// Access to a PRIVATE table's seat is gated: a caller must have proven the password (recorded as
// a membership row by the password-validating join), be the host who created it, or already be
// seated (a reconnect). A public table is always open. The browser cannot decide this — the
// server evaluates it before any seat reservation or coin movement.

import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'

// scrypt$<saltHex>$<hashHex> — a self-describing, salted, one-way password record.
export function hashTablePassword(plain: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(plain, salt, 32)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

// Constant-time verification. Any malformed stored record verifies to false (never throws).
export function verifyTablePassword(plain: string, stored: string | null | undefined): boolean {
  if (!stored) return false
  const [scheme, saltHex, hashHex] = stored.split('$')
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false
  const expected = Buffer.from(hashHex, 'hex')
  if (expected.length === 0) return false
  const actual = scryptSync(plain, Buffer.from(saltHex, 'hex'), expected.length)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

export interface PrivateAccessInput {
  // Whether the table is private (public tables are always accessible).
  readonly isPrivate: boolean
  // The caller created (hosts) this table — implicitly knows the password.
  readonly isCreator: boolean
  // The caller already holds a seat at this table (a reconnect must never be locked out).
  readonly isSeated: boolean
  // The caller has a membership row — recorded ONLY after passing the password check.
  readonly isMember: boolean
}

// Whether the caller may take a seat at / view a private table. A direct-URL visitor who has not
// passed the password (no membership), is not the host, and is not already seated is DENIED — the
// join/seat path never reaches the seat reservation, so no seat or coin state changes.
export function privateTableAccessAllowed(i: PrivateAccessInput): boolean {
  if (!i.isPrivate) return true
  return i.isCreator || i.isSeated || i.isMember
}
