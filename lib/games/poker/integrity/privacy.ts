// ── Poker integrity — PRIVACY primitives (pure, no DB, no React, no secrets) ────────────
//
// The integrity system may correlate accounts by *device* / *network* to surface multi-account
// abuse. Raw device fingerprints and IP addresses are personal data and MUST NOT be stored in
// the clear, logged, or shown to admins. This module provides the minimize→hash pipeline the
// rest of the system uses so that only irreversible, salted tokens ever leave this boundary.
//
// Design contract (see docs/poker/integrity/privacy.md):
//   • A shared-network / shared-device match is a WEAK signal, never proof. It only ever raises a
//     score when it co-occurs with an independent behavioural signal (see scoring.ts).
//   • Raw identifiers are never returned by any function here except the hashing input, which is
//     consumed immediately and discarded by the caller.
//   • Hashing is keyed (HMAC-SHA256) with a server-only salt so tokens cannot be reversed by a
//     rainbow table and are not portable across environments.
//   • IPs are TRUNCATED before hashing (v4 → /24, v6 → /48) so a household/office keeps ONE token
//     rather than a per-device token, deliberately weakening the signal to avoid false positives.

import { createHmac } from 'node:crypto'

// Env var holding the server-only HMAC salt. Never expose to the browser.
export const INTEGRITY_ID_SALT_ENV = 'POKER_INTEGRITY_ID_SALT' as const

// Retention: how long minimized identity tokens and derived risk artefacts are kept. Chosen to be
// long enough to investigate a pattern across a season, short enough to respect data-minimization.
export const INTEGRITY_RETENTION = {
  // Hashed device/network tokens tied to a session.
  identityTokenDays: 90,
  // Derived risk cases + their signal snapshots (evidence for a human review).
  riskCaseDays: 365,
  // Immutable audit of admin actions — kept longest (accountability), never auto-purged here.
  auditDays: 3650,
} as const

export type IdentifierKind = 'ip' | 'device'

// Length of the emitted hex token. 20 hex chars (80 bits) is ample to avoid collisions while
// keeping the stored value compact; the full 256-bit digest is never needed.
const TOKEN_HEX_LEN = 20

function hmacHex(value: string, salt: string): string {
  return createHmac('sha256', salt).update(value).digest('hex').slice(0, TOKEN_HEX_LEN)
}

// ── IP minimization ─────────────────────────────────────────────────────────────────────
// Truncate to the network prefix so many devices behind one NAT/household collapse to one token.
export function minimizeIp(raw: string): string | null {
  const ip = raw.trim().toLowerCase()
  if (!ip) return null
  // IPv4 (optionally embedded) → keep the first three octets, zero the host.
  const v4 = ip.match(/(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})/)
  if (v4) {
    const oct = [v4[1], v4[2], v4[3]].map((o) => Number(o))
    if (oct.some((o) => o > 255)) return null
    return `${oct[0]}.${oct[1]}.${oct[2]}.0/24`
  }
  // IPv6 → keep the first three hextets (/48) which identifies the site, not the device.
  if (ip.includes(':')) {
    const hextets = ip.split(':').filter((h) => h.length > 0)
    if (hextets.length < 3) return null
    return `${hextets.slice(0, 3).join(':')}::/48`
  }
  return null
}

// A device fingerprint is opaque; we only strip whitespace/case before hashing.
export function minimizeDevice(raw: string): string | null {
  const d = raw.trim()
  return d.length ? d : null
}

// Produce the stored, irreversible token for an identifier. Returns null when the input is empty
// or unparseable (caller stores nothing rather than a garbage token).
export function hashIdentifier(kind: IdentifierKind, raw: string, salt: string): string | null {
  if (!salt || salt.length < 8) throw new Error('integrity_salt_missing_or_weak')
  const minimized = kind === 'ip' ? minimizeIp(raw) : minimizeDevice(raw)
  if (minimized == null) return null
  return `${kind}:${hmacHex(`${kind}|${minimized}`, salt)}`
}

// ── Identity overlap ─────────────────────────────────────────────────────────────────────
// A record of which (already-hashed) tokens an account was seen using. This is the ONLY shape
// the correlation layer consumes — it never sees a raw identifier.
export interface AccountIdentityTokens {
  readonly userId: string
  readonly tokens: ReadonlySet<string> // hashed ip:/device: tokens observed for this account
}

export interface IdentityOverlap {
  readonly userA: string
  readonly userB: string
  readonly sharedTokenCount: number
  readonly sharedDevice: boolean // at least one device token in common (stronger than IP alone)
  readonly sharedNetwork: boolean // at least one IP token in common (weak on its own)
}

// Pairwise overlap of hashed tokens between accounts. Household/office IP sharing is expected and
// therefore reported as `sharedNetwork` WITHOUT any suspicion attached; the scorer decides.
export function computeIdentityOverlaps(
  accounts: readonly AccountIdentityTokens[],
): readonly IdentityOverlap[] {
  const out: IdentityOverlap[] = []
  for (let i = 0; i < accounts.length; i++) {
    for (let j = i + 1; j < accounts.length; j++) {
      const a = accounts[i]
      const b = accounts[j]
      let shared = 0
      let dev = false
      let net = false
      for (const tok of Array.from(a.tokens)) {
        if (b.tokens.has(tok)) {
          shared++
          if (tok.startsWith('device:')) dev = true
          if (tok.startsWith('ip:')) net = true
        }
      }
      if (shared === 0) continue
      const [ua, ub] = a.userId < b.userId ? [a.userId, b.userId] : [b.userId, a.userId]
      out.push({ userA: ua, userB: ub, sharedTokenCount: shared, sharedDevice: dev, sharedNetwork: net })
    }
  }
  return out.sort((x, y) => y.sharedTokenCount - x.sharedTokenCount)
}

// Redact any accidental raw identifier out of a value destined for storage/logging. Defence in
// depth for evidence payloads: drops keys that could carry PII and masks IP-looking strings.
const PII_KEY_RE = /(ip|addr|address|fingerprint|device_id|user_agent|useragent|mac|geo|lat|lng|email|phone)/i
const RAW_IP_RE = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/

export function redactPii(input: unknown): Record<string, unknown> {
  if (input == null || typeof input !== 'object') return {}
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (PII_KEY_RE.test(k)) continue
    if (typeof v === 'string' && RAW_IP_RE.test(v)) continue
    if (v == null || typeof v === 'number' || typeof v === 'boolean') { out[k] = v; continue }
    if (typeof v === 'string') { out[k] = v; continue }
    // Nested objects/arrays: recurse shallowly and drop card-ish leaks conservatively.
    if (Array.isArray(v)) { out[k] = v.filter((x) => typeof x === 'number' || typeof x === 'boolean'); continue }
    if (typeof v === 'object') { out[k] = redactPii(v); continue }
  }
  return out
}
