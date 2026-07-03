// ── Poker PRACTICE ops metrics (pure aggregation) ─────────────────────────────────────
//
// PURE module — no React, no Supabase, no clock. Tested by adminMetrics.test.ts.
//
// Aggregates privacy-safe operational counters for the admin dashboard. Carries NO cards and NO
// hidden state — only difficulty labels and integer counters. The admin panel reads these; it can
// NEVER activate bots in a human cash table (there is no such control here or anywhere).

import type { BotDifficulty } from '../bot/policy.ts'
import type { BotIneligibleReason } from './worker.ts'
import type { BotFallbackReason } from '../bot/policy.ts'

export interface PracticeOpsSample {
  readonly tableId: string
  readonly difficulty: BotDifficulty
  readonly acted: boolean
  readonly fallback: BotFallbackReason | null
  readonly ineligible: BotIneligibleReason | null
  readonly staleRejected: boolean
  readonly timedOut: boolean
  readonly conservationFailure: boolean
}

export interface PracticeOpsMetrics {
  readonly totalSamples: number
  readonly botActions: number
  readonly fallbacks: number
  readonly staleRejections: number
  readonly timeouts: number
  readonly conservationFailures: number
  readonly byDifficulty: Readonly<Record<string, number>> // difficulty → actions
  readonly byFallbackReason: Readonly<Record<string, number>>
  readonly byIneligibleReason: Readonly<Record<string, number>>
}

const EMPTY: PracticeOpsMetrics = {
  totalSamples: 0,
  botActions: 0,
  fallbacks: 0,
  staleRejections: 0,
  timeouts: 0,
  conservationFailures: 0,
  byDifficulty: {},
  byFallbackReason: {},
  byIneligibleReason: {},
}

function bump(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1
}

export function aggregatePracticeOps(samples: readonly PracticeOpsSample[]): PracticeOpsMetrics {
  if (samples.length === 0) return EMPTY
  const byDifficulty: Record<string, number> = {}
  const byFallbackReason: Record<string, number> = {}
  const byIneligibleReason: Record<string, number> = {}
  let botActions = 0
  let fallbacks = 0
  let staleRejections = 0
  let timeouts = 0
  let conservationFailures = 0

  for (const s of samples) {
    if (s.acted) {
      botActions += 1
      bump(byDifficulty, s.difficulty)
    }
    if (s.fallback) { fallbacks += 1; bump(byFallbackReason, s.fallback) }
    if (s.ineligible) bump(byIneligibleReason, s.ineligible)
    if (s.staleRejected) staleRejections += 1
    if (s.timedOut) timeouts += 1
    if (s.conservationFailure) conservationFailures += 1
  }

  return {
    totalSamples: samples.length,
    botActions,
    fallbacks,
    staleRejections,
    timeouts,
    conservationFailures,
    byDifficulty,
    byFallbackReason,
    byIneligibleReason,
  }
}

// Difficulty distribution across live practice seats (privacy-safe, no cards).
export function difficultyDistribution(
  seatDifficulties: readonly BotDifficulty[],
): Readonly<Record<string, number>> {
  const out: Record<string, number> = {}
  for (const d of seatDifficulties) bump(out, d)
  return out
}
