// Pure, framework-free Caro (Gomoku) rules: win detection and move-outcome
// resolution. Server-authoritative game completion (in actions.ts / future RPC)
// must use these so the result of a match is computed deterministically and is
// unit-testable, independent of any browser state.

export const SIZE = 15
export const BOARD_CELLS = SIZE * SIZE // 225

export type Mark = 'X' | 'O'
export type Cell = Mark | null
export type Winner = Mark | 'draw' | null

/**
 * Five-in-a-row check anchored on the last placed cell. Returns the winning
 * cell indices (length >= 5) or null. Pure; never throws on out-of-range input.
 */
export function checkWinner(board: Cell[], lastIdx: number): { cells: number[] } | null {
  if (lastIdx < 0 || lastIdx >= board.length) return null
  const player = board[lastIdx]
  if (player !== 'X' && player !== 'O') return null

  const row = Math.floor(lastIdx / SIZE)
  const col = lastIdx % SIZE
  const dirs: [number, number][] = [[0, 1], [1, 0], [1, 1], [1, -1]]

  for (const [dr, dc] of dirs) {
    const cells = [lastIdx]
    for (let i = 1; i < 5; i++) {
      const r = row + dr * i, c = col + dc * i
      if (r < 0 || r >= SIZE || c < 0 || c >= SIZE || board[r * SIZE + c] !== player) break
      cells.push(r * SIZE + c)
    }
    for (let i = 1; i < 5; i++) {
      const r = row - dr * i, c = col - dc * i
      if (r < 0 || r >= SIZE || c < 0 || c >= SIZE || board[r * SIZE + c] !== player) break
      cells.unshift(r * SIZE + c)
    }
    if (cells.length >= 5) return { cells }
  }
  return null
}

export type MoveOutcome =
  | { ok: false; reason: 'out_of_range' | 'cell_occupied' }
  | {
      ok: true
      board: Cell[]
      nextTurn: Mark
      winner: Winner
      winningCells: number[]
      isFinished: boolean
      status: 'playing' | 'finished'
    }

/**
 * Resolve the authoritative result of placing `symbol` at `cellIndex` on `board`.
 * Rejects out-of-range and already-occupied cells (idempotency / duplicate-move
 * guard). On success returns the new board plus terminal state. Does not mutate
 * the input board.
 */
export function decideMoveOutcome(board: Cell[], cellIndex: number, symbol: Mark): MoveOutcome {
  if (cellIndex < 0 || cellIndex >= BOARD_CELLS) return { ok: false, reason: 'out_of_range' }
  if (board[cellIndex] === 'X' || board[cellIndex] === 'O') return { ok: false, reason: 'cell_occupied' }

  const next = board.slice()
  next[cellIndex] = symbol

  const win = checkWinner(next, cellIndex)
  const isDraw = !win && next.every((c) => c === 'X' || c === 'O')
  const isFinished = !!win || isDraw

  return {
    ok: true,
    board: next,
    nextTurn: symbol === 'X' ? 'O' : 'X',
    winner: win ? symbol : isDraw ? 'draw' : null,
    winningCells: win ? win.cells : [],
    isFinished,
    status: isFinished ? 'finished' : 'playing',
  }
}

/**
 * The forfeit winner when a game is finalized due to timeout/abandonment: the
 * player whose turn it is failed to act, so their opponent wins.
 */
export function forfeitWinner(currentTurn: Mark): Mark {
  return currentTurn === 'X' ? 'O' : 'X'
}
