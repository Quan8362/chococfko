import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mirroredColumns, bracketEdges, feederMap, bracketSize } from './bracket-layout.ts'
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
