// Relative difficulty classification + adaptive selection. PURE module.
// JLPT level is NEVER changed by adaptation — this only picks the relative
// difficulty BUCKET (easy/normal/hard) of the next question within the level.

import type { Jp60Difficulty } from './constants.ts'

// Heuristic difficulty of a generated question from its source signals.
// longerReading / more meanings / blank-fill = harder; kept simple & data-driven.
export function classifyDifficulty(signals: {
  qType: string
  readingLength?: number
  distractorCloseness?: number // 0..1, how similar distractors are to the answer
}): Jp60Difficulty {
  if (signals.qType.includes('blank') || signals.qType.includes('meaning_to')) {
    return 'hard'
  }
  if ((signals.readingLength ?? 0) >= 5) return 'hard'
  if ((signals.distractorCloseness ?? 0) >= 0.6) return 'hard'
  if (signals.qType.includes('reading')) return 'normal'
  return 'normal'
}

// Adaptive target for the NEXT question. Starts normal; climbs after a streak of
// correct answers, eases after repeated misses. Never returns outside the bucket.
export function nextTargetDifficulty(prev: {
  current: Jp60Difficulty
  consecutiveCorrect: number
  consecutiveWrong: number
}): Jp60Difficulty {
  if (prev.consecutiveWrong >= 2) {
    return prev.current === 'hard' ? 'normal' : 'easy'
  }
  if (prev.consecutiveCorrect >= 3) return 'hard'
  if (prev.consecutiveCorrect >= 1) return 'normal'
  return 'normal'
}

const ORDER: Jp60Difficulty[] = ['easy', 'normal', 'hard']

// Pick the candidate closest to the target bucket (so we never stall when a
// bucket is empty), preferring not to repeat recent source ids.
export function pickByDifficulty<T extends { difficulty: Jp60Difficulty; sourceId: string }>(
  candidates: readonly T[],
  target: Jp60Difficulty,
  recentSourceIds: ReadonlySet<string>
): T | null {
  const fresh = candidates.filter((c) => !recentSourceIds.has(c.sourceId))
  const pool = fresh.length > 0 ? fresh : candidates
  if (pool.length === 0) return null

  const targetIdx = ORDER.indexOf(target)
  let best: T | null = null
  let bestDist = Infinity
  for (const c of pool) {
    const dist = Math.abs(ORDER.indexOf(c.difficulty) - targetIdx)
    if (dist < bestDist) {
      bestDist = dist
      best = c
    }
  }
  return best
}
