// Sudoku game logic — pure functions, no side effects

export type CellValue = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
export type Board = CellValue[][]
export type Difficulty = 'easy' | 'medium' | 'hard'

export type PuzzleCell = { value: CellValue; isGiven: boolean }
export type Puzzle = PuzzleCell[][]

// Target clues (filled cells) per difficulty
const TARGET_CLUES: Record<Difficulty, number> = {
  easy:   46,   // 35 empty
  medium: 34,   // 47 empty
  hard:   27,   // 54 empty — may be slightly higher if uniqueness forces it
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function copyBoard(b: Board): Board {
  return b.map(r => [...r]) as Board
}

function isValidAt(b: Board, row: number, col: number, n: number): boolean {
  for (let i = 0; i < 9; i++) {
    if (b[row][i] === n || b[i][col] === n) return false
  }
  const br = Math.floor(row / 3) * 3
  const bc = Math.floor(col / 3) * 3
  for (let r = br; r < br + 3; r++) {
    for (let c = bc; c < bc + 3; c++) {
      if (b[r][c] === n) return false
    }
  }
  return true
}

// MRV heuristic: find empty cell with fewest valid candidates
function findBestCell(b: Board): [number, number] | null {
  let best: [number, number] | null = null
  let minCandidates = 10
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (b[r][c] !== 0) continue
      let cnt = 0
      for (let n = 1; n <= 9; n++) {
        if (isValidAt(b, r, c, n)) cnt++
      }
      if (cnt < minCandidates) {
        minCandidates = cnt
        best = [r, c]
        if (cnt === 0) return best  // Dead end — return immediately
      }
    }
  }
  return best
}

// Deterministic solver (ordered 1–9) — used for uniqueness check and solve
function solveBoard(b: Board): boolean {
  const cell = findBestCell(b)
  if (!cell) return true  // All filled = solved
  const [r, c] = cell
  for (let n = 1; n <= 9; n++) {
    if (isValidAt(b, r, c, n)) {
      b[r][c] = n as CellValue
      if (solveBoard(b)) return true
      b[r][c] = 0
    }
  }
  return false
}

// Random-order fill — used for generation to produce variety
function fillRandom(b: Board): boolean {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (b[r][c] !== 0) continue
      const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9] as CellValue[])
      for (const n of nums) {
        if (isValidAt(b, r, c, n)) {
          b[r][c] = n
          if (fillRandom(b)) return true
          b[r][c] = 0
        }
      }
      return false
    }
  }
  return true
}

// Count solutions, stopping at maxCount (fast: returns early once maxCount reached)
function countSolutions(b: Board, max: number): number {
  if (max <= 0) return 0
  const cell = findBestCell(b)
  if (!cell) return 1
  const [r, c] = cell
  let count = 0
  for (let n = 1; n <= 9; n++) {
    if (isValidAt(b, r, c, n)) {
      b[r][c] = n as CellValue
      count += countSolutions(b, max - count)
      b[r][c] = 0
      if (count >= max) return count
    }
  }
  return count
}

// ── Public API ────────────────────────────────────────────────────────────────

export function createSolvedBoard(): Board {
  const b: Board = Array.from({ length: 9 }, () => new Array(9).fill(0) as CellValue[])
  fillRandom(b)
  return b
}

// Remove cells from a solved board while maintaining a unique solution
export function removeNumbersByDifficulty(solved: Board, difficulty: Difficulty): Board {
  const b = copyBoard(solved)
  const target = TARGET_CLUES[difficulty]
  const positions = shuffle(
    Array.from({ length: 81 }, (_, i) => [Math.floor(i / 9), i % 9] as [number, number])
  )
  let clues = 81

  for (const [r, c] of positions) {
    if (clues <= target) break
    const saved = b[r][c]
    b[r][c] = 0
    // Keep removal only if puzzle still has a unique solution
    if (countSolutions(copyBoard(b), 2) === 1) {
      clues--
    } else {
      b[r][c] = saved
    }
  }

  return b
}

export function createPuzzle(difficulty: Difficulty): { puzzle: Puzzle; solution: Board } {
  const solution = createSolvedBoard()
  const board = removeNumbersByDifficulty(solution, difficulty)
  const puzzle: Puzzle = board.map(row =>
    row.map(val => ({ value: val, isGiven: val !== 0 }))
  )
  return { puzzle, solution }
}

// Returns set of "r,c" keys for all cells involved in a conflict
export function getConflicts(puzzle: Puzzle): Set<string> {
  const out = new Set<string>()
  const vals = puzzle.map(row => row.map(cell => cell.value))

  const checkGroup = (cells: [number, number][]) => {
    const seen = new Map<number, string>()
    for (const [r, c] of cells) {
      const v = vals[r][c]
      if (v === 0) continue
      const key = `${r},${c}`
      const prev = seen.get(v)
      if (prev !== undefined) { out.add(key); out.add(prev) }
      else seen.set(v, key)
    }
  }

  for (let r = 0; r < 9; r++) checkGroup(Array.from({ length: 9 }, (_, c) => [r, c]))
  for (let c = 0; c < 9; c++) checkGroup(Array.from({ length: 9 }, (_, r) => [r, c]))
  for (let br = 0; br < 3; br++) {
    for (let bc = 0; bc < 3; bc++) {
      const cells: [number, number][] = []
      for (let r = br * 3; r < br * 3 + 3; r++)
        for (let c = bc * 3; c < bc * 3 + 3; c++) cells.push([r, c])
      checkGroup(cells)
    }
  }

  return out
}

export function checkBoardComplete(puzzle: Puzzle, solution: Board): boolean {
  return puzzle.every((row, r) => row.every((cell, c) => cell.value === solution[r][c]))
}

export function solveSudoku(board: Board): Board | null {
  const b = copyBoard(board)
  return solveBoard(b) ? b : null
}
