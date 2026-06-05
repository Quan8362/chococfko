export const SIZE = 4
export type Board = number[][]
export type Direction = 'up' | 'down' | 'left' | 'right'

export function createEmptyBoard(): Board {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(0))
}

export function addRandomTile(board: Board): Board {
  const empty: [number, number][] = []
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++)
      if (board[r][c] === 0) empty.push([r, c])
  if (empty.length === 0) return board
  const [r, c] = empty[Math.floor(Math.random() * empty.length)]
  const next = board.map(row => [...row])
  next[r][c] = Math.random() < 0.9 ? 2 : 4
  return next
}

export function createInitialBoard(): Board {
  return addRandomTile(addRandomTile(createEmptyBoard()))
}

function slideRowLeft(row: number[]): { row: number[]; score: number } {
  const tiles = row.filter(v => v !== 0)
  const result: number[] = []
  let score = 0
  let i = 0
  while (i < tiles.length) {
    if (i + 1 < tiles.length && tiles[i] === tiles[i + 1]) {
      const val = tiles[i] * 2
      result.push(val)
      score += val
      i += 2
    } else {
      result.push(tiles[i])
      i++
    }
  }
  while (result.length < SIZE) result.push(0)
  return { row: result, score }
}

export function moveLeft(board: Board): { board: Board; score: number; changed: boolean } {
  let score = 0
  let changed = false
  const next = board.map(row => {
    const { row: newRow, score: s } = slideRowLeft(row)
    score += s
    if (newRow.some((v, i) => v !== row[i])) changed = true
    return newRow
  })
  return { board: next, score, changed }
}

export function moveRight(board: Board): { board: Board; score: number; changed: boolean } {
  let score = 0
  let changed = false
  const next = board.map(row => {
    const rev = [...row].reverse()
    const { row: newRow, score: s } = slideRowLeft(rev)
    score += s
    const result = [...newRow].reverse()
    if (result.some((v, i) => v !== row[i])) changed = true
    return result
  })
  return { board: next, score, changed }
}

function transpose(board: Board): Board {
  return board[0].map((_, c) => board.map(row => row[c]))
}

export function moveUp(board: Board): { board: Board; score: number; changed: boolean } {
  const { board: moved, score, changed } = moveLeft(transpose(board))
  return { board: transpose(moved), score, changed }
}

export function moveDown(board: Board): { board: Board; score: number; changed: boolean } {
  const { board: moved, score, changed } = moveRight(transpose(board))
  return { board: transpose(moved), score, changed }
}

export function applyMove(board: Board, dir: Direction) {
  switch (dir) {
    case 'left':  return moveLeft(board)
    case 'right': return moveRight(board)
    case 'up':    return moveUp(board)
    case 'down':  return moveDown(board)
  }
}

export function hasWon(board: Board): boolean {
  return board.some(row => row.some(v => v >= 2048))
}

export function canMove(board: Board): boolean {
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] === 0) return true
      if (c + 1 < SIZE && board[r][c] === board[r][c + 1]) return true
      if (r + 1 < SIZE && board[r][c] === board[r + 1][c]) return true
    }
  return false
}
