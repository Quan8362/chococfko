// ── Poker integrity — RISK SCORING (pure, versioned, explainable) ───────────────────────
//
// Combines RiskSignal evidence into a single 0..100 score PER SUBJECT (a user or an account pair),
// with an overall confidence and an explainable breakdown of what contributed. The score is:
//   • VERSIONED — RISK_SCORE_VERSION + RISK_WEIGHTS_VERSION are stamped on every result so a score
//     can be recomputed and compared as rules evolve.
//   • EXPLAINABLE — every contributing signal is listed with its individual contribution.
//   • DETERMINISTIC — pure function of its inputs; `recompute` reproduces an identical score.
//   • SEPARATE FROM WALLET — no coin fields, no side effects. A high score NEVER moves coins or
//     punishes; it only routes a case to a human (review.ts).
//
// Weak/low-confidence evidence (e.g. a shared household IP) cannot on its own reach an actionable
// band — it only elevates a score when it CO-OCCURS with independent behavioural signals, because
// each signal's contribution is scaled by its own confidence.

import {
  RISK_SIGNAL_CATEGORY,
  type RiskSignal,
  type RiskSignalCode,
  type RiskSignalCategory,
} from './signals.ts'

export const RISK_SCORE_VERSION = 'poker-integrity-score-2026-07-v1' as const
export const RISK_WEIGHTS_VERSION = 'poker-integrity-weights-2026-07-v1' as const

// ⚠️ FIRST-PASS, REVIEW-ONLY CALIBRATION. The weights, band cut-offs, and per-signal thresholds
// below are an UNVALIDATED starting point. They exist to ROUTE evidence to a human, never to act
// automatically. `isActionableAdvisory` is only ever a *suggestion*; no code path turns a score
// into a punishment. Re-tune against real data and bump RISK_WEIGHTS_VERSION before treating any
// band as more than advisory. See docs/poker/integrity/risk-scoring.md.
export const THRESHOLDS_REVIEW_ONLY = true as const

// Per-signal weight in [0,1] — the ceiling contribution a single, fully-severe, fully-confident
// observation of this code can make. Structural impossibilities weigh most; identifier hints least.
export const SIGNAL_WEIGHTS: Record<RiskSignalCode, number> = {
  // relationship
  REL_ONE_WAY_VALUE_FLOW: 0.85,
  REL_VALUE_CONCENTRATION: 0.6,
  REL_REPEATED_PAIRING: 0.4,
  REL_PRIVATE_TABLE_PAIRING: 0.5,
  // gameplay
  GP_CHIP_DUMP: 0.9,
  GP_SOFT_PLAY: 0.65,
  GP_COORDINATED_FOLD: 0.6,
  GP_TIMING_SYNC: 0.55,
  GP_BOT_TIMING: 0.7,
  // account / session
  AS_MULTI_SEAT: 0.95,
  AS_CONCURRENT_SESSIONS: 0.5,
  AS_IMPOSSIBLE_FREQUENCY: 0.8,
  AS_SHARED_IDENTIFIER: 0.3, // weak by policy — corroborating only
}

export type RiskBand = 'none' | 'low' | 'medium' | 'high'

// Band thresholds on the 0..100 score. `high` is the only band the workflow suggests for stronger
// action, and even then only when overall confidence clears MIN_ACTION_CONFIDENCE (advisory).
export const RISK_BANDS: Readonly<Record<Exclude<RiskBand, 'none'>, number>> = {
  low: 20,
  medium: 45,
  high: 70,
}
export const MIN_ACTION_CONFIDENCE = 0.5

export interface SignalContribution {
  readonly code: RiskSignalCode
  readonly category: RiskSignalCategory
  readonly contribution: number // points added to the 0..100 score by this signal
  readonly severity: number
  readonly confidence: number
  readonly reasons: readonly string[]
  readonly evidence: Readonly<Record<string, number>> // redacted numeric evidence for the reviewer
}

export interface RiskScore {
  readonly scoreVersion: string
  readonly weightsVersion: string
  readonly subjectUserIds: readonly string[] // canonical (sorted) subject
  readonly score: number // 0..100
  readonly confidence: number // 0..1 overall
  readonly band: RiskBand
  readonly contributingSignals: readonly SignalContribution[]
  readonly relatedUserIds: readonly string[]
  readonly relatedHandIds: readonly string[]
  readonly windowHands: number
  readonly categories: readonly RiskSignalCategory[] // distinct categories that fired
}

function clamp01(x: number): number { return x < 0 ? 0 : x > 1 ? 1 : x }

export function bandFor(score: number): RiskBand {
  if (score >= RISK_BANDS.high) return 'high'
  if (score >= RISK_BANDS.medium) return 'medium'
  if (score >= RISK_BANDS.low) return 'low'
  return 'none'
}

