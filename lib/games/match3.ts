// Match-3 game logic — pure functions, no side effects

export const BOARD_ROWS = 8
export const BOARD_COLS = 8
export const NUM_COLORS = 6
export const MIN_MATCH = 3

export type TileColor = 0 | 1 | 2 | 3 | 4 | 5

export type Tile = {
  color: TileColor
  id: number
}

export type Board = (Tile | null)[][]

// Module-level counter — resets on createInitialBoard
let _tileIdCounter = 0

export function createRandomTile(): Tile {
  return {
    color: Math.floor(Math.random() * NUM_COLORS) as TileColor,
    id: _tileIdCounter++,
  }
}

// Creates an 8×8 board with no pre-existing horizontal or vertical matches
export function createInitialBoard(rows = BOARD_ROWS, cols = BOARD_COLS): Board {
  _tileIdCounter = 0
  const board: Board = Array.from({ length: rows }, () => Array(cols).fill(null))

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let color: TileColor
      let attempts = 0
      do {
        color = Math.floor(Math.random() * NUM_COLORS) as TileColor
        attempts++
      } while (
        attempts < 30 &&
        (
          (c >= 2 && board[r][c - 1]?.color === color && board[r][c - 2]?.color === color) ||
          (r >= 2 && board[r - 1]?.[c]?.color === color && board[r - 2]?.[c]?.color === color)
        )
      )
      board[r][c] = { color, id: _tileIdCounter++ }
    }
  }

  return board
}

export function areAdjacent(r1: number, c1: number, r2: number, c2: number): boolean {
  return (Math.abs(r1 - r2) === 1 && c1 === c2) || (r1 === r2 && Math.abs(c1 - c2) === 1)
}

export function swapTiles(board: Board, r1: number, c1: number, r2: number, c2: number): Board {
  const next = board.map(row => [...row])
  const tmp = next[r1][c1]
  next[r1][c1] = next[r2][c2]
  next[r2][c2] = tmp
  return next
}

export type MatchSet = Set<string>

export function findMatches(board: Board): MatchSet {
  const matches = new Set<string>()
  const rows = board.length
  const cols = board[0]?.length ?? 0

  // Horizontal
  for (let r = 0; r < rows; r++) {
    let c = 0
    while (c < cols) {
      const color = board[r][c]?.color
      if (color === undefined || color === null) { c++; continue }
      let end = c + 1
      while (end < cols && board[r][end]?.color === color) end++
      if (end - c >= MIN_MATCH) {
        for (let i = c; i < end; i++) matches.add(`${r},${i}`)
      }
      c = end
    }
  }

  // Vertical
  for (let c = 0; c < cols; c++) {
    let r = 0
    while (r < rows) {
      const color = board[r][c]?.color
      if (color === undefined || color === null) { r++; continue }
      let end = r + 1
      while (end < rows && board[end][c]?.color === color) end++
      if (end - r >= MIN_MATCH) {
        for (let i = r; i < end; i++) matches.add(`${i},${c}`)
      }
      r = end
    }
  }

  return matches
}

export function removeMatches(board: Board, matches: MatchSet): Board {
  return board.map((row, r) =>
    row.map((tile, c) => (matches.has(`${r},${c}`) ? null : tile))
  )
}

// Tiles fall down — nulls bubble up to the top
export function collapseBoard(board: Board): Board {
  const rows = board.length
  const cols = board[0]?.length ?? 0
  const next = board.map(row => [...row])

  for (let c = 0; c < cols; c++) {
    let writeRow = rows - 1
    for (let r = rows - 1; r >= 0; r--) {
      if (next[r][c] !== null) {
        next[writeRow][c] = next[r][c]
        if (writeRow !== r) next[r][c] = null
        writeRow--
      }
    }
    while (writeRow >= 0) {
      next[writeRow][c] = null
      writeRow--
    }
  }

  return next
}

// Fill null spots with new random tiles
export function fillBoard(board: Board): Board {
  return board.map(row =>
    row.map(tile => (tile === null ? createRandomTile() : tile))
  )
}

// Check if any adjacent swap produces at least one match
export function hasPossibleMoves(board: Board): boolean {
  const rows = board.length
  const cols = board[0]?.length ?? 0

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (c + 1 < cols && findMatches(swapTiles(board, r, c, r, c + 1)).size > 0) return true
      if (r + 1 < rows && findMatches(swapTiles(board, r, c, r + 1, c)).size > 0) return true
    }
  }

  return false
}

// Score: 3-match = 30pts, each extra tile = +10pts
export function calculateScore(matchCount: number): number {
  if (matchCount < MIN_MATCH) return 0
  return 30 + (matchCount - MIN_MATCH) * 10
}
