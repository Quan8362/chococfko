// ── Poker admin / operations — PURE logic (no DB, no React, no secrets) ─────────────────
//
// This module holds the testable heart of the operational tooling:
//   • the incident-case state machine (legal transitions + terminal contract),
//   • a deterministic HAND REPLAY reconstruction from the public action log,
//   • redaction guards that keep hole cards / decks / seeds / tokens out of any audit, ops
//     event, or incident `detail` payload (SECURITY-HOLE-CARDS-001 — defense in depth), and
//   • pure anti-abuse SIGNAL computation (evidence only — never auto-punishment).
//
// Everything here is a pure function over plain data so it can be unit-tested with node:test
// and reused identically on the server. It NEVER reads private state; the only card-bearing
// input it accepts is an already-authorized, already-audited terminal-hand reveal (the caller's
// responsibility), and even then it is treated opaquely.

import type { Street, PokerActionType } from './types.ts'

// ════════════════════════════════════════════════════════════════════════════════════
// 1. Incident-case state machine
// ════════════════════════════════════════════════════════════════════════════════════
export type IncidentStatus = 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'REFUNDED' | 'DISMISSED'

export const INCIDENT_STATES: readonly IncidentStatus[] = [
  'OPEN', 'INVESTIGATING', 'RESOLVED', 'REFUNDED', 'DISMISSED',
] as const

export const TERMINAL_INCIDENT_STATES: readonly IncidentStatus[] = ['RESOLVED', 'REFUNDED', 'DISMISSED'] as const

export function isTerminalIncident(status: IncidentStatus): boolean {
  return TERMINAL_INCIDENT_STATES.includes(status)
}

// Allowed transitions. REFUNDED is intentionally NOT reachable by a generic transition — it is
// only set by the refund workflow (poker_admin_refund_hand) so reaching it always moves coins.
const INCIDENT_TRANSITIONS: Record<IncidentStatus, readonly IncidentStatus[]> = {
  OPEN: ['INVESTIGATING', 'RESOLVED', 'DISMISSED'],
  INVESTIGATING: ['RESOLVED', 'DISMISSED', 'OPEN'],
  RESOLVED: [],
  REFUNDED: [],
  DISMISSED: [],
}

export function canTransitionIncident(from: IncidentStatus, to: IncidentStatus): boolean {
  return INCIDENT_TRANSITIONS[from]?.includes(to) ?? false
}

// RESOLVED / DISMISSED require a non-empty resolution note (the terminal contract).
export function transitionRequiresResolution(to: IncidentStatus): boolean {
  return to === 'RESOLVED' || to === 'DISMISSED'
}

// ════════════════════════════════════════════════════════════════════════════════════
// 2. Audit / ops / incident redaction — keep secrets out of `detail` payloads
// ════════════════════════════════════════════════════════════════════════════════════
// A card looks like "As", "Kd", "Tc", "2h" (rank + suit). We treat an array of these as a card
// leak. Key names that may carry secrets are dropped wholesale.
const CARD_RE = /^(?:[2-9TJQKA])[cdhs]$/
const SECRET_KEY_RE = /(card|hole|deck|stub|seed|commit_hash|password|secret|token|jwt|authorization|cookie|service_role)/i

function looksLikeCard(v: unknown): boolean {
  return typeof v === 'string' && CARD_RE.test(v)
}
function looksLikeCardArray(v: unknown): boolean {
  return Array.isArray(v) && v.length > 0 && v.every(looksLikeCard)
}

// Returns a deep-cloned copy of `detail` with any secret-bearing key removed and any card-like
// value scrubbed. Safe to persist into poker_admin_audit / poker_ops_events / incident evidence.
export function scrubDetail(detail: unknown): Record<string, unknown> {
  const out = scrubValue(detail)
  return out && typeof out === 'object' && !Array.isArray(out) ? (out as Record<string, unknown>) : {}
}

function scrubValue(v: unknown): unknown {
  if (looksLikeCard(v) || looksLikeCardArray(v)) return '[redacted]'
  if (Array.isArray(v)) return v.map(scrubValue)
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (SECRET_KEY_RE.test(k)) { o[k] = '[redacted]'; continue }
      o[k] = scrubValue(val)
    }
    return o
  }
  return v
}

