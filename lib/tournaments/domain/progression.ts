// Bracket progression: given a completed match's winner (and loser), work out which downstream
// slots that result fills. Pure & deterministic; does NOT mutate the bracket and does NOT touch a
// database — it returns a patch description a server action can later apply.

import type { CompetitorId, KnockoutBracket, KnockoutMatch, ProgressionPatch, ProgressionResult } from './types.ts'
import { TournamentDomainError } from './errors.ts'

function allMatches(bracket: KnockoutBracket): KnockoutMatch[] {
  const out: KnockoutMatch[] = []
  for (const round of bracket.rounds) for (const m of round) out.push(m)
  if (bracket.thirdPlaceMatch) out.push(bracket.thirdPlaceMatch)
  return out
}

export function progressKnockout(input: {
  readonly bracket: KnockoutBracket
  readonly completedMatchKey: string
  readonly winnerId: CompetitorId
  readonly loserId?: CompetitorId | null
}): ProgressionResult {
  const { bracket, completedMatchKey, winnerId } = input
  const loserId = input.loserId ?? null

  const matches = allMatches(bracket)
  if (!matches.some((m) => m.matchKey === completedMatchKey)) {
    throw new TournamentDomainError('UNKNOWN_MATCH', 'Completed match is not part of this bracket', { completedMatchKey })
  }

  const patches: ProgressionPatch[] = []
  for (const m of matches) {
    if (m.slotA.from === 'winner' && m.slotA.matchKey === completedMatchKey) {
      patches.push({ matchKey: m.matchKey, slot: 'A', competitorId: winnerId })
    }
    if (m.slotB.from === 'winner' && m.slotB.matchKey === completedMatchKey) {
      patches.push({ matchKey: m.matchKey, slot: 'B', competitorId: winnerId })
    }
    if (loserId !== null && m.slotA.from === 'loser' && m.slotA.matchKey === completedMatchKey) {
      patches.push({ matchKey: m.matchKey, slot: 'A', competitorId: loserId })
    }
    if (loserId !== null && m.slotB.from === 'loser' && m.slotB.matchKey === completedMatchKey) {
      patches.push({ matchKey: m.matchKey, slot: 'B', competitorId: loserId })
    }
  }

  return { winnerId, loserId, patches }
}
