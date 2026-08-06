// Run with: node --test lib/tournaments/domain/first-round-pairing.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  pairingBracketSize,
  seedNumberForSlot,
  slotForSeedPosition,
  buildArrangement,
  seatedTokenOrder,
  arrangementToSlotIndexByToken,
  arrangementMatches,
  validatePairingArrangement,
  type PairingArrangement,
} from './first-round-pairing.ts'
import { buildKnockoutPreviewFromSeats, buildKnockoutBracketFromSeeds, buildKnockoutBracketFromSeats } from './knockout-seed.ts'

const tokens = (n: number): string[] => Array.from({ length: n }, (_, i) => `t${i + 1}`)

// Build an arrangement from an ordered "seat position → token" list (dense canonical placement).
function arr(size: number, seatList: (string | null)[], pool: string[] = []): PairingArrangement {
  const seats = new Array(size).fill(null)
  seatList.forEach((v, i) => (seats[i] = v))
  return { size, seats, pool }
}

test('pairingBracketSize applies the unchanged next-power-of-two formula to the FULL pool', () => {
  assert.equal(pairingBracketSize(8), 8)
  assert.equal(pairingBracketSize(5), 8)
  assert.equal(pairingBracketSize(6), 8)
  assert.equal(pairingBracketSize(4), 4)
  assert.equal(pairingBracketSize(3), 4)
})

test('seat ⇄ (match, side) mapping is invertible for a bracket size', () => {
  const size = 8
  for (let m = 0; m < size / 2; m++) {
    for (const side of ['a', 'b'] as const) {
      const seat = seedNumberForSlot(size, { matchIndex: m, side }) - 1
      const back = slotForSeedPosition(size, seat)
      assert.deepEqual(back, { matchIndex: m, side })
    }
  }
})

test('canonical 8-team arrangement produces the standard first-round pairings', () => {
  // seedOrder(8) = [1,8,4,5,2,7,3,6] → matches (1,8)(4,5)(2,7)(3,6)
  const a = buildArrangement(tokens(8), seatByPos(tokens(8)))
  const matches = arrangementMatches(a)
  assert.deepEqual(matches[0], { a: 't1', b: 't8' })
  assert.deepEqual(matches[1], { a: 't4', b: 't5' })
  assert.deepEqual(matches[2], { a: 't2', b: 't7' })
  assert.deepEqual(matches[3], { a: 't3', b: 't6' })
})

// token i (0-based) → seat position i (canonical dense placement).
function seatByPos(ids: string[]): Map<number, string> {
  const m = new Map<number, string>()
  ids.forEach((id, i) => m.set(i, id))
  return m
}

test('round-trip: arrangement → slot-index map → arrangement is deterministic and lossless', () => {
  // A deliberately non-canonical layout (BYE placed in match 1, not the bottom seeds).
  const size = 8
  const seats: (string | null)[] = [null, 't1', 't2', 't3', 't4', 't5', null, null]
  const original: PairingArrangement = { size, seats, pool: [] }
  // Persist: token → seat position (what the DB slot rows store).
  const tokenToPos = arrangementToSlotIndexByToken(original)
  // Reload: seat position → token (what buildArrangement consumes).
  const posToToken = new Map<number, string>()
  tokenToPos.forEach((pos, token) => posToToken.set(pos, token))
  const rebuilt = buildArrangement(tokens(5), posToToken)
  assert.deepEqual([...rebuilt.seats], seats)
  assert.equal(rebuilt.pool.length, 0)
})

test('buildArrangement drops out-of-range and stale placements back into the pool', () => {
  const all = tokens(4) // size 4
  const map = new Map<number, string>([
    [0, 't1'],
    [9, 't2'], // out of range → pool
    [1, 'ghost'], // not a valid token → ignored
    [2, 't3'],
  ])
  const a = buildArrangement(all, map)
  assert.equal(a.size, 4)
  assert.equal(a.seats[0], 't1')
  assert.equal(a.seats[2], 't3')
  assert.deepEqual([...a.pool].sort(), ['t2', 't4'])
})

test('5 tokens / bracket 8 → exactly 3 BYEs at the ORGANISER-CHOSEN slots', () => {
  // Organiser leaves match-2 as the only real match; matches 1/3/4 each carry one team → 3 BYEs.
  // seedOrder(8): match indices → seat pairs. Fill the two seats of match index 1 + one seat each of 0/2/3.
  const size = 8
  const seats: (string | null)[] = new Array(size).fill(null)
  const put = (m: number, side: 'a' | 'b', id: string) => (seats[seedNumberForSlot(size, { matchIndex: m, side }) - 1] = id)
  put(1, 'a', 't1'); put(1, 'b', 't2') // real match
  put(0, 'a', 't3'); put(2, 'a', 't4'); put(3, 'a', 't5') // three byes
  const a: PairingArrangement = { size, seats, pool: [] }
  const v = validatePairingArrangement(a)
  assert.equal(v.seatedCount, 5)
  assert.equal(v.byes, 3)
  assert.equal(v.canApply, true)
  const matches = arrangementMatches(a)
  const byeMatches = matches.filter((mm) => (mm.a === null) !== (mm.b === null)).length
  assert.equal(byeMatches, 3)
})

