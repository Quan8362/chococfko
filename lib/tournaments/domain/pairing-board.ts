// Pure reducer for the direct first-round pairing editor. The board is a fixed-length seat array
// (index = seed position) plus a pool of unplaced tokens. Every drag / keyboard / dropdown move funnels
// through these functions, so the invariant "each valid token is in exactly one place (a seat OR the
// pool) and no token is ever lost or duplicated" holds by construction. Pure & deterministic; never
// mutates its input — always returns a fresh { seats, pool }.

import type { PairingArrangement } from './first-round-pairing.ts'

export interface BoardState {
  readonly seats: readonly (string | null)[]
  readonly pool: readonly string[]
}

export function boardFromArrangement(arr: PairingArrangement): BoardState {
  return { seats: [...arr.seats], pool: [...arr.pool] }
}

/** Where a token currently lives: a seat index, the pool, or nowhere (unknown token). */
export function locate(state: BoardState, tokenId: string): { where: 'seat'; index: number } | { where: 'pool' } | null {
  const idx = state.seats.indexOf(tokenId)
  if (idx >= 0) return { where: 'seat', index: idx }
  if (state.pool.includes(tokenId)) return { where: 'pool' }
  return null
}

function withoutToken(state: BoardState, tokenId: string): { seats: (string | null)[]; pool: string[] } {
  const seats = state.seats.map((s) => (s === tokenId ? null : s))
  const pool = state.pool.filter((id) => id !== tokenId)
  return { seats, pool }
}

/**
 * Move `tokenId` into a specific seat.
 *   • If the seat is empty → the token simply lands there.
 *   • If the seat holds `other` → SWAP when the token came from another seat (other takes the token's
 *     old seat); when the token came from the POOL, `other` is displaced back to the pool.
 * A no-op (dropping a token onto its own seat) returns the state unchanged.
 */
export function moveToSeat(state: BoardState, tokenId: string, seatIndex: number): BoardState {
  if (seatIndex < 0 || seatIndex >= state.seats.length) return state
  const from = locate(state, tokenId)
  if (!from) return state
  if (from.where === 'seat' && from.index === seatIndex) return state

  const occupant = state.seats[seatIndex]
  const base = withoutToken(state, tokenId)

  if (occupant !== null && occupant !== tokenId) {
    // Displace the occupant: to the token's vacated seat (swap) if it had one, else to the pool.
    base.seats[seatIndex] = null
    if (from.where === 'seat') base.seats[from.index] = occupant
    else if (!base.pool.includes(occupant)) base.pool.push(occupant)
  }
  base.seats[seatIndex] = tokenId
  return { seats: base.seats, pool: base.pool }
}

/** Move `tokenId` back to the pool (from a seat or a no-op if already pooled). */
export function moveToPool(state: BoardState, tokenId: string): BoardState {
  const from = locate(state, tokenId)
  if (!from || from.where === 'pool') return state
  const base = withoutToken(state, tokenId)
  base.pool.push(tokenId)
  return { seats: base.seats, pool: base.pool }
}

export function toArrangement(state: BoardState, size: number): PairingArrangement {
  return { size, seats: [...state.seats], pool: [...state.pool] }
}

/** Order-independent equality — used to detect an unsaved (dirty) board vs its persisted baseline. */
export function boardsEqual(a: BoardState, b: BoardState): boolean {
  if (a.seats.length !== b.seats.length) return false
  for (let i = 0; i < a.seats.length; i++) if (a.seats[i] !== b.seats[i]) return false
  if (a.pool.length !== b.pool.length) return false
  const set = new Set(a.pool)
  return b.pool.every((id) => set.has(id))
}
