// Pure helpers for safely applying Supabase Realtime payloads to Chinese Chess
// room state. Framework-free so they can be unit-tested with `node --test`.
//
// The room component previously did `setRoom(payload.new as ChessRoom)` — a blind
// full replace. The 10x9 board is small (no TOAST risk like Caro's 225-cell board),
// but a blind replace still has two real hazards:
//   1. Terminal regression: a late/duplicate/partial UPDATE could push a 'finished'
//      game back to 'playing' (e.g. a draw-flag reset event reordered after the
//      finish), making a completed result look unfinished on the client.
//   2. Stale overwrite: an out-of-order event with a lower move_count could roll the
//      board back to an earlier position.
// mergeChessRoomUpdate merges onto the last known good state with explicit guards.

export type ChessSide = 'red' | 'black'
export type ChessCell = string | null
export type ChessBoard = ChessCell[][]

export type ChessRoomState = {
  id: string
  room_code: string
  player_red: string | null
  player_black: string | null
  current_turn: ChessSide
  board: ChessBoard
  status: 'waiting' | 'playing' | 'finished' | 'cancelled'
  winner: ChessSide | 'draw' | null
  end_reason: 'checkmate' | 'resign' | 'draw' | 'general_captured' | 'timeout' | null
  last_move: { from: [number, number]; to: [number, number] } | null
  move_count: number
  red_offered_draw: boolean
  black_offered_draw: boolean
  turn_started_at: string | null
  turn_timeout_seconds: number
  created_at: string
  updated_at: string
  finished_at: string | null
}

export const BOARD_ROWS = 10
export const BOARD_COLS = 9

/** True when raw looks like a usable 10x9 board (array of 10 row-arrays). */
export function isValidChessBoard(raw: unknown): raw is ChessBoard {
  if (!Array.isArray(raw) || raw.length !== BOARD_ROWS) return false
  return raw.every((row) => Array.isArray(row) && row.length === BOARD_COLS)
}

// Scalar fields delivered complete on every UPDATE. `undefined` in the payload ⇒
// keep the previous value (so an empty/partial payload is a no-op, not a wipe).
const SCALAR_KEYS = [
  'id',
  'room_code',
  'player_red',
  'player_black',
  'current_turn',
  'status',
  'winner',
  'end_reason',
  'last_move',
  'move_count',
  'red_offered_draw',
  'black_offered_draw',
  'turn_started_at',
  'turn_timeout_seconds',
  'created_at',
  'updated_at',
  'finished_at',
] as const

/**
 * Merge a realtime UPDATE payload onto the last known room state.
 *
 * Guards:
 *  - non-object payload → return prev unchanged.
 *  - payload.id present and != prev.id → event for another room; ignore.
 *  - TERMINAL guard: once prev.status === 'finished', the result is immutable —
 *    ignore any further payload (prevents a stale event un-finishing the game).
 *  - STALE guard: a payload whose move_count is strictly LOWER than prev's is an
 *    out-of-order/older event; ignore it (don't roll the board back).
 *  - board overridden only when it is a valid 10x9 array, else prev board kept.
 *  - any scalar that is `undefined` in the payload falls back to prev.
 */
export function mergeChessRoomUpdate(prev: ChessRoomState, incoming: unknown): ChessRoomState {
  if (!incoming || typeof incoming !== 'object') return prev
  const inc = incoming as Record<string, unknown>

  if (typeof inc.id === 'string' && inc.id !== prev.id) return prev

  // A finished game is terminal: never let a later event mutate it.
  if (prev.status === 'finished') return prev

  // Reject older/out-of-order events that would regress the board.
  if (typeof inc.move_count === 'number' && inc.move_count < prev.move_count) return prev

  const next: ChessRoomState = { ...prev }
  for (const key of SCALAR_KEYS) {
    if (inc[key] !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(next as any)[key] = inc[key]
    }
  }
  next.board = isValidChessBoard(inc.board) ? (inc.board as ChessBoard) : prev.board

  return next
}

/**
 * Whether the current player's turn deadline has objectively passed, given an
 * authoritative server "now". Mirrors claim_chinese_chess_timeout's SQL check.
 * Returns false when there is no active timer.
 */
export function isTurnDeadlineExpired(
  room: Pick<ChessRoomState, 'status' | 'turn_started_at' | 'turn_timeout_seconds'>,
  nowMs: number,
): boolean {
  if (room.status !== 'playing') return false
  if (!room.turn_started_at) return false
  const startedMs = new Date(room.turn_started_at).getTime()
  if (Number.isNaN(startedMs)) return false
  const limitMs = (room.turn_timeout_seconds || 60) * 1000
  return nowMs > startedMs + limitMs
}

/** Forfeit winner when a turn times out: the player NOT on the clock. */
export function timeoutWinner(currentTurn: ChessSide): ChessSide {
  return currentTurn === 'red' ? 'black' : 'red'
}
