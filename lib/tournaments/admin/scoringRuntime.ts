import 'server-only'

// Server-only SCORING RUNTIME. The single entry point every score mutation uses to turn the games an
// admin entered into a validated result + derived winner. It picks ONE authority:
//   • the event's rule SNAPSHOT (rule-aware path) when the event has one, or
//   • the legacy domain engine (validateMatchScores → deriveMatchOutcome) when it does not.
//
// It NEVER trusts a client winner, rule, stage or starting score. The winner is always derived here.
// The pure decision logic lives in lib/tournaments/rules/scoring.ts (stage resolution + evaluation)
// and lib/tournaments/domain/score-input.ts (legacy) — this module only loads the snapshot and maps
// the pure results into one shape the actions consume, plus the safe audit metadata (§16).

import { getEventRuleSnapshotForAdmin, getCompetitorCompositionsForAdmin } from './ruleQueries'
import type { ScoreRuleError } from './types'
import { validateMatchScores, type ScoreGameInput } from '@/lib/tournaments/domain/score-input'
import {
  evaluateMatchScoreWithSnapshot,
  validateTournamentRules,
  type AppliedHandicap,
  type CompetitorComposition,
  type EventScoringRuleView,
  type MatchRules,
  type MatchStageDescriptor,
  type RuleScoreErrorCode,
  type ScoringStage,
  type StageRuleView,
} from '@/lib/tournaments/rules'

export type ScoreRuntimeError = ScoreRuleError | 'invalid_score'

export type ScoreRuntimeSource = 'legacy_default' | 'snapshot'

// Safe audit metadata for a scored result (§16). Only rule shape — never a raw payload, token, or
// secret. `null`s mean "not applicable" (e.g. the legacy path resolves no rule numbers).
export interface ScoreRuleAudit {
  rule_source: ScoreRuntimeSource
  preset_key: string | null
  preset_version: number | null
  snapshot_version: number | null
  rule_category: string | null
  match_stage: ScoringStage | null
  games_to_win: number | null
  points_to_win: number | null
  win_by: number | null
  points_cap: number | null
  handicap_state: 'disabled' | 'enabled' | 'legacy'
  // Handicap application (Prompt 15D-1B). All null / 0 when no handicap applied. `handicap_mode` +
  // difference + female counts explain WHY a game started 2–0 or 4–0; the preset_version above is the
  // handicap rule version. Never a token / secret.
  handicap_mode: string | null
  starting_score_a: number
  starting_score_b: number
  female_count_a: number | null
  female_count_b: number | null
  handicap_difference: number | null
}

// One scored game to persist. `startingScore*` is the server-computed head start (0 when no handicap)
// stored beside the final scoreboard score so a corrected preset can never re-interpret an old result.
export interface ResolvedGame {
  gameNumber: number
  scoreA: number
  scoreB: number
  startingScoreA: number
  startingScoreB: number
}

export interface ResolvedMatchScore {
  games: ResolvedGame[]
  winnerSide: 'A' | 'B'
  winnerId: string
  loserId: string
  gamesWonA: number
  gamesWonB: number
  // Match-level handicap application (same for every game). Persisted for audit (§12/§16).
  startingScoreA: number
  startingScoreB: number
  handicapMode: string | null
  handicapVersion: number | null
  source: ScoreRuntimeSource
  audit: ScoreRuleAudit
}

export type ResolveMatchScoreResult =
  | { ok: true; value: ResolvedMatchScore }
  | { ok: false; error: ScoreRuntimeError; gameNumber?: number }

export interface ResolveMatchScoreInput {
  eventId: string
  competitorAId: string
  competitorBId: string
  stage: MatchStageDescriptor
  games: ScoreGameInput[]
}

// Map the pure evaluator's code onto the action-facing runtime error. `match_not_decided` and
// `not_integer` collapse to the existing `invalid_score` so the UI keeps its current messaging.
function mapRuleCode(code: RuleScoreErrorCode): ScoreRuntimeError {
  switch (code) {
    case 'bye_not_scoreable': return 'bye_not_scoreable'
    case 'match_stage_unsupported': return 'match_stage_unsupported'
    case 'handicap_not_configured': return 'handicap_not_configured'
    case 'competitor_composition_required': return 'competitor_composition_required'
    case 'competitor_composition_invalid': return 'competitor_composition_invalid'
    case 'score_below_starting_score': return 'score_below_starting_score'
    case 'game_tied_not_allowed': return 'game_tied_not_allowed'
    case 'score_below_target': return 'score_below_target'
    case 'score_margin_invalid': return 'score_margin_invalid'
    case 'score_above_cap': return 'score_above_cap'
    case 'too_many_games': return 'too_many_games'
    case 'match_already_decided': return 'match_already_decided'
    case 'not_integer': return 'invalid_score'
    case 'match_not_decided': return 'invalid_score'
    default: return 'invalid_score'
  }
}

