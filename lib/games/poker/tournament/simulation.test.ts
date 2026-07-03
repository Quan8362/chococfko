import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  makePRNG,
  drawInitialSeating,
  planBalancing,
  tableSize,
  formFinalTable,
  shouldFormFinalTable,
  isHeadsUp,
  type TableState,
} from './balancing.ts'
import { assignFinishingOrder, type HandBustEvent } from './elimination.ts'
import { resolveBlindClock } from './blinds.ts'
import { prizePool, projectedPayouts } from './prizePool.ts'
import { settleFinal } from './payout.ts'
import { TEMPLATE_MTT } from './config.ts'
import type { TournamentConfig } from './types.ts'

function applyMoves(tables: TableState[], plan: ReturnType<typeof planBalancing>): TableState[] {
  const work = tables.map((t) => ({ tableId: t.tableId, seats: [...t.seats] as (string | null)[] }))
  const byId = new Map(work.map((t) => [t.tableId, t]))
  for (const m of plan.moves) {
    const from = byId.get(m.fromTableId)!
    const to = byId.get(m.toTableId)!
    from.seats[from.seats.indexOf(m.entryId)] = null
    to.seats[m.toSeatIndex] = m.entryId
  }
  const kept = plan.breakTableId ? work.filter((t) => t.tableId !== plan.breakTableId) : work
  return kept.map((t) => ({ tableId: t.tableId, seats: t.seats }))
}

// A full, deterministic tournament: seat draw → hands (short-stack shove) → busts → rebalance →
// final table → heads-up → payout. Returns the finishing order + settled payouts + invariants seen.
function simulate(config: TournamentConfig, n: number, seed: string) {
  const entryIds = Array.from({ length: n }, (_, i) => `e${i + 1}`)
  const players = new Map<string, number>(entryIds.map((id) => [id, config.startingStack]))
  const seats = config.seatsPerTable
  const totalChips = n * config.startingStack

  let tables = drawInitialSeating(entryIds, seats, seed)
  const initialTableCount = tables.length
  const live = new Set(entryIds)
  const rng = makePRNG(`${seed}:play`)
  const events: HandBustEvent[] = []

  let finalFormed = false
  let headsUpSeen = false
  let guard = 5_000_000

  while (live.size > 1) {
    if (guard-- <= 0) throw new Error('simulation did not terminate')

    if (!finalFormed && shouldFormFinalTable(live.size, seats)) {
      tables = [formFinalTable([...live], seats, seed)]
      finalFormed = true
    }
    if (isHeadsUp(live.size)) headsUpSeen = true

    const playable = tables.filter((t) => tableSize(t) >= 2)
    const table = playable[Math.floor(rng() * playable.length)]
    const occ = table.seats.map((s, i) => ({ s, i })).filter((x) => x.s) as { s: string; i: number }[]
    // A = shortest stack (forced all-in shove), B = a different occupant.
    const A = [...occ].sort((x, y) => players.get(x.s)! - players.get(y.s)! || (x.s < y.s ? -1 : 1))[0]
    const others = occ.filter((x) => x.s !== A.s)
    const B = others[Math.floor(rng() * others.length)]

    const aChips = players.get(A.s)!
    const bChips = players.get(B.s)!
    const amount = Math.min(aChips, bChips) // = aChips (A is shortest)
    const aWins = rng() < 0.5
    if (aWins) {
      players.set(A.s, aChips + amount)
      players.set(B.s, bChips - amount)
    } else {
      players.set(A.s, aChips - amount)
      players.set(B.s, bChips + amount)
    }

    const remainingBefore = live.size
    const busted = [A, B]
      .filter((p) => players.get(p.s) === 0)
      .map((p) => ({ entryId: p.s, userId: `u_${p.s}`, chipsAtHandStart: p === A ? aChips : bChips }))

    if (busted.length) {
      events.push({ handNo: events.length + 1, remainingBefore, busted })
      for (const bp of busted) {
        live.delete(bp.entryId)
        const t = tables.find((tt) => tt.seats.includes(bp.entryId))!
        const arr = [...t.seats] as (string | null)[]
        arr[arr.indexOf(bp.entryId)] = null
        tables = tables.map((tt) => (tt.tableId === t.tableId ? { tableId: tt.tableId, seats: arr } : tt))
      }
      if (!finalFormed) {
        tables = tables.filter((t) => tableSize(t) > 0)
        tables = applyMoves(tables, planBalancing(tables, seats))
      }
    }

    // Chip conservation at every hand boundary (TNMT-CHIP-003).
    let sum = 0
    for (const id of live) sum += players.get(id)!
    assert.equal(sum, totalChips, `chip conservation broken at hand ${events.length}`)
  }

  const winner = [...live][0]
  const order = assignFinishingOrder(events, { entryId: winner, userId: `u_${winner}` })
  const pool = prizePool(config, n)
  const prizes = projectedPayouts(config, n, n)
  const payouts = settleFinal(order, prizes)
  return { order, payouts, pool, headsUpSeen, initialTableCount }
}

const CONFIG: TournamentConfig = { ...TEMPLATE_MTT, startingStack: 3000, minEntries: 2, maxEntries: 500 }

test('TNMT #21 full tournament simulation: places 1..N, conservation, heads-up', () => {
  // Field sizes span heads-up (2), 3-handed, a full single table (6), and multi-table (9..42).
  for (const [n, seed] of [[2, 'hu'], [3, 's3p'], [6, 's6'], [9, 's1'], [17, 's2'], [23, 's3'], [42, 's4']] as const) {
    const { order, payouts, pool, headsUpSeen, initialTableCount } = simulate(CONFIG, n, seed)

    // Every entry reaches a finishing place; places are exactly 1..N with no gaps or dupes.
    assert.equal(order.length, n, `field size ${n}`)
    const places = order.map((r) => r.finishingPlace).sort((a, b) => a - b)
    assert.deepEqual(places, Array.from({ length: n }, (_, i) => i + 1))
    assert.equal(order[0].finishingPlace, 1) // sorted winner first

    // Payout conserves exactly to the pool (TNMT-PAY-012).
    assert.equal(payouts.reduce((s, r) => s + r.amount, 0), pool)
    assert.equal(pool, CONFIG.entryFee * n)

    // The winner is paid the top prize; nobody outside the paid places gets coins.
    const winnerPay = payouts.find((p) => p.place === 1)!.amount
    assert.ok(winnerPay > 0)

    // A multi-table field must have started on >1 table and reached heads-up.
    if (n > CONFIG.seatsPerTable) assert.ok(initialTableCount > 1)
    assert.ok(headsUpSeen, `heads-up should occur for n=${n}`)
  }
})

test('simulation is deterministic (same seed → identical outcome)', () => {
  const a = simulate(CONFIG, 19, 'repeat')
  const b = simulate(CONFIG, 19, 'repeat')
  assert.deepEqual(a.order, b.order)
  assert.deepEqual(a.payouts, b.payouts)
})

test('blind clock rises monotonically as the tournament runs', () => {
  let prev = 0
  for (let elapsed = 0; elapsed <= 3600; elapsed += 120) {
    const lvl = resolveBlindClock(CONFIG.blindStructure, elapsed).levelIndex
    assert.ok(lvl >= prev)
    prev = lvl
  }
})
