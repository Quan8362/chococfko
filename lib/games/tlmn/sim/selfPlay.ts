// ─────────────────────────────────────────────────────────────────────────────
// Self-play batch runner — reproducible games + aggregate health metrics.
//
// Used both as a stand-alone "how does policy X do against a field" report and as
// the inner loop of the optimizer. Rejects any policy that produces an illegal move
// (illegalMoveCount must be 0). Deterministic given the seed list.
// ─────────────────────────────────────────────────────────────────────────────
import { type Rules } from '../engine.ts'
import { type SimPolicy } from './simulator.ts'
import { evaluateCandidate, type EvalMetrics } from './evaluation.ts'

export interface SelfPlayConfig {
  candidate: SimPolicy
  field: SimPolicy[]
  seeds: string[]
  playerCount?: number
  ruleConfig?: Partial<Rules>
}

export interface SelfPlayReport extends EvalMetrics {
  candidateName: string
  fieldNames: string[]
  legal: boolean
}

export function runSelfPlay(cfg: SelfPlayConfig): SelfPlayReport {
  const m = evaluateCandidate({
    candidate: cfg.candidate,
    field: cfg.field,
    seeds: cfg.seeds,
    playerCount: cfg.playerCount,
    ruleConfig: cfg.ruleConfig,
  })
  return {
    ...m,
    candidateName: cfg.candidate.name,
    fieldNames: cfg.field.map(f => f.name),
    legal: m.illegalMoveCount === 0,
  }
}
