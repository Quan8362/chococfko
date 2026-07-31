// Turns an Admin's manual ordering of ONE tied group of competitors into the full group ordering
// stored as a qualification override (tournament_qualification_overrides.resolved_order). Pure &
// deterministic; no DB write.
//
// The Admin may only reorder the members WITHIN a genuine tie group — everyone else keeps their
// standings position (design doc §12). The produced `resolvedOrder` is therefore a full permutation
// of the group's roster: standings order, with exactly the tie group's contiguous slots replaced by
// the Admin's chosen order. Feeding it back into qualifyGroup(resolvedOrder) breaks the tie.

import type { CompetitorId, Standings } from './types.ts'

export type TieResolutionResult =
  | { readonly ok: true; readonly resolvedOrder: readonly CompetitorId[] }
  | { readonly ok: false; readonly code: 'NO_SUCH_TIE' | 'INVALID_PERMUTATION' }

export function resolveTieOrder(input: {
  readonly standings: Standings
  readonly orderedTieIds: readonly CompetitorId[]
}): TieResolutionResult {
  const { standings, orderedTieIds } = input

  const proposed = new Set(orderedTieIds)
  if (proposed.size !== orderedTieIds.length) return { ok: false, code: 'INVALID_PERMUTATION' }

  // The proposed set must be EXACTLY the members of one real tie group in the current standings.
  const tie = standings.tieGroups.find(
    (g) => g.competitorIds.length === proposed.size && g.competitorIds.every((id) => proposed.has(id)),
  )
  if (!tie) return { ok: false, code: 'NO_SUCH_TIE' }

  // Full roster order by unique position; overwrite the tie group's contiguous slots in place.
  const fullOrder = [...standings.rows]
    .sort((a, b) => a.position - b.position)
    .map((r) => r.competitorId)
  const startIndex = tie.positionStart - 1
  const resolved = [...fullOrder]
  for (let k = 0; k < orderedTieIds.length; k++) resolved[startIndex + k] = orderedTieIds[k]

  return { ok: true, resolvedOrder: resolved }
}
