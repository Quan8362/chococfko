// ── Poker TOURNAMENT — blind clock (TNMT-BLIND) ─────────────────────────────────────────
//
// PURE module — no clock read here. The caller passes `elapsedSeconds` (the server-authoritative
// elapsed play time = now - started_at - paused_ms). This resolves WHICH level is current, the
// next level, and the time remaining. Breaks are pseudo-levels (isBreak) with no blinds. Level
// timing is server-authoritative and pause-safe: freezing is done by NOT advancing elapsed, which
// the DB does by accumulating paused_ms (TNMT-BLIND-010..013).

import type { BlindLevel, BlindStructure, BlindClock } from './types.ts'

export function validateBlindStructure(s: BlindStructure): { ok: true } | { ok: false; reason: string } {
  if (!s.levels.length) return { ok: false, reason: 'blind structure has no levels' }
  for (let i = 0; i < s.levels.length; i++) {
    const l = s.levels[i]
    if (l.level !== i + 1) return { ok: false, reason: `level ${i} has ordinal ${l.level}, expected ${i + 1}` }
    if (!Number.isInteger(l.durationSeconds) || l.durationSeconds <= 0) {
      return { ok: false, reason: `level ${l.level} has non-positive duration` }
    }
    for (const [k, v] of [['smallBlind', l.smallBlind], ['bigBlind', l.bigBlind], ['ante', l.ante]] as const) {
      if (!Number.isInteger(v) || v < 0) return { ok: false, reason: `level ${l.level} ${k} must be a non-negative integer` }
    }
    if (l.isBreak) {
      if (l.smallBlind !== 0 || l.bigBlind !== 0 || l.ante !== 0) {
        return { ok: false, reason: `break level ${l.level} must have zero blinds/ante` }
      }
    } else {
      if (l.bigBlind <= 0 || l.smallBlind <= 0) return { ok: false, reason: `play level ${l.level} needs positive blinds` }
      if (l.smallBlind > l.bigBlind) return { ok: false, reason: `level ${l.level} smallBlind > bigBlind` }
    }
  }
  return { ok: true }
}

// Cumulative end-time (seconds from start) of each level. `ends[i]` = when level i finishes.
function cumulativeEnds(s: BlindStructure): number[] {
  const ends: number[] = []
  let acc = 0
  for (const l of s.levels) {
    acc += l.durationSeconds
    ends.push(acc)
  }
  return ends
}

export function totalDurationSeconds(s: BlindStructure): number {
  return s.levels.reduce((a, l) => a + l.durationSeconds, 0)
}

// Resolve the current blind clock at `elapsedSeconds` into the running tournament. Clamps: before
// start (elapsed < 0) → level 1 at 0; after the final level ends → the last level, no next, 0
// remaining (the tournament is finishing at that point; the clock just parks on the last level).
export function resolveBlindClock(s: BlindStructure, elapsedSeconds: number): BlindClock {
  if (!s.levels.length) throw new Error('blinds: empty structure')
  const e = Math.max(0, Math.floor(elapsedSeconds))
  const ends = cumulativeEnds(s)
  const last = s.levels.length - 1

  let idx = ends.findIndex((end) => e < end)
  if (idx === -1) idx = last // past the end → park on last level

  const level = s.levels[idx]
  const levelStart = idx === 0 ? 0 : ends[idx - 1]
  const secondsIntoLevel = Math.max(0, e - levelStart)
  const pastEnd = e >= ends[last]
  const secondsRemainingInLevel = pastEnd ? 0 : Math.max(0, ends[idx] - e)
  const nextLevel: BlindLevel | null = idx < last ? s.levels[idx + 1] : null

  return {
    currentLevel: level,
    nextLevel,
    levelIndex: idx,
    secondsIntoLevel,
    secondsRemainingInLevel,
    onBreak: level.isBreak,
  }
}

// When does level index `idx` START (seconds from tournament start)? Used to answer late-reg /
// re-entry deadlines ("late reg closes when level N ends" = start of level N+1).
export function levelStartSeconds(s: BlindStructure, idx: number): number {
  if (idx <= 0) return 0
  const ends = cumulativeEnds(s)
  return ends[Math.min(idx, ends.length) - 1]
}

// When does level index `idx` END (seconds from start)? levelEndSeconds(last) = totalDuration.
export function levelEndSeconds(s: BlindStructure, idx: number): number {
  const ends = cumulativeEnds(s)
  return ends[Math.min(Math.max(idx, 0), ends.length - 1)]
}

// The play level active at `elapsedSeconds` — what blinds/ante a hand STARTING now must post
// (TNMT-BLIND-013). If the clock is on a break, no hand should start; callers gate on onBreak.
export function activeBlinds(s: BlindStructure, elapsedSeconds: number): Pick<BlindLevel, 'smallBlind' | 'bigBlind' | 'ante'> {
  const { currentLevel } = resolveBlindClock(s, elapsedSeconds)
  return { smallBlind: currentLevel.smallBlind, bigBlind: currentLevel.bigBlind, ante: currentLevel.ante }
}
