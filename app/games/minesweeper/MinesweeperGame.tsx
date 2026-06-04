'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import {
  createEmptyBoard,
  placeMines,
  calculateAdjacentMines,
  revealCell,
  toggleFlag,
  checkWin,
  revealAllMines,
  DIFFICULTY_CONFIG,
  type Cell,
  type Difficulty,
  type GameStatus,
} from '@/lib/games/minesweeper'

// ── Constants ─────────────────────────────────────────────────────────────────
const LS_BEST   = (d: Difficulty) => `minesweeper-best-${d}`
const LS_WINS   = 'minesweeper-wins'
const LS_LOSSES = 'minesweeper-losses'

// Number colours matching classic Minesweeper
const NUM_COLOR: Record<number, string> = {
  1: 'text-blue-600',
  2: 'text-emerald-600',
  3: 'text-red-600',
  4: 'text-indigo-800',
  5: 'text-red-800',
  6: 'text-teal',
  7: 'text-ink',
  8: 'text-muted',
}

// ── LocalStorage helpers ──────────────────────────────────────────────────────
function lsGet(key: string): number | null {
  try { const v = localStorage.getItem(key); return v !== null ? Number(v) : null } catch { return null }
}
function lsSet(key: string, value: number) {
  try { localStorage.setItem(key, String(value)) } catch {}
}

