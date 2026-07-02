// ── Poker integrity — RISK SIGNALS (pure, explainable, evidence-only) ───────────────────
//
// Each function turns integrity-relevant *facts* about completed hands / sessions into a set of
// explainable RiskSignal records. A signal is EVIDENCE ONLY — it never punishes anyone. It carries
// a bounded intrinsic `severity`, a sample-size-driven `confidence`, the related users/hands, the
// observation window, and a small numeric `evidence` map an admin can read. The scorer (scoring.ts)
// combines signals into a versioned score; a human decides any action (review.ts).
//
// PRIVACY / SECURITY: inputs are reduced facts that carry NO hole cards, deck, or seeds. Device /
// network correlation arrives ONLY as already-hashed tokens (privacy.ts). Nothing here reads live
// private state. The existing pair-flow + concentration heuristics in ../admin.ts and ../ranking.ts
// are reused so there is one implementation of the value-flow math.

import { computeCollusionSignals, type HandFlowInput, type PairSignal } from '../admin.ts'
import { collusionRiskScore, type CollusionInput } from '../ranking.ts'
import { computeIdentityOverlaps, type AccountIdentityTokens, type IdentityOverlap } from './privacy.ts'

// ── Signal taxonomy ─────────────────────────────────────────────────────────────────────
export type RiskSignalCategory = 'relationship' | 'gameplay' | 'account_session'

export type RiskSignalCode =
  // relationship
  | 'REL_ONE_WAY_VALUE_FLOW' // value moves almost entirely one direction between a pair
  | 'REL_REPEATED_PAIRING' // the same two accounts keep sharing tables
  | 'REL_PRIVATE_TABLE_PAIRING' // that pairing concentrates on private tables
  | 'REL_VALUE_CONCENTRATION' // one player's winnings come from one/few feeders
  // gameplay
  | 'GP_CHIP_DUMP' // repeated large commitments that hand a pot to one counterparty
  | 'GP_SOFT_PLAY' // a player is passive specifically against one opponent, aggressive vs others
  | 'GP_COORDINATED_FOLD' // repeatedly folding to a specific account's aggression
  | 'GP_BOT_TIMING' // machine-like regularity / impossibly fast decisions
  | 'GP_TIMING_SYNC' // two accounts act with matched cadence across shared hands
  // account / session
  | 'AS_MULTI_SEAT' // one account occupied multiple seats at the same table concurrently
  | 'AS_CONCURRENT_SESSIONS' // one account in contradictory concurrent live hands
  | 'AS_SHARED_IDENTIFIER' // accounts share a hashed device/network token (weak on its own)
  | 'AS_IMPOSSIBLE_FREQUENCY' // action rate beyond human capability

export const RISK_SIGNAL_CATEGORY: Record<RiskSignalCode, RiskSignalCategory> = {
  REL_ONE_WAY_VALUE_FLOW: 'relationship',
  REL_REPEATED_PAIRING: 'relationship',
  REL_PRIVATE_TABLE_PAIRING: 'relationship',
  REL_VALUE_CONCENTRATION: 'relationship',
  GP_CHIP_DUMP: 'gameplay',
  GP_SOFT_PLAY: 'gameplay',
  GP_COORDINATED_FOLD: 'gameplay',
  GP_BOT_TIMING: 'gameplay',
  GP_TIMING_SYNC: 'gameplay',
  AS_MULTI_SEAT: 'account_session',
  AS_CONCURRENT_SESSIONS: 'account_session',
  AS_SHARED_IDENTIFIER: 'account_session',
  AS_IMPOSSIBLE_FREQUENCY: 'account_session',
}

export interface RiskSignal {
  readonly code: RiskSignalCode
  readonly category: RiskSignalCategory
  readonly severity: number // 0..1 intrinsic strength of THIS observation
  readonly confidence: number // 0..1 driven by sample size — small samples are never confident
  readonly relatedUserIds: readonly string[]
  readonly relatedHandIds: readonly string[]
  readonly windowHands: number // number of hands the observation spans
  readonly reasons: readonly string[] // explainable sub-codes for the admin
  readonly evidence: Readonly<Record<string, number>> // redacted numeric evidence only
}

