// Score evaluation BY RULES. Pure & deterministic; never writes a row and never mutates input.
// Given a MatchRules snapshot it decides whether a single game score is legal (and who won it),
// whether a full list of games completes a match, and how one tie-break token compares two rows.
//
// This is the rule-driven counterpart to the domain engine's fixed deriveMatchOutcome — that stays
// untouched. Callers that opt into per-event rules use these instead.

import {
  AUTO_TIE_BREAK_TOKENS,
  type MatchRules,
  type TieBreakStat,
  type TieBreakToken,
} from './types.ts'
import { RuleEngineError } from './errors.ts'

export type WinnerSide = 'A' | 'B'

// ── Single game ─────────────────────────────────────────────────────────────────────────────
export type GameScoreError =
  | 'NOT_INTEGER'            // a score is not a non-negative integer
  | 'TIED_NOT_ALLOWED'      // scores equal and allow_tied_game is false
  | 'EXCEEDS_CAP'           // winning score is above points_cap
  | 'TARGET_NOT_REACHED'    // winner is below points_to_win (and no cap reached)
  | 'WIN_BY_NOT_MET'        // margin smaller than win_by (and no cap reached)
  | 'INVALID_OVERSHOOT'     // deuce overshot the exact win_by margin below the cap

export type GameScoreResult =
  | { readonly ok: true; readonly winner: WinnerSide | null; readonly tied: boolean }
  | { readonly ok: false; readonly code: GameScoreError }

// Judge one game score against the rules. Returns a typed result (no throw for expected states).
//
// Legality (for a decided game): winner reached `points_to_win`, margin >= `win_by`, winning score
// <= `points_cap`. Deuce handling: once the winning score is above `points_to_win` but below the
// cap, the game must end EXACTLY on the win_by margin (e.g. 23-21 is illegal at to-21/by-2 — it
// should have ended 22-20 or continued). At the cap the game may end on a smaller margin (31-30).
export function validateGameScoreByRules(
  rules: MatchRules,
  score: { readonly scoreA: number; readonly scoreB: number },
): GameScoreResult {
  const { scoreA, scoreB } = score
  if (
    !Number.isInteger(scoreA) || !Number.isInteger(scoreB) || scoreA < 0 || scoreB < 0
  ) {
    return { ok: false, code: 'NOT_INTEGER' }
  }

  if (scoreA === scoreB) {
    if (rules.allow_tied_game) return { ok: true, winner: null, tied: true }
    return { ok: false, code: 'TIED_NOT_ALLOWED' }
  }

  const winner: WinnerSide = scoreA > scoreB ? 'A' : 'B'
  const hi = Math.max(scoreA, scoreB)
  const lo = Math.min(scoreA, scoreB)
  const margin = hi - lo
  const cap = rules.points_cap
  const capReached = cap !== null && hi === cap

  if (cap !== null && hi > cap) return { ok: false, code: 'EXCEEDS_CAP' }
  if (!capReached && hi < rules.points_to_win) return { ok: false, code: 'TARGET_NOT_REACHED' }
  if (!capReached && margin < rules.win_by) return { ok: false, code: 'WIN_BY_NOT_MET' }
  // Deuce below the cap must end on exactly the win_by margin; the cap is the only place a smaller
  // margin (down to 1) is legal.
  if (!capReached && hi > rules.points_to_win && margin !== rules.win_by) {
    return { ok: false, code: 'INVALID_OVERSHOOT' }
  }

  return { ok: true, winner, tied: false }
}

// Convenience that throws (mirrors deriveMatchOutcome) — returns the winning side, or null for a
// legal tie. Throws RuleEngineError('INVALID_GAME_SCORE') on an illegal score.
export function deriveGameWinnerByRules(
  rules: MatchRules,
  score: { readonly scoreA: number; readonly scoreB: number },
): WinnerSide | null {
  const r = validateGameScoreByRules(rules, score)
  if (!r.ok) {
    throw new RuleEngineError('INVALID_GAME_SCORE', 'Game score is illegal under the rules', {
      code: r.code, scoreA: score.scoreA, scoreB: score.scoreB,
    })
  }
  return r.winner
}

// ── Full match ──────────────────────────────────────────────────────────────────────────────
export type MatchScoreError =
  | { readonly kind: 'game'; readonly gameNumber: number; readonly code: GameScoreError }
  | { readonly kind: 'too_many_games' }
  | { readonly kind: 'not_decided' } // no side reached games_to_win

export type MatchScoreResult =
  | {
      readonly ok: true
      readonly winner: WinnerSide
      readonly gamesWonA: number
      readonly gamesWonB: number
      readonly tiedGames: number
    }
  | { readonly ok: false; readonly error: MatchScoreError }

// Validate an ordered list of game scores against the rules and derive the match winner.
//   • every game must be legal (allow_tied_game gates drawn games)
//   • at most `max_games` games
//   • exactly one side reaches `games_to_win` (else NOT_DECIDED — covers an unfinished match)
export function validateMatchScoresByRules(
  rules: MatchRules,
  games: readonly { readonly scoreA: number; readonly scoreB: number }[],
): MatchScoreResult {
  let gamesWonA = 0
  let gamesWonB = 0
  let tiedGames = 0

  for (let i = 0; i < games.length; i++) {
    const r = validateGameScoreByRules(rules, games[i])
    if (!r.ok) return { ok: false, error: { kind: 'game', gameNumber: i + 1, code: r.code } }
    if (r.tied) tiedGames += 1
    else if (r.winner === 'A') gamesWonA += 1
    else gamesWonB += 1
  }

  if (games.length > rules.max_games) return { ok: false, error: { kind: 'too_many_games' } }

  const decidedA = gamesWonA >= rules.games_to_win && gamesWonA > gamesWonB
  const decidedB = gamesWonB >= rules.games_to_win && gamesWonB > gamesWonA
  if (!decidedA && !decidedB) return { ok: false, error: { kind: 'not_decided' } }

  return {
    ok: true,
    winner: decidedA ? 'A' : 'B',
    gamesWonA,
    gamesWonB,
    tiedGames,
  }
}

// ── Tie-break token comparison ──────────────────────────────────────────────────────────────
export type TieBreakComparison =
  | { readonly supported: true; readonly cmp: number } // >0 ⇒ a ranks ahead of b, <0 ⇒ behind, 0 ⇒ equal
  | { readonly supported: false; readonly token: TieBreakToken } // recognized but not auto-evaluable

// Compare two competitors by ONE tie-break token. Tokens the engine can compute from standings
// numbers (table_points / point_difference / points_for) return a numeric comparison; the rest
// (head_to_head, organizer_decision, random_draw) are legal but resolve to a typed
// "unsupported (manual)" result — never silently ignored.
export function compareByTieBreakToken(
  token: TieBreakToken,
  a: TieBreakStat,
  b: TieBreakStat,
): TieBreakComparison {
  if (!AUTO_TIE_BREAK_TOKENS.includes(token)) return { supported: false, token }
  switch (token) {
    case 'table_points': return { supported: true, cmp: a.tablePoints - b.tablePoints }
    case 'point_difference': return { supported: true, cmp: a.pointDifference - b.pointDifference }
    case 'points_for': return { supported: true, cmp: a.pointsFor - b.pointsFor }
    default: return { supported: false, token }
  }
}
