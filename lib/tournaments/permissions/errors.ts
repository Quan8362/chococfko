// Typed denials for the permission layer. Every failure carries a stable machine code (never a
// bare string) so the server/UI can branch and localize, and so a raw SQL/auth error is never
// surfaced. PURE — no I/O.

export type PermissionDenialCode =
  | 'NOT_AUTHENTICATED' // no signed-in user
  | 'FORBIDDEN'         // authenticated but lacks the required permission
  | 'INVALID_ROLE'      // an untrusted role value was not one of the scoped roles
  | 'INVALID_PERMISSION' // an unknown permission token was requested

export class TournamentPermissionError extends Error {
  readonly code: PermissionDenialCode
  // The permission that was required (when applicable) — safe, non-secret metadata for logging.
  readonly permission: string | null
  readonly tournamentId: string | null
  constructor(
    code: PermissionDenialCode,
    message: string,
    opts: { permission?: string | null; tournamentId?: string | null } = {},
  ) {
    super(message)
    this.name = 'TournamentPermissionError'
    this.code = code
    this.permission = opts.permission ?? null
    this.tournamentId = opts.tournamentId ?? null
  }
}

export function isTournamentPermissionError(e: unknown): e is TournamentPermissionError {
  return e instanceof TournamentPermissionError
}

// The typed result shape membership service actions return (never throw raw errors to the UI).
export type PermissionErrorResult = { readonly ok: false; readonly error: PermissionDenialCode }
