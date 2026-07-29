// Podium calculator for ONE bracket. Championship and consolation are computed by separate calls
// with separate inputs, so the two branches never mix (Prompt 20). Pure & deterministic.
//
//   with third-place match  → 1 = final winner, 2 = final loser, 3 = third-place winner
//   without third-place      → 1 = final winner, 2 = final loser, both semifinal losers = joint 3rd
//
// Returns `pending` (never throws) while the deciding matches are incomplete, so callers can show
// "not decided yet" instead of an error.

import type { CompetitorId, PodiumEntry } from './types.ts'
import type { TournamentErrorCode } from './errors.ts'

export interface PodiumInput {
  readonly final: { readonly winnerId: CompetitorId; readonly loserId: CompetitorId } | null
  readonly thirdPlaceEnabled: boolean
  // Required only when thirdPlaceEnabled: the third-place match result.
  readonly thirdPlace?: { readonly winnerId: CompetitorId } | null
  // Required only when !thirdPlaceEnabled AND the bracket had semifinals: the two SF losers.
  readonly semifinalLosers?: readonly CompetitorId[]
}

export type PodiumResult =
  | { readonly status: 'ready'; readonly entries: readonly PodiumEntry[] }
  | { readonly status: 'pending'; readonly reason: TournamentErrorCode }

export function calculatePodium(input: PodiumInput): PodiumResult {
  const { final, thirdPlaceEnabled, thirdPlace, semifinalLosers } = input

  if (final === null) return { status: 'pending', reason: 'INCOMPLETE_FINAL' }

  const entries: PodiumEntry[] = [
    { rank: 1, competitorId: final.winnerId, isJoint: false },
    { rank: 2, competitorId: final.loserId, isJoint: false },
  ]

  if (thirdPlaceEnabled) {
    if (!thirdPlace) return { status: 'pending', reason: 'INCOMPLETE_THIRD_PLACE' }
    entries.push({ rank: 3, competitorId: thirdPlace.winnerId, isJoint: false })
  } else if (semifinalLosers && semifinalLosers.length > 0) {
    // Joint third: every semifinal loser shares rank 3. (A size-2 bracket has no semifinals →
    // no rank 3 at all, which is correct.)
    for (const id of semifinalLosers) {
      entries.push({ rank: 3, competitorId: id, isJoint: true })
    }
  }

  return { status: 'ready', entries }
}
