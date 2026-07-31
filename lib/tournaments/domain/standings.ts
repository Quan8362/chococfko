// Round-robin standings calculator. Pure & deterministic. Counts ONLY completed matches
// (pending/ready/cancelled/bye are ignored). Does not mutate input.
//
// Ranking order: tablePoints ↓ → pointDifference ↓ → pointsFor ↓. When those three are equal the
// competitors are a genuine tie: they share a rank and are flagged `tied`. A stable technical
// order (roster index, then id) is applied ONLY to keep the output deterministic — it is NEVER a
// sporting criterion and never changes shared ranks.

import type { Competitor, CompetitorId, MatchInput, Standings, StandingRow, TieGroup } from './types.ts'
import { deriveMatchOutcome } from './outcome.ts'

interface Acc {
  played: number
  wins: number
  losses: number
  pointsFor: number
  pointsAgainst: number
}

function sameSortKey(a: StandingRow, b: StandingRow): boolean {
  return a.tablePoints === b.tablePoints
    && a.pointDifference === b.pointDifference
    && a.pointsFor === b.pointsFor
}

// Table-point award for a win / loss. Defaults to the classic 1 / 0 so every existing caller keeps
// its behaviour; a rule snapshot (Prompt 15D-1) may override it (e.g. win = 2, loss = 0).
export interface TablePointsConfig {
  readonly win: number
  readonly loss: number
}

const DEFAULT_TABLE_POINTS: TablePointsConfig = { win: 1, loss: 0 }

export function calculateStandings(input: {
  readonly competitors: readonly Competitor[]
  readonly matches: readonly MatchInput[]
  readonly tablePoints?: TablePointsConfig
}): Standings {
  const { competitors, matches } = input
  const tp = input.tablePoints ?? DEFAULT_TABLE_POINTS

  const order = new Map<CompetitorId, number>()
  const acc = new Map<CompetitorId, Acc>()
  competitors.forEach((c, i) => {
    order.set(c.id, i)
    acc.set(c.id, { played: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 })
  })

  for (const match of matches) {
    if (match.status !== 'completed') continue
    const o = deriveMatchOutcome(match) // throws on malformed completed data
    const a = match.competitorAId as CompetitorId
    const b = match.competitorBId as CompetitorId
    const accA = acc.get(a)
    const accB = acc.get(b)
    // A match referencing a competitor outside the roster is ignored for that side only; the
    // roster is the source of truth for who appears in the table.
    if (accA) {
      accA.played += 1
      accA.pointsFor += o.pointsForA
      accA.pointsAgainst += o.pointsForB
      if (o.winnerId === a) accA.wins += 1; else accA.losses += 1
    }
    if (accB) {
      accB.played += 1
      accB.pointsFor += o.pointsForB
      accB.pointsAgainst += o.pointsForA
      if (o.winnerId === b) accB.wins += 1; else accB.losses += 1
    }
  }

  // Build unsorted rows.
  const draft = competitors.map((c) => {
    const s = acc.get(c.id)!
    const tablePoints = s.wins * tp.win + s.losses * tp.loss
    return {
      competitorId: c.id,
      played: s.played,
      wins: s.wins,
      losses: s.losses,
      tablePoints,
      pointsFor: s.pointsFor,
      pointsAgainst: s.pointsAgainst,
      pointDifference: s.pointsFor - s.pointsAgainst,
    }
  })

  // Sort by sporting key; break exact ties with the technical order (roster index) purely so the
  // array order is deterministic — shared ranks are assigned afterwards.
  const sorted = [...draft].sort((x, y) => {
    if (y.tablePoints !== x.tablePoints) return y.tablePoints - x.tablePoints
    if (y.pointDifference !== x.pointDifference) return y.pointDifference - x.pointDifference
    if (y.pointsFor !== x.pointsFor) return y.pointsFor - x.pointsFor
    return (order.get(x.competitorId)! - order.get(y.competitorId)!)
  })

  const rows: StandingRow[] = sorted.map((d, i) => ({
    ...d,
    position: i + 1,
    rank: i + 1, // provisional; collapsed below
    tied: false,
  }))

  // Collapse shared ranks + mark ties (standard competition ranking: 1,2,2,4).
  for (let i = 0; i < rows.length; i++) {
    if (i > 0 && sameSortKey(rows[i], rows[i - 1])) {
      rows[i] = { ...rows[i], rank: rows[i - 1].rank }
    }
  }
  const tieGroups: TieGroup[] = []
  let i = 0
  while (i < rows.length) {
    let j = i + 1
    while (j < rows.length && sameSortKey(rows[j], rows[i])) j++
    if (j - i > 1) {
      const group = rows.slice(i, j)
      group.forEach((_, k) => { rows[i + k] = { ...rows[i + k], tied: true } })
      tieGroups.push({
        competitorIds: group.map((r) => r.competitorId),
        rank: rows[i].rank,
        positionStart: rows[i].position,
        positionEnd: rows[j - 1].position,
      })
    }
    i = j
  }

  return { rows, tieGroups }
}
