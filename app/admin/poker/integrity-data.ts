// ── Poker INTEGRITY read-side derivation (service role; server-only) ────────────────────
//
// Builds the anti-collusion REVIEW QUEUE. Runs the pure risk engine (lib/games/poker/integrity)
// over the authoritative history tables and returns scored subjects for the admin dashboard.
//
// This is READ-ONLY and derives candidate cases LIVE from history — it does NOT depend on the
// (pending) migration_poker_integrity.sql tables, so the queue is usable immediately. Once that
// migration is applied, a scheduled job can PERSIST these scores via poker_risk_upsert_case and the
// human-owned status/notes/actions layer comes online (next phase).
//
// PRIVACY: never returns hole cards / decks / seeds. Only public action facts + settlement payouts
// are read; seat→user mapping uses the service-role-only hole-cards table for identity ONLY (card
// values are never selected). Evidence surfaced to admins is numeric + scrubbed.

import { createAdminClient } from '@/lib/supabase/admin'
import { reconstructReplay, type ReplayActionInput } from '@/lib/games/poker/admin'
import {
  handDerivedSignals,
  scoreSubjects,
  redactPii,
  riskCaseDedupKey,
  type HandFacts,
  type SeatFacts,
  type RiskScore,
} from '@/lib/games/poker/integrity'

const AGGRESSIVE = new Set(['bet', 'raise', 'all_in'])
const PASSIVE = new Set(['check', 'call'])
const BLIND = new Set(['post_sb', 'post_bb'])
const FOLD = new Set(['fold', 'timeout_fold'])
const MAX_DECISION_MS = 120_000 // ignore idle gaps beyond this when estimating decision latency

export interface RiskCaseView {
  dedupKey: string
  subjectUserIds: string[]
  score: number
  band: RiskScore['band']
  confidence: number
  categories: string[]
  windowHands: number
  relatedUserIds: string[]
  relatedHandIds: string[]
  contributingSignals: {
    code: string
    category: string
    contribution: number
    severity: number
    confidence: number
    reasons: string[]
    evidence: Record<string, number>
  }[]
}

interface ActRow {
  hand_id: string; action_seq: number; seat_index: number; user_id: string | null
  street: string; type: string; amount: number | null; created_at: string
}

// Reduce the raw action log + settlement of one hand into privacy-safe HandFacts (no cards).
function buildHandFacts(
  handId: string,
  tableId: string,
  handNo: number,
  isPrivate: boolean,
  completedAtMs: number,
  rows: ActRow[],
  seatUser: Map<number, string>,
  payBySeat: Map<number, number>,
): HandFacts | null {
  if (rows.length === 0) return null
  const ordered = [...rows].sort((a, b) => a.action_seq - b.action_seq)
  const seatIndexes = Array.from(new Set(ordered.map((r) => r.seat_index)))

  const replay = reconstructReplay({
    seatIndexes,
    actions: ordered.map<ReplayActionInput>((r) => ({
      actionSeq: r.action_seq, seatIndex: r.seat_index,
      street: r.street as ReplayActionInput['street'], type: r.type as ReplayActionInput['type'],
      amount: r.amount ?? null,
    })),
  })
  const last = replay.steps[replay.steps.length - 1]
  const contribBySeat = new Map<number, number>()
  for (const si of seatIndexes) contribBySeat.set(si, (last.committedTotal[si] ?? 0) + (last.committedThisStreet[si] ?? 0))

  // Per-seat behavioural aggregates + decision-latency proxy (gap since previous action in hand).
  interface Agg { agg: number; pass: number; allIn: boolean; voluntary: boolean; folded: boolean; showdown: boolean; timings: number[] }
  const agg = new Map<number, Agg>()
  const get = (si: number): Agg => {
    let a = agg.get(si)
    if (!a) { a = { agg: 0, pass: 0, allIn: false, voluntary: false, folded: false, showdown: false, timings: [] }; agg.set(si, a) }
    return a
  }
  const postflop = new Set<string>()
  let prevMs: number | null = null
  for (const r of ordered) {
    const a = get(r.seat_index)
    const tMs = new Date(r.created_at).getTime()
    if (prevMs != null) { const dt = tMs - prevMs; if (dt >= 0 && dt <= MAX_DECISION_MS) a.timings.push(dt) }
    prevMs = tMs
    if (AGGRESSIVE.has(r.type)) a.agg++
    else if (PASSIVE.has(r.type)) a.pass++
    if (r.type === 'all_in') a.allIn = true
    if (!BLIND.has(r.type) && !FOLD.has(r.type)) a.voluntary = true
    if (FOLD.has(r.type)) a.folded = true
    if (r.street === 'SHOWDOWN') a.showdown = true
    const uid = seatUser.get(r.seat_index) ?? r.user_id ?? undefined
    if (uid && (AGGRESSIVE.has(r.type) || r.type === 'call') && ['FLOP', 'TURN', 'RIVER'].includes(r.street)) postflop.add(uid)
  }

  const seats: SeatFacts[] = []
  for (const si of seatIndexes) {
    const uid = seatUser.get(si) ?? ordered.find((r) => r.seat_index === si)?.user_id ?? null
    if (!uid) continue
    const a = get(si)
    const contributed = contribBySeat.get(si) ?? 0
    const payout = payBySeat.get(si) ?? 0
    seats.push({
      userId: uid, seatIndex: si, contributed, net: payout - contributed,
      wentAllIn: a.allIn, voluntaryPutIn: a.voluntary, aggressiveActions: a.agg, passiveActions: a.pass,
      folded: a.folded, reachedShowdown: a.showdown && !a.folded, actionTimingsMs: a.timings,
    })
  }
  if (seats.length === 0) return null
  return {
    handId, tableId, handNo, isPrivateTable: isPrivate, completedAtMs, seats,
    postflopContestants: Array.from(postflop),
  }
}

