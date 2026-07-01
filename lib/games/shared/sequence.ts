// ── Shared multiplayer infra: monotonic state-version & action-sequence reasoning ──
//
// PURE module — no React, no Supabase. Tested by sequence.test.ts.
//
// The realtime model's spine (realtime-model §2): every authoritative table row carries a
// strictly-increasing `state_version`. A client keeps the last version it applied and uses
// these helpers to decide, for each incoming realtime payload, whether to APPLY it, DROP it
// (stale or duplicate), or RECONCILE (a gap means a missed event — fetch the authoritative
// snapshot rather than apply a partial jump). The server uses the same comparison to REJECT
// a stale action (a client acting on an old snapshot, security-model C4 / EC-H2).
//
// `state_version` is a Postgres `bigint`; in JS it arrives as a `number`. Versions only ever
// increment by 1 per accepted transition, so they stay far below Number.MAX_SAFE_INTEGER for
// any realistic table lifetime — a `number` is safe here. (Coin amounts, which can be large,
// use the dedicated safe-integer helpers in coins.ts.)

export type StateVersion = number

export type ActionSeq = number

// What the client reducer should do with an incoming versioned payload.
export type ReconcileDecision = 'apply' | 'drop' | 'reconcile'

function assertVersion(v: number, label: string): void {
  if (!Number.isInteger(v) || v < 0) {
    throw new Error(`${label} must be a non-negative integer version, got ${v}`)
  }
}

// -1 if a < b, 0 if equal, 1 if a > b.
export function compareVersion(a: StateVersion, b: StateVersion): -1 | 0 | 1 {
  assertVersion(a, 'compareVersion(a)')
  assertVersion(b, 'compareVersion(b)')
  return a < b ? -1 : a > b ? 1 : 0
}

// A payload is STALE when its version is at or behind what we've already applied. Stale
// payloads (out-of-order deliveries) must be dropped; the reducer is idempotent (D4).
export function isStaleVersion(incoming: StateVersion, lastSeen: StateVersion): boolean {
  return compareVersion(incoming, lastSeen) <= 0
}

// A payload is a DUPLICATE when its version exactly equals the last applied one. Applying
// it twice is a no-op (EC-I2). Distinguished from "older stale" for clarity/metrics.
export function isDuplicateVersion(incoming: StateVersion, lastSeen: StateVersion): boolean {
  return compareVersion(incoming, lastSeen) === 0
}

// A GAP means we missed at least one event between lastSeen and incoming. We must NOT apply
// a partial jump; we trigger a full reconcile against the authoritative row (realtime §2).
export function isVersionGap(incoming: StateVersion, lastSeen: StateVersion): boolean {
  return incoming > lastSeen + 1
}

// The contiguous next version (the happy path: exactly one transition ahead).
export function isNextVersion(incoming: StateVersion, lastSeen: StateVersion): boolean {
  return incoming === lastSeen + 1
}

export function nextVersion(v: StateVersion): StateVersion {
  assertVersion(v, 'nextVersion')
  return v + 1
}

// The single decision the client reducer needs. Encodes realtime-model §2 exactly:
//   incoming <= lastSeen        → drop      (stale / duplicate)
//   incoming === lastSeen + 1   → apply     (contiguous next)
//   incoming  >  lastSeen + 1   → reconcile (gap: a missed event)
export function reconcileDecision(
  incoming: StateVersion,
  lastSeen: StateVersion,
): ReconcileDecision {
  assertVersion(incoming, 'reconcileDecision(incoming)')
  assertVersion(lastSeen, 'reconcileDecision(lastSeen)')
  if (incoming <= lastSeen) return 'drop'
  if (incoming === lastSeen + 1) return 'apply'
  return 'reconcile'
}

// Snapshot comparison for the reconnect/refresh path: a freshly fetched authoritative
// snapshot should replace local state only when it is newer than (or equal to, to recover
// from a corrupted local state) what we hold. Equal-version snapshots are accepted because a
// reconcile fetch is the trusted source of truth, not a delta to be deduped.
export function shouldApplySnapshot(
  snapshotVersion: StateVersion,
  currentVersion: StateVersion,
): boolean {
  return compareVersion(snapshotVersion, currentVersion) >= 0
}