test('6 tokens / bracket 8 → exactly 2 BYEs', () => {
  const size = 8
  const seats: (string | null)[] = new Array(size).fill(null)
  const put = (m: number, side: 'a' | 'b', id: string) => (seats[seedNumberForSlot(size, { matchIndex: m, side }) - 1] = id)
  put(0, 'a', 't1'); put(0, 'b', 't2')
  put(1, 'a', 't3'); put(1, 'b', 't4')
  put(2, 'a', 't5'); put(3, 'a', 't6')
  const v = validatePairingArrangement({ size, seats, pool: [] })
  assert.equal(v.byes, 2)
  assert.equal(v.canApply, true)
})

test('a both-slots-empty match blocks save & apply once the pool is drained', () => {
  const size = 8
  const seats: (string | null)[] = new Array(size).fill(null)
  const put = (m: number, side: 'a' | 'b', id: string) => (seats[seedNumberForSlot(size, { matchIndex: m, side }) - 1] = id)
  // 5 tokens all placed, but clustered so match index 3 is left completely empty.
  put(0, 'a', 't1'); put(0, 'b', 't2')
  put(1, 'a', 't3'); put(1, 'b', 't4')
  put(2, 'a', 't5')
  const v = validatePairingArrangement({ size, seats, pool: [] })
  assert.equal(v.canSave, false)
  assert.equal(v.canApply, false)
  assert.ok(v.issues.some((i) => i.code === 'both_slots_empty'))
})

test('an empty match while tokens remain in the pool is a saveable draft (not yet a two-BYE match)', () => {
  const a = arr(8, ['t1', 't2'], ['t3', 't4', 't5']) // matches 2/3/4 empty, but 3 tokens still pooled
  const v = validatePairingArrangement(a)
  assert.equal(v.canSave, true) // draft is fine
  assert.equal(v.canApply, false) // pool not empty
  assert.ok(v.issues.some((i) => i.code === 'unassigned_remaining'))
})

test('fewer than two seated tokens cannot be applied', () => {
  const v = validatePairingArrangement(arr(2, ['t1'], []))
  assert.equal(v.canApply, false)
  assert.ok(v.issues.some((i) => i.code === 'not_enough_competitors'))
})

test('seatedTokenOrder returns placed tokens in seat-position order, dropping BYEs', () => {
  const a = arr(8, ['t1', null, 't2', null, 't3'])
  assert.deepEqual(seatedTokenOrder(a), ['t1', 't2', 't3'])
})

test('positional engine on a canonical seat layout equals the dense generator (regression)', () => {
  const ids = tokens(6)
  const seatsCanonical: (string | null)[] = [...ids, null, null] // dense: byes at the bottom seeds
  const dense = buildKnockoutBracketFromSeeds(ids, false)
  const positional = buildKnockoutBracketFromSeats(seatsCanonical, false)
  assert.deepEqual(positional, dense)
})

test('positional engine honours a BYE placed at a NON-standard slot (no two byes meet)', () => {
  const size = 8
  const seats: (string | null)[] = new Array(size).fill(null)
  const put = (m: number, side: 'a' | 'b', id: string) => (seats[seedNumberForSlot(size, { matchIndex: m, side }) - 1] = id)
  // Put the real match at index 0 and BYEs at matches 1/2/3 (the opposite of the dense default).
  put(0, 'a', 'c1'); put(0, 'b', 'c2')
  put(1, 'a', 'c3'); put(2, 'a', 'c4'); put(3, 'a', 'c5')
  const bracket = buildKnockoutBracketFromSeats(seats, false)
  const first = bracket.rounds[0]
  assert.equal(bracket.byes, 3)
  // Match index 0 is the only non-BYE first-round match.
  assert.equal(first[0].isBye, false)
  assert.equal(first[1].isBye, true)
  assert.equal(first[2].isBye, true)
  assert.equal(first[3].isBye, true)
  // No first-round match has BOTH slots as a bye.
  for (const m of first) assert.ok(!(m.slotA.from === 'bye' && m.slotB.from === 'bye'))
})

test('inline arrangement matches the full-bracket preview first round exactly', () => {
  const size = 8
  const seats: (string | null)[] = [null, 't1', 't2', 't3', 't4', 't5', null, null]
  const inline = arrangementMatches({ size, seats, pool: [] })
  const preview = buildKnockoutPreviewFromSeats(seats, false)
  const first = preview.rounds[0]
  inline.forEach((mm, i) => {
    const pm = first.matches[i]
    const slotToken = (s: typeof pm.slotA) => (s.kind === 'competitor' ? s.competitorId : null)
    assert.equal(slotToken(pm.slotA), mm.a)
    assert.equal(slotToken(pm.slotB), mm.b)
  })
})