// ── Reduced facts (NO hole cards) an integrity job builds from the authoritative tables ──
export interface SeatFacts {
  readonly userId: string
  readonly seatIndex: number
  readonly contributed: number // total chips this seat put in the pot
  readonly net: number // signed coin delta for the hand (payout − contributed)
  readonly wentAllIn: boolean
  readonly voluntaryPutIn: boolean // VPIP: put chips in preflop by choice (not just blinds)
  readonly aggressiveActions: number // bets + raises made this hand
  readonly passiveActions: number // checks + calls made this hand
  readonly folded: boolean
  readonly reachedShowdown: boolean
  readonly actionTimingsMs: readonly number[] // decision latency per action (ms)
}

export interface HandFacts {
  readonly handId: string
  readonly tableId: string
  readonly handNo: number
  readonly isPrivateTable: boolean
  readonly completedAtMs: number
  readonly seats: readonly SeatFacts[]
  // users who voluntarily put money in on flop or later (the real "contestants" of the pot)
  readonly postflopContestants: readonly string[]
}

// ── helpers ───────────────────────────────────────────────────────────────────────────────
function clamp01(x: number): number { return x < 0 ? 0 : x > 1 ? 1 : x }
function pairKey(a: string, b: string): [string, string] { return a < b ? [a, b] : [b, a] }
// Confidence saturates with sample size n relative to a "trust" count k (n=k ⇒ ~0.5).
function sampleConfidence(n: number, k: number): number { return n <= 0 ? 0 : n / (n + k) }
function round2(x: number): number { return Math.round(x * 100) / 100 }

// ── 1. Relationship — one-way value flow + repeated / private pairing ────────────────────
export interface RelationshipSignalOptions {
  readonly minHandsTogether?: number // default 5
  readonly oneWayThreshold?: number // default 0.6 (|net|/gross)
}

