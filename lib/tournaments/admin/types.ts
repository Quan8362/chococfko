// Shared, pure types for the admin tournament module. No I/O, no 'server-only' → safe to
// import from both Server Components/actions and Client Components.

import type { TournamentFieldErrors, TournamentFormValues } from '@/lib/tournaments/validation'
import type { EventFieldErrors, EventFormValues, EventFormat } from '@/lib/tournaments/eventValidation'
import type {
  CompetitorFieldErrors,
  CompetitorFormValues,
} from '@/lib/tournaments/competitorValidation'
import type { Bracket } from '@/lib/tournaments/domain/types'
import type { EventScoringRuleView } from '@/lib/tournaments/rules'

export type { TournamentFormValues, TournamentFieldErrors }
export type { EventFormValues, EventFieldErrors, EventFormat }
export type { CompetitorFormValues, CompetitorFieldErrors }

export type TournamentStatus = 'draft' | 'published' | 'completed' | 'archived'

// List filter tabs (adds 'all' on top of the four statuses).
export type TournamentStatusFilter = 'all' | TournamentStatus

export const TOURNAMENT_STATUSES: readonly TournamentStatus[] = [
  'draft',
  'published',
  'completed',
  'archived',
] as const

export const TOURNAMENT_STATUS_FILTERS: readonly TournamentStatusFilter[] = [
  'all',
  ...TOURNAMENT_STATUSES,
] as const

export function isTournamentStatusFilter(v: string | undefined): v is TournamentStatusFilter {
  return !!v && (TOURNAMENT_STATUS_FILTERS as readonly string[]).includes(v)
}

// One row in the admin list — includes the aggregated event count (single query, no N+1).
export interface TournamentListItem {
  id: string
  slug: string
  name: string
  status: TournamentStatus
  startsAt: string | null
  endsAt: string | null
  location: string | null
  eventCount: number
  updatedAt: string
}

// Full detail for the admin detail/edit screens.
export interface TournamentDetail {
  id: string
  slug: string
  name: string
  status: TournamentStatus
  startsAt: string | null
  endsAt: string | null
  location: string | null
  rulesUrl: string | null
  eventCount: number
  hasChildren: boolean
  createdAt: string
  updatedAt: string
  // Site-Admin opt-in for the home-page activity-promo strip (independent of publish/archive).
  homePromoEnabled: boolean
}

// Stable machine codes for mutation failures → the UI localizes each one.
export type TournamentMutationError =
  | 'forbidden'
  | 'invalid'
  | 'not_found'
  | 'slug_taken'
  | 'version_conflict'
  | 'needs_event'
  | 'has_children'
  | 'not_draft'
  | 'unknown'

export type TournamentMutationResult =
  | { ok: true; id: string; slug?: string }
  | { ok: false; error: TournamentMutationError; fieldErrors?: TournamentFieldErrors }

// ── Events (nội dung thi đấu) ───────────────────────────────────────────────────────────────

export type EventStatus =
  | 'setup'
  | 'group_stage'
  | 'group_stage_completed'
  | 'knockout_ready'
  | 'knockout_running'
  | 'completed'

// One event row in the tournament-detail list (carries competitor count via a single query).
export interface EventListItem {
  id: string
  name: string
  format: EventFormat
  status: EventStatus
  groupCount: number
  winnerQualifiersPerGroup: number
  consolationQualifiersPerGroup: number
  thirdPlaceEnabled: boolean
  displayOrder: number
  competitorCount: number
  version: number
}

// One competitor row shown in the event-detail manager.
export interface CompetitorRow {
  id: string
  name: string
  shortName: string | null
  seed: number | null
  displayOrder: number
  updatedAt: string
  // Gender make-up for the handicap layer (Prompt 15D-1B). Null when unset (legacy / non-handicap).
  composition: { kind: 'single' | 'pair' | 'team'; maleCount: number; femaleCount: number } | null
}

// Full detail for the event-detail screen: settings + counts + roster.
export interface EventDetail {
  id: string
  tournamentId: string
  tournamentName: string
  tournamentStatus: TournamentStatus
  name: string
  format: EventFormat
  status: EventStatus
  groupCount: number
  winnerQualifiersPerGroup: number
  consolationQualifiersPerGroup: number
  thirdPlaceEnabled: boolean
  displayOrder: number
  version: number
  competitorCount: number
  matchCount: number
  completedMatchCount: number
  competitors: CompetitorRow[]
}

