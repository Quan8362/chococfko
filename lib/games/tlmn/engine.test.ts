// Framework-free tests for the pure Tiến Lên rules engine ("chuẩn chỉ" gate).
// Run with:  node --test lib/games/tlmn/engine.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseHand, parseCard, parseCombo, beats, legalMoves, enumerateCombos,
  isRoundOneOpening, checkInstantWin, settleRound, isBomb,
  DEFAULT_RULES, resolveRules, pickHostOverride, HOST_CONFIGURABLE_KEYS,
  type Combo, type Card, type SettlementState,
} from './engine.ts'

const RULES = DEFAULT_RULES // existing tests reference numeric defaults via this alias

// ── helpers ──────────────────────────────────────────────────────────────────────
function combo(s: string): Combo {
  const c = parseCombo(parseHand(s))
  assert.ok(c, `expected a legal combo from "${s}"`)
  return c!
}
function sum(rec: Record<number, number>): number {
  return Object.values(rec).reduce((a, b) => a + b, 0)
}

// ── Cards & ordering ───────────────────────────────────────────────────────────
test('3♥ beats 3♠ (suit breaks the tie); not vice-versa', () => {
  assert.equal(beats(combo('3H'), combo('3S')), true)
  assert.equal(beats(combo('3S'), combo('3H')), false)
})

test('2♥ is the top single — beats everything, beaten by nothing (as a single)', () => {
  assert.equal(beats(combo('2H'), combo('AH')), true)
  assert.equal(beats(combo('2H'), combo('2D')), true)
  assert.equal(beats(combo('AH'), combo('2H')), false)
  assert.equal(beats(combo('2S'), combo('2H')), false)
})

test('pairs compare by highest card; higher rank wins; count must match', () => {
  assert.equal(beats(combo('4S 4H'), combo('4C 4D')), true)   // same rank, ♥ tops ♦
  assert.equal(beats(combo('5S 5C'), combo('4H 4D')), true)   // higher rank
  assert.equal(beats(combo('4C 4D'), combo('4S 4H')), false)
  // a single can never beat a pair (different count, not a bomb)
  assert.equal(beats(combo('5H'), combo('4S 4C')), false)
})

test('triples compare by rank; a pair cannot beat a triple', () => {
  assert.equal(beats(combo('7S 7C 7D'), combo('6S 6C 6D')), true)
  assert.equal(beats(combo('6S 6C 6D'), combo('7S 7C 7D')), false)
  assert.equal(beats(combo('KS KC'), combo('7S 7C 7D')), false)
})

// ── Straights (sảnh) ─────────────────────────────────────────────────────────────
test('straight parses ≥3 consecutive; 2 rejected; no wrap-around', () => {
  assert.equal(parseCombo(parseHand('3S 4S 5S'))?.type, 'straight')
  assert.equal(parseCombo(parseHand('QS KS AS'))?.type, 'straight')
  assert.equal(parseCombo(parseHand('KS AS 2S')), null)  // contains 2
  assert.equal(parseCombo(parseHand('AS 2S 3S')), null)  // wrap A-2-3
  assert.equal(parseCombo(parseHand('KH AS')), null)     // too short
})

test('straights compare same-length only, by highest card (incl. suit)', () => {
  assert.equal(beats(combo('4S 5S 6S'), combo('3S 4S 5S')), true)
  assert.equal(beats(combo('3S 4S 5S'), combo('4S 5S 6S')), false)
  // different length never matches
  assert.equal(beats(combo('3S 4S 5S 6S'), combo('3S 4S 5S')), false)
  assert.equal(beats(combo('3S 4S 5S'), combo('3S 4S 5S 6S')), false)
  // same top rank, suit breaks it
  assert.equal(beats(combo('3C 4C 5H'), combo('3S 4S 5C')), true)
})