export function relationshipSignals(
  hands: readonly HandFacts[],
  opts: RelationshipSignalOptions = {},
): readonly RiskSignal[] {
  const minHands = opts.minHandsTogether ?? 5
  const oneWayThreshold = opts.oneWayThreshold ?? 0.6

  // Reuse the proven pair directed-flow math from admin.ts.
  const flows: HandFlowInput[] = hands.map((h) => {
    const netByUser: Record<string, number> = {}
    for (const s of h.seats) netByUser[s.userId] = (netByUser[s.userId] ?? 0) + s.net
    return { handId: h.handId, tableId: h.tableId, netByUser }
  })
  const pairs = computeCollusionSignals(flows, { minHandsTogether: minHands })

  // How many of each pair's shared hands were on private tables?
  const privateHandsByPair = new Map<string, number>()
  for (const h of hands) {
    if (!h.isPrivateTable) continue
    const users = Array.from(new Set(h.seats.map((s) => s.userId)))
    for (let i = 0; i < users.length; i++) {
      for (let j = i + 1; j < users.length; j++) {
        const [a, b] = pairKey(users[i], users[j])
        const k = `${a}|${b}`
        privateHandsByPair.set(k, (privateHandsByPair.get(k) ?? 0) + 1)
      }
    }
  }

  const out: RiskSignal[] = []
  for (const p of pairs) {
    const conf = sampleConfidence(p.handsTogether, 15)
    const related = [p.userA, p.userB]
    if (p.oneWayRatio >= oneWayThreshold) {
      out.push({
        code: 'REL_ONE_WAY_VALUE_FLOW',
        category: 'relationship',
        severity: clamp01(p.oneWayRatio),
        confidence: conf,
        relatedUserIds: related,
        relatedHandIds: [],
        windowHands: p.handsTogether,
        reasons: ['one_way_value_flow', p.oneWayRatio >= 0.85 ? 'near_total_one_way' : 'directional_flow'],
        evidence: {
          handsTogether: p.handsTogether,
          tablesTogether: p.tablesTogether,
          netFlow: p.netFlowAToB,
          grossFlow: p.grossFlow,
          oneWayRatioPct: Math.round(p.oneWayRatio * 100),
        },
      })
    }
    // Repeated pairing: many shared hands concentrated on few tables (grinders spread out).
    if (p.handsTogether >= minHands * 2 && p.tablesTogether <= 2) {
      out.push({
        code: 'REL_REPEATED_PAIRING',
        category: 'relationship',
        severity: clamp01(Math.min(1, p.handsTogether / 40) * (p.tablesTogether === 1 ? 1 : 0.7)),
        confidence: conf,
        relatedUserIds: related,
        relatedHandIds: [],
        windowHands: p.handsTogether,
        reasons: ['repeated_pairing', p.tablesTogether === 1 ? 'single_shared_table' : 'few_shared_tables'],
        evidence: { handsTogether: p.handsTogether, tablesTogether: p.tablesTogether },
      })
    }
    const priv = privateHandsByPair.get(`${p.userA}|${p.userB}`) ?? 0
    const privShare = p.handsTogether > 0 ? priv / p.handsTogether : 0
    if (priv >= minHands && privShare >= 0.7) {
      out.push({
        code: 'REL_PRIVATE_TABLE_PAIRING',
        category: 'relationship',
        severity: clamp01(privShare),
        confidence: sampleConfidence(priv, 15),
        relatedUserIds: related,
        relatedHandIds: [],
        windowHands: priv,
        reasons: ['private_table_pairing'],
        evidence: { privateHandsTogether: priv, privateSharePct: Math.round(privShare * 100) },
      })
    }
  }
  return out
}

// Per-subject value concentration (reuses ranking.ts). Flags a winner whose profit comes from
// one/few feeders across many hands.
export function valueConcentrationSignals(inputs: readonly CollusionInput[]): readonly RiskSignal[] {
  const out: RiskSignal[] = []
  for (const inp of inputs) {
    const s = collusionRiskScore(inp)
    if (s.score < 0.5 || inp.netProfitChips <= 0) continue
    out.push({
      code: 'REL_VALUE_CONCENTRATION',
      category: 'relationship',
      severity: clamp01(s.score),
      confidence: sampleConfidence(inp.handsPlayed, 200),
      relatedUserIds: [inp.userId],
      relatedHandIds: [],
      windowHands: inp.handsPlayed,
      reasons: ['value_concentration', ...s.reasons],
      evidence: {
        topCounterpartySharePct: Math.round(s.topCounterpartyShare * 100),
        distinctOpponents: inp.distinctOpponents,
        netProfitChips: inp.netProfitChips,
      },
    })
  }
  return out
}

// ── 2. Gameplay — chip dumping, soft play, coordinated folds, timing ─────────────────────
export interface GameplaySignalOptions {
  readonly minHands?: number // per-pattern minimum hands to emit (default 4)
  readonly botMaxMedianMs?: number // decisions faster than this median look automated (default 700)
  readonly botMaxJitterMs?: number // and with variance tighter than this (default 120)
  readonly impossibleMs?: number // a single decision faster than this is beyond human (default 180)
}

