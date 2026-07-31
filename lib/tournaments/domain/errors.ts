// Typed domain errors for the tournament engine. Every failure carries a stable machine code
// (never a bare string) so callers/UI can branch and localize. Pure — no I/O.

export type TournamentErrorCode =
  | 'NO_COMPETITORS'
  | 'NOT_ENOUGH_COMPETITORS'
  | 'DUPLICATE_COMPETITOR'
  | 'SELF_MATCH'
  | 'MISSING_SCORE'
  | 'TIED_GAME_SCORE'
  | 'INDECISIVE_MATCH'
  | 'WINNER_MISMATCH'
  | 'UNKNOWN_COMPETITOR'
  | 'QUALIFICATION_OVERFLOW'
  | 'INVALID_OVERRIDE'
  | 'INVALID_BRACKET_SIZE'
  | 'INCOMPLETE_FINAL'
  | 'INCOMPLETE_THIRD_PLACE'
  | 'NO_SEMIFINAL_LOSERS'
  | 'UNKNOWN_MATCH'

export class TournamentDomainError extends Error {
  readonly code: TournamentErrorCode
  readonly details: Readonly<Record<string, unknown>>
  constructor(code: TournamentErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message)
    this.name = 'TournamentDomainError'
    this.code = code
    this.details = Object.freeze({ ...details })
  }
}

export function isTournamentDomainError(e: unknown): e is TournamentDomainError {
  return e instanceof TournamentDomainError
}