const LEGACY_AUDIT = (stage: MatchStageDescriptor): ScoreRuleAudit => ({
  rule_source: 'legacy_default',
  preset_key: null,
  preset_version: null,
  snapshot_version: null,
  rule_category: null,
  // Record the physical stage for traceability even though the legacy path resolves no rule numbers.
  match_stage: stage.stage === 'group' ? 'group' : stage.stage === 'knockout' ? 'knockout' : null,
  games_to_win: null,
  points_to_win: null,
  win_by: null,
  points_cap: null,
  handicap_state: 'legacy',
  handicap_mode: null,
  starting_score_a: 0,
  starting_score_b: 0,
  female_count_a: null,
  female_count_b: null,
  handicap_difference: null,
})

// Attach a zero starting score to each legacy game (the legacy engine has no handicap concept).
function withZeroStart(g: { gameNumber: number; scoreA: number; scoreB: number }): ResolvedGame {
  return { ...g, startingScoreA: 0, startingScoreB: 0 }
}

// Resolve the authoritative result for a match's entered games. Called by every score mutation AFTER
// it has verified ownership + that the match is a real, scoreable pairing (competitors non-null).
export async function resolveMatchScore(input: ResolveMatchScoreInput): Promise<ResolveMatchScoreResult> {
  const snapshotRow = await getEventRuleSnapshotForAdmin(input.eventId)

  // ── Legacy fallback: no snapshot → keep the exact current behaviour (never auto-create one). ──
  if (!snapshotRow) {
    const scored = validateMatchScores({
      competitorAId: input.competitorAId,
      competitorBId: input.competitorBId,
      games: input.games,
    })
    if (!scored.ok) {
      const gameNumber = scored.error.code === 'INVALID_SCORE' ? scored.error.gameNumber : undefined
      return gameNumber
        ? { ok: false, error: 'invalid_score', gameNumber }
        : { ok: false, error: 'invalid_score' }
    }
    return {
      ok: true,
      value: {
        games: scored.games.map((g) => withZeroStart({ gameNumber: g.gameNumber, scoreA: g.scoreA, scoreB: g.scoreB })),
        winnerSide: scored.winnerSide,
        winnerId: scored.winnerId,
        loserId: scored.loserId,
        gamesWonA: scored.gamesWonA,
        gamesWonB: scored.gamesWonB,
        startingScoreA: 0,
        startingScoreB: 0,
        handicapMode: null,
        handicapVersion: null,
        source: 'legacy_default',
        audit: LEGACY_AUDIT(input.stage),
      },
    }
  }

  // ── Snapshot path: a snapshot exists → it is authoritative. Invalid ⇒ block (NO legacy fallback). ──
  const rules = snapshotRow.rules
  if (!validateTournamentRules(rules).ok) {
    return { ok: false, error: 'rules_snapshot_invalid' }
  }

  // Load both competitors' compositions ONLY when the snapshot enables a handicap — a non-handicap
  // event never needs them (and legacy competitors may have none). The compositions come straight from
  // the DB row, proven to belong to the event; the client never supplies them.
  let compA: CompetitorComposition | null = null
  let compB: CompetitorComposition | null = null
  if (rules.handicap.enabled) {
    const comps = await getCompetitorCompositionsForAdmin(input.eventId, [input.competitorAId, input.competitorBId])
    compA = comps.get(input.competitorAId) ?? null
    compB = comps.get(input.competitorBId) ?? null
  }

  const evaluation = evaluateMatchScoreWithSnapshot({
    rules,
    stage: input.stage,
    games: input.games,
    competitorA: compA,
    competitorB: compB,
  })
  if (!evaluation.ok) {
    return { ok: false, error: mapRuleCode(evaluation.code), gameNumber: evaluation.gameNumber }
  }

  const winnerId = evaluation.winner === 'A' ? input.competitorAId : input.competitorBId
  const loserId = evaluation.winner === 'A' ? input.competitorBId : input.competitorAId
  const applied = evaluation.rules
  const h: AppliedHandicap = evaluation.handicap
  // The head start is the SAME for every game/set — attach it to each persisted game row so a later
  // preset edit can never re-interpret this result (§12). Server-computed; the client value is ignored.
  const games: ResolvedGame[] = input.games.map((g, i) => ({
    gameNumber: i + 1,
    scoreA: g.scoreA,
    scoreB: g.scoreB,
    startingScoreA: h.startingScoreA,
    startingScoreB: h.startingScoreB,
  }))
  return {
    ok: true,
    value: {
      games,
      winnerSide: evaluation.winner,
      winnerId,
      loserId,
      gamesWonA: evaluation.gamesWonA,
      gamesWonB: evaluation.gamesWonB,
      startingScoreA: h.startingScoreA,
      startingScoreB: h.startingScoreB,
      handicapMode: h.mode,
      handicapVersion: rules.handicap.enabled ? snapshotRow.presetVersion : null,
      source: 'snapshot',
      audit: {
        rule_source: 'snapshot',
        preset_key: snapshotRow.presetKey,
        preset_version: snapshotRow.presetVersion,
        snapshot_version: snapshotRow.snapshotVersion,
        rule_category: snapshotRow.category,
        match_stage: evaluation.stage,
        games_to_win: applied.games_to_win,
        points_to_win: applied.points_to_win,
        win_by: applied.win_by,
        points_cap: applied.points_cap,
        handicap_state: rules.handicap.enabled ? 'enabled' : 'disabled',
        handicap_mode: h.mode,
        starting_score_a: h.startingScoreA,
        starting_score_b: h.startingScoreB,
        female_count_a: h.femaleCountA,
        female_count_b: h.femaleCountB,
        handicap_difference: h.difference,
      },
    },
  }
}

