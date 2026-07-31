// Rule-aware SCORING ORCHESTRATION. Pure & deterministic; no I/O; never mutates input.
//
// Given an event's rule snapshot (a RuleSet) and the physical stage of a match, this decides WHICH
// match rules apply (group vs knockout), then judges the entered games with the SAME engine the rest
// of the rule package uses (validateGameScoreByRules / validateMatchScoresByRules) and derives the
// winner. It never re-implements the 15/21 / win-by / cap / deuce logic — that lives in match-rules.ts.
//
// This is the config-driven counterpart to the domain engine's fixed validateMatchScores → the server
// scoring actions choose one or the other: the rule path when an event has a snapshot, the legacy
// domain path when it does not (see lib/tournaments/admin/scoringRuntime.ts).
//
// Hard rule (inherited from the whole package): nothing here branches on a tournament/event name, a
// year, or a category string. Every decision is driven by the snapshot passed in.

import {
  type CompetitorComposition,
  type GroupStageRules,
  type HandicapMode,
  type MatchRules,
  type RuleSet,
} from './types.ts'
import {
  validateGameScoreByRules,
  validateMatchScoresByRules,
  type MatchScoreError,
  type WinnerSide,
} from './match-rules.ts'
import { calculateStartingScore } from './handicap.ts'
import type { RuleEngineErrorCode } from './errors.ts'

// ── Match stage resolution ────────────────────────────────────────────────────────────────────
// The physical placement of a match, straight from the DB row — never a client-declared stage.
//   • stage   : 'group' (round-robin / group_knockout group phase) | 'knockout' (bracket match)
//   • bracket : 'championship' | 'consolation' | null (pure-knockout event has no bracket label)
//   • status  : 'pending' | 'ready' | 'completed' | 'bye' | 'cancelled'
export interface MatchStageDescriptor {
  readonly stage: string
  readonly bracket: string | null
  readonly status: string
}

export type ScoringStage = 'group' | 'knockout'

export type StageResolutionError = 'bye_not_scoreable' | 'match_stage_unsupported'

export type StageResolution =
  | { readonly ok: true; readonly stage: 'group'; readonly match: MatchRules; readonly group: GroupStageRules }
  | { readonly ok: true; readonly stage: 'knockout'; readonly match: MatchRules; readonly group: null }
  | { readonly ok: false; readonly error: StageResolutionError }

// Resolve the applicable match rules for one match from its stage + the event rule set.
//   • a BYE is never scoreable                                   → bye_not_scoreable
//   • group / round-robin matches                                → group rules
//   • knockout matches — championship, consolation, third-place, and the pure-knockout (null) bracket
//     ALL use the knockout rules (third-place is structurally a knockout match)   → knockout rules
//   • any other stage is a typed unsupported result, never a silent fallback     → match_stage_unsupported
export function resolveMatchScoringRules(descriptor: MatchStageDescriptor, rules: RuleSet): StageResolution {
  if (descriptor.status === 'bye') return { ok: false, error: 'bye_not_scoreable' }

  switch (descriptor.stage) {
    case 'group':
      return { ok: true, stage: 'group', match: rules.group.match, group: rules.group }
    case 'knockout':
      if (
        descriptor.bracket === null ||
        descriptor.bracket === 'championship' ||
        descriptor.bracket === 'consolation'
      ) {
        return { ok: true, stage: 'knockout', match: rules.knockout.match, group: null }
      }
      return { ok: false, error: 'match_stage_unsupported' }
    default:
      return { ok: false, error: 'match_stage_unsupported' }
  }
}

// ── Full-match evaluation under a snapshot ────────────────────────────────────────────────────
export type RuleScoreErrorCode =
  | 'bye_not_scoreable'
  | 'match_stage_unsupported'
  | 'handicap_not_configured'
  | 'competitor_composition_required'
  | 'competitor_composition_invalid'
  | 'score_below_starting_score'
  | 'not_integer'
  | 'game_tied_not_allowed'
  | 'score_below_target'
  | 'score_margin_invalid'
  | 'score_above_cap'
  | 'too_many_games'
  | 'match_not_decided'
  | 'match_already_decided'

// The server-computed head start applied to a match under a handicap, surfaced so callers persist it
// for audit (§12). All zero when the handicap is disabled. Applies to EVERY game/set of the match.
export interface AppliedHandicap {
  readonly startingScoreA: number
  readonly startingScoreB: number
  readonly mode: HandicapMode | null
  readonly femaleCountA: number | null
  readonly femaleCountB: number | null
  readonly difference: number | null
}

export type MatchScoreEvaluation =
  | {
      readonly ok: true
      readonly stage: ScoringStage
      readonly rules: MatchRules
      readonly winner: WinnerSide
      readonly gamesWonA: number
      readonly gamesWonB: number
      readonly tiedGames: number
      readonly handicap: AppliedHandicap
    }
  | { readonly ok: false; readonly code: RuleScoreErrorCode; readonly gameNumber?: number }

export interface EvaluateMatchScoreInput {
  readonly rules: RuleSet
  readonly stage: MatchStageDescriptor
  readonly games: readonly { readonly scoreA: number; readonly scoreB: number }[]
  // Competitor compositions (kind + gender counts). Required ONLY when the snapshot enables a
  // configured handicap that keys off composition; `null`/omitted then yields a typed
  // competitor_composition_required. Never an identity — see handicap.ts.
  readonly competitorA?: CompetitorComposition | null
  readonly competitorB?: CompetitorComposition | null
}

const NO_HANDICAP: AppliedHandicap = {
  startingScoreA: 0,
  startingScoreB: 0,
  mode: null,
  femaleCountA: null,
  femaleCountB: null,
  difference: null,
}

