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
  // Monotonic counter bumped by a DB trigger on every authoritative UPDATE.
  // Optional so the client degrades safely before migration_caro_realtime_sync
  // is applied (column absent → undefined → monotonic guard is inert).
  state_version?: number
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
  'state_version',
] as const

/**
 * Result of applying a realtime/refetched payload onto the last known state.
 *
 * - `room`     — the (possibly unchanged) next state to render.
 * - `stale`    — the payload was ignored because it carried an OLDER
 *                `state_version` than what we've already applied. The caller
 *                should NOT refetch (we already hold newer authoritative state).
 * - `refetch`  — the payload looked structurally wrong (e.g. a `board` that is
 *                present but not a valid 225-cell array). We kept the previous
 *                state instead of accepting garbage, and the caller should pull
 *                authoritative state so it can never get stuck on stale forever.
 */
export type ApplyRoomResult = {
  room: CaroRoomState
  stale: boolean
  refetch: boolean
}

/**
 * Apply a realtime UPDATE / refetched row onto the last known room state.
 *
 * - If `incoming` is not an object → no-op (`prev`).
 * - If `incoming.id` differs from `prev.id` → it's for another room; ignore.
 * - If `incoming.state_version` is OLDER than the applied version → ignore
 *   (`stale`), so an out-of-order event or a lagging read replica can never
 *   regress newer state.
 * - `board` is overridden only when the incoming board is a valid 225-array.
 *   A missing/null board is the normal TOAST case and is silently preserved.
 *   A board that is *present but malformed* preserves prev AND flags `refetch`.
 * - `winning_cells` is overridden only when the incoming value is an array.
 * - Any scalar that is `undefined` in the payload falls back to `prev`.
 */
export function applyRoomUpdate(prev: CaroRoomState, incoming: unknown): ApplyRoomResult {
  if (!incoming || typeof incoming !== 'object') return { room: prev, stale: false, refetch: false }
  const inc = incoming as Record<string, unknown>

  if (typeof inc.id === 'string' && inc.id !== prev.id) return { room: prev, stale: false, refetch: false }

  // Monotonic guard: reject strictly-older versions. Equal versions are allowed
  // through (idempotent reapply of the same authoritative row is harmless).
  if (
    typeof inc.state_version === 'number' &&
    typeof prev.state_version === 'number' &&
    inc.state_version < prev.state_version
  ) {
    return { room: prev, stale: true, refetch: false }
  }

  const next: CaroRoomState = { ...prev }

  for (const key of SCALAR_KEYS) {
    if (inc[key] !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(next as any)[key] = inc[key]
    }
  }

  // A board key that is present but neither null nor a valid 225-array is an
  // unexpected serialization → keep prev and ask the caller to refetch.
  const boardPresent = 'board' in inc && inc.board !== undefined && inc.board !== null
  const refetch = boardPresent && !isValidBoard(inc.board)

  next.board = isValidBoard(inc.board) ? parseBoard(inc.board) : prev.board
  next.winning_cells = Array.isArray(inc.winning_cells) ? parseWinningCells(inc.winning_cells) : prev.winning_cells

  return { room: next, stale: false, refetch }
}

/**
 * Merge a realtime UPDATE payload onto the last known room state.
 * Thin wrapper over {@link applyRoomUpdate} that returns only the next state —
 * kept for callers/tests that don't need the stale/refetch signals.
 */
export function mergeRoomUpdate(prev: CaroRoomState, incoming: unknown): CaroRoomState {
  return applyRoomUpdate(prev, incoming).room
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
