// Evaluates the whole group stage of one event from DB truth and derives the correct event status.
// Pure & deterministic; NO DB write. This is the single source of truth used BOTH by the read layer
// (to render standings + qualification) and by the score/override actions (to compute the event's
// target status atomically). It never re-implements standings/tie/qualification logic — it composes
// calculateStandings + classifyTies + qualifyGroup.
//
// Status mapping (design doc §5.2 / §13):
//   • not every group finished              → group_stage
//   • round_robin, all finished             → completed
//   • group_knockout, all finished, a critical (boundary) tie is unresolved → group_stage_completed
//   • group_knockout, all finished, no blocking tie → knockout_ready

import type {
  ClassifiedTie,
  Competitor,
  CompetitorId,
  GroupId,
  MatchInput,
  Standings,
} from './types.ts'
import { calculateStandings, type TablePointsConfig } from './standings.ts'
import { classifyTies } from './ties.ts'
import { qualifyGroup, type QualificationOutcome } from './qualification.ts'
import type { GroupStageFormat } from './group-assignment.ts'

export interface GroupEvaluationInput {
  readonly groupId: GroupId
  readonly competitors: readonly Competitor[]
  readonly matches: readonly MatchInput[]
  // The stored manual resolution for this group, if any (full permutation of the group roster).
  readonly resolvedOrder?: readonly CompetitorId[]
}

export interface GroupEvaluation {
  readonly groupId: GroupId
  readonly standings: Standings
  readonly ties: readonly ClassifiedTie[]
  readonly qualification: QualificationOutcome
  readonly allCompleted: boolean
  readonly hasOverride: boolean
}

export type EventProgressStatus =
  | 'group_stage'
  | 'group_stage_completed'
  | 'knockout_ready'
  | 'completed'

export interface GroupStageEvaluation {
  readonly groups: readonly GroupEvaluation[]
  readonly allCompleted: boolean
  readonly hasBlockingTie: boolean
  readonly status: EventProgressStatus
}

// A group is finished when it has at least one non-cancelled match and every such match is completed.
function groupCompleted(matches: readonly MatchInput[]): boolean {
  const relevant = matches.filter((m) => m.status !== 'cancelled')
  return relevant.length > 0 && relevant.every((m) => m.status === 'completed')
}

export function evaluateGroupStage(input: {
  readonly format: GroupStageFormat
  readonly winnerQualifiers: number
  readonly consolationQualifiers: number
  readonly groups: readonly GroupEvaluationInput[]
  // Rule-snapshot table points (Prompt 15D-1). Omitted ⇒ the classic win = 1 / loss = 0.
  readonly tablePoints?: TablePointsConfig
}): GroupStageEvaluation {
  const { format, winnerQualifiers, consolationQualifiers, tablePoints } = input
  const mode = format === 'group_knockout' ? 'group_knockout' : 'round_robin'

  const groups: GroupEvaluation[] = input.groups.map((g) => {
    const standings = calculateStandings({ competitors: g.competitors, matches: g.matches, tablePoints })
    const ties = classifyTies({ standings, mode, winnerQualifiers, consolationQualifiers })
    const qualification: QualificationOutcome =
      format === 'group_knockout'
        ? qualifyGroup({
            groupId: g.groupId,
            standings,
            winnerQualifiers,
            consolationQualifiers,
            resolvedOrder: g.resolvedOrder,
          })
        : { status: 'ok', championship: [], consolation: [] }
    return {
      groupId: g.groupId,
      standings,
      ties,
      qualification,
      allCompleted: groupCompleted(g.matches),
      hasOverride: !!(g.resolvedOrder && g.resolvedOrder.length > 0),
    }
  })

  const allCompleted = groups.length > 0 && groups.every((g) => g.allCompleted)
  // A group_knockout tie that straddles a qualification cut leaves qualifyGroup non-ok → blocking.
  const hasBlockingTie =
    format === 'group_knockout' && allCompleted && groups.some((g) => g.qualification.status !== 'ok')

  let status: EventProgressStatus
  if (!allCompleted) status = 'group_stage'
  else if (format === 'round_robin') status = 'completed'
  else status = hasBlockingTie ? 'group_stage_completed' : 'knockout_ready'

  return { groups, allCompleted, hasBlockingTie, status }
}