// Stable machine codes for event/competitor mutation failures → the UI localizes each one.
export type EventMutationError =
  | 'forbidden'
  | 'invalid'
  | 'not_found'
  | 'tournament_not_found'
  | 'wrong_tournament'
  | 'version_conflict'
  | 'event_has_results' // a completed match exists → format change / delete blocked
  | 'event_needs_reset' // matches exist (not completed) → must reset generation in a later phase
  | 'event_locked' // event already has generated matches → competitor roster is frozen
  | 'competitor_has_results' // competitor is in a completed match → cannot delete
  | 'competitor_needs_reset' // competitor is referenced by a pending/ready match or a group
  | 'bulk_empty'
  | 'bulk_too_many'
  | 'bulk_duplicate_input'
  | 'bulk_duplicate_existing'
  | 'unknown'

export type EventMutationResult =
  | { ok: true; id: string }
  | {
      ok: false
      error: EventMutationError
      fieldErrors?: EventFieldErrors
      // For bulk failures: the offending names (already normalized) so the UI can list them.
      names?: string[]
    }

export type CompetitorMutationResult =
  | { ok: true; id: string }
  | { ok: false; error: EventMutationError; fieldErrors?: CompetitorFieldErrors }

export type BulkMutationResult =
  | { ok: true; created: number }
  | { ok: false; error: EventMutationError; fieldErrors?: never; names?: string[] }

export const EVENT_FORMAT_ORDER: readonly EventFormat[] = [
  'round_robin',
  'group_knockout',
  'knockout',
] as const

// ── Groups & assignment (Prompt 06) ─────────────────────────────────────────────────────────

// A group as shown on the assignment board (name + order). Membership is carried separately.
export interface GroupRow {
  id: string
  name: string
  displayOrder: number
}

// A generated group match as shown in the "Lịch vòng bảng" schedule view.
export interface ScheduleMatch {
  id: string
  groupId: string | null
  roundNumber: number
  matchNumber: number
  competitorAId: string | null
  competitorBId: string | null
  status: string
}

// Everything the event workspace needs for the group tabs, in one shape (one query builds it).
export interface GroupSetup {
  event: {
    id: string
    tournamentId: string
    format: EventFormat
    status: EventStatus
    groupCount: number
    winnerQualifiersPerGroup: number
    consolationQualifiersPerGroup: number
    version: number
  }
  competitors: CompetitorRow[]
  groups: GroupRow[]
  // groupId → ordered competitor ids currently placed in that group.
  memberships: Record<string, string[]>
  // Competitors not currently in any group.
  unassignedIds: string[]
  // Already-generated group-stage matches (empty until generate).
  schedule: ScheduleMatch[]
  matchCount: number
  completedMatchCount: number
  hasKnockoutMatches: boolean
  hasScores: boolean
}

// Stable machine codes for group-stage mutation failures → the UI localizes each one.
export type GroupMutationError =
  | 'forbidden'
  | 'invalid'
  | 'not_found'
  | 'wrong_tournament'
  | 'wrong_format' // groups only apply to round_robin / group_knockout
  | 'version_conflict'
  | 'has_matches' // structural change blocked because matches already exist
  | 'would_orphan' // reducing group_count would strand competitors already placed
  | 'not_ready' // pre-generate validation did not pass (unassigned / small groups / capacity)
  | 'already_generated' // idempotent generate: matches already exist for this assignment
  | 'event_has_results' // a completed match / score exists → regenerate blocked
  | 'event_has_knockout' // knockout downstream exists → regenerate blocked
  | 'unknown'

export type GroupMutationResult =
  | { ok: true; matchCount?: number; alreadyGenerated?: boolean }
  | { ok: false; error: GroupMutationError }

// ── Scoring, standings & qualification (Prompt 07) ──────────────────────────────────────────

// One game/set of a match as shown / edited.
export interface MatchGameView {
  gameNumber: number
  scoreA: number
  scoreB: number
}

// A group match with everything the results view + score editor need. `version` is the
// optimistic-concurrency token the editor must echo back. gamesWon* are derived (0 until completed).
export interface MatchView {
  id: string
  groupId: string | null
  roundNumber: number
  matchNumber: number
  competitorAId: string | null
  competitorBId: string | null
  status: string
  version: number
  winnerId: string | null
  games: MatchGameView[]
  gamesWonA: number
  gamesWonB: number
  pointsForA: number
  pointsForB: number
  updatedAt: string | null
}

// Where a competitor lands in the qualification preview (group_knockout only).
export type QualificationSlot = 'championship' | 'consolation' | 'none' | 'undetermined'

