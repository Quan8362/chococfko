// Asia/Tokyo calendar helpers for daily challenges, streaks and weekly periods.
// PURE module — all functions take an explicit Date so they are deterministic
// and testable regardless of the server's local timezone.

const TZ = 'Asia/Tokyo'

// 'YYYY-MM-DD' for the given instant, in Japan local time.
export function tokyoDateString(at: Date = new Date()): string {
  // en-CA gives ISO-style YYYY-MM-DD.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return fmt.format(at)
}

// Parse a 'YYYY-MM-DD' into its parts (no Date / timezone involved).
function parseYmd(s: string): { y: number; m: number; d: number } {
  const [y, m, d] = s.split('-').map(Number)
  return { y, m, d }
}

// Day index (days since epoch) for a 'YYYY-MM-DD' — used for date arithmetic
// that must ignore time-of-day and DST. Japan has no DST, so this is exact.
export function dayNumber(ymd: string): number {
  const { y, m, d } = parseYmd(ymd)
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000)
}

// Difference in whole days between two Tokyo date strings (a - b).
export function dayDiff(a: string, b: string): number {
  return dayNumber(a) - dayNumber(b)
}

// 0=Sunday … 6=Saturday for a Tokyo date string.
export function weekdayOf(ymd: string): number {
  const { y, m, d } = parseYmd(ymd)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

function ymdFromDayNumber(n: number): string {
  const dt = new Date(n * 86400000)
  const y = dt.getUTCFullYear()
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const d = String(dt.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export type WeeklyPeriod = {
  key: string // e.g. '2026-06-15' (the Monday) — stable, sortable key
  start: string // Monday  YYYY-MM-DD (Tokyo)
  end: string // Sunday  YYYY-MM-DD (Tokyo)
}

// ISO-style week (Monday start) containing the given instant, in Tokyo time.
export function tokyoWeeklyPeriod(at: Date = new Date()): WeeklyPeriod {
  const today = tokyoDateString(at)
  const wd = weekdayOf(today) // 0=Sun..6=Sat
  const sinceMonday = (wd + 6) % 7 // Mon→0, Sun→6
  const startNum = dayNumber(today) - sinceMonday
  const start = ymdFromDayNumber(startNum)
  const end = ymdFromDayNumber(startNum + 6)
  return { key: start, start, end }
}
