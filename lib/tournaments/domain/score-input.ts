// Validates the raw per-game/set scores an Admin enters for ONE group match and derives the
// outcome. Pure & deterministic; NEVER writes a DB row. The decisive-winner rule is NOT
// re-implemented here — after the cheap integer/shape checks it delegates straight to
// deriveMatchOutcome (design doc §5: "Dùng trực tiếp deriveMatchOutcome").
//
// Returns a discriminated result (no throw for expected states) so both the server action and any
// caller can branch and localize on a stable code.

import type { CompetitorId, GameScore, MatchInput } from './types.ts'
import { deriveMatchOutcome } from './outcome.ts'
import { isTournamentDomainError, type TournamentErrorCode } from './errors.ts'

// One game/set as typed into the editor (game numbers are assigned by position, 1-based).
export interface ScoreGameInput {
  readonly scoreA: number
  readonly scoreB: number
}

export type ScoreInputError =
  | { readonly code: 'INVALID_SCORE'; readonly gameNumber: number } // non-integer or negative
  | { readonly code: TournamentErrorCode } // MISSING_SCORE / TIED_GAME_SCORE / INDECISIVE_MATCH / SELF_MATCH

export type ScoreValidationResult =
  | {
      readonly ok: true
      readonly games: readonly GameScore[]
      readonly winnerSide: 'A' | 'B'
      readonly winnerId: CompetitorId
      readonly loserId: CompetitorId
      readonly gamesWonA: number
      readonly gamesWonB: number
      readonly pointsForA: number
      readonly pointsForB: number
    }
  | { readonly ok: false; readonly error: ScoreInputError }

// Validates the entered games and derives the winner. Rules (all enforced, none re-implemented from
// outcome.ts beyond the integer guard):
//   • at least one game               → MISSING_SCORE otherwise
//   • every score is a non-negative integer → INVALID_SCORE (with the offending game number)
//   • no completed game is a tie      → TIED_GAME_SCORE
//   • games won are not equal         → INDECISIVE_MATCH
//   • A ≠ B                            → SELF_MATCH
export function validateMatchScores(input: {
  readonly competitorAId: CompetitorId
  readonly competitorBId: CompetitorId
  readonly games: readonly ScoreGameInput[]
}): ScoreValidationResult {
  const { competitorAId, competitorBId, games } = input

  if (games.length === 0) return { ok: false, error: { code: 'MISSING_SCORE' } }

  const normalized: GameScore[] = []
  for (let i = 0; i < games.length; i++) {
    const g = games[i]
    const gameNumber = i + 1
    if (
      !Number.isInteger(g.scoreA) ||
      !Number.isInteger(g.scoreB) ||
      g.scoreA < 0 ||
      g.scoreB < 0
    ) {
      return { ok: false, error: { code: 'INVALID_SCORE', gameNumber } }
    }
    normalized.push({ gameNumber, scoreA: g.scoreA, scoreB: g.scoreB })
  }

  const matchInput: MatchInput = {
    competitorAId,
    competitorBId,
    status: 'completed',
    games: normalized,
  }

  try {
    const o = deriveMatchOutcome(matchInput)
    return {
      ok: true,
      games: normalized,
      winnerSide: o.winnerId === competitorAId ? 'A' : 'B',
      winnerId: o.winnerId,
      loserId: o.loserId,
      gamesWonA: o.gamesWonA,
      gamesWonB: o.gamesWonB,
      pointsForA: o.pointsForA,
      pointsForB: o.pointsForB,
    }
  } catch (e) {
    if (isTournamentDomainError(e)) return { ok: false, error: { code: e.code } }
    throw e
  }
}
