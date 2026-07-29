// Classifies the tie groups in a group's standings by how they affect progression, so the
// Admin UI (later phase) can explain exactly which decision is blocked. Pure & deterministic.
//
//   group_knockout → a tie can straddle the championship cut or the consolation cut.
//   round_robin    → a tie can affect the event podium (top `podiumSize`, default 3).
//
// A tie group occupies contiguous ordinal positions [positionStart, positionEnd]. It "straddles"
// a cut at position C (positions 1..C qualify) when positionStart ≤ C < positionEnd — i.e. some
// tied members would qualify and some would not, yet they are equal → ambiguous.

import type { ClassifiedTie, Standings, TieImpact } from './types.ts'

function straddles(positionStart: number, positionEnd: number, cut: number): boolean {
  return positionStart <= cut && cut < positionEnd
}

export function classifyTies(input: {
  readonly standings: Standings
  readonly mode: 'group_knockout' | 'round_robin'
  readonly winnerQualifiers?: number
  readonly consolationQualifiers?: number
  readonly podiumSize?: number
}): ClassifiedTie[] {
  const { standings, mode } = input
  const winnerQ = input.winnerQualifiers ?? 0
  const consoQ = input.consolationQualifiers ?? 0
  const podiumSize = input.podiumSize ?? 3

  const champCut = winnerQ
  const consoCut = winnerQ + consoQ

  return standings.tieGroups.map((g): ClassifiedTie => {
    let impact: TieImpact = 'none'
    if (mode === 'group_knockout') {
      if (straddles(g.positionStart, g.positionEnd, champCut)) impact = 'championship_boundary'
      else if (straddles(g.positionStart, g.positionEnd, consoCut)) impact = 'consolation_boundary'
    } else {
      // round_robin: any tie touching the podium zone makes a podium rank ambiguous.
      if (g.positionStart <= podiumSize) impact = 'podium'
    }
    return {
      competitorIds: g.competitorIds,
      rank: g.rank,
      positionStart: g.positionStart,
      positionEnd: g.positionEnd,
      impact,
    }
  })
}

export function hasBlockingTie(ties: readonly ClassifiedTie[]): boolean {
  return ties.some((t) => t.impact !== 'none')
}
