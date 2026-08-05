import { matchScoreDisplay, type MatchScoreInput } from '@/lib/tournaments/matchScore'

// Read-only compact scoreline for a completed match, shared by the group schedule and the knockout
// results list so both render the REAL per-game scores from one place ("21–11 · 21–12"). Each game is
// a non-breaking unit — "21–11" never wraps mid-score — while a wrap is allowed between games so a
// best-of-three stays readable on a phone. When a match is completed but has no recorded games it
// shows a status label instead of a fabricated 1–0 (design §7). Not-yet-played matches never reach
// here; the caller renders their "gặp" / status cue.
export default function ScoreLine({
  match,
  completedLabel,
  scoreAria,
  className = '',
}: {
  match: MatchScoreInput
  // Fallback shown for a completed match with no per-game data (e.g. "Đã hoàn thành").
  completedLabel: string
  // Builds the screen-reader label for the score from the comma-joined games (e.g. "Tỉ số 21–11, 21–12").
  scoreAria: (scores: string) => string
  className?: string
}) {
  const sc = matchScoreDisplay(match)

  if (!sc.hasRealScores) {
    return <span className={`text-[11px] text-muted ${className}`}>{completedLabel}</span>
  }

  const games = sc.compactScore.split(' · ')
  return (
    <span className={`inline-flex flex-wrap items-center justify-center gap-x-1 gap-y-0.5 ${className}`} aria-label={scoreAria(sc.ariaScores)}>
      {games.map((g, i) => (
        <span key={i} className="inline-flex items-center gap-x-1">
          {i > 0 && <span aria-hidden className="text-muted/60">·</span>}
          <span className="whitespace-nowrap tabular-nums">{g}</span>
        </span>
      ))}
    </span>
  )
}
