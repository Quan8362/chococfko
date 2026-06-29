// Framework-free tests for the TLMN leaderboard win-rate display.
// Run with:  node --test lib/games/winRate.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatWinRate, winRateDisplay } from './winRate.ts'

const DASH = '–'

// Spec §6 worked examples (case A–D).
test('A — no matches → dash, never 0%', () => {
  assert.equal(winRateDisplay(0, 0, DASH), DASH)
})

test('B — 1 match, 1 win → 100% (no trailing .0)', () => {
  assert.equal(winRateDisplay(1, 1, DASH), '100%')
})

test('C — 2 matches, 1 win → 50%', () => {
  assert.equal(winRateDisplay(1, 2, DASH), '50%')
})

test('D — 3 matches, 2 wins → 66.7% (one decimal)', () => {
  assert.equal(winRateDisplay(2, 3, DASH), '66.7%')
})

// §6: dash is keyed on match count, not the rate — a player who has played but never won
// shows 0%, NOT the dash.
test('H/loss-only — matches but no wins → 0%, not dash', () => {
  assert.equal(winRateDisplay(0, 4, DASH), '0%')
})

test('formatWinRate strips trailing .0 and keeps a single decimal', () => {
  assert.equal(formatWinRate(0), '0%')
  assert.equal(formatWinRate(50), '50%')
  assert.equal(formatWinRate(100), '100%')
  assert.equal(formatWinRate(33.3), '33.3%')
  assert.equal(formatWinRate(66.7), '66.7%')
})