// ── Đôi thông (pairs-run) ─────────────────────────────────────────────────────────
test('pairs-run parses 3-/4-length; 2 rejected; same-length compare', () => {
  assert.equal(parseCombo(parseHand('3S 3C 4S 4C 5S 5C'))?.type, 'pairsRun')
  assert.equal(parseCombo(parseHand('3S 3C 4S 4C 5S 5C 6S 6C'))?.count, 8)
  assert.equal(parseCombo(parseHand('KS KC AS AC 2S 2C')), null) // contains 2
  assert.equal(
    beats(combo('4S 4C 5S 5C 6S 6C'), combo('3S 3C 4S 4C 5S 5C')),
    true,
  )
  assert.equal(
    beats(combo('3S 3C 4S 4C 5S 5C'), combo('4S 4C 5S 5C 6S 6C')),
    false,
  )
})

// ── Bombs / chặt ──────────────────────────────────────────────────────────────────
test('3 đôi thông cuts a single 2', () => {
  assert.equal(beats(combo('3S 3C 4S 4C 5S 5C'), combo('2H')), true)
  assert.ok(isBomb(combo('3S 3C 4S 4C 5S 5C')))
})

test('tứ quý cuts a single 2 and a 3 đôi thông; not a non-2 pair', () => {
  assert.equal(beats(combo('5S 5C 5D 5H'), combo('2H')), true)
  assert.equal(beats(combo('5S 5C 5D 5H'), combo('3S 3C 4S 4C 5S 5C')), true)
  assert.equal(beats(combo('5S 5C 5D 5H'), combo('KS KC')), false)
})

test('4 đôi thông cuts đôi heo, tứ quý, and 3 đôi thông', () => {
  const fourRun = combo('3S 3C 4S 4C 5S 5C 6S 6C')
  assert.equal(beats(fourRun, combo('2S 2C')), true)             // đôi heo
  assert.equal(beats(fourRun, combo('9S 9C 9D 9H')), true)        // tứ quý
  assert.equal(beats(fourRun, combo('7S 7C 8S 8C 9S 9C')), true)  // 3 đôi thông
})

test('higher same-type bomb wins; đôi heo is NOT cut by tứ quý', () => {
  assert.equal(beats(combo('6S 6C 6D 6H'), combo('5S 5C 5D 5H')), true) // tứ quý vs tứ quý
  assert.equal(beats(combo('5S 5C 5D 5H'), combo('6S 6C 6D 6H')), false)
  assert.equal(beats(combo('5S 5C 5D 5H'), combo('2S 2C')), false)      // đôi heo immune to tứ quý
})

// ── legalMoves ────────────────────────────────────────────────────────────────────
test('legalMoves vs a single returns only higher singles', () => {
  const hand = parseHand('3S 4S 5S 6S 7S')
  const moves = legalMoves(hand, combo('5H'))
  assert.ok(moves.length > 0)
  for (const m of moves) {
    assert.equal(m.type, 'single')
    assert.ok(beats(m, combo('5H')))
  }
  // 6S and 7S qualify; 3S/4S/5S do not
  const ranks = moves.map(m => m.high.rank).sort()
  assert.deepEqual(ranks, [3, 4]) // rank indices for 6 and 7
})

test('legalMoves leading returns only valid combos and includes the full straight', () => {
  const hand = parseHand('3S 4S 5S 6S 7S')
  const moves = legalMoves(hand, null)
  for (const m of moves) {
    // every returned combo must independently re-parse to the same type
    assert.equal(parseCombo(m.cards)?.type, m.type)
  }
  assert.ok(moves.some(m => m.type === 'straight' && m.count === 5))
})

// ── isRoundOneOpening ─────────────────────────────────────────────────────────────
test('round-1 opening must contain 3♠', () => {
  assert.equal(isRoundOneOpening(combo('3S')), true)
  assert.equal(isRoundOneOpening(combo('3S 4S 5S')), true)
  assert.equal(isRoundOneOpening(combo('3C')), false)
  assert.equal(isRoundOneOpening(combo('4S 5S 6S')), false)
})

