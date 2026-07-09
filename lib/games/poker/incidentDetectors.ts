// ── Poker SEV-1 invariant detectors — PURE ──────────────────────────────────────────────────────
//
// Given already-fetched DURABLE rows (never live secrets), decide whether a zero-tolerance invariant
// has been contradicted, and if so return a SEV-1 candidate (code + correlation + numbers/ids-only
// facts) ready to hand to buildSev1Incident. PURE: no DB, no clock, no console, no secrets.
//
// IMPORTANT — these are TRIPWIRES. Several of these invariants are ALSO prevented by construction at
// the database layer (poker_actions has UNIQUE(hand_id, action_seq); poker_tournament_payouts has
// UNIQUE(tournament_id, entry_id, kind)). A detector firing therefore means a construction guarantee
// was defeated (a dropped constraint, a migration mistake, a bug) — exactly the class of event that
// must be actively paged, which is why they are wired into the scheduled auditor.

import type { Sev1Code, Sev1Correlation } from './incident.ts'
import type { IntegrityViolation } from './coinIntegrity.ts'

export interface Sev1Detection {
  readonly code: Sev1Code
  readonly correlation: Sev1Correlation
  readonly facts: Record<string, number | string>
}

// ── Map a coin-integrity violation onto a SEV-1 code ────────────────────────────────────────────
export function sev1CodeForIntegrity(code: IntegrityViolation['code']): Sev1Code {
  switch (code) {
    case 'DUPLICATE_SETTLEMENT':
      return 'PKR_SEV1_DUPLICATE_PAYOUT'
    case 'PAYOUT_TO_INELIGIBLE_SEAT':
      return 'PKR_SEV1_CONTRADICTORY_SETTLEMENT'
    case 'CONSERVATION_MISMATCH':
    case 'SETTLEMENT_RECONCILE_MISMATCH':
    case 'POT_CONSTRUCTION_MISMATCH':
    case 'NEGATIVE_VALUE':
    case 'NON_INTEGER_VALUE':
    case 'LEDGER_IMBALANCE':
    default:
      return 'PKR_SEV1_ECONOMY_NOT_CONSERVED'
  }
}

export function detectionFromIntegrity(v: IntegrityViolation, source: string): Sev1Detection {
  const facts: Record<string, number | string> = { integrity: v.code }
  for (const [k, val] of Object.entries(v.evidence)) {
    if (typeof val === 'number' && Number.isFinite(val)) facts[k] = val
  }
  return {
    code: sev1CodeForIntegrity(v.code),
    correlation: { tableId: v.correlation.tableId ?? null, handId: v.correlation.handId ?? null, source },
    facts,
  }
}

// ── Duplicate active hands (NOT backed by a DB unique constraint → highest-value tripwire) ────────
// A "live" hand is one that is not in a terminal phase. More than one live hand for the same table is
// a contradiction: exactly one hand may be in progress at a table at a time.
export interface LiveHandRow {
  readonly tableKey: string   // opaque table identifier (cash table id or `${tournamentId}:${tableNo}`)
  readonly live: boolean      // true when the hand is non-terminal / unsettled
  readonly tournamentId?: string | null
  readonly tableId?: string | null
}

export function detectDuplicateActiveHands(rows: readonly LiveHandRow[], source: string): Sev1Detection[] {
  const byTable = new Map<string, LiveHandRow[]>()
  for (const r of rows) {
    if (!r.live) continue
    const arr = byTable.get(r.tableKey) ?? []
    arr.push(r)
    byTable.set(r.tableKey, arr)
  }
  const out: Sev1Detection[] = []
  for (const [tableKey, live] of Array.from(byTable.entries())) {
    if (live.length > 1) {
      const first = live[0]
      out.push({
        code: 'PKR_SEV1_DUPLICATE_ACTIVE_HAND',
        correlation: { tournamentId: first.tournamentId ?? null, tableId: first.tableId ?? null, source },
        facts: { tableKey, liveHands: live.length },
      })
    }
  }
  return out
}

