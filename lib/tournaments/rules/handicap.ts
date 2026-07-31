// Handicap ("chấp điểm") model + evaluation. Pure & deterministic. Handicap keys ONLY off competitor
// composition (kind + gender counts) — never identity, a pair name, or a category string.
//
// Two families of handicap are supported:
//   • entry-matched (`starting_score` / `point_adjustment`) — a side's composition class is looked up
//     in `entries`, and the matched value is its head start / adjustment.
//   • `female_count_difference` — the OFFICIAL FJP OLYMPIAD 2026 rule: the pair with MORE women starts
//     each game ahead by `points_per_difference` points per surplus woman. difference = femaleCountA −
//     femaleCountB; the heavier side begins with |difference| × points_per_difference, the other with 0.
//
// Never invent handicap values: an enabled-but-unconfigured handicap yields a TYPED error, and a
// competitor missing / with an invalid composition is a typed error, never a silent 0–0 fallback.

import {
  type CompetitorComposition,
  type HandicapMode,
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

// A composition is structurally valid when both counts are non-negative integers and the total
// agrees with the kind (single ⇒ 1, pair ⇒ 2, team ⇒ ≥ 2). Mirrors validateCompetitorComposition
// so the handicap layer can fail closed on a malformed composition without importing validation.ts.
function isValidComposition(c: CompetitorComposition): boolean {
  const { kind, maleCount, femaleCount } = c
  if (!Number.isInteger(maleCount) || maleCount < 0) return false
  if (!Number.isInteger(femaleCount) || femaleCount < 0) return false
  const total = maleCount + femaleCount
  return kind === 'single' ? total === 1 : kind === 'pair' ? total === 2 : total >= 2
}

export type StartingScoreReason = 'disabled' | 'entry_match' | 'female_count_difference'

// The full, typed starting-score outcome (§9). `startingScore*` are the head starts each side begins
// a game on; `adjustment*` carries the raw value for the `point_adjustment` mode (where the starting
// score is intentionally 0). The composition diagnostics (femaleCount*, difference) make the result
// auditable — a server can record WHY a game began 4–0.
export interface StartingScore {
  readonly startingScoreA: number
  readonly startingScoreB: number
  readonly adjustmentA: number
  readonly adjustmentB: number
  readonly femaleCountA: number
  readonly femaleCountB: number
  readonly difference: number // femaleCountA − femaleCountB
  readonly mode: HandicapMode
  readonly reason: StartingScoreReason
}

export type StartingScoreResult =
  | { readonly ok: true; readonly value: StartingScore }
  | { readonly ok: false; readonly error: RuleEngineError }

function disabledResult(
  a: CompetitorComposition | null,
  b: CompetitorComposition | null,
  mode: HandicapMode,
): StartingScore {
  const femaleCountA = a?.femaleCount ?? 0
  const femaleCountB = b?.femaleCount ?? 0
  return {
    startingScoreA: 0,
    startingScoreB: 0,
    adjustmentA: 0,
    adjustmentB: 0,
    femaleCountA,
    femaleCountB,
    difference: femaleCountA - femaleCountB,
    mode,
    reason: 'disabled',
  }
}

// Compute each side's starting score for a game under a handicap. Pure; never mutates input.
//   • disabled                                                → 0 / 0 (reason 'disabled')
//   • enabled + requires_configuration                        → HANDICAP_NOT_CONFIGURED (fail closed)
//   • a competitor missing a composition                      → HANDICAP_COMPOSITION_REQUIRED
//   • a competitor with a structurally invalid composition    → HANDICAP_COMPOSITION_INVALID
//   • mode 'female_count_difference':
//       – no positive points_per_difference                   → HANDICAP_NOT_CONFIGURED
//       – difference = femaleCountA − femaleCountB; heavier side starts |difference| × ppd, other 0
//   • entry-matched modes (starting_score / point_adjustment):
//       – no entries                                          → HANDICAP_NOT_CONFIGURED
//       – no entry matches a side                             → HANDICAP_NO_ENTRY
//   • a resulting negative starting score                     → NEGATIVE_STARTING_SCORE
export function calculateStartingScore(input: {
  readonly handicap: HandicapRules
  readonly competitorA: CompetitorComposition | null
  readonly competitorB: CompetitorComposition | null
}): StartingScoreResult {
  const { handicap, competitorA, competitorB } = input

  if (!handicap.enabled) {
    return { ok: true, value: disabledResult(competitorA, competitorB, handicap.mode) }
  }

  if (handicap.requires_configuration) {
    return {
      ok: false,
      error: new RuleEngineError(
        'HANDICAP_NOT_CONFIGURED',
        'Handicap is enabled but its values are not yet confirmed',
        { requiresConfiguration: true },
      ),
    }
  }

  // Every enabled + configured handicap keys off both compositions → both are required and valid.
  if (!competitorA || !competitorB) {
    return {
      ok: false,
      error: new RuleEngineError('HANDICAP_COMPOSITION_REQUIRED', 'A competitor is missing its composition', {
        missing: !competitorA ? 'A' : 'B',
      }),
    }
  }
  if (!isValidComposition(competitorA) || !isValidComposition(competitorB)) {
    return {
      ok: false,
      error: new RuleEngineError('HANDICAP_COMPOSITION_INVALID', 'A competitor composition is invalid', {
        invalid: !isValidComposition(competitorA) ? 'A' : 'B',
      }),
    }
  }

  const femaleCountA = competitorA.femaleCount
  const femaleCountB = competitorB.femaleCount
  const difference = femaleCountA - femaleCountB

  // ── Official FJP difference handicap ─────────────────────────────────────────────────────────
  if (handicap.mode === 'female_count_difference') {
    const ppd = handicap.points_per_difference
    if (typeof ppd !== 'number' || !Number.isInteger(ppd) || ppd <= 0) {
      return {
        ok: false,
        error: new RuleEngineError(
          'HANDICAP_NOT_CONFIGURED',
          'female_count_difference handicap has no valid points_per_difference',
          { pointsPerDifference: ppd ?? null },
        ),
      }
    }
    const magnitude = Math.abs(difference) * ppd
    const startingScoreA = difference > 0 ? magnitude : 0
    const startingScoreB = difference < 0 ? magnitude : 0
    return {
      ok: true,
      value: {
        startingScoreA,
        startingScoreB,
        adjustmentA: startingScoreA,
        adjustmentB: startingScoreB,
        femaleCountA,
        femaleCountB,
        difference,
        mode: handicap.mode,
        reason: 'female_count_difference',
      },
    }
  }

  // ── Entry-matched modes ──────────────────────────────────────────────────────────────────────
  if (handicap.entries.length === 0) {
    return {
      ok: false,
      error: new RuleEngineError('HANDICAP_NOT_CONFIGURED', 'Handicap is enabled but has no entries', {
        entryCount: 0,
      }),
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

  return {
    ok: true,
    value: {
      startingScoreA,
      startingScoreB,
      adjustmentA,
      adjustmentB,
      femaleCountA,
      femaleCountB,
      difference,
      mode: handicap.mode,
      reason: 'entry_match',
    },
  }
}