// A "dump" hand for ordered pair (dumper → collector): the dumper commits a lot (all-in or a
// large voluntary raise) and the pot's value ends up almost entirely with the collector.
export function chipDumpSignals(
  hands: readonly HandFacts[],
  opts: GameplaySignalOptions = {},
): readonly RiskSignal[] {
  const minHands = opts.minHands ?? 4
  interface Acc { hands: Set<string>; dumped: number; count: number }
  const byPair = new Map<string, Acc>() // key dumper|collector (ordered)

  for (const h of hands) {
    const winners = h.seats.filter((s) => s.net > 0)
    if (winners.length !== 1) continue // clean two-party value transfer only
    const collector = winners[0]
    for (const s of h.seats) {
      if (s.userId === collector.userId || s.net >= 0) continue
      const bigCommit = s.wentAllIn || (s.voluntaryPutIn && s.contributed >= collector.contributed * 2)
      if (!bigCommit) continue
      const k = `${s.userId}|${collector.userId}`
      const acc = byPair.get(k) ?? { hands: new Set<string>(), dumped: 0, count: 0 }
      acc.hands.add(h.handId)
      acc.dumped += -s.net
      acc.count++
      byPair.set(k, acc)
    }
  }

  const out: RiskSignal[] = []
  for (const [k, acc] of Array.from(byPair)) {
    if (acc.hands.size < minHands) continue
    const [dumper, collector] = k.split('|')
    const conf = sampleConfidence(acc.hands.size, 10)
    out.push({
      code: 'GP_CHIP_DUMP',
      category: 'gameplay',
      severity: clamp01(Math.min(1, acc.hands.size / 12)),
      confidence: conf,
      relatedUserIds: [dumper, collector],
      relatedHandIds: Array.from(acc.hands),
      windowHands: acc.hands.size,
      reasons: ['repeated_large_commit_to_one_account'],
      evidence: { dumpHands: acc.hands.size, chipsTransferred: Math.round(acc.dumped) },
    })
  }
  return out.sort((a, b) => b.severity - a.severity)
}

// Soft play: player A is markedly LESS aggressive when the pot is contested only with B than A's
// baseline aggression against the field. Directed (A soft toward B).
export function softPlaySignals(
  hands: readonly HandFacts[],
  opts: GameplaySignalOptions = {},
): readonly RiskSignal[] {
  const minHands = opts.minHands ?? 4
  interface Base { agg: number; total: number }
  const baseline = new Map<string, Base>() // user → aggression frequency across all their hands
  interface Vs { softHands: Set<string>; agg: number; total: number }
  const vs = new Map<string, Vs>() // "A|B" A's aggression when heads-up-in-pot vs B

  for (const h of hands) {
    for (const s of h.seats) {
      const acts = s.aggressiveActions + s.passiveActions
      if (acts === 0) continue
      const b = baseline.get(s.userId) ?? { agg: 0, total: 0 }
      b.agg += s.aggressiveActions
      b.total += acts
      baseline.set(s.userId, b)
    }
    // Heads-up contested pot (exactly two postflop contestants) ⇒ directed observation both ways.
    if (h.postflopContestants.length === 2) {
      const [x, y] = h.postflopContestants
      for (const [self, other] of [[x, y], [y, x]] as const) {
        const s = h.seats.find((z) => z.userId === self)
        if (!s) continue
        const acts = s.aggressiveActions + s.passiveActions
        if (acts === 0) continue
        const k = `${self}|${other}`
        const v = vs.get(k) ?? { softHands: new Set<string>(), agg: 0, total: 0 }
        v.agg += s.aggressiveActions
        v.total += acts
        if (s.aggressiveActions === 0) v.softHands.add(h.handId)
        vs.set(k, v)
      }
    }
  }

  const out: RiskSignal[] = []
  for (const [k, v] of Array.from(vs)) {
    if (v.softHands.size < minHands || v.total === 0) continue
    const [self, other] = k.split('|')
    const b = baseline.get(self)
    if (!b || b.total < 10) continue
    const baseAgg = b.agg / b.total
    const vsAgg = v.agg / v.total
    // Meaningfully more passive vs this one opponent than baseline.
    if (baseAgg - vsAgg < 0.2 || baseAgg < 0.15) continue
    out.push({
      code: 'GP_SOFT_PLAY',
      category: 'gameplay',
      severity: clamp01(baseAgg - vsAgg),
      confidence: sampleConfidence(v.softHands.size, 10),
      relatedUserIds: [self, other],
      relatedHandIds: Array.from(v.softHands),
      windowHands: v.softHands.size,
      reasons: ['passive_only_versus_one_opponent'],
      evidence: {
        softHands: v.softHands.size,
        baselineAggressionPct: Math.round(baseAgg * 100),
        versusAggressionPct: Math.round(vsAgg * 100),
      },
    })
  }
  return out.sort((a, b) => b.severity - a.severity)
}

