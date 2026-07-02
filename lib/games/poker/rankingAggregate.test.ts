import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildRankStats, type HandResultRecord } from './rankingAggregate.ts'
import { rankPlayers } from './ranking.ts'

function hand(over: Partial<HandResultRecord> & { handId: string }): HandResultRecord {
  return {
    bigBlind: 100,
    seats: [{ seatIndex: 0, userId: 'a' }, { seatIndex: 1, userId: 'b' }],
    payouts: [{ seatIndex: 0, amount: 200 }],
    revealSeatIndexes: [],
    ...over,
  }
}

test('counts hands, opponents, and biggest pot (in bb×100)', () => {
  const stats = buildRankStats(
    [hand({ handId: 'h1', payouts: [{ seatIndex: 0, amount: 300 }] })],
    new Map([['a', 200], ['b', -200]]),
  )
  const a = stats.find((s) => s.userId === 'a')!
  assert.equal(a.handsPlayed, 1)
  assert.equal(a.distinctOpponents, 1)
  assert.equal(a.biggestPotBbHundredths, 300) // 300 chips / 100 bb × 100 = 300
  assert.equal(a.netProfitChips, 200)
})

test('showdown seen/won derived from reveal + payouts', () => {
  const stats = buildRankStats(
    [hand({ handId: 'h1', revealSeatIndexes: [0, 1], payouts: [{ seatIndex: 0, amount: 200 }] })],
    new Map(),
  )
  const a = stats.find((s) => s.userId === 'a')!
  const b = stats.find((s) => s.userId === 'b')!
  assert.equal(a.showdownsSeen, 1)
  assert.equal(a.showdownsWon, 1)
  assert.equal(b.showdownsSeen, 1)
  assert.equal(b.showdownsWon, 0)
})

test('netBbHundredths normalizes exact ledger net by weighted average bb', () => {
  // Two hands at bb 100 and 300 → avg bb 200. Net +400 chips → 400/200 = 2 bb → 200 (×100).
  const stats = buildRankStats(
    [hand({ handId: 'h1', bigBlind: 100 }), hand({ handId: 'h2', bigBlind: 300 })],
    new Map([['a', 400]]),
  )
  const a = stats.find((s) => s.userId === 'a')!
  assert.equal(a.handsPlayed, 2)
  assert.equal(a.netBbHundredths, 200)
})

test('missing ledger net → 0 profit, no NaN', () => {
  const stats = buildRankStats([hand({ handId: 'h1' })], new Map())
  const a = stats.find((s) => s.userId === 'a')!
  assert.equal(a.netProfitChips, 0)
  assert.equal(a.netBbHundredths, 0)
})

test('ignores hands with a non-positive big blind', () => {
  const stats = buildRankStats([hand({ handId: 'h1', bigBlind: 0 })], new Map())
  assert.equal(stats.length, 0)
})

test('output feeds cleanly into rankPlayers', () => {
  const many: HandResultRecord[] = []
  for (let i = 0; i < 600; i++) {
    many.push({
      handId: `h${i}`,
      bigBlind: 100,
      seats: [
        { seatIndex: 0, userId: 'hero' },
        { seatIndex: 1, userId: `opp${i % 10}` },
      ],
      payouts: [{ seatIndex: 0, amount: 150 }],
      revealSeatIndexes: [],
    })
  }
  const stats = buildRankStats(many, new Map([['hero', 30_000]]))
  const hero = stats.find((s) => s.userId === 'hero')!
  assert.equal(hero.handsPlayed, 600)
  assert.equal(hero.distinctOpponents, 10)
  const ranked = rankPlayers(stats, 'bb_per_100')
  // hero has 600 hands + 10 opponents → eligible and ranked #1 (only broad player).
  assert.equal(ranked[0].userId, 'hero')
})
