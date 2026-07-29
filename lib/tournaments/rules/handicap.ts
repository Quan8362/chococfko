// Handicap ("chấp điểm") model + evaluation. Pure & deterministic. The concrete FJP 2026 handicap
// VALUES are not yet confirmed by the organizer, so this module ships the schema, validation, and a
// fail-closed evaluator: an enabled-but-unconfigured handicap yields a TYPED error rather than a
// guessed number. Never invent handicap values.
//
// Handicap keys ONLY off competitor composition (kind + gender counts) — never identity.

import {
  type CompetitorComposition,
  type HandicapRuleEntry,
  type HandicapRules,
} from './types.ts'
import { RuleEngineError } from './errors.ts'

// Stable class key for a composition — used to match a side against a handicap entry.
export function compositionKey(c: {
  readonly kind: CompetitorComposition['kind']
  readonly maleCount: number
  readonly femaleCount: number
}): string {
  return `${c.kind}:m${c.maleCount}:f${c.femaleCount}`
}

function findEntry(
  entries: readonly HandicapRuleEntry[],
  comp: CompetitorComposition,
): HandicapRuleEntry | undefined {
  const key = compositionKey(comp)
  return entries.find((e) => compositionKey(e) === key)
}

export interface StartingScore {
  readonly startingScoreA: number
  readonly startingScoreB: number
  readonly adjustmentA: number
  readonly adjustmentB: number
}

export type StartingScoreResult =
  | { readonly ok: true; readonly value: StartingScore }
  | { readonly ok: false; readonly error: RuleEngineError }

// Compute each side's starting score for a game under a handicap.
//   • disabled                 → 0 / 0 (no adjustment)
//   • enabled + requires_configuration (or no entries) → HANDICAP_NOT_CONFIGURED (fail closed)
//   • enabled + configured, no matching entry for a side → HANDICAP_NO_ENTRY
//   • a resulting negative starting score → NEGATIVE_STARTING_SCORE
//
// For mode `point_adjustment` the value is still surfaced as `adjustment*`; the starting score is
// left at 0 so callers can apply the adjustment to the final total instead of the opening score.
export function calculateStartingScore(input: {
  readonly handicap: HandicapRules
  readonly competitorA: CompetitorComposition
  readonly competitorB: CompetitorComposition
}): StartingScoreResult {
  const { handicap, competitorA, competitorB } = input

  if (!handicap.enabled) {
    return { ok: true, value: { startingScoreA: 0, startingScoreB: 0, adjustmentA: 0, adjustmentB: 0 } }
  }

  if (handicap.requires_configuration || handicap.entries.length === 0) {
    return {
      ok: false,
      error: new RuleEngineError(
        'HANDICAP_NOT_CONFIGURED',
        'Handicap is enabled but its values are not yet confirmed',
        { requiresConfiguration: handicap.requires_configuration, entryCount: handicap.entries.length },
      ),
    }
  }

  const entryA = findEntry(handicap.entries, competitorA)
  const entryB = findEntry(handicap.entries, competitorB)
  if (!entryA || !entryB) {
    return {
      ok: false,
      error: new RuleEngineError('HANDICAP_NO_ENTRY', 'No handicap entry matches a competitor composition', {
        missing: !entryA ? compositionKey(competitorA) : compositionKey(competitorB),
      }),
    }
  }

  const adjustmentA = entryA.value
  const adjustmentB = entryB.value
  const startingScoreA = handicap.mode === 'starting_score' ? adjustmentA : 0
  const startingScoreB = handicap.mode === 'starting_score' ? adjustmentB : 0

  if (startingScoreA < 0 || startingScoreB < 0) {
    return {
      ok: false,
      error: new RuleEngineError('NEGATIVE_STARTING_SCORE', 'Handicap produced a negative starting score', {
        startingScoreA, startingScoreB,
      }),
    }
  }

  return { ok: true, value: { startingScoreA, startingScoreB, adjustmentA, adjustmentB } }
}