// Map a pure handicap RuleEngineError code onto the scoring-facing code. A no-entry / negative-score
// config gap fails closed as "not configured" (never a silent 0–0); a missing/invalid composition is
// its own typed code so the UI can point at the exact competitor.
function mapHandicapError(code: RuleEngineErrorCode): RuleScoreErrorCode {
  switch (code) {
    case 'HANDICAP_COMPOSITION_REQUIRED': return 'competitor_composition_required'
    case 'HANDICAP_COMPOSITION_INVALID': return 'competitor_composition_invalid'
    case 'HANDICAP_NOT_CONFIGURED':
    case 'HANDICAP_NO_ENTRY':
    case 'NEGATIVE_STARTING_SCORE':
    default:
      return 'handicap_not_configured'
  }
}

// Map the engine's series error onto a stable rule-scoring code (+ the offending game number).
function mapSeriesError(error: MatchScoreError): { readonly code: RuleScoreErrorCode; readonly gameNumber?: number } {
  if (error.kind === 'too_many_games') return { code: 'too_many_games' }
  if (error.kind === 'not_decided') return { code: 'match_not_decided' }
  const gameNumber = error.gameNumber
  switch (error.code) {
    case 'NOT_INTEGER': return { code: 'not_integer', gameNumber }
    case 'TIED_NOT_ALLOWED': return { code: 'game_tied_not_allowed', gameNumber }
    case 'EXCEEDS_CAP': return { code: 'score_above_cap', gameNumber }
    case 'TARGET_NOT_REACHED': return { code: 'score_below_target', gameNumber }
    case 'WIN_BY_NOT_MET': return { code: 'score_margin_invalid', gameNumber }
    case 'INVALID_OVERSHOOT': return { code: 'score_margin_invalid', gameNumber }
    default: return { code: 'score_margin_invalid', gameNumber }
  }
}

// The 1-based number of the first game recorded AFTER the match was already decided (a side had
// already reached games_to_win with strictly more wins), or null if none. The series validator
// accepts trailing games below max_games, so this catches an "extra game after the winner" that a
// pure count check would miss. Illegal individual games are left to the series validator (returns
// null so the error is reported once).
function firstExtraGameAfterDecision(
  rules: MatchRules,
  games: readonly { readonly scoreA: number; readonly scoreB: number }[],
): number | null {
  let a = 0
  let b = 0
  for (let i = 0; i < games.length; i++) {
    const decided = (a >= rules.games_to_win && a > b) || (b >= rules.games_to_win && b > a)
    if (decided) return i + 1
    const r = validateGameScoreByRules(rules, games[i])
    if (!r.ok) return null
    if (!r.tied) {
      if (r.winner === 'A') a += 1
      else b += 1
    }
  }
  return null
}

// Evaluate an ordered list of game scores for ONE match against the event rule set. Resolves the
// stage's rules, applies the handicap ("chấp điểm") as a per-game STARTING SCORE computed server-side
// from the two compositions (never from the client, never invented), validates the final scoreboard
// scores against target/win-by/cap, and derives the winner via the pure engine.
//
// Score semantics (§11): the handicap is each side's OPENING score for every game. The scores in
// `games` are the FINAL scoreboard scores (already including the head start). So a final score below
// the starting score is impossible and rejected; target/win-by/cap apply to the final scoreboard.
export function evaluateMatchScoreWithSnapshot(input: EvaluateMatchScoreInput): MatchScoreEvaluation {
  const resolution = resolveMatchScoringRules(input.stage, input.rules)
  if (!resolution.ok) return { ok: false, code: resolution.error }

  const handicapRules = input.rules.handicap

  // Compute the head start. Disabled ⇒ 0–0. Enabled ⇒ derived from both compositions; an unconfigured
  // handicap, or a missing/invalid composition, fails closed with a typed code (never a guessed 0–0).
  let applied: AppliedHandicap = NO_HANDICAP
  if (handicapRules.enabled) {
    const start = calculateStartingScore({
      handicap: handicapRules,
      competitorA: input.competitorA ?? null,
      competitorB: input.competitorB ?? null,
    })
    if (!start.ok) return { ok: false, code: mapHandicapError(start.error.code) }
    applied = {
      startingScoreA: start.value.startingScoreA,
      startingScoreB: start.value.startingScoreB,
      mode: start.value.mode,
      femaleCountA: start.value.femaleCountA,
      femaleCountB: start.value.femaleCountB,
      difference: start.value.difference,
    }
  }

  const match = resolution.match

  // A final scoreboard score can never be below the side's opening (handicap) score. Checked per game
  // BEFORE target/cap validation so the organizer gets the precise reason (§13 step 5 before step 6).
  if (applied.startingScoreA > 0 || applied.startingScoreB > 0) {
    for (let i = 0; i < input.games.length; i++) {
      const g = input.games[i]
      if (g.scoreA < applied.startingScoreA || g.scoreB < applied.startingScoreB) {
        return { ok: false, code: 'score_below_starting_score', gameNumber: i + 1 }
      }
    }
  }

  const series = validateMatchScoresByRules(match, input.games)
  if (!series.ok) {
    const mapped = mapSeriesError(series.error)
    return { ok: false, code: mapped.code, gameNumber: mapped.gameNumber }
  }

  const extra = firstExtraGameAfterDecision(match, input.games)
  if (extra !== null) return { ok: false, code: 'match_already_decided', gameNumber: extra }

  return {
    ok: true,
    stage: resolution.stage,
    rules: match,
    winner: series.winner,
    gamesWonA: series.gamesWonA,
    gamesWonB: series.gamesWonB,
    tiedGames: series.tiedGames,
    handicap: applied,
  }
}
