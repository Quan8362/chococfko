// ── Poker INTEGRITY — scheduled scoring job (server-only; called by the cron route) ─────
//
// Deterministic + idempotent. Each run:
//   1. reduces recent settled hands to privacy-safe HandFacts (buildRiskHandFacts — no cards),
//   2. runs the PURE risk engine (handDerivedSignals → scoreSubjects),
//   3. UPSERTs each above-threshold subject via poker_risk_upsert_case, keyed by the version-scoped
//      riskCaseDedupKey so re-running UPDATES a case (never duplicates) and preserves human-owned
//      status/notes/resolution.
//
// Persists ONLY versioned scores + REDACTED numeric evidence. Never moves coins, never punishes,
// never opens incidents. Degrade-safe: if migration_poker_integrity.sql is not yet applied, the
// RPC is missing → the job reports `dbAvailable: false` and persists nothing (no error thrown).
//
// IDENTIFIER CORRELATION IS DISABLED HERE BY CONSTRUCTION: this path uses only handDerivedSignals
// (behavioural), never sharedIdentifierSignals. Device/network correlation stays off until the
// lawful-basis + privacy-policy + server-only-salt requirements in docs/poker/integrity/privacy.md
// are met and a session→hashed-token capture is deliberately wired.

import { createAdminClient } from '@/lib/supabase/admin'
import { buildRiskHandFacts } from './integrity-data'
import {
  handDerivedSignals,
  scoreSubjects,
  subjectKeyForSignal,
  riskCaseDedupKey,
  redactPii,
  RISK_SCORE_VERSION,
  RISK_WEIGHTS_VERSION,
  type RiskSignal,
} from '@/lib/games/poker/integrity'

export interface RiskScoringJobResult {
  ok: boolean
  dbAvailable: boolean
  handsAnalyzed: number
  subjectsScored: number
  persisted: number
  skipped: number
  minScore: number
  scoreVersion: string
  weightsVersion: string
  durationMs: number
}

const MISSING_OBJECT_RE = /does not exist|could not find|schema cache|relation .* does not exist|function .* does not exist/i

export async function runRiskScoringJob(
  opts: { limitHands?: number; minScore?: number } = {},
): Promise<RiskScoringJobResult> {
  const started = Date.now()
  const limitHands = opts.limitHands ?? 800
  const minScore = opts.minScore ?? 20

  const facts = await buildRiskHandFacts(limitHands)
  const signals = handDerivedSignals(facts)
  const scores = scoreSubjects(signals).filter((s) => s.score >= minScore)

  const base = {
    handsAnalyzed: facts.length,
    subjectsScored: scores.length,
    minScore,
    scoreVersion: RISK_SCORE_VERSION,
    weightsVersion: RISK_WEIGHTS_VERSION,
  }
  if (scores.length === 0) {
    return { ok: true, dbAvailable: true, persisted: 0, skipped: 0, ...base, durationMs: Date.now() - started }
  }

  // Group the raw signals per subject so the persisted snapshot keeps full per-signal fidelity.
  const bySubject = new Map<string, RiskSignal[]>()
  for (const s of signals) {
    const k = subjectKeyForSignal(s)
    ;(bySubject.get(k) ?? bySubject.set(k, []).get(k)!).push(s)
  }

  const windowFrom = facts.length ? new Date(Math.min(...facts.map((f) => f.completedAtMs || Date.now()))).toISOString() : null
  const windowTo = facts.length ? new Date(Math.max(...facts.map((f) => f.completedAtMs || 0)) || Date.now()).toISOString() : null

  const admin = createAdminClient()
  let persisted = 0
  let skipped = 0
  let dbAvailable = true

  for (const score of scores) {
    const raw = bySubject.get(score.subjectUserIds.join('+')) ?? []
    const contribByCode = new Map(score.contributingSignals.map((c) => [c.code, c.contribution]))
    const pSignals = raw.map((sig) => ({
      code: sig.code,
      category: sig.category,
      severity: sig.severity,
      confidence: sig.confidence,
      contribution: contribByCode.get(sig.code) ?? 0,
      reasons: [...sig.reasons],
      evidence: redactPii({ ...sig.evidence }),
      relatedUserIds: [...sig.relatedUserIds],
      relatedHandIds: sig.relatedHandIds.slice(0, 25),
      windowHands: sig.windowHands,
    }))

    // Advisory magnitude only (NOT a coin movement): the largest value-flow the signals observed.
    const valueTransferred = raw.reduce((mx, s) => {
      const v = Math.abs(Number(s.evidence.chipsTransferred ?? s.evidence.netFlow ?? 0))
      return v > mx ? v : mx
    }, 0)

    const signalSummary = redactPii({
      top: score.contributingSignals[0]?.code ?? '',
      categories: score.categories.length,
      score: score.score,
    })

    const { error } = await admin.rpc('poker_risk_upsert_case', {
      p_dedup_key: riskCaseDedupKey(score.subjectUserIds),
      p_score: score.score,
      p_score_version: RISK_SCORE_VERSION,
      p_weights_version: RISK_WEIGHTS_VERSION,
      p_confidence: score.confidence,
      p_band: score.band,
      p_subject_user_ids: [...score.subjectUserIds],
      p_related_user_ids: [...score.relatedUserIds],
      p_related_hand_ids: score.relatedHandIds.slice(0, 50),
      p_value_transferred: Math.round(valueTransferred),
      p_window_from: windowFrom,
      p_window_to: windowTo,
      p_signal_summary: signalSummary,
      p_signals: pSignals,
    })

    if (error) {
      // Migration not applied yet (missing function/table) → stop, report unavailable, no throw.
      if (MISSING_OBJECT_RE.test(error.message)) { dbAvailable = false; break }
      skipped++
    } else {
      persisted++
    }
  }

  return { ok: dbAvailable, dbAvailable, persisted, skipped, ...base, durationMs: Date.now() - started }
}
