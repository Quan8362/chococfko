// Pure structural identification of a knockout bracket's rounds, its final, and its third-place
// match — plus round labelling. This is the single source of truth for "which match is the final /
// third-place, and what round is a quarter/semi-final" so NEITHER the admin workspace queries NOR
// the public read layer re-implements it. No I/O, no mutation, deterministic.

// The minimal shape a bracket match row must expose for structural analysis.
export interface BracketMatchRef {
  readonly id: string
  readonly roundNumber: number
  readonly sourceMatchAId: string | null
  readonly sourceMatchBId: string | null
  readonly sourceOutcomeA: string | null
  readonly sourceOutcomeB: string | null
}

export interface BracketRoundGroup<V> {
  readonly roundNumber: number
  readonly label: string
  readonly matches: readonly V[]
}

export interface BracketBuildResult<V> {
  // Rounds in play order (earliest first), EXCLUDING the third-place match (rendered on its own).
  readonly rounds: readonly BracketRoundGroup<V>[]
  readonly thirdPlaceMatch: V | null
  readonly finalId: string | null
  readonly thirdPlaceId: string | null
}

// The human round label follows the number of matches in the round, mirroring the pure engine.
export function knockoutRoundLabel(matchesInRound: number, roundNumber: number): string {
  switch (matchesInRound) {
    case 1:
      return 'final'
    case 2:
      return 'semifinal'
    case 4:
      return 'quarterfinal'
    case 8:
      return 'round_of_16'
    default:
      return `round_${roundNumber}`
  }
}

// Identify the third-place match (the one fed by two LOSERS) and the final (the terminal non-third
// match — no other match references it as a source).
export function identifyBracket(rows: readonly BracketMatchRef[]): {
  thirdPlaceId: string | null
  finalId: string | null
} {
  const referenced = new Set<string>()
  for (const m of rows) {
    if (m.sourceMatchAId) referenced.add(m.sourceMatchAId)
    if (m.sourceMatchBId) referenced.add(m.sourceMatchBId)
  }
  const thirdPlaceId =
    rows.find((m) => m.sourceOutcomeA === 'loser' && m.sourceOutcomeB === 'loser')?.id ?? null
  let finalId: string | null = null
  for (const m of rows) {
    if (m.id === thirdPlaceId) continue
    if (referenced.has(m.id)) continue // has a downstream → not terminal
    finalId = m.id // terminal non-third match
  }
  return { thirdPlaceId, finalId }
}

// Group bracket rows into labelled rounds and map each to a view via `toView`. The third-place match
// is pulled out separately. Rows are assumed pre-sorted by (round_number, match_number); this keeps
// that order stable within each round.
export function buildBracketRounds<R extends BracketMatchRef, V>(
  rows: readonly R[],
  toView: (row: R, meta: { roundLabel: string; isFinal: boolean; isThirdPlace: boolean }) => V,
): BracketBuildResult<V> {
  const { thirdPlaceId, finalId } = identifyBracket(rows)

  const byRound = new Map<number, R[]>()
  for (const m of rows) {
    if (m.id === thirdPlaceId) continue // rendered separately
    const list = byRound.get(m.roundNumber)
    if (list) list.push(m)
    else byRound.set(m.roundNumber, [m])
  }

  const rounds: BracketRoundGroup<V>[] = Array.from(byRound.keys())
    .sort((x, y) => x - y)
    .map((roundNumber) => {
      const list = byRound.get(roundNumber)!
      const label = knockoutRoundLabel(list.length, roundNumber)
      return {
        roundNumber,
        label,
        matches: list.map((m) =>
          toView(m, { roundLabel: label, isFinal: m.id === finalId, isThirdPlace: false }),
        ),
      }
    })

  const thirdRow = rows.find((m) => m.id === thirdPlaceId) ?? null
  const thirdPlaceMatch = thirdRow
    ? toView(thirdRow, { roundLabel: 'third_place', isFinal: false, isThirdPlace: true })
    : null

  return { rounds, thirdPlaceMatch, finalId, thirdPlaceId }
}
