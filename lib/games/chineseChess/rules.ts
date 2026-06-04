/**
 * Chinese Chess (Xiangqi / Cờ Tướng) rules engine
 *
 * Board:  10 rows × 9 cols  →  board[row][col]
 *   row 0 = top    (Black's back rank)
 *   row 9 = bottom (Red's back rank)
 *   col 0 = left,  col 8 = right
 *
 * Piece encoding: "{side}{type}"
 *   side : 'r' = Red  |  'b' = Black
 *   type : G=General · A=Advisor · E=Elephant · N=Knight
 *          R=Rook    · C=Cannon  · P=Pawn
 *   e.g.  'rG' = Red General,  'bP' = Black Pawn
 *
 * Sides of the river
 *   Red   homeland : rows 5-9  (bottom half)
 *   Black homeland : rows 0-4  (top half)
 *   River separates row 4 and row 5.
 *
 * Palaces  (general + advisors must stay inside)
 *   Red   : rows 7-9,  cols 3-5
 *   Black : rows 0-2,  cols 3-5
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export type Side = 'r' | 'b'
export type Board = (string | null)[][]
export type Pos = [number, number]   // [row, col]

// ── Primitive helpers ──────────────────────────────────────────────────────────

export function getSide(piece: string): Side {
  return piece[0] as Side
}

export function isInsideBoard(row: number, col: number): boolean {
  return row >= 0 && row <= 9 && col >= 0 && col <= 8
}

export function isInsidePalace(side: Side, row: number, col: number): boolean {
  if (col < 3 || col > 5) return false
  return side === 'r' ? row >= 7 && row <= 9 : row >= 0 && row <= 2
}

/**
 * Returns true if `row` is on the *opponent's* side of the river for `side`.
 * A piece has "crossed the river" when it stands on the opponent's homeland.
 */
export function isRiverCrossed(side: Side, row: number): boolean {
  return side === 'r' ? row <= 4 : row >= 5
}

export function getPieceAt(board: Board, row: number, col: number): string | null {
  if (!isInsideBoard(row, col)) return null
  return board[row][col]
}

function isSameSide(piece: string | null, side: Side): boolean {
  return piece !== null && piece[0] === side
}

// ── hasPieceBetween ────────────────────────────────────────────────────────────

/**
 * Returns true if there is at least one piece on the orthogonal line
 * between (r1,c1) and (r2,c2), exclusive of both endpoints.
 * Returns false if the two positions are not on the same rank or file.
 */
export function hasPieceBetween(
  board: Board,
  r1: number, c1: number,
  r2: number, c2: number,
): boolean {
  if (r1 === r2) {
    const lo = Math.min(c1, c2), hi = Math.max(c1, c2)
    for (let c = lo + 1; c < hi; c++) if (board[r1][c]) return true
  } else if (c1 === c2) {
    const lo = Math.min(r1, r2), hi = Math.max(r1, r2)
    for (let r = lo + 1; r < hi; r++) if (board[r][c1]) return true
  }
  return false
}

/** Count pieces strictly between two orthogonally aligned squares. */
function countBetween(
  board: Board,
  r1: number, c1: number,
  r2: number, c2: number,
): number {
  let n = 0
  if (r1 === r2) {
    const lo = Math.min(c1, c2), hi = Math.max(c1, c2)
    for (let c = lo + 1; c < hi; c++) if (board[r1][c]) n++
  } else if (c1 === c2) {
    const lo = Math.min(r1, r2), hi = Math.max(r1, r2)
    for (let r = lo + 1; r < hi; r++) if (board[r][c1]) n++
  }
  return n
}

// ── Per-piece constants ────────────────────────────────────────────────────────

// Knight: [delta-row, delta-col, leg-row, leg-col]
// The "leg" square must be empty; otherwise the knight is blocked (馬腳).
const KNIGHT_OFFSETS: [number, number, number, number][] = [
  [-2, -1, -1,  0],
  [-2,  1, -1,  0],
  [ 2, -1,  1,  0],
  [ 2,  1,  1,  0],
  [-1, -2,  0, -1],
  [ 1, -2,  0, -1],
  [-1,  2,  0,  1],
  [ 1,  2,  0,  1],
]

// Elephant: [delta-row, delta-col, midpoint-row, midpoint-col]
// The midpoint (象眼/相眼) must be empty; cannot cross the river.
const ELEPHANT_OFFSETS: [number, number, number, number][] = [
  [-2, -2, -1, -1],
  [-2,  2, -1,  1],
  [ 2, -2,  1, -1],
  [ 2,  2,  1,  1],
]

const ORTHOGONAL: [number, number][] = [[0, 1], [0, -1], [1, 0], [-1, 0]]
const DIAGONAL:   [number, number][] = [[1, 1], [1, -1], [-1, 1], [-1, -1]]

// ── Pseudo-legal move generation (ignores leaving own general in check) ─────────