// Bot-like timing: a user's decisions are both very fast and very regular (low jitter), or contain
// impossibly fast actions. Per-user.
export function botTimingSignals(
  hands: readonly HandFacts[],
  opts: GameplaySignalOptions = {},
): readonly RiskSignal[] {
  const botMaxMedian = opts.botMaxMedianMs ?? 700
  const botMaxJitter = opts.botMaxJitterMs ?? 120
  const impossibleMs = opts.impossibleMs ?? 180

  const byUser = new Map<string, number[]>()
  for (const h of hands) {
    for (const s of h.seats) {
      const arr = byUser.get(s.userId) ?? []
      for (const t of s.actionTimingsMs) if (t >= 0) arr.push(t)
      byUser.set(s.userId, arr)
    }
  }

  const out: RiskSignal[] = []
  for (const [userId, timings] of Array.from(byUser)) {
    if (timings.length < 20) continue
    const sorted = [...timings].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]
    const mean = timings.reduce((s, t) => s + t, 0) / timings.length
    const variance = timings.reduce((s, t) => s + (t - mean) * (t - mean), 0) / timings.length
    const stdev = Math.sqrt(variance)
    const impossibleCount = timings.filter((t) => t < impossibleMs).length
    const reasons: string[] = []
    let severity = 0
    if (median <= botMaxMedian && stdev <= botMaxJitter) {
      reasons.push('fast_and_regular_timing')
      severity = Math.max(severity, clamp01(1 - stdev / botMaxJitter) * 0.9)
    }
    if (impossibleCount / timings.length >= 0.2) {
      reasons.push('impossibly_fast_actions')
      severity = Math.max(severity, clamp01(impossibleCount / timings.length))
    }
    if (reasons.length === 0) continue
    out.push({
      code: 'GP_BOT_TIMING',
      category: 'gameplay',
      severity,
      confidence: sampleConfidence(timings.length, 100),
      relatedUserIds: [userId],
      relatedHandIds: [],
      windowHands: timings.length,
      reasons,
      evidence: {
        actions: timings.length,
        medianMs: Math.round(median),
        stdevMs: Math.round(stdev),
        impossibleActionPct: Math.round((impossibleCount / timings.length) * 100),
      },
    })
  }
  return out.sort((a, b) => b.severity - a.severity)
}

// Timing synchronization: across shared hands, two accounts consistently act with matched cadence
// (near-equal per-action latency). Directed-agnostic pair signal.
export function timingSyncSignals(
  hands: readonly HandFacts[],
  opts: GameplaySignalOptions = {},
): readonly RiskSignal[] {
  const minHands = opts.minHands ?? 6
  interface Acc { hands: Set<string>; matched: number; total: number }
  const byPair = new Map<string, Acc>()
  const tol = 150 // ms: two medians within this look "synchronized"

  for (const h of hands) {
    const medians = h.seats
      .filter((s) => s.actionTimingsMs.length > 0)
      .map((s) => {
        const sorted = [...s.actionTimingsMs].sort((a, b) => a - b)
        return { userId: s.userId, median: sorted[Math.floor(sorted.length / 2)] }
      })
    for (let i = 0; i < medians.length; i++) {
      for (let j = i + 1; j < medians.length; j++) {
        const [a, b] = pairKey(medians[i].userId, medians[j].userId)
        const k = `${a}|${b}`
        const acc = byPair.get(k) ?? { hands: new Set<string>(), matched: 0, total: 0 }
        acc.hands.add(h.handId)
        acc.total++
        if (Math.abs(medians[i].median - medians[j].median) <= tol) acc.matched++
        byPair.set(k, acc)
      }
    }
  }

  const out: RiskSignal[] = []
  for (const [k, acc] of Array.from(byPair)) {
    if (acc.hands.size < minHands || acc.total === 0) continue
    const matchRate = acc.matched / acc.total
    if (matchRate < 0.7) continue
    const [a, b] = k.split('|')
    out.push({
      code: 'GP_TIMING_SYNC',
      category: 'gameplay',
      severity: clamp01(matchRate),
      confidence: sampleConfidence(acc.hands.size, 20),
      relatedUserIds: [a, b],
      relatedHandIds: [],
      windowHands: acc.hands.size,
      reasons: ['matched_action_cadence'],
      evidence: { sharedHands: acc.hands.size, matchRatePct: Math.round(matchRate * 100) },
    })
  }
  return out.sort((x, y) => y.severity - x.severity)
}