// Throws if `detail` still carries something that must never be persisted/logged. Use as a loud,
// test-catchable assertion in code paths that build audit/ops payloads by hand.
export function assertDetailClean(detail: unknown, where = 'detail'): void {
  const seen = new Set<unknown>()
  const walk = (v: unknown, path: string) => {
    if (looksLikeCard(v) || looksLikeCardArray(v)) throw new Error(`poker audit: card leak at ${path}`)
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${path}[${i}]`)); return }
    if (v && typeof v === 'object') {
      if (seen.has(v)) return
      seen.add(v)
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (SECRET_KEY_RE.test(k)) throw new Error(`poker audit: secret-bearing key "${k}" at ${path}`)
        walk(val, `${path}.${k}`)
      }
    }
  }
  walk(detail, where)
}

// ════════════════════════════════════════════════════════════════════════════════════
// 3. Hand replay reconstruction (pure) — pot evolution from the public action log
// ════════════════════════════════════════════════════════════════════════════════════
// Rebuilds, step by step, how the pot was constructed from the recorded poker_actions. Card
// values are NEVER needed. `amount` follows the log convention: the TO-amount (committed-this-
// street target) for bet/raise/all_in/post_sb/post_bb; null for fold/check/call. The reconstructed
// final pot is reconciled against the authoritative settled total when supplied, so a mismatch
// (a possible engine/settlement bug or tampering) is surfaced rather than hidden.

export type ReplayActionType =
  | PokerActionType
  | 'post_sb' | 'post_bb' | 'timeout_fold' | 'timeout_check'

export interface ReplayActionInput {
  readonly actionSeq: number
  readonly seatIndex: number
  readonly street: Street
  readonly type: ReplayActionType
  readonly amount: number | null
}

export interface ReplayInput {
  readonly seatIndexes: readonly number[] // seats dealt into the hand
  readonly actions: readonly ReplayActionInput[]
  readonly authoritativeTotalContributed?: number | null // from poker_hand_settlements
}

export interface ReplayStep {
  readonly index: number // 0 = initial; 1..n after each applied action
  readonly actionSeq: number | null
  readonly street: Street | null
  readonly seatIndex: number | null
  readonly type: ReplayActionType | null
  readonly committedThisStreet: Readonly<Record<number, number>>
  readonly committedTotal: Readonly<Record<number, number>>
  readonly potTotal: number
  readonly currentBet: number
  readonly foldedSeats: readonly number[]
  readonly activeSeats: readonly number[]
}

export interface ReplayResult {
  readonly steps: readonly ReplayStep[]
  readonly finalPot: number
  readonly reconciledWithSettlement: boolean | null // null when no authoritative total supplied
  readonly discrepancy: number | null // finalPot - authoritative (null when not supplied)
}

function normalizeType(t: ReplayActionType): ReplayActionType {
  if (t === 'timeout_fold') return 'fold'
  if (t === 'timeout_check') return 'check'
  return t
}

export function reconstructReplay(input: ReplayInput): ReplayResult {
  const seats = [...input.seatIndexes].sort((a, b) => a - b)
  const cts: Record<number, number> = {} // committed this street
  const tot: Record<number, number> = {} // committed total (carried streets)
  for (const s of seats) { cts[s] = 0; tot[s] = 0 }
  const folded = new Set<number>()
  let currentBet = 0
  let trackingStreet: Street | null = input.actions[0]?.street ?? null

  const potTotal = () =>
    seats.reduce((sum, s) => sum + (cts[s] ?? 0) + (tot[s] ?? 0), 0)
  const snapshot = (
    index: number, a: ReplayActionInput | null,
  ): ReplayStep => ({
    index,
    actionSeq: a?.actionSeq ?? null,
    street: a?.street ?? trackingStreet,
    seatIndex: a?.seatIndex ?? null,
    type: a?.type ?? null,
    committedThisStreet: { ...cts },
    committedTotal: { ...tot },
    potTotal: potTotal(),
    currentBet,
    foldedSeats: Array.from(folded).sort((x, y) => x - y),
    activeSeats: seats.filter((s) => !folded.has(s)),
  })

  const steps: ReplayStep[] = [snapshot(0, null)]
  const ordered = [...input.actions].sort((a, b) => a.actionSeq - b.actionSeq)

  for (let i = 0; i < ordered.length; i++) {
    const a = ordered[i]
    // Street boundary: fold this street's contributions into the running total + reset.
    if (trackingStreet !== null && a.street !== trackingStreet) {
      for (const s of seats) { tot[s] = (tot[s] ?? 0) + (cts[s] ?? 0); cts[s] = 0 }
      currentBet = 0
    }
    trackingStreet = a.street
    if (cts[a.seatIndex] === undefined) { cts[a.seatIndex] = 0; tot[a.seatIndex] = 0 }

    const type = normalizeType(a.type)
    switch (type) {
      case 'fold':
        folded.add(a.seatIndex); break
      case 'check':
        break
      case 'call': {
        cts[a.seatIndex] = Math.max(cts[a.seatIndex], currentBet)
        break
      }
      case 'bet':
      case 'raise':
      case 'all_in':
      case 'post_sb':
      case 'post_bb': {
        const target = a.amount ?? cts[a.seatIndex]
        cts[a.seatIndex] = Math.max(cts[a.seatIndex], target)
        currentBet = Math.max(currentBet, cts[a.seatIndex])
        break
      }
    }
    steps.push(snapshot(i + 1, a))
  }

  const finalPot = potTotal()
  const auth = input.authoritativeTotalContributed
  const reconciledWithSettlement = auth == null ? null : finalPot === auth
  const discrepancy = auth == null ? null : finalPot - auth
  return { steps, finalPot, reconciledWithSettlement, discrepancy }
}

// ════════════════════════════════════════════════════════════════════════════════════
// 4. Anti-abuse SIGNALS (pure, evidence-only — NEVER auto-punishment)
// ════════════════════════════════════════════════════════════════════════════════════
// Surfaces directed value-flow between account pairs that repeatedly play together — the shape
// of chip-dumping / collusion. First-release intent (per the operational spec) is to STORE and
// SURFACE evidence for a human investigator, never to act automatically on a weak heuristic.

export interface HandFlowInput {
  readonly handId: string
  readonly tableId: string
  // Net coin delta per user for the hand: winners positive, losers negative. Should sum to ~0.
  readonly netByUser: Readonly<Record<string, number>>
}

export interface PairSignal {
  readonly userA: string // lexicographically smaller id
  readonly userB: string
  readonly handsTogether: number
  readonly tablesTogether: number
  // Net directional flow A→B across all shared hands (positive ⇒ value moved A→B).
  readonly netFlowAToB: number
  readonly grossFlow: number
  // |netFlow| / grossFlow ∈ [0,1]; near 1 ⇒ value moves almost entirely one direction.
  readonly oneWayRatio: number
  // Coarse 0..100 suspicion score (volume × directionality × repetition). Advisory ONLY.
  readonly suspicion: number
}

function pairKey(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a]
}

// Attribute each hand's losses to its winners proportionally, producing per-pair directed flow.
export function computeCollusionSignals(
  hands: readonly HandFlowInput[],
  opts: { readonly minHandsTogether?: number } = {},
): readonly PairSignal[] {
  const minHands = opts.minHandsTogether ?? 3
  interface Acc { net: number; gross: number; hands: Set<string>; tables: Set<string> }
  const pairs = new Map<string, Acc>()

  for (const h of hands) {
    const winners = Object.entries(h.netByUser).filter(([, v]) => v > 0)
    const losers = Object.entries(h.netByUser).filter(([, v]) => v < 0)
    const totalGain = winners.reduce((s, [, v]) => s + v, 0)
    if (totalGain <= 0) continue
    for (const [loser, lossNeg] of losers) {
      const loss = -lossNeg
      for (const [winner, gain] of winners) {
        const flow = loss * (gain / totalGain) // loser → winner
        const [a, b] = pairKey(loser, winner)
        const k = `${a}|${b}`
        let acc = pairs.get(k)
        if (!acc) { acc = { net: 0, gross: 0, hands: new Set(), tables: new Set() }; pairs.set(k, acc) }
        // net is signed A→B: positive when value moves from a to b.
        acc.net += loser === a ? flow : -flow
        acc.gross += flow
        acc.hands.add(h.handId)
        acc.tables.add(h.tableId)
      }
    }
  }

  const out: PairSignal[] = []
  for (const [k, acc] of Array.from(pairs.entries())) {
    const [userA, userB] = k.split('|')
    const handsTogether = acc.hands.size
    if (handsTogether < minHands) continue
    const oneWayRatio = acc.gross > 0 ? Math.abs(acc.net) / acc.gross : 0
    // Repetition weight saturates so a handful of hands cannot dominate.
    const repetition = Math.min(1, handsTogether / 25)
    const suspicion = Math.round(100 * oneWayRatio * repetition)
    out.push({
      userA, userB, handsTogether, tablesTogether: acc.tables.size,
      netFlowAToB: Math.round(acc.net), grossFlow: Math.round(acc.gross),
      oneWayRatio: Number(oneWayRatio.toFixed(3)), suspicion,
    })
  }
  return out.sort((x, y) => y.suspicion - x.suspicion)
}

// ════════════════════════════════════════════════════════════════════════════════════
// 5. Observability event taxonomy
// ════════════════════════════════════════════════════════════════════════════════════
export type OpsEventKind =
  | 'failed_action' | 'stale_state' | 'duplicate_action' | 'sequence_gap' | 'reconnect_failure'
  | 'transaction_retry' | 'settlement_failure' | 'coin_conservation_failure' | 'rls_denial'
  | 'frozen_hand' | 'long_running_hand' | 'abandoned_table' | 'realtime_subscription_error'

export type OpsSeverity = 'info' | 'warn' | 'error' | 'critical'

export const OPS_EVENT_KINDS: readonly OpsEventKind[] = [
  'failed_action', 'stale_state', 'duplicate_action', 'sequence_gap', 'reconnect_failure',
  'transaction_retry', 'settlement_failure', 'coin_conservation_failure', 'rls_denial',
  'frozen_hand', 'long_running_hand', 'abandoned_table', 'realtime_subscription_error',
] as const

// Default severity per kind. A coin/settlement integrity failure is always critical; a transient
// duplicate/stale event is informational. Callers may override.
export function defaultOpsSeverity(kind: OpsEventKind): OpsSeverity {
  switch (kind) {
    case 'coin_conservation_failure':
    case 'settlement_failure':
      return 'critical'
    case 'failed_action':
    case 'reconnect_failure':
    case 'rls_denial':
    case 'frozen_hand':
    case 'realtime_subscription_error':
      return 'error'
    case 'duplicate_action':
    case 'stale_state':
      return 'info'
    default:
      return 'warn'
  }
}