// Reduce the most recent settled hands into privacy-safe HandFacts. Shared by the live review
// queue AND the scheduled scoring job. Degrade-safe: returns [] if the tables are missing/empty.
// Reads NO card values (only seat→user identity from the service-role hole-cards table).
export async function buildRiskHandFacts(limitHands = 800): Promise<HandFacts[]> {
  const admin = createAdminClient()
  interface SettleRow { hand_id: string; table_id: string; payouts: unknown }
  let settles: SettleRow[] = []
  try {
    const res = await admin.from('poker_hand_settlements')
      .select('hand_id, table_id, payouts, kind, settled_at')
      .eq('kind', 'settle').order('settled_at', { ascending: false }).limit(limitHands)
    settles = ((res.data as SettleRow[] | null) ?? [])
  } catch { return [] }
  if (settles.length === 0) return []

  const handIds = settles.map((s) => s.hand_id)
  const tableIds = Array.from(new Set(settles.map((s) => s.table_id)))
  const [{ data: acts }, { data: holes }, { data: hands }, { data: tables }] = await Promise.all([
    admin.from('poker_actions').select('hand_id, action_seq, seat_index, user_id, street, type, amount, created_at').in('hand_id', handIds),
    admin.from('poker_hole_cards').select('hand_id, seat_index, user_id').in('hand_id', handIds),
    admin.from('poker_hands').select('id, hand_no, completed_at').in('id', handIds),
    admin.from('poker_tables').select('id, is_private').in('id', tableIds),
  ])

  const actsByHand = new Map<string, ActRow[]>()
  for (const a of (acts ?? []) as ActRow[]) (actsByHand.get(a.hand_id) ?? actsByHand.set(a.hand_id, []).get(a.hand_id)!).push(a)
  const seatUserByHand = new Map<string, Map<number, string>>()
  for (const hc of holes ?? []) {
    const m = seatUserByHand.get(hc.hand_id as string) ?? new Map<number, string>()
    m.set(hc.seat_index as number, hc.user_id as string)
    seatUserByHand.set(hc.hand_id as string, m)
  }
  const handMeta = new Map<string, { handNo: number; completedAtMs: number }>()
  for (const h of hands ?? []) handMeta.set(h.id as string, {
    handNo: (h.hand_no as number) ?? 0,
    completedAtMs: h.completed_at ? new Date(h.completed_at as string).getTime() : 0,
  })
  const isPrivate = new Map<string, boolean>()
  for (const t of tables ?? []) isPrivate.set(t.id as string, !!t.is_private)

  const facts: HandFacts[] = []
  for (const s of settles) {
    const payBySeat = new Map<number, number>()
    for (const p of (s.payouts as { seatIndex: number; amount: number }[]) ?? []) {
      payBySeat.set(p.seatIndex, (payBySeat.get(p.seatIndex) ?? 0) + p.amount)
    }
    const meta = handMeta.get(s.hand_id) ?? { handNo: 0, completedAtMs: 0 }
    const hf = buildHandFacts(
      s.hand_id, s.table_id, meta.handNo, isPrivate.get(s.table_id) ?? false, meta.completedAtMs,
      actsByHand.get(s.hand_id) ?? [], seatUserByHand.get(s.hand_id) ?? new Map(), payBySeat,
    )
    if (hf) facts.push(hf)
  }
  return facts
}

// Build the live review queue from the most recent settled hands. `minScore` filters noise.
export async function loadRiskReviewQueue(limitHands = 800, minScore = 20): Promise<RiskCaseView[]> {
  const facts = await buildRiskHandFacts(limitHands)
  const scores = scoreSubjects(handDerivedSignals(facts)).filter((s) => s.score >= minScore)
  return scores.map((s) => ({
    dedupKey: riskCaseDedupKey(s.subjectUserIds),
    subjectUserIds: [...s.subjectUserIds],
    score: s.score,
    band: s.band,
    confidence: s.confidence,
    categories: [...s.categories],
    windowHands: s.windowHands,
    relatedUserIds: [...s.relatedUserIds],
    relatedHandIds: [...s.relatedHandIds].slice(0, 25),
    contributingSignals: s.contributingSignals.map((c) => ({
      code: c.code, category: c.category, contribution: c.contribution,
      severity: c.severity, confidence: c.confidence, reasons: [...c.reasons],
      // evidence originates from the pure engine (numeric only); scrub defensively regardless.
      evidence: redactPii({ ...c.evidence }) as Record<string, number>,
    })),
  }))
}
