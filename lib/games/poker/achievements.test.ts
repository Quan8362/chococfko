import test from 'node:test'
import assert from 'node:assert/strict'
import {
  POKER_ACHIEVEMENTS,
  ACHIEVEMENT_KEYS,
  isAchievementKey,
  achievementDef,
  instantSeatAchievements,
  awardsForHand,
  winningCategoryLabel,
  HANDS_MILESTONES,
  FULL_TABLE_SEATS,
  type SeatHandFact,
} from './achievements.ts'
import type { Card } from './types.ts'

const baseFact = (over: Partial<SeatHandFact> = {}): SeatHandFact => ({
  userId: 'u1',
  seatIndex: 0,
  folded: false,
  payout: 0,
  wonAtShowdown: false,
  wonSplitPot: false,
  wonSidePot: false,
  winningCategoryLabel: null,
  reconnectedDuringHand: false,
  ...over,
})

// ── Catalog integrity ────────────────────────────────────────────────────────────────────────
test('ACH-CAT-001 keys are unique and typed', () => {
  const set = new Set(ACHIEVEMENT_KEYS)
  assert.equal(set.size, ACHIEVEMENT_KEYS.length, 'no duplicate keys')
  for (const d of POKER_ACHIEVEMENTS) assert.equal(isAchievementKey(d.key), true)
  assert.equal(isAchievementKey('not_a_key'), false)
})

test('ACH-CAT-002 every def resolves and every i18n leaf is unique', () => {
  const leaves = new Set<string>()
  for (const d of POKER_ACHIEVEMENTS) {
    assert.equal(achievementDef(d.key).key, d.key)
    assert.equal(leaves.has(d.i18n), false, `duplicate i18n leaf ${d.i18n}`)
    leaves.add(d.i18n)
  }
})

test('ACH-CAT-003 unknown key throws', () => {
  // @ts-expect-error intentional bad key
  assert.throws(() => achievementDef('nope'))
})

test('ACH-CAT-004 responsible-engagement guardrail — no prohibited achievement pattern', () => {
  // FAILS if anyone introduces a badge that rewards a forbidden behaviour: losing on purpose /
  // chip dumping, repeated all-ins, folding to a friend (collusion), coin transfer, time played,
  // daily-streak pressure, or winning a specific large amount.
  const banned = /daily|streak|login|time|hour|minute|session|marathon|allin|all_in|shove|jam|lose|loss|dump|coin|xu|reward|deposit|spend|gift|transfer|collu|coordinat|friend_fold|bigwin|jackpot/i
  for (const a of POKER_ACHIEVEMENTS) {
    assert.equal(banned.test(a.key), false, `achievement key "${a.key}" matches a prohibited pattern`)
  }
  // Every shipped badge is cosmetic: the catalog carries NO coin/amount/reward field of any kind.
  for (const a of POKER_ACHIEVEMENTS) {
    assert.equal('reward' in a, false)
    assert.equal('coins' in a, false)
    assert.equal('amount' in a, false)
  }
})

// ── Instant per-seat awards ────────────────────────────────────────────────────────────────
test('ACH-INST-001 losing/folded seat earns nothing instant', () => {
  assert.deepEqual(instantSeatAchievements(baseFact({ folded: true })), [])
  assert.deepEqual(instantSeatAchievements(baseFact()), [])
})

test('ACH-INST-002 winning a pot earns first_pot only when uncontested', () => {
  const got = instantSeatAchievements(baseFact({ payout: 500 }))
  assert.deepEqual(got, ['first_pot'])
})

test('ACH-INST-003 showdown win adds first_showdown_win', () => {
  const got = instantSeatAchievements(baseFact({ payout: 500, wonAtShowdown: true }))
  assert.deepEqual(new Set(got), new Set(['first_pot', 'first_showdown_win']))
})

test('ACH-INST-004 split and side pot flags map to their badges', () => {
  const got = instantSeatAchievements(baseFact({ payout: 500, wonAtShowdown: true, wonSplitPot: true, wonSidePot: true }))
  assert.equal(got.includes('win_split_pot'), true)
  assert.equal(got.includes('win_side_pot'), true)
})

