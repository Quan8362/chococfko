// Typed errors + validation-issue shapes for the rule engine. Every failure carries a stable
// machine code (never a bare string) so callers/UI can branch and localize. Pure — no I/O.
//
// Two kinds of failure are modelled:
//   • RuleEngineError — thrown for programmer/data faults on the derive-* helpers (mirrors the
//     domain engine's TournamentDomainError style).
//   • RuleValidationIssue / typed result unions — returned (not thrown) for EXPECTED invalid input
//     so the admin/server layer can branch on a code + field path.

export type RuleEngineErrorCode =
  | 'INVALID_GAME_SCORE'      // game cannot be judged (non-integer, negative, or undecidable)
  | 'HANDICAP_NOT_CONFIGURED' // handicap is enabled but its values are not yet confirmed
  | 'HANDICAP_NO_ENTRY'       // handicap is configured but no entry matches a competitor
  | 'NEGATIVE_STARTING_SCORE' // a handicap would produce a negative starting score
  | 'UNKNOWN_PRESET'          // getRulePreset called with an unknown key/version
  | 'UNKNOWN_CATEGORY'        // applyRulePreset called with a category the preset does not define

export class RuleEngineError extends Error {
  readonly code: RuleEngineErrorCode
  readonly details: Readonly<Record<string, unknown>>
  constructor(code: RuleEngineErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message)
    this.name = 'RuleEngineError'
    this.code = code
    this.details = Object.freeze({ ...details })
  }
}

export function isRuleEngineError(e: unknown): e is RuleEngineError {
  return e instanceof RuleEngineError
}

// ── Validation issues (returned, never thrown) ──────────────────────────────────────────────
export type RuleValidationCode =
  | 'GAMES_TO_WIN_TOO_LOW'
  | 'MAX_GAMES_TOO_LOW'
  | 'POINTS_TO_WIN_TOO_LOW'
  | 'WIN_BY_TOO_LOW'
  | 'POINTS_CAP_TOO_LOW'
  | 'TABLE_POINTS_INVALID'
  | 'WIN_LOSS_POINTS_ORDER'
  | 'TIE_BREAK_EMPTY'
  | 'TIE_BREAK_DUPLICATE'
  | 'TIE_BREAK_UNKNOWN_TOKEN'
  | 'HANDICAP_MISSING_ENTRIES'
  | 'HANDICAP_ENTRY_INVALID'
  | 'PRESET_KEY_INVALID'
  | 'PRESET_VERSION_INVALID'
  | 'SNAPSHOT_INCOMPLETE'
  | 'CATEGORY_UNKNOWN'
  | 'COMPOSITION_COUNT_INVALID'
  | 'COMPOSITION_TOTAL_INVALID'

export interface RuleValidationIssue {
  readonly path: string // dotted field path, e.g. 'group.match.points_to_win'
  readonly code: RuleValidationCode
  readonly message: string
}

export type ValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly issues: readonly RuleValidationIssue[] }

export function issue(path: string, code: RuleValidationCode, message: string): RuleValidationIssue {
  return { path, code, message }
}