// Combine a set of signals that are already known to concern the SAME subject.
export function combineSignals(subjectUserIds: readonly string[], signals: readonly RiskSignal[]): RiskScore {
  const subject = [...subjectUserIds].sort()
  const contributions: SignalContribution[] = signals.map((s) => {
    const weight = SIGNAL_WEIGHTS[s.code] ?? 0
    // Raw per-signal strength in [0,1], scaled by its own confidence so weak evidence stays weak.
    const strength = clamp01(weight * clamp01(s.severity) * clamp01(s.confidence))
    return {
      code: s.code,
      category: s.category,
      contribution: strength, // provisional in [0,1]; converted to points below
      severity: clamp01(s.severity),
      confidence: clamp01(s.confidence),
      reasons: s.reasons,
      evidence: s.evidence,
    }
  })

  // Diminishing-returns combination (noisy-OR): p = 1 − Π(1 − strength_i). Keeps score ≤ 100 while
  // rewarding independent corroboration more than a single strong signal.
  let survive = 1
  for (const c of contributions) survive *= 1 - c.contribution
  const combined = 1 - survive
  const score = Math.round(combined * 100)

  // Overall confidence = strength-weighted mean of signal confidences (fallback to plain mean).
  const wsum = contributions.reduce((a, c) => a + c.contribution, 0)
  const confidence = wsum > 0
    ? contributions.reduce((a, c) => a + c.confidence * c.contribution, 0) / wsum
    : contributions.length
      ? contributions.reduce((a, c) => a + c.confidence, 0) / contributions.length
      : 0

  // Convert each provisional [0,1] strength into its marginal point contribution for display.
  const displayed: SignalContribution[] = contributions
    .map((c) => ({ ...c, contribution: Math.round(c.contribution * 100) }))
    .sort((a, b) => b.contribution - a.contribution)

  const relatedUsers = new Set<string>()
  const relatedHands = new Set<string>()
  const categories = new Set<RiskSignalCategory>()
  let windowHands = 0
  for (const s of signals) {
    for (const u of s.relatedUserIds) relatedUsers.add(u)
    for (const h of s.relatedHandIds) relatedHands.add(h)
    categories.add(RISK_SIGNAL_CATEGORY[s.code])
    windowHands = Math.max(windowHands, s.windowHands)
  }

  return {
    scoreVersion: RISK_SCORE_VERSION,
    weightsVersion: RISK_WEIGHTS_VERSION,
    subjectUserIds: subject,
    score,
    confidence: Math.round(confidence * 100) / 100,
    band: bandFor(score),
    contributingSignals: displayed,
    relatedUserIds: Array.from(relatedUsers).sort(),
    relatedHandIds: Array.from(relatedHands).sort(),
    windowHands,
    categories: Array.from(categories),
  }
}

// Canonical subject key for a signal: single-user signals key on that user; pair/relationship
// signals key on the sorted pair. Grouping by this key means a pair's relationship signals and
// a single account's gameplay signals form distinct, comparable subjects.
export function subjectKeyForSignal(s: RiskSignal): string {
  return [...s.relatedUserIds].sort().join('+')
}

// Score every subject present in a flat signal list. Returns one RiskScore per subject, sorted by
// score desc. This is the top-level entry point an integrity job calls each cycle.
export function scoreSubjects(signals: readonly RiskSignal[]): readonly RiskScore[] {
  const groups = new Map<string, RiskSignal[]>()
  for (const s of signals) {
    if (s.relatedUserIds.length === 0) continue
    const k = subjectKeyForSignal(s)
    ;(groups.get(k) ?? groups.set(k, []).get(k)!).push(s)
  }
  const scores: RiskScore[] = []
  for (const [k, group] of Array.from(groups)) {
    scores.push(combineSignals(k.split('+'), group))
  }
  return scores.filter((s) => s.score > 0).sort((a, b) => b.score - a.score)
}

// Deterministic recompute — identical inputs reproduce an identical score (used when weights change
// or a case is re-evaluated). Exists to make the "recalculate when rules change" contract explicit.
export function recomputeScore(subjectUserIds: readonly string[], signals: readonly RiskSignal[]): RiskScore {
  return combineSignals(subjectUserIds, signals)
}

// Stable de-duplication key for a review-queue case so re-running the job UPDATES a case rather
// than creating duplicates. Version-scoped so a weights change opens a fresh comparable case.
export function riskCaseDedupKey(subjectUserIds: readonly string[]): string {
  return `${RISK_WEIGHTS_VERSION}:${[...subjectUserIds].sort().join('+')}`
}

// Advisory only — the workflow never auto-acts. True ⇒ an admin *may* consider stronger action.
export function isActionableAdvisory(score: RiskScore): boolean {
  return score.band === 'high' && score.confidence >= MIN_ACTION_CONFIDENCE
}
