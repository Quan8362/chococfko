// Single-elimination bracket generator. Pure & deterministic; does not mutate input. Works for
// BOTH knockout-only (competitor entrants) and group+knockout (group_rank token entrants), so the
// same structure is reused across formats and for BOTH the championship and consolation brackets.
//
// Bracket size = smallest power of two ≥ entrant count. Missing slots become BYEs, placed against
// the top seeds by standard seeding, so no two BYEs ever meet. A BYE is an explicit slot kind —
// never a 0–0 score — and its real entrant auto-advances (isBye match). Later rounds are
// placeholder matches whose slots reference the winner/loser of an earlier match.

import type {
  Bracket, KnockoutBracket, KnockoutMatch, KnockoutRoundLabel, KnockoutSlot, SlotSource,
} from './types.ts'
import { TournamentDomainError } from './errors.ts'

export type KnockoutEntrant = Exclude<SlotSource, { readonly kind: 'bye' }>

function nextPow2(x: number): number {
  let p = 1
  while (p < x) p *= 2
  return p
}

// Standard bracket seed order (1-indexed) of length `size`: adjacent pairs are the first-round
// matchups, e.g. size 8 → [1,8,4,5,2,7,3,6].
function seedOrder(size: number): number[] {
  let seeds = [1]
  while (seeds.length < size) {
    const sum = seeds.length * 2 + 1
    const next: number[] = []
    for (const s of seeds) {
      next.push(s)
      next.push(sum - s)
    }
    seeds = next
  }
  return seeds
}

function roundLabel(matchesInRound: number, roundNumber: number): KnockoutRoundLabel {
  switch (matchesInRound) {
    case 1: return 'final'
    case 2: return 'semifinal'
    case 4: return 'quarterfinal'
    case 8: return 'round_of_16'
    default: return `round_${roundNumber}`
  }
}

function entrantKey(e: KnockoutEntrant): string {
  return e.kind === 'competitor' ? `c:${e.competitorId}` : `g:${e.groupId}#${e.rank}`
}

export function generateKnockout(input: {
  readonly bracket: Bracket
  readonly entrants: readonly KnockoutEntrant[]
  readonly thirdPlaceEnabled: boolean
}): KnockoutBracket {
  const { bracket, entrants, thirdPlaceEnabled } = input

  if (entrants.length < 2) {
    throw new TournamentDomainError('NOT_ENOUGH_COMPETITORS', 'A knockout bracket needs at least 2 entrants', {
      bracket, count: entrants.length,
    })
  }
  const seen = new Set<string>()
  for (const e of entrants) {
    const k = entrantKey(e)
    if (seen.has(k)) {
      throw new TournamentDomainError('DUPLICATE_COMPETITOR', 'Entrant appears twice in the bracket', { entrant: e })
    }
    seen.add(k)
  }

  const size = nextPow2(entrants.length)
  const byes = size - entrants.length
  const seeds = seedOrder(size)

  const key = (round: number, match: number) => `ko:${bracket}:r${round}:m${match}`
  const slotForSeed = (seedNum: number): KnockoutSlot =>
    seedNum <= entrants.length
      ? { from: 'entrant', source: entrants[seedNum - 1] }
      : { from: 'bye' }

  const rounds: KnockoutMatch[][] = []

  // ── First round from the seed order ──────────────────────────────────────────────────────
  const firstRoundMatches = size / 2
  const first: KnockoutMatch[] = []
  for (let m = 0; m < firstRoundMatches; m++) {
    const slotA = slotForSeed(seeds[2 * m])
    const slotB = slotForSeed(seeds[2 * m + 1])
    const isBye = (slotA.from === 'bye') !== (slotB.from === 'bye')
    first.push({
      bracket,
      roundNumber: 1,
      matchNumber: m + 1,
      matchKey: key(1, m + 1),
      roundLabel: roundLabel(firstRoundMatches, 1),
      slotA,
      slotB,
      isBye,
      generationKey: key(1, m + 1),
    })
  }
  rounds.push(first)

  // ── Later rounds: placeholders fed by the previous round's winners ───────────────────────
  let roundNumber = 2
  let prevMatchCount = firstRoundMatches
  while (prevMatchCount > 1) {
    const matchesInRound = prevMatchCount / 2
    const round: KnockoutMatch[] = []
    for (let m = 0; m < matchesInRound; m++) {
      round.push({
        bracket,
        roundNumber,
        matchNumber: m + 1,
        matchKey: key(roundNumber, m + 1),
        roundLabel: roundLabel(matchesInRound, roundNumber),
        slotA: { from: 'winner', matchKey: key(roundNumber - 1, 2 * m + 1) },
        slotB: { from: 'winner', matchKey: key(roundNumber - 1, 2 * m + 2) },
        isBye: false,
        generationKey: key(roundNumber, m + 1),
      })
    }
    rounds.push(round)
    prevMatchCount = matchesInRound
    roundNumber += 1
  }

  // ── Third-place match: losers of the two semifinals (only when semifinals exist) ─────────
  let thirdPlaceMatch: KnockoutMatch | null = null
  const semifinalRound = rounds.find((r) => r.length === 2)
  if (thirdPlaceEnabled && semifinalRound) {
    thirdPlaceMatch = {
      bracket,
      roundNumber: semifinalRound[0].roundNumber + 1,
      matchNumber: 2, // sits alongside the final (matchNumber 1) in its round
      matchKey: `ko:${bracket}:third`,
      roundLabel: 'third_place',
      slotA: { from: 'loser', matchKey: semifinalRound[0].matchKey },
      slotB: { from: 'loser', matchKey: semifinalRound[1].matchKey },
      isBye: false,
      generationKey: `ko:${bracket}:third`,
    }
  }

  return { bracket, size, byes, rounds, thirdPlaceMatch }
}
