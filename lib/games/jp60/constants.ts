// Japanese 60-Second Challenge — shared constants & types.
// PURE module: no server-only imports, safe to import from client + tests.

export const JP60_LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1', 'MIXED'] as const
export type Jp60Level = (typeof JP60_LEVELS)[number]

export const JP60_MODES = ['daily', 'rush', 'practice'] as const
export type Jp60Mode = (typeof JP60_MODES)[number]

// Rush + Daily run on a fixed clock; practice may opt out of the timer.
export const JP60_DURATION_SEC = 60
// Daily challenge serves up to this many scored questions.
export const JP60_DAILY_QUESTIONS = 10
// Server-side grace so a slow network submit near 0:00 still counts.
export const JP60_SUBMIT_GRACE_MS = 2500
// Hard ceiling on how many questions one rush session can pull/answer.
export const JP60_RUSH_MAX_QUESTIONS = 60
// Practice question-count choices.
export const JP60_PRACTICE_COUNTS = [10, 20, 30] as const

export type Jp60Difficulty = 'easy' | 'normal' | 'hard'
export const JP60_DIFFICULTIES = ['easy', 'normal', 'hard'] as const

export function isJp60Level(v: unknown): v is Jp60Level {
  return typeof v === 'string' && (JP60_LEVELS as readonly string[]).includes(v)
}
export function isJp60Mode(v: unknown): v is Jp60Mode {
  return typeof v === 'string' && (JP60_MODES as readonly string[]).includes(v)
}

// JLPT source levels behind a chosen game level (MIXED spans all).
export function sourceLevelsFor(level: Jp60Level): readonly ('N5' | 'N4' | 'N3' | 'N2' | 'N1')[] {
  if (level === 'MIXED') return ['N5', 'N4', 'N3', 'N2', 'N1']
  return [level]
}