// ── Tới trắng (instant win) ───────────────────────────────────────────────────────
test('checkInstantWin detects each of the six bộ on crafted hands', () => {
  assert.equal(checkInstantWin(parseHand('3H 4H 5H 6H 7H 8H 9H 10H JH QH KH AH 2H'))?.type, 'dongHoa')
  assert.equal(checkInstantWin(parseHand('2S 2C 2D 2H 3S 3C 4S 4C 5S 5C 6S 6C 7S'))?.type, 'tuQuyHeo')
  assert.equal(checkInstantWin(parseHand('3S 4S 5S 6S 7S 8S 9S 10S JS QS KS AS 3C'))?.type, 'sanhRong')
  assert.equal(checkInstantWin(parseHand('3S 3C 4S 4C 5S 5C 6S 6C 7S 7C 9S 10S JS'))?.type, 'namDoiThong')
  assert.equal(checkInstantWin(parseHand('3S 3C 4S 4C 6S 6C 7S 7C 9S 9C 10S 10C JS'))?.type, 'sauDoi')
  assert.equal(checkInstantWin(parseHand('3S 3C 3D 4S 4C 4D 5S 5C 5D 6S 7S 8S 9S'))?.type, 'baSamCo')
})

test('non-qualifying hand returns null', () => {
  assert.equal(checkInstantWin(parseHand('3S 3C 4S 5S 6S 8C 9D 10H JS QC KD 7H 7C')), null)
})

test('instantWinOrder picks the highest when several match (and is configurable)', () => {
  const flushDragon = parseHand('3H 4H 5H 6H 7H 8H 9H 10H JH QH KH AH 2H')
  // default order: dongHoa outranks sanhRong/tuQuyHeo
  assert.equal(checkInstantWin(flushDragon)?.type, 'dongHoa')
  // override the order so sanhRong is checked first
  assert.equal(
    checkInstantWin(flushDragon, { instantWinOrder: ['sanhRong', 'dongHoa', 'tuQuyHeo', 'namDoiThong', 'sauDoi', 'baSamCo'] })?.type,
    'sanhRong',
  )
})

// ── Settlement (đếm lá / thối / cóng / đền) ───────────────────────────────────────
function st(partial: Partial<SettlementState>): SettlementState {
  return {
    seats: [0, 1],
    winner: 0,
    hands: { 0: [], 1: [] },
    playedCount: { 0: 5, 1: 5 },
    cutEvents: [],
    ...partial,
  }
}

test('đếm-lá base: a loser with N cards pays N × basePerCard to the Nhất', () => {
  const d = settleRound(st({ hands: { 0: [], 1: parseHand('4S 5S 6S') } }))
  assert.equal(d[1], -3)
  assert.equal(d[0], 3)
  assert.equal(sum(d), 0)
})

test('thối-heo doubles a loser holding a 2', () => {
  const d = settleRound(st({ hands: { 0: [], 1: parseHand('4S 5S 6S 7S 2D') } }))
  assert.equal(d[1], -(5 * RULES.thoiHeoMultiplier)) // 5 cards × base, ×2 for the heo
  assert.equal(sum(d), 0)
})

test('thối-bom adds the flat penalty per held bộ (tứ quý)', () => {
  // 5 cards (base 5) + one tứ quý bộ (+5), no 2 held
  const d = settleRound(st({ hands: { 0: [], 1: parseHand('5S 5C 5D 5H 3S') } }))
  assert.equal(d[1], -(5 + RULES.thoiBomPenalty))
  assert.equal(sum(d), 0)
})