function pseudoMovesForPiece(board: Board, row: number, col: number): Pos[] {
  const piece = board[row][col]
  if (!piece) return []

  const side = getSide(piece)
  const type = piece[1]
  const moves: Pos[] = []

  switch (type) {
    // ── General (将/帅) ─────────────────────────────────────────────────────
    case 'G': {
      for (const [dr, dc] of ORTHOGONAL) {
        const r = row + dr, c = col + dc
        if (isInsidePalace(side, r, c) && !isSameSide(board[r]?.[c], side)) {
          moves.push([r, c])
        }
      }
      break
    }

    // ── Advisor (士/仕) ─────────────────────────────────────────────────────
    case 'A': {
      for (const [dr, dc] of DIAGONAL) {
        const r = row + dr, c = col + dc
        if (isInsidePalace(side, r, c) && !isSameSide(board[r]?.[c], side)) {
          moves.push([r, c])
        }
      }
      break
    }

    // ── Elephant (象/相) ────────────────────────────────────────────────────
    case 'E': {
      for (const [dr, dc, mr, mc] of ELEPHANT_OFFSETS) {
        const r = row + dr, c = col + dc
        const midR = row + mr, midC = col + mc
        if (!isInsideBoard(r, c)) continue
        if (isRiverCrossed(side, r)) continue        // cannot cross river
        if (board[midR]?.[midC]) continue            // elephant eye blocked
        if (isSameSide(board[r]?.[c], side)) continue
        moves.push([r, c])
      }
      break
    }

    // ── Knight (马/傌) ──────────────────────────────────────────────────────
    case 'N': {
      for (const [dr, dc, lr, lc] of KNIGHT_OFFSETS) {
        const r = row + dr, c = col + dc
        const legR = row + lr, legC = col + lc
        if (!isInsideBoard(r, c)) continue
        if (board[legR]?.[legC]) continue            // leg blocked
        if (isSameSide(board[r]?.[c], side)) continue
        moves.push([r, c])
      }
      break
    }

    // ── Rook (车/俥) ────────────────────────────────────────────────────────
    case 'R': {
      for (const [dr, dc] of ORTHOGONAL) {
        let r = row + dr, c = col + dc
        while (isInsideBoard(r, c)) {
          if (board[r][c]) {
            if (!isSameSide(board[r][c], side)) moves.push([r, c])
            break
          }
          moves.push([r, c])
          r += dr; c += dc
        }
      }
      break
    }

    // ── Cannon (炮/砲) ──────────────────────────────────────────────────────
    // Moves like a rook when not capturing.
    // To capture, must have exactly one piece ("screen") between it and the target.
    case 'C': {
      for (const [dr, dc] of ORTHOGONAL) {
        let r = row + dr, c = col + dc
        let jumped = false
        while (isInsideBoard(r, c)) {
          const target = board[r][c]
          if (!jumped) {
            if (target) {
              jumped = true                           // found the screen
            } else {
              moves.push([r, c])                     // can slide to empty
            }
          } else {
            if (target) {
              if (!isSameSide(target, side)) moves.push([r, c])   // capture
              break
            }
          }
          r += dr; c += dc
        }
      }
      break
    }

    // ── Pawn (卒/兵) ────────────────────────────────────────────────────────
    // Before crossing the river: only forward.
    // After crossing: forward + sideways (never backward).
    case 'P': {
      const fwd = side === 'r' ? -1 : 1        // red moves up (row-1), black down
      const crossed = isRiverCrossed(side, row)
      const dirs: [number, number][] = [[fwd, 0]]
      if (crossed) dirs.push([0, 1], [0, -1])
      for (const [dr, dc] of dirs) {
        const r = row + dr, c = col + dc
        if (!isInsideBoard(r, c)) continue
        if (isSameSide(board[r]?.[c], side)) continue
        moves.push([r, c])
      }
      break
    }
  }

  return moves
}

// ── Find pieces ────────────────────────────────────────────────────────────────

function findGeneral(board: Board, side: Side): Pos | null {
  const target = `${side}G`
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      if (board[r][c] === target) return [r, c]
    }
  }
  return null
}

// ── isGeneralFacing ────────────────────────────────────────────────────────────

/**
 * Returns true if the two generals are on the same column with no pieces
 * between them ("flying general / 对面将").
 *
 * Such a board state is always illegal: any move that creates it is forbidden.
 */
export function isGeneralFacing(board: Board): boolean {
  const rg = findGeneral(board, 'r')
  const bg = findGeneral(board, 'b')
  if (!rg || !bg) return false
  if (rg[1] !== bg[1]) return false                  // different columns
  return !hasPieceBetween(board, rg[0], rg[1], bg[0], bg[1])
}

// ── isInCheck ─────────────────────────────────────────────────────────────────

/**
 * Returns true if `side`'s general is under attack.
 * Accounts for:
 *   1. Direct attacks by any opponent piece (pseudo-legal reach).
 *   2. The flying-general rule (两将相对).
 */
