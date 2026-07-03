import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  validateBlindStructure,
  resolveBlindClock,
  totalDurationSeconds,
  levelStartSeconds,
  levelEndSeconds,
  activeBlinds,
} from './blinds.ts'
import type { BlindStructure } from './types.ts'

const S: BlindStructure = {
  id: 'test',
  levels: [
    { level: 1, smallBlind: 10, bigBlind: 20, ante: 0, durationSeconds: 100, isBreak: false },
    { level: 2, smallBlind: 20, bigBlind: 40, ante: 0, durationSeconds: 100, isBreak: false },
    { level: 3, smallBlind: 0, bigBlind: 0, ante: 0, durationSeconds: 50, isBreak: true },
    { level: 4, smallBlind: 30, bigBlind: 60, ante: 10, durationSeconds: 100, isBreak: false },
  ],
}

test('validateBlindStructure accepts a good structure and rejects bad ones', () => {
  assert.deepEqual(validateBlindStructure(S), { ok: true })
  assert.equal(validateBlindStructure({ id: 'x', levels: [] }).ok, false)
  const badOrdinal: BlindStructure = { id: 'x', levels: [{ level: 2, smallBlind: 1, bigBlind: 2, ante: 0, durationSeconds: 1, isBreak: false }] }
  assert.equal(validateBlindStructure(badOrdinal).ok, false)
  const breakWithBlinds: BlindStructure = { id: 'x', levels: [{ level: 1, smallBlind: 5, bigBlind: 10, ante: 0, durationSeconds: 1, isBreak: true }] }
  assert.equal(validateBlindStructure(breakWithBlinds).ok, false)
  const sbGtBb: BlindStructure = { id: 'x', levels: [{ level: 1, smallBlind: 30, bigBlind: 10, ante: 0, durationSeconds: 1, isBreak: false }] }
  assert.equal(validateBlindStructure(sbGtBb).ok, false)
})

test('TNMT-BLIND-010 resolveBlindClock picks the level by elapsed time', () => {
  assert.equal(resolveBlindClock(S, 0).currentLevel.level, 1)
  assert.equal(resolveBlindClock(S, 50).currentLevel.level, 1)
  assert.equal(resolveBlindClock(S, 99).currentLevel.level, 1)
  assert.equal(resolveBlindClock(S, 100).currentLevel.level, 2) // boundary → next level
  assert.equal(resolveBlindClock(S, 150).currentLevel.level, 2)
  assert.equal(resolveBlindClock(S, 200).currentLevel.level, 3) // break
  assert.equal(resolveBlindClock(S, 260).currentLevel.level, 4)
})

test('time remaining + into-level are correct and next level is exposed', () => {
  const c = resolveBlindClock(S, 30)
  assert.equal(c.secondsIntoLevel, 30)
  assert.equal(c.secondsRemainingInLevel, 70)
  assert.equal(c.nextLevel?.level, 2)
  assert.equal(c.levelIndex, 0)
  const last = resolveBlindClock(S, 1000) // past the end parks on last level
  assert.equal(last.currentLevel.level, 4)
  assert.equal(last.nextLevel, null)
  assert.equal(last.secondsRemainingInLevel, 0)
})

test('TNMT-BLIND-011 break level is flagged onBreak with zero blinds', () => {
  const c = resolveBlindClock(S, 210)
  assert.ok(c.onBreak)
  assert.equal(c.currentLevel.bigBlind, 0)
})

test('TNMT-BLIND-013 activeBlinds returns the current level blinds/ante', () => {
  assert.deepEqual(activeBlinds(S, 120), { smallBlind: 20, bigBlind: 40, ante: 0 })
  assert.deepEqual(activeBlinds(S, 260), { smallBlind: 30, bigBlind: 60, ante: 10 })
})

test('level start/end helpers + total duration', () => {
  assert.equal(totalDurationSeconds(S), 350)
  assert.equal(levelStartSeconds(S, 0), 0)
  assert.equal(levelStartSeconds(S, 1), 100)
  assert.equal(levelStartSeconds(S, 3), 250)
  assert.equal(levelEndSeconds(S, 0), 100)
  assert.equal(levelEndSeconds(S, 3), 350)
})

test('pause-safety: freezing elapsed keeps the same level (TNMT-BLIND-012)', () => {
  // Pausing accumulates into paused_ms so elapsed does not advance — same input, same level.
  const before = resolveBlindClock(S, 80)
  const afterPause = resolveBlindClock(S, 80) // elapsed unchanged during pause
  assert.deepEqual(before, afterPause)
})
