// Round-robin schedule generator (circle method). Pure & deterministic: the same roster in the
// same order always yields the same matches, rounds and order. Does NOT mutate its input.
//
// Guarantees:
//   • every pair meets exactly once (no self-match, no reversed duplicate)
//   • total matches = n·(n−1)/2
//   • odd n → one competitor sits out each round (the scheduling BYE); NO competitor-vs-BYE match
//     is emitted, so the group never contains a fake "database match" against a bye.

import type { Competitor, GeneratedGroupMatch, GroupId } from './types.ts'
import { TournamentDomainError } from './errors.ts'

const BYE = Symbol('rr-bye')
type Slot = Competitor | typeof BYE

function pairKey(groupId: GroupId, x: string, y: string): string {
  const [lo, hi] = x < y ? [x, y] : [y, x]
  return `rr:${groupId}:${lo}:${hi}`
}

export function generateRoundRobin(input: {
  readonly groupId: GroupId
  readonly competitors: readonly Competitor[]
}): GeneratedGroupMatch[] {
  const { groupId, competitors } = input

  const seen = new Set<string>()
  for (const c of competitors) {
    if (seen.has(c.id)) {
      throw new TournamentDomainError('DUPLICATE_COMPETITOR', 'Competitor appears twice in the group', { competitorId: c.id })
    }
    seen.add(c.id)
  }

  // Fewer than 2 → no matches (a degenerate but valid, deterministic result).
  if (competitors.length < 2) return []

  // Circle method: fix the first slot, rotate the rest. Pad with a BYE when odd.
  const slots: Slot[] = [...competitors]
  if (slots.length % 2 === 1) slots.push(BYE)
  const m = slots.length
  const rounds = m - 1
  const half = m / 2

  const matches: GeneratedGroupMatch[] = []
  const arr: Slot[] = [...slots]
  let matchNumber = 0

  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < half; i++) {
      const home = arr[i]
      const away = arr[m - 1 - i]
      if (home === BYE || away === BYE) continue // the sit-out player: emit nothing
      matchNumber += 1
      matches.push({
        stage: 'group',
        groupId,
        roundNumber: r + 1,
        matchNumber,
        competitorAId: home.id,
        competitorBId: away.id,
        generationKey: pairKey(groupId, home.id, away.id),
      })
    }
    // Rotate positions 1..m-1 clockwise, keeping position 0 fixed.
    const last = arr[m - 1]
    for (let i = m - 1; i >= 2; i--) arr[i] = arr[i - 1]
    arr[1] = last
  }

  return matches
}
