import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  makePRNG,
  seededShuffle,
  drawInitialSeating,
  planBalancing,
  tableSize,
  shouldFormFinalTable,
  formFinalTable,
  isHeadsUp,
  isTournamentOver,
  type TableState,
} from './balancing.ts'

function ids(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `e${i + 1}`)
}

function applyMoves(tables: TableState[], plan: ReturnType<typeof planBalancing>): TableState[] {
  const work = tables.map((t) => ({ tableId: t.tableId, seats: [...t.seats] as (string | null)[] }))
  const byId = new Map(work.map((t) => [t.tableId, t]))
  for (const m of plan.moves) {
    const from = byId.get(m.fromTableId)!
    const to = byId.get(m.toTableId)!
    const idx = from.seats.indexOf(m.entryId)
    from.seats[idx] = null
    to.seats[m.toSeatIndex] = m.entryId
  }
  const kept = plan.breakTableId ? work.filter((t) => t.tableId !== plan.breakTableId) : work
  return kept.map((t) => ({ tableId: t.tableId, seats: t.seats }))
}

test('makePRNG is deterministic; seededShuffle is stable per seed', () => {
  const a = Array.from({ length: 5 }, makePRNG('x'))
  const b = Array.from({ length: 5 }, makePRNG('x'))
  assert.deepEqual(a, b)
  assert.deepEqual(seededShuffle(ids(10), makePRNG('s')), seededShuffle(ids(10), makePRNG('s')))
  assert.notDeepEqual(seededShuffle(ids(10), makePRNG('s1')), seededShuffle(ids(10), makePRNG('s2')))
})

test('TNMT-BAL-010 initial draw: deterministic, sizes within 1, everyone seated once', () => {
  const seating1 = drawInitialSeating(ids(17), 6, 'seed-A')
  const seating2 = drawInitialSeating(ids(17), 6, 'seed-A')
  assert.deepEqual(seating1, seating2) // replayable
  assert.equal(seating1.length, 3) // ceil(17/6)
  const sizes = seating1.map(tableSize)
  assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1)
  const seated = seating1.flatMap((t) => t.seats.filter(Boolean))
  assert.equal(seated.length, 17)
  assert.equal(new Set(seated).size, 17)
})

test('TNMT-BAL-024 equalise brings max-min to <= 1 without breaking a table', () => {
  // Two tables: 6 and 2 → move 2 to balance to 4/4. seatsPerTable 6.
  const tables: TableState[] = [
    { tableId: 't1', seats: ['a', 'b', 'c', 'd', 'e', 'f'] },
    { tableId: 't2', seats: ['g', 'h', null, null, null, null] },
  ]
  const plan = planBalancing(tables, 6)
  assert.equal(plan.breakTableId, null)
  const after = applyMoves(tables, plan)
  const sizes = after.map(tableSize)
  assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1)
  assert.equal(sizes.reduce((a, b) => a + b, 0), 8) // conserved
})

test('TNMT-BAL-023 break the shortest table when the field fits on fewer tables', () => {
  // Three tables 3/3/2 (8 players), seats 6 → fits on 2 tables → break the shortest (t3, size 2).
  const tables: TableState[] = [
    { tableId: 't1', seats: ['a', 'b', 'c', null, null, null] },
    { tableId: 't2', seats: ['d', 'e', 'f', null, null, null] },
    { tableId: 't3', seats: ['g', 'h', null, null, null, null] },
  ]
  const plan = planBalancing(tables, 6)
  assert.equal(plan.breakTableId, 't3')
  const after = applyMoves(tables, plan)
  assert.equal(after.length, 2)
  const seated = after.flatMap((t) => t.seats.filter(Boolean))
  assert.equal(seated.length, 8) // all players preserved
  assert.equal(new Set(seated).size, 8)
})

test('balancing converges from random imbalanced configs (property)', () => {
  const rng = makePRNG('bal-fuzz')
  for (let iter = 0; iter < 200; iter++) {
    const seats = 6
    const nTables = 2 + Math.floor(rng() * 3)
    let counter = 0
    let tables: TableState[] = Array.from({ length: nTables }, (_, ti) => {
      const size = 1 + Math.floor(rng() * seats)
      const arr = Array<string | null>(seats).fill(null)
      for (let s = 0; s < size; s++) arr[s] = `p${counter++}`
      return { tableId: `t${ti + 1}`, seats: arr }
    })
    const totalBefore = tables.reduce((a, t) => a + tableSize(t), 0)
    // Run balancing repeatedly until stable (mimics per-boundary application).
    for (let step = 0; step < 20; step++) {
      const plan = planBalancing(tables, seats)
      if (!plan.moves.length && !plan.breakTableId) break
      tables = applyMoves(tables, plan)
    }
    const sizes = tables.map(tableSize)
    const totalAfter = sizes.reduce((a, b) => a + b, 0)
    assert.equal(totalAfter, totalBefore) // chip/seat conservation of players
    if (tables.length > 1) assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1)
  }
})

test('TNMT-BAL-031/032/033 final table + heads-up + over', () => {
  assert.equal(shouldFormFinalTable(7, 6), false)
  assert.equal(shouldFormFinalTable(6, 6), true)
  assert.equal(shouldFormFinalTable(1, 6), false)
  const ft1 = formFinalTable(ids(6), 6, 'seed-Z')
  const ft2 = formFinalTable(ids(6), 6, 'seed-Z')
  assert.deepEqual(ft1, ft2) // auditable redraw
  assert.equal(ft1.tableId, 'final')
  assert.equal(ft1.seats.filter(Boolean).length, 6)
  assert.ok(isHeadsUp(2))
  assert.equal(isHeadsUp(3), false)
  assert.ok(isTournamentOver(1))
  assert.equal(isTournamentOver(2), false)
})
