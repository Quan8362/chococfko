// Single source of truth for how a completed match's REAL scoreline is presented across the
// management surfaces (group schedule + knockout results). The point is to show the stored per-game
// scores — "21–11 · 21–12" — and NEVER the winner=1 / loser=0 sets tally masquerading as a scoreline
// (which used to render as a fake "1–0"). No I/O; the winner is the server's authoritative `winnerId`
// and is only echoed here, never derived. Kept beside the pure domain so both the group panel and the
// knockout panel format identically and can never diverge.

import { formatGameScores, type GameScorePair } from './public/format.ts'

export type { GameScorePair }

export interface MatchScoreInput {
  status: string
  winnerId: string | null
  competitorAId: string | null
  competitorBId: string | null
  games: GameScorePair[]
}

export interface MatchScoreDisplay {
  // Compact real per-game scoreline, always oriented side-A first: "21–11 · 21–12". '' when there is
  // nothing real to show (not completed, or completed with no recorded games).
  compactScore: string
  // The same games comma-joined for a screen-reader label ("21–11, 21–12") — a spoken-friendly form
  // of the compact line whose "·" separator has no meaning read aloud. '' when no real scores.
  ariaScores: string
  // completed AND at least one recorded game → render compactScore; otherwise the caller shows a
  // status label ("Đã hoàn thành" / "gặp"). Guards against fabricating a 0–0 or a 1–0.
  hasRealScores: boolean
  isWinnerA: boolean
  isWinnerB: boolean
}

export function matchScoreDisplay(m: MatchScoreInput): MatchScoreDisplay {
  const done = m.status === 'completed'
  const hasRealScores = done && m.games.length > 0
  return {
    compactScore: hasRealScores ? formatGameScores(m.games) : '',
    ariaScores: hasRealScores ? m.games.map((g) => `${g.scoreA}–${g.scoreB}`).join(', ') : '',
    hasRealScores,
    isWinnerA: done && m.winnerId != null && m.winnerId === m.competitorAId,
    isWinnerB: done && m.winnerId != null && m.winnerId === m.competitorBId,
  }
}