// ── Main component ────────────────────────────────────────────────────────────
export default function MinesweeperGame() {
  const t = useTranslations('games.minesweeper')

  const [difficulty, setDifficulty] = useState<Difficulty>('easy')
  const [board, setBoard]           = useState<Cell[][]>([])
  const [status, setStatus]         = useState<GameStatus>('idle')
  const [flags, setFlags]           = useState(0)      // how many flags placed
  const [elapsed, setElapsed]       = useState(0)      // seconds
  const [flagMode, setFlagMode]     = useState(false)  // mobile toggle
  const [bestTimes, setBestTimes]   = useState<Partial<Record<Difficulty, number>>>({})
  const [wins, setWins]             = useState(0)
  const [losses, setLosses]         = useState(0)

  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null)
  const longPressRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMinesPlaced = useRef(false)

  const cfg = DIFFICULTY_CONFIG[difficulty]

  // ── Load localStorage on mount ─────────────────────────────────────────────
  useEffect(() => {
    setBestTimes({
      easy:   lsGet(LS_BEST('easy'))   ?? undefined,
      medium: lsGet(LS_BEST('medium')) ?? undefined,
      hard:   lsGet(LS_BEST('hard'))   ?? undefined,
    })
    setWins(lsGet(LS_WINS)   ?? 0)
    setLosses(lsGet(LS_LOSSES) ?? 0)
  }, [])

  // ── Start / reset game ─────────────────────────────────────────────────────
  const startGame = useCallback((diff?: Difficulty) => {
    const d = diff ?? difficulty
    if (diff) setDifficulty(d)
    const { rows, cols } = DIFFICULTY_CONFIG[d]
    setBoard(createEmptyBoard(rows, cols))
    setStatus('idle')
    setFlags(0)
    setElapsed(0)
    setFlagMode(false)
    isMinesPlaced.current = false
    if (timerRef.current) clearInterval(timerRef.current)
  }, [difficulty])

  // Init board on mount and when difficulty changes
  useEffect(() => { startGame() }, [difficulty]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Timer ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (status === 'playing') {
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [status])

  // ── Cell actions ───────────────────────────────────────────────────────────
  const handleReveal = useCallback((row: number, col: number) => {
    if (status === 'won' || status === 'lost') return
    const cell = board[row]?.[col]
    if (!cell || cell.isRevealed || cell.isFlagged) return

    let currentBoard = board

    // First click: place mines now (safe zone guaranteed)
    if (!isMinesPlaced.current) {
      isMinesPlaced.current = true
      const { mines } = cfg
      let b = placeMines(currentBoard, mines, row, col)
      b = calculateAdjacentMines(b)
      currentBoard = b
      setStatus('playing')
    }

    // If it's a mine → lose
    if (currentBoard[row][col].isMine) {
      const revealed = revealAllMines(currentBoard)
      setBoard(revealed)
      setStatus('lost')
      const newLosses = (lsGet(LS_LOSSES) ?? 0) + 1
      lsSet(LS_LOSSES, newLosses)
      setLosses(newLosses)
      return
    }

    const next = revealCell(currentBoard, row, col)
    if (checkWin(next)) {
      setBoard(next)
      setStatus('won')
      // Save best time
      const best = lsGet(LS_BEST(difficulty))
      if (best === null || elapsed < best) {
        lsSet(LS_BEST(difficulty), elapsed)
        setBestTimes(prev => ({ ...prev, [difficulty]: elapsed }))
      }
      const newWins = (lsGet(LS_WINS) ?? 0) + 1
      lsSet(LS_WINS, newWins)
      setWins(newWins)
    } else {
      setBoard(next)
    }
  }, [board, cfg, difficulty, elapsed, status])

  const handleFlag = useCallback((row: number, col: number) => {
    if (status === 'won' || status === 'lost') return
    if (status === 'idle') return // can't flag before game starts
    const cell = board[row]?.[col]
    if (!cell || cell.isRevealed) return
    const next = toggleFlag(board, row, col)
    setBoard(next)
    setFlags(f => next[row][col].isFlagged ? f + 1 : f - 1)
  }, [board, status])

  // ── Desktop right-click ────────────────────────────────────────────────────
  const onContextMenu = useCallback((e: React.MouseEvent, row: number, col: number) => {
    e.preventDefault()
    handleFlag(row, col)
  }, [handleFlag])

  // ── Mobile: tap vs long-press ──────────────────────────────────────────────
  const onTouchStart = useCallback((row: number, col: number) => {
    longPressRef.current = setTimeout(() => {
      handleFlag(row, col)
    }, 500)
  }, [handleFlag])

  const onTouchEnd = useCallback(() => {
    if (longPressRef.current) clearTimeout(longPressRef.current)
  }, [])

  const onCellClick = useCallback((row: number, col: number) => {
    if (flagMode) {
      handleFlag(row, col)
    } else {
      handleReveal(row, col)
    }
  }, [flagMode, handleFlag, handleReveal])

  // ── Derived ────────────────────────────────────────────────────────────────
  const minesLeft = cfg.mines - flags
  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return m > 0 ? `${m}:${String(sec).padStart(2, '0')}` : `${sec}${t('seconds_unit')}`
  }

  const diffLabels: Record<Difficulty, string> = {
    easy:   t('difficulty_easy'),
    medium: t('difficulty_medium'),
    hard:   t('difficulty_hard'),
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col items-center gap-5 w-full">

      {/* ── Difficulty selector ── */}
      <div className="flex gap-2 flex-wrap justify-center">
        {(['easy', 'medium', 'hard'] as Difficulty[]).map(d => (
          <button
            key={d}
            onClick={() => startGame(d)}
            className={`text-[12.5px] font-semibold px-4 py-1.5 rounded-full border transition-colors ${
              difficulty === d
                ? 'bg-rose text-white border-rose'
                : 'bg-paper border-line text-muted hover:border-rose/40 hover:text-rose'
            }`}
          >
            {diffLabels[d]}
            <span className="ml-1.5 opacity-60 text-[11px]">
              {DIFFICULTY_CONFIG[d].rows}×{DIFFICULTY_CONFIG[d].cols}
            </span>
          </button>
        ))}
      </div>

      {/* ── Control bar ── */}
      <div className="flex items-center justify-between w-full max-w-[600px] bg-paper border border-line rounded-2xl px-4 py-3 gap-3 flex-wrap">
        {/* Mines left */}
        <div className="flex items-center gap-1.5">
          <span className="text-[16px]">💣</span>
          <span className="font-mono font-bold text-[18px] text-ink tabular-nums min-w-[28px]">
            {minesLeft}
          </span>
          <span className="text-[11px] text-muted/60">{t('mines_left')}</span>
        </div>

        {/* Status + restart */}
        <button
          onClick={() => startGame()}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-rose/30 text-rose hover:bg-rose/5 text-[12.5px] font-semibold transition-colors"
          title={t('restart_btn')}
        >
          <span className="text-[18px]">
            {status === 'won' ? '😎' : status === 'lost' ? '😵' : '🙂'}
          </span>
          {t('restart_btn')}
        </button>

        {/* Timer */}
        <div className="flex items-center gap-1.5">
          <span className="text-[14px]">⏱</span>
          <span className="font-mono font-bold text-[18px] text-ink tabular-nums min-w-[40px]">
            {elapsed}
          </span>
          <span className="text-[11px] text-muted/60">{t('timer_label')}</span>
        </div>
      </div>

      {/* ── Mobile flag mode toggle ── */}
      <div className="flex gap-2 sm:hidden">
        {(['reveal', 'flag'] as const).map(mode => (
          <button
            key={mode}
            onClick={() => setFlagMode(mode === 'flag')}
            className={`flex items-center gap-1.5 text-[12.5px] font-semibold px-4 py-1.5 rounded-full border transition-colors ${
              (mode === 'flag') === flagMode
                ? 'bg-rose text-white border-rose'
                : 'bg-paper border-line text-muted hover:border-rose/40 hover:text-rose'
            }`}
          >
            {mode === 'flag' ? <>🚩 {t('mode_flag')}</> : <>👆 {t('mode_reveal')}</>}
          </button>
        ))}
      </div>

      {/* ── Board ── */}
      <div className="w-full overflow-x-auto pb-1" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div
          className="inline-grid gap-px bg-line/30 border border-line rounded-xl overflow-hidden mx-auto"
          style={{ gridTemplateColumns: `repeat(${cfg.cols}, minmax(0, 1fr))` }}
        >
          {board.map((row, ri) =>
            row.map((cell, ci) => (
              <BoardCell
                key={`${ri},${ci}`}
                cell={cell}
                onClick={() => onCellClick(ri, ci)}
                onContextMenu={e => onContextMenu(e, ri, ci)}
                onTouchStart={() => onTouchStart(ri, ci)}
                onTouchEnd={onTouchEnd}
                cols={cfg.cols}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Result overlay ── */}
      {(status === 'won' || status === 'lost') && (
        <div className={`w-full max-w-[360px] rounded-2xl border px-6 py-5 text-center ${
          status === 'won'
            ? 'bg-emerald-50 border-emerald-200'
            : 'bg-red-50 border-red-200'
        }`}>
          <p className="text-[32px] mb-1">{status === 'won' ? '🎉' : '💥'}</p>
          <p className={`font-serif font-bold text-[20px] mb-1 ${
            status === 'won' ? 'text-emerald-700' : 'text-red-700'
          }`}>
            {status === 'won' ? t('you_win') : t('you_lose')}
          </p>
          {status === 'won' && (
            <p className="text-[13px] text-muted mb-1">
              {t('timer_label')}: <span className="font-semibold">{formatTime(elapsed)}</span>
            </p>
          )}
          <p className="text-[13px] text-muted mb-4">
            {t('difficulty_label')}: <span className="font-semibold">{diffLabels[difficulty]}</span>
          </p>
          <button
            onClick={() => startGame()}
            className="px-7 py-2.5 rounded-2xl bg-rose text-white font-semibold text-[13.5px] hover:bg-rose-deep transition-all shadow-[0_4px_14px_-4px_rgba(194,24,91,0.45)]"
          >
            {t('restart_btn')}
          </button>
        </div>
      )}

      {/* ── Best times & stats ── */}
      <div className="w-full max-w-[500px] bg-paper border border-line rounded-2xl px-5 py-4">
        <p className="text-[11px] font-bold text-muted/60 uppercase tracking-widest mb-3">
          {t('best_times_heading')}
        </p>
        <div className="grid grid-cols-3 gap-3 mb-3">
          {(['easy', 'medium', 'hard'] as Difficulty[]).map(d => (
            <div key={d} className="text-center">
              <p className="text-[10.5px] font-semibold text-muted/60 uppercase mb-0.5">{diffLabels[d]}</p>
              <p className="font-mono font-bold text-[15px] text-ink">
                {bestTimes[d] !== undefined
                  ? formatTime(bestTimes[d]!)
                  : <span className="text-[11px] text-muted/40">{t('no_best')}</span>
                }
              </p>
            </div>
          ))}
        </div>
        <div className="flex justify-center gap-6 border-t border-line/50 pt-3 text-[12px] text-muted">
          <span>
            <span className="font-bold text-emerald-600">{wins}</span> {t('wins_label')}
          </span>
          <span>
            <span className="font-bold text-red-500">{losses}</span> {t('losses_label')}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── BoardCell ─────────────────────────────────────────────────────────────────
type CellProps = {
  cell:          Cell
  onClick:       () => void
  onContextMenu: (e: React.MouseEvent) => void
  onTouchStart:  () => void
  onTouchEnd:    () => void
  cols:          number
}

function BoardCell({ cell, onClick, onContextMenu, onTouchStart, onTouchEnd, cols }: CellProps) {
  const size = cols <= 9 ? 36 : cols <= 16 ? 28 : 22

  let content: React.ReactNode = null
  let bg   = 'bg-cream/70 hover:bg-cream border-cream/40 cursor-pointer active:scale-95'
  let text = ''

  if (cell.isRevealed) {
    bg = cell.isMine
      ? 'bg-red-400 border-red-500 cursor-default'
      : 'bg-paper border-line/50 cursor-default'
    if (cell.isMine) {
      content = <span className="text-[14px] leading-none select-none">💣</span>
    } else if (cell.adjacentMines > 0) {
      text = NUM_COLOR[cell.adjacentMines] ?? 'text-ink'
      content = (
        <span className={`font-bold select-none leading-none ${text}`} style={{ fontSize: size > 28 ? 14 : 11 }}>
          {cell.adjacentMines}
        </span>
      )
    }
  } else if (cell.isFlagged) {
    bg = 'bg-rose/10 border-rose/30 cursor-pointer'
    content = <span className="text-[13px] leading-none select-none">🚩</span>
  }

  return (
    <button
      onClick={onClick}
      onContextMenu={onContextMenu}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchMove={onTouchEnd}
      className={`flex items-center justify-center border transition-all duration-75 ${bg}`}
      style={{ width: size, height: size }}
      tabIndex={-1}
    >
      {content}
    </button>
  )
}
