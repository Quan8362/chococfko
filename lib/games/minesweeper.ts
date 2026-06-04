// Minesweeper game logic — pure functions, no side effects

export type Difficulty = 'easy' | 'medium' | 'hard'

export type Cell = {
  row: number
  col: number
  isMine: boolean
  isRevealed: boolean
  isFlagged: boolean
  adjacentMines: number
}

export type GameStatus = 'idle' | 'playing' | 'won' | 'lost'

export type DifficultyConfig = {
  rows: number
  cols: number
  mines: number
}

export const DIFFICULTY_CONFIG: Record<Difficulty, DifficultyConfig> = {
  easy:   { rows: 9,  cols: 9,  mines: 10 },
  medium: { rows: 16, cols: 16, mines: 40 },
  hard:   { rows: 16, cols: 30, mines: 99 },
}

// ── Board creation ────────────────────────────────────────────────────────────

export function createEmptyBoard(rows: number, cols: number): Cell[][] {
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => ({
      row:          r,
      col:          c,
      isMine:       false,
      isRevealed:   false,
      isFlagged:    false,
      adjacentMines: 0,
    }))
  )
}

// Place mines randomly, avoiding the first-click cell and its 8 neighbours
export function placeMines(
  board: Cell[][],
  mineCount: number,
  safeRow: number,
  safeCol: number,
): Cell[][] {
  const rows = board.length
  const cols = board[0].length

  // Build set of safe positions (first click + neighbours)
  const safeSet = new Set<string>()
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const r = safeRow + dr, c = safeCol + dc
      if (r >= 0 && r < rows && c >= 0 && c < cols) safeSet.add(`${r},${c}`)
    }
  }

  // Collect candidate positions
  const candidates: [number, number][] = []
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      if (!safeSet.has(`${r},${c}`)) candidates.push([r, c])

  // Fisher-Yates partial shuffle to pick mineCount positions
  const count = Math.min(mineCount, candidates.length)
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(Math.random() * (candidates.length - i))
    ;[candidates[i], candidates[j]] = [candidates[j], candidates[i]]
  }

  const newBoard = board.map(row => row.map(cell => ({ ...cell })))
  for (let i = 0; i < count; i++) {
    const [r, c] = candidates[i]
    newBoard[r][c].isMine = true
  }
  return newBoard
}

// Fill adjacentMines counts after mines are placed
export function calculateAdjacentMines(board: Cell[][]): Cell[][] {
  const rows = board.length
  const cols = board[0].length
  return board.map(row =>
    row.map(cell => {
      if (cell.isMine) return { ...cell }
      let count = 0
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          const r = cell.row + dr, c = cell.col + dc
          if (r >= 0 && r < rows && c >= 0 && c < cols && board[r][c].isMine) count++
        }
      return { ...cell, adjacentMines: count }
    })
  )
}

// ── Gameplay ──────────────────────────────────────────────────────────────────

// Reveal a cell; if adjacentMines === 0 flood-fill to neighbours
export function revealCell(board: Cell[][], row: number, col: number): Cell[][] {
  const rows = board.length
  const cols = board[0].length
  const cell = board[row][col]
  if (cell.isRevealed || cell.isFlagged) return board

  // Deep copy
  const next = board.map(r => r.map(c => ({ ...c })))

  const queue: [number, number][] = [[row, col]]
  const visited = new Set<string>()
  visited.add(`${row},${col}`)

  while (queue.length > 0) {
    const [r, c] = queue.shift()!
    next[r][c].isRevealed = true
    if (next[r][c].adjacentMines === 0 && !next[r][c].isMine) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr, nc = c + dc
          const key = `${nr},${nc}`
          if (
            nr >= 0 && nr < rows && nc >= 0 && nc < cols &&
            !visited.has(key) &&
            !next[nr][nc].isRevealed &&
            !next[nr][nc].isFlagged &&
            !next[nr][nc].isMine
          ) {
            visited.add(key)
            queue.push([nr, nc])
          }
        }
      }
    }
  }
  return next
}

export function toggleFlag(board: Cell[][], row: number, col: number): Cell[][] {
  if (board[row][col].isRevealed) return board
  return board.map((r, ri) =>
    r.map((c, ci) =>
      ri === row && ci === col ? { ...c, isFlagged: !c.isFlagged } : { ...c }
    )
  )
}

export function checkWin(board: Cell[][]): boolean {
  return board.every(row =>
    row.every(cell => cell.isMine || cell.isRevealed)
  )
}

// Reveal all mines (called when player loses)
export function revealAllMines(board: Cell[][]): Cell[][] {
  return board.map(row =>
    row.map(cell =>
      cell.isMine ? { ...cell, isRevealed: true } : { ...cell }
    )
  )
}