// ── Duplicate payouts / refunds (DB-prevented via UNIQUE(tournament_id, entry_id, kind)) ──────────
export interface PayoutRow {
  readonly tournamentId: string
  readonly entryId: string
  readonly kind: 'prize' | 'refund' | string
}

function detectDuplicatePayoutKind(
  rows: readonly PayoutRow[], kind: 'prize' | 'refund', code: Sev1Code, source: string,
): Sev1Detection[] {
  const counts = new Map<string, { count: number; tournamentId: string }>()
  for (const r of rows) {
    if (r.kind !== kind) continue
    const key = `${r.tournamentId}:${r.entryId}`
    const cur = counts.get(key)
    counts.set(key, { count: (cur?.count ?? 0) + 1, tournamentId: r.tournamentId })
  }
  const out: Sev1Detection[] = []
  for (const [, v] of Array.from(counts.entries())) {
    if (v.count > 1) {
      out.push({ code, correlation: { tournamentId: v.tournamentId, source }, facts: { kind, rows: v.count } })
    }
  }
  return out
}

export function detectDuplicatePayouts(rows: readonly PayoutRow[], source: string): Sev1Detection[] {
  return [
    ...detectDuplicatePayoutKind(rows, 'prize', 'PKR_SEV1_DUPLICATE_PAYOUT', source),
    ...detectDuplicatePayoutKind(rows, 'refund', 'PKR_SEV1_DUPLICATE_REFUND', source),
  ]
}

// ── Duplicate accepted action (DB-prevented via UNIQUE(hand_id, action_seq)) ──────────────────────
export interface ActionRow {
  readonly handId: string
  readonly actionSeq: number
  readonly seatIndex: number
  readonly userId: string | null
}

export function detectDuplicateActions(rows: readonly ActionRow[], source: string): Sev1Detection[] {
  const counts = new Map<string, { count: number; handId: string; actionSeq: number }>()
  for (const r of rows) {
    const key = `${r.handId}:${r.actionSeq}`
    const cur = counts.get(key)
    counts.set(key, { count: (cur?.count ?? 0) + 1, handId: r.handId, actionSeq: r.actionSeq })
  }
  const out: Sev1Detection[] = []
  for (const [, v] of Array.from(counts.entries())) {
    if (v.count > 1) {
      out.push({
        code: 'PKR_SEV1_DUPLICATE_ACTION',
        correlation: { handId: v.handId, source },
        facts: { actionSeq: v.actionSeq, rows: v.count },
      })
    }
  }
  return out
}

// ── Cross-user action ─────────────────────────────────────────────────────────────────────────
// An action row whose acting user_id does NOT own the seat_index it acted from, per the hand's
// authoritative seating. Rows with a null user_id are server actions (timeouts) and are ignored.
export interface SeatOwnershipRow {
  readonly handId: string
  readonly seatIndex: number
  readonly userId: string
}

export function detectCrossUserActions(
  actions: readonly ActionRow[], seating: readonly SeatOwnershipRow[], source: string,
): Sev1Detection[] {
  const owner = new Map<string, string>() // `${handId}:${seatIndex}` -> userId
  for (const s of seating) owner.set(`${s.handId}:${s.seatIndex}`, s.userId)
  const out: Sev1Detection[] = []
  for (const a of actions) {
    if (!a.userId) continue // server / timeout action
    const key = `${a.handId}:${a.seatIndex}`
    const seatOwner = owner.get(key)
    if (seatOwner !== undefined && seatOwner !== a.userId) {
      out.push({
        code: 'PKR_SEV1_CROSS_USER_ACTION',
        correlation: { handId: a.handId, source },
        facts: { seatIndex: a.seatIndex, actionSeq: a.actionSeq },
      })
    }
  }
  return out
}