test('cóng counts all 13 × congMultiplier; stacks with thối-heo when a 2 is held', () => {
  // played 0 → cóng, 13 cards, no 2
  const congNoHeo = settleRound(st({
    hands: { 0: [], 1: parseHand('3S 4S 5S 6S 7S 8S 9S 10S JS QS KS AS 3C') },
    playedCount: { 0: 5, 1: 0 },
  }))
  assert.equal(congNoHeo[1], -(13 * RULES.basePerCard * RULES.congMultiplier))

  // played 0 → cóng, 13 cards including a 2 → cóng ×2 then thối-heo ×2
  const congHeo = settleRound(st({
    hands: { 0: [], 1: parseHand('2S 3S 4S 5S 6S 7S 8S 9S 10S JS QS KS AC') },
    playedCount: { 0: 5, 1: 0 },
  }))
  assert.equal(congHeo[1], -(13 * RULES.basePerCard * RULES.congMultiplier * RULES.thoiHeoMultiplier))
  assert.equal(sum(congHeo), 0)
})

test('đền moves denHeo / denBom from victim to cutter', () => {
  const d = settleRound(st({
    seats: [0, 1, 2],
    hands: { 0: [], 1: parseHand('4S'), 2: parseHand('5S') },
    playedCount: { 0: 5, 1: 5, 2: 5 },
    cutEvents: [
      { cutVictim: 1, cutter: 2, kind: 'heo' },
      { cutVictim: 2, cutter: 0, kind: 'bom' },
    ],
  }))
  // base: seat1 pays 1, seat2 pays 1 → winner +2
  // đền: seat1 −5 → seat2; seat2 −10 → seat0
  assert.equal(d[0], 2 + RULES.denBom)
  assert.equal(d[1], -1 - RULES.denHeo)
  assert.equal(d[2], -1 + RULES.denHeo - RULES.denBom)
  assert.equal(sum(d), 0)
})

test('tới trắng: each other player pays the instant-winner the flat payout', () => {
  const d = settleRound(st({
    seats: [0, 1, 2, 3],
    winner: 1,
    instantWin: { seat: 1, type: 'dongHoa' },
    hands: { 0: parseHand('3S'), 1: [], 2: parseHand('4S'), 3: parseHand('5S') },
    playedCount: { 0: 0, 1: 13, 2: 0, 3: 0 },
  }))
  assert.equal(d[1], 3 * RULES.toiTrangPayout)
  assert.equal(d[0], -RULES.toiTrangPayout)
  assert.equal(d[2], -RULES.toiTrangPayout)
  assert.equal(d[3], -RULES.toiTrangPayout)
  assert.equal(sum(d), 0)
})

test('full 4-player settlement combining everything sums to zero', () => {
  const d = settleRound({
    seats: [0, 1, 2, 3],
    winner: 0,
    hands: {
      0: [],
      1: parseHand('4S 5S 2D'),                 // 3 cards incl a heo → thối-heo
      2: parseHand('7S 7C 7D 7H 8S'),           // tứ quý bộ → thối-bom
      3: parseHand('3S 4S 5S 6S 7S 8S 9S 10S JS QS KS AS 3C'), // cóng (played 0)
    },
    playedCount: { 0: 9, 1: 4, 2: 6, 3: 0 },
    cutEvents: [{ cutVictim: 2, cutter: 1, kind: 'bom' }],
  })
  assert.equal(sum(d), 0)
  assert.ok(d[0] > 0)            // the Nhất nets positive
  assert.ok(d[1] < 0 || d[1] !== 0)
})

// ── sanity: parseCard round-trips ─────────────────────────────────────────────────
test('parseCard accepts 10 and T equivalently', () => {
  assert.deepEqual<Card>(parseCard('10H'), parseCard('TH'))
})

test('enumerateCombos never emits an illegal combo', () => {
  const hand = parseHand('3S 3C 3D 4S 4C 5S 6S 7S 9H 9D 2S 2C KH')
  for (const m of enumerateCombos(hand)) {
    assert.equal(parseCombo(m.cards)?.type, m.type)
  }
})

// ── PATCH: host rule-config layer ─────────────────────────────────────────────────
test('resolveRules(undefined) and resolveRules({}) deep-equal DEFAULT_RULES', () => {
  assert.deepEqual(resolveRules(undefined), DEFAULT_RULES)
  assert.deepEqual(resolveRules({}), DEFAULT_RULES)
})

