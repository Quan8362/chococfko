// ── Poker TOURNAMENT — table balancing (TNMT-BAL) ───────────────────────────────────────
//
// PURE + DETERMINISTIC. Given the same seed + entries, produces the same seating and the same
// moves (auditable, replayable — no Math.random). Implements the frozen algorithm in
// docs/poker/tournaments/table-balancing.md: seeded initial draw, break-shortest-first, equalise
// to ≤1, deterministic who-moves + destination seat, final-table redraw, heads-up detection.
//
// The pure planner never knows about "active hands" — the caller passes only tables that are at a
// hand boundary and applies the returned moves atomically (TNMT-BAL-011/028). Seat index 0 is
// caller-defined; the RPC pre-rotates seats so index order reflects blind position, giving the
// deterministic "highest seat index moves / lowest empty seat receives" rule its blind-fairness
// meaning (TNMT-BAL-025/026).

// ── Deterministic PRNG (seed string → float stream) ────────────────────────────────────
function hashSeed(seed: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// mulberry32 — small, fast, well-distributed, fully deterministic.
export function makePRNG(seed: string): () => number {
  let a = hashSeed(seed)
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function seededShuffle<T>(items: readonly T[], rng: () => number): T[] {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// ── Table model ─────────────────────────────────────────────────────────────────────────
export interface TableState {
  readonly tableId: string
  readonly seats: readonly (string | null)[] // entryId per seat index; null = empty
}

export interface Move {
  readonly entryId: string
  readonly fromTableId: string
  readonly toTableId: string
  readonly toSeatIndex: number
}

export interface BalancePlan {
  readonly breakTableId: string | null
  readonly moves: readonly Move[]
}

export function tableSize(t: TableState): number {
  return t.seats.reduce((n, s) => n + (s ? 1 : 0), 0)
}

function lowestEmptySeat(seats: (string | null)[]): number {
  const i = seats.findIndex((s) => s === null)
  if (i === -1) throw new Error('balancing: no empty seat')
  return i
}

function highestOccupiedSeat(seats: (string | null)[]): number {
  for (let i = seats.length - 1; i >= 0; i--) if (seats[i]) return i
  throw new Error('balancing: no occupied seat')
}

// ── Initial seat draw (TNMT-BAL-010/021) ────────────────────────────────────────────────
export function drawInitialSeating(entryIds: readonly string[], seatsPerTable: number, seed: string): TableState[] {
  if (seatsPerTable < 2) throw new Error('balancing: seatsPerTable must be >= 2')
  const shuffled = seededShuffle(entryIds, makePRNG(seed))
  const numTables = Math.max(1, Math.ceil(shuffled.length / seatsPerTable))
  const tables: (string | null)[][] = Array.from({ length: numTables }, () => Array<string | null>(seatsPerTable).fill(null))
  // Round-robin deal keeps table sizes within 1 and fills seats bottom-up deterministically.
  shuffled.forEach((entryId, i) => {
    const t = i % numTables
    const seat = Math.floor(i / numTables)
    tables[t][seat] = entryId
  })
  return tables.map((seats, i) => ({ tableId: `t${i + 1}`, seats }))
}

// ── Balancing plan (TNMT-BAL-012/023/024/025) ───────────────────────────────────────────
// Operates on tables that are AT a hand boundary (caller-filtered). Returns a break-table (if the
// field can collapse onto fewer tables) plus the moves to apply. Deterministic throughout.
export function planBalancing(tables: readonly TableState[], seatsPerTable: number): BalancePlan {
  const work = tables.map((t) => ({ tableId: t.tableId, seats: [...t.seats] as (string | null)[] }))
  const n = work.length
  const total = work.reduce((a, t) => a + tableSize(t), 0)
  const moves: Move[] = []

  // 1. Break the shortest table if the field fits on n-1 tables (TNMT-BAL-023).
  if (n > 1 && total <= (n - 1) * seatsPerTable) {
    const breakTable = [...work].sort((a, b) => (tableSize(a) - tableSize(b)) || (a.tableId < b.tableId ? -1 : 1))[0]
    const others = work.filter((t) => t.tableId !== breakTable.tableId)
    // Movers in deterministic order (lowest occupied seat first).
    const movers = breakTable.seats.map((s, i) => ({ s, i })).filter((x) => x.s).map((x) => x.s as string)
    for (const entryId of movers) {
      // Fill the most-empty table first (smallest size), tie-break lowest id (TNMT-BAL-024/026).
      const target = [...others].sort((a, b) => (tableSize(a) - tableSize(b)) || (a.tableId < b.tableId ? -1 : 1))[0]
      const seat = lowestEmptySeat(target.seats)
      target.seats[seat] = entryId
      moves.push({ entryId, fromTableId: breakTable.tableId, toTableId: target.tableId, toSeatIndex: seat })
    }
    return { breakTableId: breakTable.tableId, moves }
  }

  // 2. Equalise sizes until max-min <= 1 (TNMT-BAL-024).
  //    Bounded loop: each move strictly reduces (max-min); guard against pathological input.
  let guard = work.length * seatsPerTable + 1
  while (guard-- > 0) {
    const bySize = [...work].sort((a, b) => (tableSize(b) - tableSize(a)) || (a.tableId < b.tableId ? -1 : 1))
    const largest = bySize[0]
    const smallest = [...work].sort((a, b) => (tableSize(a) - tableSize(b)) || (a.tableId < b.tableId ? -1 : 1))[0]
    if (tableSize(largest) - tableSize(smallest) < 2) break
    // Who moves: highest-seat-index occupant of the largest table (TNMT-BAL-025; caller pre-rotates
    // so this is the player next to pay the big blind).
    const fromSeat = highestOccupiedSeat(largest.seats)
    const entryId = largest.seats[fromSeat] as string
    const toSeat = lowestEmptySeat(smallest.seats)
    largest.seats[fromSeat] = null
    smallest.seats[toSeat] = entryId
    moves.push({ entryId, fromTableId: largest.tableId, toTableId: smallest.tableId, toSeatIndex: toSeat })
  }

  return { breakTableId: null, moves }
}

// ── Final table & heads-up (TNMT-BAL-031/032/033) ───────────────────────────────────────
export function shouldFormFinalTable(remainingPlayers: number, seatsPerTable: number): boolean {
  return remainingPlayers > 1 && remainingPlayers <= seatsPerTable
}

// Fresh SEEDED redraw for the final table (auditable) — collapses everyone onto one table.
export function formFinalTable(entryIds: readonly string[], seatsPerTable: number, seed: string): TableState {
  if (entryIds.length > seatsPerTable) throw new Error('balancing: final table over capacity')
  const shuffled = seededShuffle(entryIds, makePRNG(`${seed}:final`))
  const seats = Array<string | null>(seatsPerTable).fill(null)
  shuffled.forEach((e, i) => (seats[i] = e))
  return { tableId: 'final', seats }
}

export function isHeadsUp(remainingPlayers: number): boolean {
  return remainingPlayers === 2
}

// The tournament is over the instant one player holds all chips (TNMT-BAL-033).
export function isTournamentOver(remainingPlayers: number): boolean {
  return remainingPlayers <= 1
}