// ── 3. Account / session — multi-seat, concurrency, shared identifiers, impossible frequency ─
// Same account occupying multiple seats at ONE table in the same hand — impossible in honest play.
export function multiSeatSignals(hands: readonly HandFacts[]): readonly RiskSignal[] {
  interface Acc { hands: Set<string>; maxSeats: number }
  const byUser = new Map<string, Acc>()
  for (const h of hands) {
    const seatCount = new Map<string, number>()
    for (const s of h.seats) seatCount.set(s.userId, (seatCount.get(s.userId) ?? 0) + 1)
    for (const [userId, n] of Array.from(seatCount)) {
      if (n < 2) continue
      const acc = byUser.get(userId) ?? { hands: new Set<string>(), maxSeats: 0 }
      acc.hands.add(h.handId)
      acc.maxSeats = Math.max(acc.maxSeats, n)
      byUser.set(userId, acc)
    }
  }
  const out: RiskSignal[] = []
  for (const [userId, acc] of Array.from(byUser)) {
    out.push({
      code: 'AS_MULTI_SEAT',
      category: 'account_session',
      severity: 1, // structurally impossible in honest play — always maximal intrinsic severity
      confidence: sampleConfidence(acc.hands.size, 1), // even one occurrence is high confidence
      relatedUserIds: [userId],
      relatedHandIds: Array.from(acc.hands),
      windowHands: acc.hands.size,
      reasons: ['same_account_multiple_seats_same_hand'],
      evidence: { hands: acc.hands.size, maxSeatsInAHand: acc.maxSeats },
    })
  }
  return out
}

// Overlapping live sessions: a description of (userId, tableId, startMs, endMs) intervals. Two
// intervals for the same user that overlap on DIFFERENT tables is merely concurrent play; overlap
// on the SAME table (or many simultaneous tables) is the contradictory signal we surface.
export interface SessionInterval {
  readonly userId: string
  readonly tableId: string
  readonly handId: string
  readonly startMs: number
  readonly endMs: number
}

export function concurrentSessionSignals(
  intervals: readonly SessionInterval[],
  opts: { readonly minOverlaps?: number } = {},
): readonly RiskSignal[] {
  const minOverlaps = opts.minOverlaps ?? 2
  const byUser = new Map<string, SessionInterval[]>()
  for (const iv of intervals) (byUser.get(iv.userId) ?? byUser.set(iv.userId, []).get(iv.userId)!).push(iv)

  const out: RiskSignal[] = []
  for (const [userId, list] of Array.from(byUser)) {
    const sorted = [...list].sort((a, b) => a.startMs - b.startMs)
    const overlapHands = new Set<string>()
    let sameTableOverlap = 0
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        if (sorted[j].startMs >= sorted[i].endMs) break
        // overlapping
        overlapHands.add(sorted[i].handId)
        overlapHands.add(sorted[j].handId)
        if (sorted[i].tableId === sorted[j].tableId) sameTableOverlap++
      }
    }
    if (sameTableOverlap < minOverlaps) continue
    out.push({
      code: 'AS_CONCURRENT_SESSIONS',
      category: 'account_session',
      severity: clamp01(Math.min(1, sameTableOverlap / 5)),
      confidence: sampleConfidence(sameTableOverlap, 3),
      relatedUserIds: [userId],
      relatedHandIds: Array.from(overlapHands),
      windowHands: overlapHands.size,
      reasons: ['contradictory_concurrent_live_hands_same_table'],
      evidence: { sameTableOverlaps: sameTableOverlap },
    })
  }
  return out
}