// One standings row as rendered (all sporting figures pre-computed by the pure engine).
export interface StandingRowView {
  competitorId: string
  position: number
  rank: number
  played: number
  wins: number
  losses: number
  tablePoints: number
  pointsFor: number
  pointsAgainst: number
  pointDifference: number
  tied: boolean
  qualification: QualificationSlot
}

export type TieImpactView = 'none' | 'championship_boundary' | 'consolation_boundary' | 'podium'

export interface TieGroupView {
  competitorIds: string[]
  rank: number
  positionStart: number
  positionEnd: number
  impact: TieImpactView
}

// Per-group standings + qualification classification for the standings / tie-resolution tabs.
export interface GroupStandingsView {
  groupId: string
  groupName: string
  rows: StandingRowView[]
  ties: TieGroupView[]
  // ties that straddle a qualification (or podium) cut → they block progression until resolved.
  blockingTies: TieGroupView[]
  allCompleted: boolean
  qualificationStatus: 'ok' | 'blocked_by_tie' | 'invalid' | 'n/a'
  hasOverride: boolean
  overrideReason: string | null
}

// Everything the results / standings / tie-resolution tabs need, in one shape (one server load).
export interface ScoringWorkspace {
  event: {
    id: string
    tournamentId: string
    format: EventFormat
    status: EventStatus
    winnerQualifiersPerGroup: number
    consolationQualifiersPerGroup: number
    version: number
  }
  competitors: CompetitorRow[]
  groups: GroupRow[]
  matches: MatchView[]
  standings: GroupStandingsView[]
  computedStatus: EventStatus
  allCompleted: boolean
  hasBlockingTie: boolean
  hasKnockout: boolean
  // The rule the score editors display + optimistically validate against (Prompt 15D-1). Server-authoritative.
  scoringRules: EventScoringRuleView
}

// Stable machine codes for scoring / override mutation failures → the UI localizes each one.
export type ScoreMutationError =
  | 'forbidden'
  | 'invalid'
  | 'not_found'
  | 'wrong_tournament'
  | 'wrong_format'
  | 'wrong_stage'
  | 'not_scoreable'
  | 'version_conflict'
  | 'has_knockout'
  | 'invalid_score'
  | 'no_such_tie'
  // Rule-aware scoring (Prompt 15D-1): a match score judged against the event rule snapshot.
  | ScoreRuleError
  | 'unknown'

// The rule-snapshot-driven scoring failures shared by every score mutation (group / knockout /
// group-knockout, save + correction). Kept in one place so no scoring action can bypass a code.
export type ScoreRuleError =
  | 'rules_snapshot_invalid'   // the event's snapshot exists but is structurally invalid (no fallback)
  | 'match_stage_unsupported'  // the match's stage cannot be resolved to a rule set
  | 'bye_not_scoreable'        // a BYE can never carry a score
  | 'handicap_not_configured'  // an enabled handicap has no confirmed values (fail closed)
  | 'competitor_composition_required' // handicap needs a composition a competitor lacks (block save)
  | 'competitor_composition_invalid'  // a competitor composition is structurally invalid
  | 'score_below_starting_score'      // a final scoreboard score is below the handicap head start
  | 'score_below_target'       // a game ended before points_to_win (and no cap reached)
  | 'score_margin_invalid'     // margin below win_by, or an illegal deuce overshoot
  | 'score_above_cap'          // a winning score above points_cap
  | 'game_tied_not_allowed'    // a drawn game where the rules forbid it
  | 'too_many_games'           // more games than max_games
  | 'match_already_decided'    // a game recorded after a side already reached games_to_win

export type ScoreMutationResult =
  | { ok: true }
  | { ok: false; error: ScoreMutationError; gameNumber?: number }

// ── Knockout seeding, bracket, results & podium (Prompt 08) ──────────────────────────────────

// One seed slot as shown in the seed editor (slot order = array index; no client slot value trusted).
export interface SeedSlotView {
  slotIndex: number
  competitorId: string
}

// The seed editor's server-loaded state: which competitors are seeded (in slot order) and which
// remain unassigned, plus the derived bracket size / bye count. Only meaningful before generate.
export interface KnockoutSeedSetup {
  event: {
    id: string
    tournamentId: string
    format: EventFormat
    status: EventStatus
    thirdPlaceEnabled: boolean
    version: number
  }
  competitors: CompetitorRow[]
  seededIds: string[]
  unassignedIds: string[]
  bracketSize: number
  byes: number
  hasBracket: boolean // knockout matches already generated → seeds are frozen
}

