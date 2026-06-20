// Pure helpers for safely applying Supabase Realtime payloads to Caro room state.
// Framework-free so they can be unit-tested with `node --test`.
//
// Why this exists: Supabase `postgres_changes` UPDATE payloads are not always a
// complete row. With the default REPLICA IDENTITY, an UPDATE that does not touch
// a large/TOASTed column (the 225-cell `board`) can deliver that column as a
// placeholder (null / missing). Blindly doing `setRoom(payload.new)` then wipes
// the board mid-match. RLS or certain events can also deliver an essentially
// empty `new`. We therefore MERGE the incoming payload onto the last known good
// state, overriding a field only when the incoming value is present and valid.

export const BOARD_CELLS = 225

export type CaroBoard = (string | null)[]

export type CaroRoomState = {
  id: string
  room_code: string
  player_x: string | null
  player_o: string | null
  current_turn: 'X' | 'O'
  board: CaroBoard
  status: 'waiting' | 'playing' | 'finished' | 'cancelled'
  winner: 'X' | 'O' | 'draw' | null
  winning_cells: number[]
  created_at: string
  updated_at: string
  finished_at: string | null
}

/** Normalize any raw board value to a fixed-length, render-safe array. */
export function parseBoard(raw: unknown): CaroBoard {
  if (!Array.isArray(raw) || raw.length !== BOARD_CELLS) return Array(BOARD_CELLS).fill(null)
  return raw.map((c) => (c === 'X' || c === 'O' ? c : null))
}

/** True when raw looks like a usable board (right length array). */
function isValidBoard(raw: unknown): raw is CaroBoard {
  return Array.isArray(raw) && raw.length === BOARD_CELLS
}

/** Safe iterable of winning-cell indices. */
export function parseWinningCells(raw: unknown): number[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((n): n is number => typeof n === 'number' && n >= 0 && n < BOARD_CELLS)
}

// Scalar fields that Supabase always delivers complete on an UPDATE (never
// TOASTed). When the incoming value is `undefined` we keep the previous value so
// an empty/partial payload is a no-op rather than a state wipe.
const SCALAR_KEYS = [
  'id',
  'room_code',
  'player_x',
  'player_o',
  'current_turn',
  'status',
  'winner',
  'created_at',
  'updated_at',
  'finished_at',
] as const

/**
 * Merge a realtime UPDATE payload onto the last known room state.
 *
 * - If `incoming` is not an object → return `prev` unchanged.
 * - If `incoming.id` is present and differs from `prev.id` → it's for another
 *   room; ignore and return `prev`.
 * - `board` is overridden only when the incoming board is a valid 225-array,
 *   otherwise the previous board is preserved (guards the TOAST-wipe bug).
 * - `winning_cells` is overridden only when the incoming value is an array.
 * - Any scalar that is `undefined` in the payload falls back to `prev`.
 */
export function mergeRoomUpdate(prev: CaroRoomState, incoming: unknown): CaroRoomState {
  if (!incoming || typeof incoming !== 'object') return prev
  const inc = incoming as Record<string, unknown>

  if (typeof inc.id === 'string' && inc.id !== prev.id) return prev

  const next: CaroRoomState = { ...prev }

  for (const key of SCALAR_KEYS) {
    if (inc[key] !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(next as any)[key] = inc[key]
    }
  }

  next.board = isValidBoard(inc.board) ? parseBoard(inc.board) : prev.board
  next.winning_cells = Array.isArray(inc.winning_cells) ? parseWinningCells(inc.winning_cells) : prev.winning_cells

  return next
}

/**
 * Count placed marks — used to detect a regressed board (a stale payload that
 * would remove already-placed moves). Callers can use this to decide to refetch
 * authoritative state instead of accepting a payload that loses moves.
 */
export function countMoves(board: CaroBoard): number {
  let n = 0
  for (const c of board) if (c === 'X' || c === 'O') n++
  return n
}
