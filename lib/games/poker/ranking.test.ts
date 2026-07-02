import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  bbPer100,
  netBbWon,
  showdownWinRate,
  biggestPotBb,
  isRankEligible,
  metricValue,
  rankPlayers,
  collusionRiskScore,
  DEFAULT_RANK_ELIGIBILITY,
  PUBLIC_RANKING_METRICS,
  type PlayerRankStats,
} from './ranking.ts'

function stats(over: Partial<PlayerRankStats> & { userId: string }): PlayerRankStats {
  return {
    handsPlayed: 1000,
    showdownsSeen: 0,
    showdownsWon: 0,
    netBbHundredths: 0,
    netProfitChips: 0,
    biggestPotBbHundredths: 0,
    distinctOpponents: 20,
    sessionsCount: 10,
    ...over,
  }
}

test('bbPer100 normalizes bb×100 by hands to a bb/100 rate', () => {
  // +500 bb over 1000 hands = 50 bb / 100 hands.
  const s = stats({ userId: 'a', netBbHundredths: 500 * 100, handsPlayed: 1000 })
  assert.equal(bbPer100(s), 50)
  assert.equal(netBbWon(s), 500)
})

test('bbPer100 handles zero hands without dividing by zero', () => {
  assert.equal(bbPer100(stats({ userId: 'a', handsPlayed: 0 })), 0)
})

test('showdownWinRate is a bounded fraction', () => {
  assert.equal(showdownWinRate(stats({ userId: 'a', showdownsSeen: 40, showdownsWon: 30 })), 0.75)
  assert.equal(showdownWinRate(stats({ userId: 'a', showdownsSeen: 0 })), 0)
})

test('biggestPotBb converts hundredths', () => {
  assert.equal(biggestPotBb(stats({ userId: 'a', biggestPotBbHundredths: 12345 })), 123.45)
})

test('eligibility requires BOTH min hands and min distinct opponents', () => {
  assert.equal(isRankEligible(stats({ userId: 'a', handsPlayed: 500, distinctOpponents: 8 })), true)
  assert.equal(isRankEligible(stats({ userId: 'a', handsPlayed: 499, distinctOpponents: 8 })), false)
  assert.equal(isRankEligible(stats({ userId: 'a', handsPlayed: 500, distinctOpponents: 7 })), false)
})

test('rankPlayers filters out skill-ineligible players for gated metrics', () => {
  const eligible = stats({ userId: 'grinder', netBbHundredths: 300 * 100, handsPlayed: 2000, distinctOpponents: 30 })
  const smurf = stats({ userId: 'smurf', netBbHundredths: 900 * 100, handsPlayed: 40, distinctOpponents: 2 })
  const ranked = rankPlayers([eligible, smurf], 'bb_per_100')
  assert.equal(ranked.length, 1)
  assert.equal(ranked[0].userId, 'grinder')
  assert.equal(ranked[0].rank, 1)
})

test('rankPlayers does NOT gate participation metric', () => {
  const a = stats({ userId: 'a', handsPlayed: 50, distinctOpponents: 1 })
  const b = stats({ userId: 'b', handsPlayed: 80, distinctOpponents: 1 })
  const ranked = rankPlayers([a, b], 'hands_played')
  assert.deepEqual(ranked.map((r) => r.userId), ['b', 'a'])
})

test('rankPlayers is deterministic on ties (hands desc, then userId asc)', () => {
  const a = stats({ userId: 'bob', netBbHundredths: 100 * 100, handsPlayed: 1000, distinctOpponents: 20 })
  const b = stats({ userId: 'amy', netBbHundredths: 100 * 100, handsPlayed: 1000, distinctOpponents: 20 })
  const c = stats({ userId: 'cat', netBbHundredths: 100 * 100, handsPlayed: 2000, distinctOpponents: 20 })
  // c has more hands so ranks first; a & b tie on value+hands so userId decides (amy < bob).
  const ranked = rankPlayers([a, b, c], 'net_bb_won')
  assert.deepEqual(ranked.map((r) => r.userId), ['cat', 'amy', 'bob'])
})

test('metricValue matches the derived helpers', () => {
  const s = stats({ userId: 'a', netBbHundredths: 200 * 100, handsPlayed: 1000, netProfitChips: 999 })
  assert.equal(metricValue(s, 'bb_per_100'), bbPer100(s))
  assert.equal(metricValue(s, 'net_bb_won'), netBbWon(s))
  assert.equal(metricValue(s, 'net_profit_chips'), 999)
})

test('net_profit_chips is not a public metric', () => {
  assert.equal(PUBLIC_RANKING_METRICS.includes('net_profit_chips' as never), false)
})

test('collusionRiskScore flags a lopsided dump-collector', () => {
  const sig = collusionRiskScore({
    userId: 'collector',
    netProfitChips: 1_000_000,
    perOpponentProfitChips: [{ opponentId: 'feeder', chips: 950_000 }, { opponentId: 'x', chips: 50_000 }],
    handsPlayed: 60,
    distinctOpponents: 2,
  })
  assert.ok(sig.score > 0.6)
  assert.ok(sig.reasons.includes('single_counterparty_dominant'))
  assert.ok(sig.reasons.includes('few_distinct_opponents'))
})

test('collusionRiskScore stays low for a broad grinder', () => {
  const opp = Array.from({ length: 20 }, (_, i) => ({ opponentId: `o${i}`, chips: 5_000 }))
  const sig = collusionRiskScore({
    userId: 'grinder',
    netProfitChips: 100_000,
    perOpponentProfitChips: opp,
    handsPlayed: 5000,
    distinctOpponents: 20,
  })
  assert.ok(sig.score < 0.2)
  assert.equal(sig.reasons.length, 0)
})

test('DEFAULT_RANK_ELIGIBILITY is the documented 500 / 8', () => {
  assert.equal(DEFAULT_RANK_ELIGIBILITY.minHands, 500)
  assert.equal(DEFAULT_RANK_ELIGIBILITY.minDistinctOpponents, 8)
})