// Shared hashed device/network tokens. WEAK by policy: a shared token alone emits a LOW-severity,
// LOW-confidence signal and never more — the scorer only elevates it when a behavioural signal
// (value flow, chip dump, soft play) exists for the same pair. Shared NETWORK is weaker than
// shared DEVICE.
export function sharedIdentifierSignals(accounts: readonly AccountIdentityTokens[]): readonly RiskSignal[] {
  const overlaps: readonly IdentityOverlap[] = computeIdentityOverlaps(accounts)
  const out: RiskSignal[] = []
  for (const o of overlaps) {
    // Device match is a stronger hint than a shared NAT/office IP, but both stay low & uncertain.
    const severity = o.sharedDevice ? 0.35 : 0.15
    out.push({
      code: 'AS_SHARED_IDENTIFIER',
      category: 'account_session',
      severity,
      confidence: 0.25, // deliberately never confident on identifiers alone
      relatedUserIds: [o.userA, o.userB],
      relatedHandIds: [],
      windowHands: 0,
      reasons: o.sharedDevice ? ['shared_device_token'] : ['shared_network_token'],
      evidence: {
        sharedTokens: o.sharedTokenCount,
        sharedDevice: o.sharedDevice ? 1 : 0,
        sharedNetwork: o.sharedNetwork ? 1 : 0,
      },
    })
  }
  return out
}

// Impossible action frequency: total actions in a bounded wall-clock window that exceeds a human
// ceiling (e.g. many tables auto-played). Input is a per-user count over a stated window.
export interface ActionRateInput {
  readonly userId: string
  readonly actions: number
  readonly windowMs: number
}

export function impossibleFrequencySignals(
  rates: readonly ActionRateInput[],
  opts: { readonly maxActionsPerMinute?: number } = {},
): readonly RiskSignal[] {
  const ceiling = opts.maxActionsPerMinute ?? 120 // > 2 decisions/sec sustained is beyond human
  const out: RiskSignal[] = []
  for (const r of rates) {
    if (r.windowMs <= 0 || r.actions <= 0) continue
    const perMin = (r.actions / r.windowMs) * 60000
    if (perMin <= ceiling) continue
    out.push({
      code: 'AS_IMPOSSIBLE_FREQUENCY',
      category: 'account_session',
      severity: clamp01(Math.min(1, perMin / (ceiling * 2))),
      confidence: sampleConfidence(r.actions, 60),
      relatedUserIds: [r.userId],
      relatedHandIds: [],
      windowHands: 0,
      reasons: ['action_rate_beyond_human'],
      evidence: { actionsPerMinute: Math.round(perMin), ceiling },
    })
  }
  return out
}

// Convenience: everything derivable from HandFacts alone (relationship + gameplay + multi-seat).
export function handDerivedSignals(
  hands: readonly HandFacts[],
  opts: RelationshipSignalOptions & GameplaySignalOptions = {},
): readonly RiskSignal[] {
  return [
    ...relationshipSignals(hands, opts),
    ...chipDumpSignals(hands, opts),
    ...softPlaySignals(hands, opts),
    ...botTimingSignals(hands, opts),
    ...timingSyncSignals(hands, opts),
    ...multiSeatSignals(hands),
  ]
}

export type { PairSignal }
export { round2 }
