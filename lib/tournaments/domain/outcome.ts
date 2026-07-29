// Derives (and validates) the result of a single match from its game scores. Shared by the
// standings calculator and by any caller that needs the winner/loser of a completed match.
// Pure; throws a typed TournamentDomainError on malformed data.

import type { CompetitorId, MatchInput } from './types.ts'
import { TournamentDomainError } from './errors.ts'

export interface MatchOutcome {
  readonly winnerId: CompetitorId
  readonly loserId: CompetitorId
  readonly gamesWonA: number
  readonly gamesWonB: number
  readonly pointsForA: number
  readonly pointsForB: number
}

// Validates a COMPLETED match and derives its outcome. Requirements:
//   • both competitors present
//   • at least one game recorded (MISSING_SCORE otherwise)
//   • no game is a tie (TIED_GAME_SCORE)
//   • games won are not equal → a decisive winner exists (INDECISIVE_MATCH)
//   • if winnerId is supplied it must match the games-derived winner (WINNER_MISMATCH)
export function deriveMatchOutcome(match: MatchInput): MatchOutcome {
  const { competitorAId: a, competitorBId: b } = match
  if (a === null || b === null) {
    throw new TournamentDomainError('MISSING_SCORE', 'Completed match is missing a competitor')
  }
  if (a === b) {
    throw new TournamentDomainError('SELF_MATCH', 'A match cannot be between one competitor', { competitorId: a })
  }
  if (match.games.length === 0) {
    throw new TournamentDomainError('MISSING_SCORE', 'Completed match has no recorded games', { competitorAId: a, competitorBId: b })
  }

  let gamesWonA = 0
  let gamesWonB = 0
  let pointsForA = 0
  let pointsForB = 0
  for (const g of match.games) {
    if (g.scoreA < 0 || g.scoreB < 0) {
      throw new TournamentDomainError('MISSING_SCORE', 'Game score cannot be negative', { gameNumber: g.gameNumber })
    }
    if (g.scoreA === g.scoreB) {
      throw new TournamentDomainError('TIED_GAME_SCORE', 'A completed game cannot be a tie', { gameNumber: g.gameNumber })
    }
    pointsForA += g.scoreA
    pointsForB += g.scoreB
    if (g.scoreA > g.scoreB) gamesWonA += 1
    else gamesWonB += 1
  }

  if (gamesWonA === gamesWonB) {
    throw new TournamentDomainError('INDECISIVE_MATCH', 'Match has no decisive winner (equal games won)', {
      competitorAId: a, competitorBId: b, gamesWonA, gamesWonB,
    })
  }

  const winnerId = gamesWonA > gamesWonB ? a : b
  const loserId = winnerId === a ? b : a

  if (match.winnerId != null && match.winnerId !== winnerId) {
    throw new TournamentDomainError('WINNER_MISMATCH', 'Recorded winner does not match the game scores', {
      recorded: match.winnerId, derived: winnerId,
    })
  }

  return { winnerId, loserId, gamesWonA, gamesWonB, pointsForA, pointsForB }
}
