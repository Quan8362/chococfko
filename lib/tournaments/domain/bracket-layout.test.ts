import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mirroredColumns, bracketEdges, feederMap, bracketSize, bracketColumnSizing } from './bracket-layout.ts'
import type { KnockoutRoundView, KnockoutMatchView } from '../admin/types.ts'

// Minimal match factory — the layout only reads id / matchNumber / matches shape.
function m(id: string, matchNumber: number): KnockoutMatchView {
  return {
    id,
    roundNumber: 0,
    matchNumber,
    roundLabel: '',
    competitorAId: null,
    competitorBId: null,
    status: 'pending',
    version: 0,
    winnerId: null,
    games: [],
    gamesWonA: 0,
    gamesWonB: 0,
    isFinal: false,
    isThirdPlace: false,
  }
}

// An 8-slot bracket: round 0 (4 QF), round 1 (2 SF), round 2 (final).
function bracket8(): KnockoutRoundView[] {
  return [
    { roundNumber: 0, label: 'quarterfinal', matches: [m('q1', 1), m('q2', 2), m('q3', 3), m('q4', 4)] },
    { roundNumber: 1, label: 'semifinal', matches: [m('s1', 5), m('s2', 6)] },
    { roundNumber: 2, label: 'final', matches: [m('f1', 7)] },
  ]
}

test('mirroredColumns puts the final in the centre and splits every earlier round L/R', () => {
  const cols = mirroredColumns(bracket8())
  // 2 split rounds × 2 sides + 1 centre = 5 columns.
  assert.equal(cols.length, 5)
  const center = cols.find((c) => c.side === 'center')!
  assert.equal(center.matches.length, 1)
  assert.equal(center.matches[0].id, 'f1')
  // Column order is left→centre→right, right in reverse round order (r0 on the far right).
  assert.deepEqual(cols.map((c) => c.key), ['L0', 'L1', 'C', 'R1', 'R0'])
  // First-round split: first two QF left, last two right.
  assert.deepEqual(cols[0].matches.map((x) => x.id), ['q1', 'q2'])
  assert.deepEqual(cols[4].matches.map((x) => x.id), ['q3', 'q4'])
})

test('a single-round (2-competitor) bracket is just the centre final', () => {
  const cols = mirroredColumns([{ roundNumber: 0, label: 'final', matches: [m('f', 1)] }])
  assert.equal(cols.length, 1)
  assert.equal(cols[0].side, 'center')
})

test('bracketEdges wires every match to the two feeders that halve into it', () => {
  const edges = bracketEdges(bracket8())
  // 2 SF each fed by 2 QF, final fed by 2 SF = 6 edges.
  assert.equal(edges.length, 6)
  assert.ok(edges.some((e) => e.from === 'q1' && e.to === 's1'))
  assert.ok(edges.some((e) => e.from === 'q2' && e.to === 's1'))
  assert.ok(edges.some((e) => e.from === 'q3' && e.to === 's2'))
  assert.ok(edges.some((e) => e.from === 's1' && e.to === 'f1'))
  assert.ok(edges.some((e) => e.from === 's2' && e.to === 'f1'))
})

test('feederMap labels each slot with the feeding match number', () => {
  const map = feederMap(bracket8())
  assert.deepEqual(map.get('s1'), { a: 1, b: 2 })
  assert.deepEqual(map.get('s2'), { a: 3, b: 4 })
  assert.deepEqual(map.get('f1'), { a: 5, b: 6 })
  assert.equal(map.get('q1'), undefined) // round 0 has no feeders
})

test('bracketSize infers the nominal slot count from round 0', () => {
  assert.equal(bracketSize(bracket8()), 8)
  assert.equal(bracketSize([]), 0)
})

test('empty rounds yield no columns', () => {
  assert.deepEqual(mirroredColumns([]), [])
})

// A 16-slot bracket with a round-of-16: round 0 (8 R16), round 1 (4 QF), round 2 (2 SF), round 3 (final).
function bracket16(): KnockoutRoundView[] {
  return [
    { roundNumber: 0, label: 'round_of_16', matches: [m('a1', 1), m('a2', 2), m('a3', 3), m('a4', 4), m('a5', 5), m('a6', 6), m('a7', 7), m('a8', 8)] },
    { roundNumber: 1, label: 'quarterfinal', matches: [m('q1', 9), m('q2', 10), m('q3', 11), m('q4', 12)] },
    { roundNumber: 2, label: 'semifinal', matches: [m('s1', 13), m('s2', 14)] },
    { roundNumber: 3, label: 'final', matches: [m('f1', 15)] },
  ]
}

test('a round-of-16 bracket mirrors into 7 columns ([R16 QF SF]·2 + final)', () => {
  const cols = mirroredColumns(bracket16())
  // 3 split rounds × 2 sides + 1 centre final = 7 columns. This is the shape the adaptive card width
  // must fit inside the reading shell — the case that clipped the outer columns before the fix.
  assert.equal(cols.length, 7)
  assert.deepEqual(cols.map((c) => c.key), ['L0', 'L1', 'L2', 'C', 'R2', 'R1', 'R0'])
  assert.equal(cols.filter((c) => c.side === 'center').length, 1)
  assert.equal(cols[3].side, 'center')
  // Outer columns (the round-of-16) carry the most matches per side (4 each).
  assert.equal(cols[0].matches.length, 4)
  assert.equal(cols[6].matches.length, 4)
})

test('bracketColumnSizing tightens the card floor/cap/gap as the column count grows', () => {
  const wide = bracketColumnSizing(3) // final + one split round
  const medium = bracketColumnSizing(5) // 8-slot bracket
  const compact = bracketColumnSizing(7) // round-of-16

  // Monotonic: more columns → never wider, and strictly tighter at the 7-column depth.
  assert.ok(compact.minWidth < medium.minWidth && medium.minWidth <= wide.minWidth, 'floor tightens with depth')
  assert.ok(compact.maxWidth < medium.maxWidth && medium.maxWidth <= wide.maxWidth, 'cap tightens with depth')
  assert.ok(compact.gap <= medium.gap && medium.gap <= wide.gap, 'gap tightens with depth')

  // Only the deep board asks the card for compact padding; roomy boards keep their normal padding.
  assert.equal(wide.compact, false)
  assert.equal(medium.compact, false)
  assert.equal(compact.compact, true)
})

test('a 7-column round-of-16 board fits the ~1216px desktop reading shell', () => {
  // The public detail uses TournamentShell size="wide" (max-w-1280) minus lg:px-8 padding → ~1216px of
  // content. Seven columns at the compact FLOOR plus six gaps must not exceed that width, otherwise the
  // row overflows and (previously) clipped the outer columns. This guards the core containment claim.
  const s = bracketColumnSizing(7)
  const SHELL_CONTENT = 1216
  const minRowWidth = 7 * s.minWidth + 6 * s.gap
  assert.ok(minRowWidth <= SHELL_CONTENT, `7-column floor (${minRowWidth}px) must fit the ${SHELL_CONTENT}px shell`)
})

test('a 5-column and 3-column board also fit the desktop reading shell', () => {
  const SHELL_CONTENT = 1216
  for (const n of [3, 5]) {
    const s = bracketColumnSizing(n)
    const minRowWidth = n * s.minWidth + (n - 1) * s.gap
    assert.ok(minRowWidth <= SHELL_CONTENT, `${n}-column floor (${minRowWidth}px) must fit the shell`)
  }
})
