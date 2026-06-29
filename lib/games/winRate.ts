// Win-rate display for the TLMN leaderboard (and any game stats board).
//
// The dash (–) means "no games yet" and is decided by the MATCH COUNT, never by the rate:
// a player who has played but never won shows 0%, not –. The percentage is formatted with
// at most one decimal and a trailing .0 stripped (100% not 100.0%, 66.7% not 66.66666%).
//
// `rate` is the already-computed win percentage (server rounds wins*100/games once, so the
// client never double-rounds). Pass `dash` so the caller owns the i18n string.

export function formatWinRate(rate: number): string {
  return Number.isInteger(rate) ? `${rate}%` : `${rate.toFixed(1)}%`
}

export function winRateDisplay(
  totalWins: number,
  totalMatches: number,
  dash: string,
): string {
  if (totalMatches <= 0) return dash
  const rate = (totalWins / totalMatches) * 100
  return formatWinRate(rate)
}
