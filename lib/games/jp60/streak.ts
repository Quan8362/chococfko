// Daily streak logic in Asia/Tokyo. PURE module.
// A streak counts CALENDAR DAYS (Tokyo) with >=1 eligible completion. It never
// increments twice on the same date and only resets when a full day was missed.

// Whole-day difference between two 'YYYY-MM-DD' strings (a - b). Self-contained
// (no cross-module import) so node --test can load this file directly and tsc
// stays happy without enabling allowImportingTsExtensions. Japan has no DST, so
// UTC-based day arithmetic on the date parts is exact. Mirrors time.ts#dayDiff.
function dayDiff(a: string, b: string): number {
  const toNum = (s: string) => {
    const [y, m, d] = s.split('-').map(Number)
    return Math.floor(Date.UTC(y, m - 1, d) / 86400000)
  }
  return toNum(a) - toNum(b)
}

export type StreakState = {
  current: number
  longest: number
  lastActiveDate: string | null // 'YYYY-MM-DD' (Tokyo) of last counted day
}

export type StreakUpdate = StreakState & {
  incrementedToday: boolean // true only on the day it first advances
  milestoneHit: number | null // the milestone reached on THIS update, if any
}

export const JP60_STREAK_MILESTONES = [3, 7, 14, 30, 60, 100, 365] as const

export function nextMilestone(current: number): number | null {
  for (const m of JP60_STREAK_MILESTONES) if (m > current) return m
  return null
}

// Apply an eligible completion on `today` (Tokyo date string) to prior state.
export function applyStreak(prev: StreakState, today: string): StreakUpdate {
  const last = prev.lastActiveDate
  // Already counted today → no change, no double increment.
  if (last === today) {
    return { ...prev, incrementedToday: false, milestoneHit: null }
  }

  let current: number
  if (last == null) {
    current = 1
  } else {
    const gap = dayDiff(today, last)
    if (gap === 1) current = prev.current + 1 // consecutive day
    else if (gap <= 0) {
      // Clock skew / out-of-order — keep prior, don't advance or reset.
      return { ...prev, incrementedToday: false, milestoneHit: null }
    } else current = 1 // missed at least one day → reset
  }

  const longest = Math.max(prev.longest, current)
  const milestoneHit = (JP60_STREAK_MILESTONES as readonly number[]).includes(current) ? current : null
  return { current, longest, lastActiveDate: today, incrementedToday: true, milestoneHit }
}