function toStageView(m: MatchRules): StageRuleView {
  return {
    pointsToWin: m.points_to_win,
    winBy: m.win_by,
    pointsCap: m.points_cap,
    gamesToWin: m.games_to_win,
    maxGames: m.max_games,
    allowTiedGame: m.allow_tied_game,
  }
}

// The client-safe scoring rule view for one event's score editors. Legacy events (no snapshot) get a
// `legacy_default` view with null stage rules so the editor shows the "system default" label. An
// invalid snapshot ALSO reports legacy_default here (display only) — the server still blocks the save
// via resolveMatchScore, so the client never records a score against a broken snapshot.
export async function getEventScoringRuleView(eventId: string): Promise<EventScoringRuleView> {
  const disabledHandicap = { enabled: false, mode: null, pointsPerDifference: null, requiresConfiguration: false }
  const snapshotRow = await getEventRuleSnapshotForAdmin(eventId)
  if (!snapshotRow || !validateTournamentRules(snapshotRow.rules).ok) {
    return { source: 'legacy_default', category: null, group: null, knockout: null, handicapBlocked: false, handicap: disabledHandicap }
  }
  const rules = snapshotRow.rules
  const h = rules.handicap
  return {
    source: snapshotRow.source,
    category: snapshotRow.category,
    group: toStageView(rules.group.match),
    knockout: toStageView(rules.knockout.match),
    // Only a PENDING (unconfigured) handicap blocks the editor. A configured one applies server-side
    // at save time (and blocks there only if a competitor composition is missing/invalid).
    handicapBlocked: h.enabled && h.requires_configuration,
    handicap: {
      enabled: h.enabled,
      mode: h.enabled ? h.mode : null,
      pointsPerDifference: h.mode === 'female_count_difference' ? h.points_per_difference ?? null : null,
      requiresConfiguration: h.enabled && h.requires_configuration,
    },
  }
}

// The group-stage table-point award for an event, from its rule snapshot (§15). Legacy / invalid
// snapshots fall back to the classic win = 1 / loss = 0 so standings + qualification are unchanged.
export async function getEventGroupTablePoints(eventId: string): Promise<{ win: number; loss: number }> {
  const snapshotRow = await getEventRuleSnapshotForAdmin(eventId)
  if (!snapshotRow || !validateTournamentRules(snapshotRow.rules).ok) return { win: 1, loss: 0 }
  return { win: snapshotRow.rules.group.win_table_points, loss: snapshotRow.rules.group.loss_table_points }
}
