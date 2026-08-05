// Pure decision layer for how a knockout match card presents its score on the public bracket.
//
// The point is to show the REAL stored result — never the winner=1 / loser=0 sets tally masquerading
// as a scoreline. The winner itself is NOT derived here: `winnerId` is the server's authoritative
// outcome and is only echoed. This module never invents a score, never reads names, never touches the
// DB — it only maps already-loaded games/sets into display cells, so it is unit-testable in isolation.

import { formatGameScores, type GameScorePair } from './format.ts'

export interface KnockoutScoreInput {
  status: string
  winnerId: string | null
  competitorAId: string | null
  competitorBId: string | null
  games: GameScorePair[]
  gamesWonA: number
  gamesWonB: number
}

export interface KnockoutScoreView {
  // Number to render on each side, as a string, or null when no score should be shown (not played,
  // BYE, or a completed match with no per-game data recorded — the card falls back to its status).
  scoreA: string | null
  scoreB: string | null
  // Per-game breakdown for a best-of-N result ("21–15 · 15–21 · 21–18"); '' when not applicable.
  detail: string
  isWinnerA: boolean
  isWinnerB: boolean
}

export function knockoutScoreView(m: KnockoutScoreInput): KnockoutScoreView {
  const done = m.status === 'completed'
  const games = m.games
  // A best-of-N result: the side cell shows SETS won and a per-game detail line carries the points.
  const multi = done && games.length > 1

  const cell = (singlePoint: number | undefined, setsWon: number): string | null => {
    // No fabricated score: nothing is shown until the match is completed AND has at least one game.
    if (!done || games.length === 0) return null
    // Single game → that game's real point score (e.g. 21 / 15). Multi game → sets won (e.g. 2 / 1).
    return multi ? String(setsWon) : String(singlePoint ?? setsWon)
  }

  return {
    scoreA: cell(games[0]?.scoreA, m.gamesWonA),
    scoreB: cell(games[0]?.scoreB, m.gamesWonB),
    detail: multi ? formatGameScores(games) : '',
    isWinnerA: done && m.winnerId != null && m.winnerId === m.competitorAId,
    isWinnerB: done && m.winnerId != null && m.winnerId === m.competitorBId,
  }
}