test('resolveRules overrides only the given keys; unknown keys ignored; no mutation', () => {
  const r = resolveRules({ denHeo: 10, toiTrangEnabled: false })
  assert.deepEqual(r, { ...DEFAULT_RULES, denHeo: 10, toiTrangEnabled: false })
  // everything not named stays at default
  assert.equal(r.denBom, DEFAULT_RULES.denBom)
  assert.deepEqual(r.bombs, DEFAULT_RULES.bombs)
  // unknown keys are dropped entirely
  assert.deepEqual(resolveRules({ foo: 1, nope: 'x' } as Record<string, unknown>), DEFAULT_RULES)
  // DEFAULT_RULES is never mutated by a resolve
  resolveRules({ denHeo: 999 })
  assert.equal(DEFAULT_RULES.denHeo, 5)
})

test('host allow-list: pickHostOverride keeps only allow-listed keys', () => {
  const picked = pickHostOverride({ denHeo: 9, instantWinOrder: ['dongHoa'], bombs: {} as never, foo: 1 } as Record<string, unknown>)
  assert.deepEqual(picked, { denHeo: 9 })
  // bombs / instantWinOrder are engine-level, not host-editable
  assert.ok(!HOST_CONFIGURABLE_KEYS.includes('bombs' as never))
  assert.ok(!HOST_CONFIGURABLE_KEYS.includes('instantWinOrder' as never))
})

test('flag off — toiTrangEnabled false → checkInstantWin returns null on a qualifying hand', () => {
  const dragon = parseHand('3H 4H 5H 6H 7H 8H 9H 10H JH QH KH AH 2H')
  assert.equal(checkInstantWin(dragon)?.type, 'dongHoa')           // on by default
  assert.equal(checkInstantWin(dragon, { toiTrangEnabled: false }), null)
})

test('flag off — congEnabled false → a 0-card player gets no cóng multiplier', () => {
  const state = st({
    hands: { 0: [], 1: parseHand('3S 4S 5S 6S 7S 8S 9S 10S JS QS KS AS 3C') },
    playedCount: { 0: 5, 1: 0 },
  })
  assert.equal(settleRound(state)[1], -(13 * RULES.basePerCard * RULES.congMultiplier)) // on
  assert.equal(settleRound(state, { congEnabled: false })[1], -(13 * RULES.basePerCard)) // off
})

test('flag off — thoiHeoEnabled false → no doubling for a 2-holder', () => {
  const state = st({ hands: { 0: [], 1: parseHand('4S 5S 6S 7S 2D') } })
  assert.equal(settleRound(state)[1], -(5 * RULES.thoiHeoMultiplier))    // on
  assert.equal(settleRound(state, { thoiHeoEnabled: false })[1], -5)     // off
})

test('flag off — thoiBomEnabled false → no held-bomb penalty', () => {
  const state = st({ hands: { 0: [], 1: parseHand('5S 5C 5D 5H 3S') } })
  assert.equal(settleRound(state)[1], -(5 + RULES.thoiBomPenalty))       // on
  assert.equal(settleRound(state, { thoiBomEnabled: false })[1], -5)     // off
})

test('flag off — denEnabled false → a chặt event moves 0', () => {
  const state = st({
    seats: [0, 1, 2],
    hands: { 0: [], 1: parseHand('4S'), 2: parseHand('5S') },
    playedCount: { 0: 5, 1: 5, 2: 5 },
    cutEvents: [{ cutVictim: 1, cutter: 2, kind: 'heo' }],
  })
  const d = settleRound(state, { denEnabled: false })
  assert.equal(d[0], 2)   // base only: each loser pays 1
  assert.equal(d[1], -1)  // no đền −5
  assert.equal(d[2], -1)  // no đền +5
  assert.equal(Object.values(d).reduce((a, b) => a + b, 0), 0)
})