// One knockout match as rendered in the bracket / results view.
export interface KnockoutMatchView {
  id: string
  roundNumber: number
  matchNumber: number
  roundLabel: string
  competitorAId: string | null
  competitorBId: string | null
  status: string // pending | ready | completed | bye | cancelled
  version: number
  winnerId: string | null
  games: MatchGameView[]
  gamesWonA: number
  gamesWonB: number
  // Whether this is the final / third-place match (derived structurally on the server).
  isFinal: boolean
  isThirdPlace: boolean
}

// One bracket round for the bracket UI (a column of match cards).
export interface KnockoutRoundView {
  roundNumber: number
  label: string
  matches: KnockoutMatchView[]
}

// One podium row as rendered.
export interface PodiumRowView {
  rank: 1 | 2 | 3
  competitorId: string
  isJoint: boolean
}

// Everything the knockout workspace needs, in one shape (one server load).
export interface KnockoutWorkspace {
  event: {
    id: string
    tournamentId: string
    format: EventFormat
    status: EventStatus
    thirdPlaceEnabled: boolean
    version: number
  }
  competitors: CompetitorRow[]
  rounds: KnockoutRoundView[]
  thirdPlaceMatch: KnockoutMatchView | null
  podium: PodiumRowView[]
  hasBracket: boolean
  hasResults: boolean // any completed knockout match / games / podium → reset blocked
  isComplete: boolean // final (+ third-place if present) completed
  scoringRules: EventScoringRuleView // Prompt 15D-1 — knockout rule shown/validated by the editor
}

// Stable machine codes for knockout seed/bracket/result mutation failures → the UI localizes each.
export type KnockoutMutationError =
  | 'forbidden'
  | 'invalid'
  | 'not_found'
  | 'wrong_tournament'
  | 'wrong_format' // this flow is knockout-only
  | 'wrong_stage'
  | 'not_scoreable'
  | 'version_conflict'
  | 'has_matches' // seeds locked because the bracket is already generated
  | 'already_generated' // idempotent generate: bracket already exists
  | 'not_ready' // pre-generate validation failed (unseeded / < 2 competitors)
  | 'event_has_results' // reset blocked because a result / podium exists
  | 'downstream_has_results' // correction blocked: a downstream match already has a result
  | 'qualification_changed' // Prompt 09: the group-rank tokens no longer match current standings
  | 'invalid_score'
  // Rule-aware scoring (Prompt 15D-1) — same codes as the group path (see ScoreRuleError).
  | ScoreRuleError
  | 'unknown'

export type KnockoutMutationResult =
  | { ok: true; matchCount?: number; alreadyGenerated?: boolean; gameNumber?: never }
  | { ok: false; error: KnockoutMutationError; gameNumber?: number }

// ── Group + knockout: group-rank tokens, dual brackets & podiums (Prompt 09) ─────────────────

// One group-rank token as shown in the seed editor. Its identity is the SOURCE (group + finishing
// rank), never a competitor id; `competitorId` is only a resolved PREVIEW of who currently fills it.
export interface GroupRankTokenView {
  tokenId: string
  groupId: string
  groupName: string
  rank: number
  branch: Bracket
  competitorId: string | null // current standings preview (null if not yet resolvable)
  resolvable: boolean
}

// One branch's seed-editor state: its valid tokens, the seeded order + unassigned remainder, and the
// derived bracket size / bye count. `enabled` is false for consolation when consolationQualifiers = 0.
export interface BranchSeedState {
  bracket: Bracket
  enabled: boolean
  tokens: GroupRankTokenView[]
  seededIds: string[] // token ids in seed-position order (compat: seat order with BYEs dropped)
  unassignedIds: string[]
  // Direct first-round pairing editor state. `seats` is indexed by SEED POSITION (seed number − 1),
  // length = bracketSize; a null seat is an empty slot (a BYE, wherever the organiser leaves it).
  seats: (string | null)[]
  bracketSize: number
  byes: number
}

export type GroupKnockoutBlockReason = 'group_stage_incomplete' | 'blocking_tie' | 'not_ready'

// Reuses the pure phase model so the read layer, the save gate and the apply gate agree exactly.
export type { GroupKnockoutTemplatePhase } from '@/lib/tournaments/domain/group-knockout-seed'