export function isInCheck(board: Board, side: Side): boolean {
  const gen = findGeneral(board, side)
  if (!gen) return true          // no general on board → already lost

  const [gr, gc] = gen
  const opp: Side = side === 'r' ? 'b' : 'r'

  // 1. Any opponent piece that can reach the general's square?
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const piece = board[r][c]
      if (!piece || getSide(piece) !== opp) continue
      const pseudo = pseudoMovesForPiece(board, r, c)
      if (pseudo.some(([mr, mc]) => mr === gr && mc === gc)) return true
    }
  }

  // 2. Flying general
  if (isGeneralFacing(board)) return true

  return false
}

// ── makeMove ───────────────────────────────────────────────────────────────────

/**
 * Returns a new board with the piece at (fr,fc) moved to (tr,tc).
 * Does NOT validate legality — call isValidMove first.
 */
export function makeMove(
  board: Board,
  fr: number, fc: number,
  tr: number, tc: number,
): { board: Board; capturedPiece: string | null } {
  const newBoard = board.map(row => [...row])
  const capturedPiece = newBoard[tr][tc]
  newBoard[tr][tc] = newBoard[fr][fc]
  newBoard[fr][fc] = null
  return { board: newBoard, capturedPiece }
}

// ── getLegalMoves ──────────────────────────────────────────────────────────────

/**
 * Returns all fully legal destination squares for the piece at (row,col).
 * A move is legal iff it does not leave the mover's own general in check
 * (including the flying-general rule).
 */
export function getLegalMoves(board: Board, row: number, col: number): Pos[] {
  const piece = board[row][col]
  if (!piece) return []

  const side = getSide(piece)
  return pseudoMovesForPiece(board, row, col).filter(([tr, tc]) => {
    const { board: next } = makeMove(board, row, col, tr, tc)
    return !isInCheck(next, side)
  })
}

// ── isValidMove ────────────────────────────────────────────────────────────────

export function isValidMove(
  board: Board,
  fr: number, fc: number,
  tr: number, tc: number,
): boolean {
  return getLegalMoves(board, fr, fc).some(([r, c]) => r === tr && c === tc)
}

// ── hasAnyLegalMove ────────────────────────────────────────────────────────────

export function hasAnyLegalMove(board: Board, side: Side): boolean {
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const piece = board[r][c]
      if (!piece || getSide(piece) !== side) continue
      if (getLegalMoves(board, r, c).length > 0) return true
    }
  }
  return false
}

// ── isCheckmate ────────────────────────────────────────────────────────────────

/**
 * Returns true if `side` is in check AND has no legal move to escape.
 * Note: in Xiangqi, stalemate (no moves but not in check) is ALSO a loss
 * for the stalemated side — use isStalemate to detect that separately.
 */
export function isCheckmate(board: Board, side: Side): boolean {
  return isInCheck(board, side) && !hasAnyLegalMove(board, side)
}

/**
 * Returns true if `side` has no legal moves but is NOT in check.
 * In Xiangqi rules this is a loss for the stalemated side (困毙).
 */
export function isStalemate(board: Board, side: Side): boolean {
  return !isInCheck(board, side) && !hasAnyLegalMove(board, side)
}

// ── createInitialChineseChessBoard ─────────────────────────────────────────────

/**
 * Returns the standard opening position.
 *
 *  Row 0 (Black back rank): R N E A G A E N R
 *  Row 2 (Black cannons):     C . . . . . C
 *  Row 3 (Black pawns):     P . P . P . P . P
 *  ...river...
 *  Row 6 (Red pawns):       P . P . P . P . P
 *  Row 7 (Red cannons):       C . . . . . C
 *  Row 9 (Red back rank):   R N E A G A E N R
 */
export function createInitialChineseChessBoard(): Board {
  const b: Board = Array.from({ length: 10 }, () => Array(9).fill(null))

  // ── Black (top) ──────────────────────────────────────────────────────────
  b[0][0] = 'bR'; b[0][1] = 'bN'; b[0][2] = 'bE'; b[0][3] = 'bA'; b[0][4] = 'bG'
  b[0][5] = 'bA'; b[0][6] = 'bE'; b[0][7] = 'bN'; b[0][8] = 'bR'
  b[2][1] = 'bC'; b[2][7] = 'bC'
  b[3][0] = 'bP'; b[3][2] = 'bP'; b[3][4] = 'bP'; b[3][6] = 'bP'; b[3][8] = 'bP'

  // ── Red (bottom) ─────────────────────────────────────────────────────────
  b[9][0] = 'rR'; b[9][1] = 'rN'; b[9][2] = 'rE'; b[9][3] = 'rA'; b[9][4] = 'rG'
  b[9][5] = 'rA'; b[9][6] = 'rE'; b[9][7] = 'rN'; b[9][8] = 'rR'
  b[7][1] = 'rC'; b[7][7] = 'rC'
  b[6][0] = 'rP'; b[6][2] = 'rP'; b[6][4] = 'rP'; b[6][6] = 'rP'; b[6][8] = 'rP'

  return b
}