test('ACH-INST-005 made-hand badge requires a WON showdown pot', () => {
  // Had a flush category but did NOT win (payout 0) → no flush badge.
  assert.equal(instantSeatAchievements(baseFact({ winningCategoryLabel: 'flush' })).includes('win_flush'), false)
  // Won at showdown with a flush → flush badge.
  const won = instantSeatAchievements(baseFact({ payout: 900, wonAtShowdown: true, winningCategoryLabel: 'flush' }))
  assert.equal(won.includes('win_flush'), true)
})

test('ACH-INST-006 each made-hand category maps to the right badge', () => {
  const cases: [string, string][] = [
    ['straight', 'win_straight'],
    ['flush', 'win_flush'],
    ['full_house', 'win_full_house'],
    ['four_of_a_kind', 'win_four_of_a_kind'],
    ['straight_flush', 'win_straight_flush'],
  ]
  for (const [label, key] of cases) {
    const got = instantSeatAchievements(baseFact({ payout: 100, wonAtShowdown: true, winningCategoryLabel: label }))
    assert.equal(got.includes(key as never), true, `${label} → ${key}`)
  }
})

test('ACH-INST-007 low categories do NOT earn a made-hand badge', () => {
  for (const label of ['high_card', 'pair', 'two_pair', 'three_of_a_kind']) {
    const got = instantSeatAchievements(baseFact({ payout: 100, wonAtShowdown: true, winningCategoryLabel: label }))
    // Only first_pot + first_showdown_win, never a made-hand key.
    assert.equal(got.some((k) => k.startsWith('win_') && k !== 'win_split_pot' && k !== 'win_side_pot'), false, label)
  }
})

test('ACH-INST-008 reconnect_finish requires reconnect AND not folded', () => {
  assert.equal(instantSeatAchievements(baseFact({ reconnectedDuringHand: true })).includes('reconnect_finish'), true)
  assert.equal(instantSeatAchievements(baseFact({ reconnectedDuringHand: true, folded: true })).includes('reconnect_finish'), false)
})

// ── Whole-hand assembly ────────────────────────────────────────────────────────────────────
test('ACH-HAND-001 every participant always gets first_hand + a counter increment + milestones', () => {
  const awards = awardsForHand({
    seatCount: 3,
    seats: [baseFact({ userId: 'a' }), baseFact({ userId: 'b', payout: 300 })],
  })
  for (const a of awards) {
    assert.equal(a.achievements.includes('first_hand'), true)
    assert.equal(a.countsHand, true)
    assert.deepEqual(a.milestones, HANDS_MILESTONES)
  }
  // The winner also carries first_pot.
  assert.equal(awards.find((a) => a.userId === 'b')!.achievements.includes('first_pot'), true)
  assert.equal(awards.find((a) => a.userId === 'a')!.achievements.includes('first_pot'), false)
})

test('ACH-HAND-002 full_table only when six were dealt in', () => {
  const five = awardsForHand({ seatCount: 5, seats: [baseFact({ userId: 'a' })] })
  assert.equal(five[0].achievements.includes('full_table'), false)
  const six = awardsForHand({ seatCount: FULL_TABLE_SEATS, seats: [baseFact({ userId: 'a' })] })
  assert.equal(six[0].achievements.includes('full_table'), true)
})

test('ACH-HAND-003 award list carries no duplicate keys', () => {
  const awards = awardsForHand({
    seatCount: 6,
    seats: [baseFact({ userId: 'a', payout: 100, wonAtShowdown: true, wonSplitPot: true, winningCategoryLabel: 'flush', reconnectedDuringHand: true })],
  })
  const keys = awards[0].achievements
  assert.equal(new Set(keys).size, keys.length)
})

// ── winningCategoryLabel wrapper ────────────────────────────────────────────────────────────
const C = (s: string) => s as Card
test('ACH-EVAL-001 returns null for a missing hole or a too-short board', () => {
  assert.equal(winningCategoryLabel(undefined, [C('As'), C('Ks'), C('Qs')]), null)
  assert.equal(winningCategoryLabel([C('As'), C('Ks')], [C('Qs')]), null) // 4 cards < 5
})

test('ACH-EVAL-002 reads a real flush from 2 hole + 3 board', () => {
  const label = winningCategoryLabel([C('As'), C('Ks')], [C('Qs'), C('9s'), C('2s')])
  assert.equal(label, 'flush')
})

test('ACH-EVAL-003 reads a straight flush', () => {
  const label = winningCategoryLabel([C('9s'), C('8s')], [C('7s'), C('6s'), C('5s')])
  assert.equal(label, 'straight_flush')
})