// The dual-branch seed-editor state (one server load). Only meaningful before generate.
export interface GroupKnockoutSeedSetup {
  event: {
    id: string
    tournamentId: string
    format: EventFormat
    status: EventStatus
    thirdPlaceEnabled: boolean
    winnerQualifiersPerGroup: number
    consolationQualifiersPerGroup: number
    version: number
  }
  competitors: CompetitorRow[]
  groups: GroupRow[]
  championship: BranchSeedState
  consolation: BranchSeedState | null // null when consolationQualifiers = 0
  readyToSeed: boolean // event has reached knockout_ready (group stage done, no blocking tie)
  blockReason: GroupKnockoutBlockReason | null
  hasBrackets: boolean // any knockout match generated → seeds frozen
  // Preconfigured-template model (knockout template before group completion).
  groupsAssigned: boolean // groups exist and every competitor is placed → token pool is stable
  templatePhase: import('@/lib/tournaments/domain/group-knockout-seed').GroupKnockoutTemplatePhase
  templateStale: boolean // a saved template's token set no longer matches the current pool
}

// One branch's live bracket workspace (rounds + podium + status).
export interface BranchWorkspace {
  bracket: Bracket
  rounds: KnockoutRoundView[]
  thirdPlaceMatch: KnockoutMatchView | null
  podium: PodiumRowView[]
  hasBracket: boolean
  hasResults: boolean
  isComplete: boolean // this branch's final (+ third-place if present) completed
}

// Everything the group_knockout bracket workspace needs (one server load).
export interface GroupKnockoutWorkspace {
  event: {
    id: string
    tournamentId: string
    format: EventFormat
    status: EventStatus
    thirdPlaceEnabled: boolean
    version: number
  }
  competitors: CompetitorRow[]
  championship: BranchWorkspace
  consolation: BranchWorkspace | null
  hasBrackets: boolean
  hasResults: boolean
  isComplete: boolean // the event is completed (all required branches done)
  scoringRules: EventScoringRuleView // Prompt 15D-1 — knockout rule shown/validated by the editor
}

// ── Prompt 11: knockout dependency-path impact preview & controlled reset ─────────────────────

// One downstream match on the dependency path, as shown in the impact-preview dialog. `roundLabel` is
// a translation TOKEN ('final' | 'semifinal' | 'quarterfinal' | 'round_of_16' | 'third_place' |
// 'round_N'); `participantNames` are the competitors currently sitting in the slots that will be emptied.
export interface ImpactAffectedMatchView {
  matchId: string
  bracket: Bracket
  roundNumber: number
  matchNumber: number
  roundLabel: string
  willClearResult: boolean
  gamesToDelete: number
  participantNames: string[]
}

// The full read-only preview of correcting a completed upstream knockout match. Server-computed from DB
// truth (analyzeKnockoutCorrection) — the client never supplies the impact list, only the new games.
export interface KnockoutImpactPreview {
  upstreamMatchId: string
  upstreamMatchVersion: number // optimistic-concurrency token to echo back to the reset action
  bracket: Bracket
  roundLabel: string
  competitorAName: string
  competitorBName: string
  currentWinnerName: string
  newWinnerName: string
  winnerChanges: boolean
  // true only when the winner changes AND at least one downstream match is already completed →
  // a controlled RESET (with confirmation) is required; otherwise a normal correction suffices.
  requiresReset: boolean
  affected: ImpactAffectedMatchView[]
  totalGamesToDelete: number
  resultsToClear: number
  podiumWillClear: boolean
  eventStatusFrom: EventStatus
  eventStatusTo: EventStatus // predicted status after the reset
  branchesAffected: Bracket[]
  branchesUnaffected: Bracket[]
}

export type ImpactPreviewError =
  | 'forbidden'
  | 'invalid'
  | 'not_found'
  | 'wrong_format'
  | 'wrong_stage'
  | 'not_scoreable' // upstream is not a completed, correctable pairing
  | 'invalid_score'
  // Rule-aware scoring (Prompt 15D-1) — the corrected score is judged against the snapshot too.
  | ScoreRuleError
  | 'unknown'

export type ImpactPreviewResult =
  | { ok: true; preview: KnockoutImpactPreview }
  | { ok: false; error: ImpactPreviewError; gameNumber?: number }

export type ResetPathError =
  | KnockoutMutationError
  | 'confirmation_required' // the typed confirmation was not exactly RESET
  | 'no_change' // the corrected winner is unchanged → use a normal correction instead

export type ResetPathResult =
  | { ok: true; status: EventStatus; completed: boolean }
  | { ok: false; error: ResetPathError; gameNumber?: number }
