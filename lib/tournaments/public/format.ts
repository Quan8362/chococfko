// Pure formatting helpers for the public tournament pages. No I/O — locale is passed in.

import type { PublicTournamentStatus, TournamentPhase } from './types'

// Bucket a tournament for list ordering / status pills. `completed` status wins; otherwise a
// published tournament is `upcoming` until its start date, then `ongoing`.
export function tournamentPhase(
  status: PublicTournamentStatus,
  startsAt: string | null,
  endsAt: string | null,
): TournamentPhase {
  if (status === 'completed') return 'completed'
  const now = Date.now()
  const start = startsAt ? Date.parse(startsAt) : NaN
  const end = endsAt ? Date.parse(endsAt) : NaN
  if (!Number.isNaN(start) && now < start) return 'upcoming'
  if (!Number.isNaN(end) && now > end) return 'ongoing'
  return Number.isNaN(start) ? 'upcoming' : 'ongoing'
}

const LOCALE_TAG: Record<string, string> = {
  vi: 'vi-VN',
  en: 'en-US',
  ja: 'ja-JP',
  ko: 'ko-KR',
  zh: 'zh-CN',
}

function tag(locale: string): string {
  return LOCALE_TAG[locale] ?? 'vi-VN'
}

function fmt(iso: string, locale: string): string | null {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return null
  try {
    return new Intl.DateTimeFormat(tag(locale), { day: 'numeric', month: 'short', year: 'numeric' }).format(ms)
  } catch {
    return null
  }
}

// A human date range. Returns '' when nothing is known so callers can fall back to a "TBD" label.
export function formatDateRange(startsAt: string | null, endsAt: string | null, locale: string): string {
  const s = startsAt ? fmt(startsAt, locale) : null
  const e = endsAt ? fmt(endsAt, locale) : null
  if (s && e) return s === e ? s : `${s} – ${e}`
  return s ?? e ?? ''
}

// Percentage of completed matches (0–100, integer). Returns null when there are no matches yet.
export function completionPercent(completed: number, total: number): number | null {
  if (total <= 0) return null
  return Math.round((completed / total) * 100)
}

// A single game/set as stored — the same shape the schedule + score editor consume.
export interface GameScorePair {
  scoreA: number
  scoreB: number
}

// Compact per-game score line for narrow bracket cards, always oriented side A first:
//   [{21,15},{15,21},{21,18}] → "21–15 · 15–21 · 21–18"
// Uses an en-dash between the two point scores of a game and a middle dot between games. Returns ''
// for an empty list so callers show a "completed, no detail" fallback instead of a fabricated 0–0.
export function formatGameScores(games: GameScorePair[]): string {
  return games.map((g) => `${g.scoreA}–${g.scoreB}`).join(' · ')
}
