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

const CELL_SIZE: Record<Difficulty, number> = { easy: 44, medium: 32, hard: 24 }

const NUM_COLOR: Record<number, string> = {
  1: 'text-blue-600',
  2: 'text-emerald-600',
  3: 'text-red-600',
  4: 'text-indigo-800',
  5: 'text-red-800',
  6: 'text-cyan-600',
  7: 'text-zinc-800',
  8: 'text-muted',
}

// ── localStorage helpers ──────────────────────────────────────────────────────
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
  const [flags, setFlags]           = useState(0)
  const [elapsed, setElapsed]       = useState(0)
  const [flagMode, setFlagMode]     = useState(false)
  const [bestTimes, setBestTimes]   = useState<Partial<Record<Difficulty, number>>>({})
  const [wins, setWins]             = useState(0)
  const [losses, setLosses]         = useState(0)

  // ── Review-map state ────────────────────────────────────────────────────────
  // Which cell the player clicked on (that was a mine)
  const [explodedCell, setExplodedCell] = useState<{ row: number; col: number } | null>(null)
  // Whether the overlay is dismissed and the board map is shown
  const [showingMap, setShowingMap]     = useState(false)

  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null)
  const longPressRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMinesPlaced = useRef(false)

  const cfg      = DIFFICULTY_CONFIG[difficulty]
  const cellSize = CELL_SIZE[difficulty]

  // ── Load localStorage ──────────────────────────────────────────────────────
  useEffect(() => {
    setBestTimes({
      easy:   lsGet(LS_BEST('easy'))   ?? undefined,
      medium: lsGet(LS_BEST('medium')) ?? undefined,
      hard:   lsGet(LS_BEST('hard'))   ?? undefined,
    })
    setWins(lsGet(LS_WINS)   ?? 0)
    setLosses(lsGet(LS_LOSSES) ?? 0)
  }, [])

  // ── Start / reset ──────────────────────────────────────────────────────────
  const startGame = useCallback((diff?: Difficulty) => {
    const d = diff ?? difficulty
    if (diff) setDifficulty(d)
    const { rows, cols } = DIFFICULTY_CONFIG[d]
    setBoard(createEmptyBoard(rows, cols))
    setStatus('idle')
    setFlags(0)
    setElapsed(0)
    setFlagMode(false)
    setExplodedCell(null)
    setShowingMap(false)
    isMinesPlaced.current = false
    if (timerRef.current) clearInterval(timerRef.current)
  }, [difficulty])

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

    if (!isMinesPlaced.current) {
      isMinesPlaced.current = true
      let b = placeMines(currentBoard, cfg.mines, row, col)
      b = calculateAdjacentMines(b)
      currentBoard = b
      setStatus('playing')
    }

    if (currentBoard[row][col].isMine) {
      // Save which cell exploded, then reveal all mines
      setExplodedCell({ row, col })
      setBoard(revealAllMines(currentBoard))
      setStatus('lost')
      const n = (lsGet(LS_LOSSES) ?? 0) + 1
      lsSet(LS_LOSSES, n)
      setLosses(n)
      return
    }

    const next = revealCell(currentBoard, row, col)
    if (checkWin(next)) {
      setBoard(next)
      setStatus('won')
      const best = lsGet(LS_BEST(difficulty))
      if (best === null || elapsed < best) {
        lsSet(LS_BEST(difficulty), elapsed)
        setBestTimes(prev => ({ ...prev, [difficulty]: elapsed }))
      }
      const n = (lsGet(LS_WINS) ?? 0) + 1
      lsSet(LS_WINS, n)
      setWins(n)
    } else {
      setBoard(next)
    }
  }, [board, cfg.mines, difficulty, elapsed, status])

  const handleFlag = useCallback((row: number, col: number) => {
    if (status === 'won' || status === 'lost' || status === 'idle') return
    const cell = board[row]?.[col]
    if (!cell || cell.isRevealed) return
    const next = toggleFlag(board, row, col)
    setBoard(next)
    setFlags(f => next[row][col].isFlagged ? f + 1 : f - 1)
  }, [board, status])

  const onContextMenu = useCallback((e: React.MouseEvent, row: number, col: number) => {
    e.preventDefault()
    handleFlag(row, col)
  }, [handleFlag])

  const onTouchStart = useCallback((row: number, col: number) => {
    longPressRef.current = setTimeout(() => handleFlag(row, col), 500)
  }, [handleFlag])

  const onTouchEnd = useCallback(() => {
    if (longPressRef.current) clearTimeout(longPressRef.current)
  }, [])

  const onCellClick = useCallback((row: number, col: number) => {
    flagMode ? handleFlag(row, col) : handleReveal(row, col)
  }, [flagMode, handleFlag, handleReveal])

  // ── Derived ────────────────────────────────────────────────────────────────
  const minesLeft = cfg.mines - flags

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    return m > 0
      ? `${m}:${String(s % 60).padStart(2, '0')}`
      : `${s}${t('seconds_unit')}`
  }

  const diffLabels: Record<Difficulty, string> = {
    easy:   t('difficulty_easy'),
    medium: t('difficulty_medium'),
    hard:   t('difficulty_hard'),
  }

  const faceEmoji = status === 'won' ? '😎' : status === 'lost' ? '😵' : status === 'playing' ? '🙂' : '😴'

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col items-center gap-5 w-full">

      {/* ══ Main game card ══ */}
      <div className="w-full max-w-[860px] bg-paper border border-line rounded-3xl shadow-[0_8px_40px_-12px_rgba(36,26,23,0.12)] overflow-hidden">

        {/* ── Unified toolbar ── */}
        <div className="bg-cream/70 border-b border-line px-4 sm:px-5 py-3 flex items-center gap-3 flex-wrap">

          {/* Mines counter */}
          <div className="flex items-center gap-1.5 min-w-[70px]">
            <span className="text-[18px] leading-none">💣</span>
            <span className="font-mono font-bold text-[22px] text-ink tabular-nums leading-none">
              {minesLeft < 0 ? 0 : minesLeft}
            </span>
          </div>

          {/* Difficulty pills */}
          <div className="flex gap-1.5 flex-1 justify-center flex-wrap">
            {(['easy', 'medium', 'hard'] as Difficulty[]).map(d => (
              <button
                key={d}
                onClick={() => startGame(d)}
                className={`text-[12px] font-bold px-3.5 py-1.5 rounded-full border transition-all ${
                  difficulty === d
                    ? 'bg-rose text-white border-rose shadow-[0_2px_8px_-2px_rgba(194,24,91,0.45)]'
                    : 'bg-paper border-line text-muted hover:border-rose/40 hover:text-rose'
                }`}
              >
                {diffLabels[d]}
                <span className="ml-1 opacity-55 text-[10.5px] font-medium">
                  {DIFFICULTY_CONFIG[d].cols}×{DIFFICULTY_CONFIG[d].rows}
                </span>
              </button>
            ))}
          </div>

          {/* Timer + restart */}
          <div className="flex items-center gap-2.5 min-w-[90px] justify-end">
            <div className="flex items-center gap-1 text-muted/70">
              <span className="text-[14px]">⏱</span>
              <span className="font-mono font-bold text-[20px] text-ink tabular-nums leading-none min-w-[36px] text-right">
                {elapsed}
              </span>
            </div>
            <button
              onClick={() => startGame()}
              title={t('restart_btn')}
              className="w-9 h-9 rounded-xl border border-line bg-paper hover:border-rose/40 hover:bg-rose/5 flex items-center justify-center text-[22px] transition-all hover:scale-110 active:scale-95 shadow-sm"
            >
              {faceEmoji}
            </button>
          </div>
        </div>

        {/* ── Mobile flag mode toggle ── */}
        <div className="sm:hidden flex gap-2 px-4 pt-3 pb-1">
          {(['reveal', 'flag'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setFlagMode(mode === 'flag')}
              className={`flex-1 flex items-center justify-center gap-1.5 text-[12.5px] font-semibold py-2 rounded-xl border transition-colors ${
                (mode === 'flag') === flagMode
                  ? 'bg-rose text-white border-rose'
                  : 'bg-paper border-line text-muted'
              }`}
            >
              {mode === 'flag' ? <>🚩 {t('mode_flag')}</> : <>👆 {t('mode_reveal')}</>}
            </button>
          ))}
        </div>

        {/* ── Board area ── */}
        <div className="relative p-4 sm:p-5 flex justify-center">
          <div
            className="overflow-x-auto rounded-xl"
            style={{ maxWidth: '100%', WebkitOverflowScrolling: 'touch' }}
          >
            <div
              className="rounded-xl overflow-hidden border border-line/60 shadow-[inset_0_1px_4px_rgba(0,0,0,0.06)]"
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${cfg.cols}, ${cellSize}px)`,
                gridTemplateRows: `repeat(${cfg.rows}, ${cellSize}px)`,
                width: cfg.cols * cellSize + (cfg.cols - 1),
                gap: 1,
                background: 'rgb(var(--color-line, 232 221 207) / 0.5)',
              }}
            >
              {board.map((row, ri) =>
                row.map((cell, ci) => (
                  <BoardCell
                    key={`${ri},${ci}`}
                    cell={cell}
                    size={cellSize}
                    onClick={() => onCellClick(ri, ci)}
                    onContextMenu={e => onContextMenu(e, ri, ci)}
                    onTouchStart={() => onTouchStart(ri, ci)}
                    onTouchEnd={onTouchEnd}
                    gameStatus={status}
                    isExploded={explodedCell?.row === ri && explodedCell?.col === ci}
                  />
                ))
              )}
            </div>
          </div>

          {/* ── Result overlay — only for won, or lost BEFORE "view map" ── */}
          {(status === 'won' || (status === 'lost' && !showingMap)) && (
            <div
              className="absolute inset-4 sm:inset-5 flex items-center justify-center rounded-xl z-10"
              style={{ background: 'rgba(250,244,234,0.90)', backdropFilter: 'blur(6px)' }}
            >
              <div className="text-center px-6 py-5 max-w-[300px]">
                <p className="text-[44px] mb-2 leading-none">
                  {status === 'won' ? '🎉' : '💥'}
                </p>
                <p className={`font-serif font-bold text-[22px] mb-2 leading-tight ${
                  status === 'won' ? 'text-emerald-700' : 'text-red-700'
                }`}>
                  {status === 'won' ? t('you_win') : t('you_lose')}
                </p>
                <div className="flex flex-col gap-0.5 mb-4 text-[13px] text-muted">
                  <span>
                    {t('difficulty_label')}:{' '}
                    <span className="font-semibold text-ink">{diffLabels[difficulty]}</span>
                  </span>
                  {status === 'won' && (
                    <span>
                      {t('timer_label')}:{' '}
                      <span className="font-semibold text-ink">{formatTime(elapsed)}</span>
                    </span>
                  )}
                  {status === 'lost' && (
                    <span>
                      {t('timer_label')}:{' '}
                      <span className="font-semibold text-ink">{formatTime(elapsed)}</span>
                    </span>
                  )}
                </div>

                {status === 'lost' ? (
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => startGame()}
                      className="w-full px-6 py-2.5 rounded-2xl bg-rose text-white font-bold text-[13.5px] hover:bg-rose-deep transition-all shadow-[0_4px_18px_-4px_rgba(194,24,91,0.5)] active:scale-95"
                    >
                      {t('restart_btn')}
                    </button>
                    <button
                      onClick={() => setShowingMap(true)}
                      className="w-full px-6 py-2.5 rounded-2xl bg-paper border border-line text-ink font-bold text-[13.5px] hover:border-rose/40 hover:bg-rose/5 transition-all active:scale-95"
                    >
                      🗺️ {t('view_map')}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => startGame()}
                    className="px-8 py-2.5 rounded-2xl bg-rose text-white font-bold text-[13.5px] hover:bg-rose-deep transition-all shadow-[0_4px_18px_-4px_rgba(194,24,91,0.5)] active:scale-95"
                  >
                    {t('restart_btn')}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Status bar at bottom of card ── */}
        {status === 'idle' && (
          <div className="border-t border-line/50 px-5 py-2.5 text-center">
            <p className="text-[12px] text-muted/60 font-medium">
              👆 {t('click_to_start')}
            </p>
          </div>
        )}

        {/* ── Map-review banner (shown when viewing map after loss) ── */}
        {status === 'lost' && showingMap && (
          <div className="border-t border-line/50 px-4 py-2.5 bg-red-50/50 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[12px] font-semibold text-red-600/80 flex items-center gap-1.5">
              🗺️ {t('map_review_mode')}
            </p>
            <button
              onClick={() => startGame()}
              className="text-[12px] font-bold px-3.5 py-1.5 rounded-xl bg-rose text-white hover:bg-rose-deep transition-all shadow-[0_2px_8px_-2px_rgba(194,24,91,0.4)] active:scale-95"
            >
              {t('restart_btn')}
            </button>
          </div>
        )}
      </div>

      {/* ══ Legend (shown after loss when viewing map) ══ */}
      {status === 'lost' && showingMap && (
        <div className="w-full max-w-[860px] bg-paper border border-line rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-line/50">
            <p className="text-[11.5px] font-bold text-muted/70 uppercase tracking-widest">
              📖 {t('legend_heading')}
            </p>
          </div>
          <div className="px-5 py-3 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2">
            <LegendItem icon="💥" label={t('legend_exploded')} />
            <LegendItem icon="💣" label={t('legend_mine')} />
            <LegendItem icon="🚩" label={t('legend_correct_flag')} color="text-emerald-600" />
            <LegendItem icon="❌" label={t('legend_wrong_flag')} />
            <LegendItem icon="·" label={t('legend_safe')} color="text-muted/60" />
            <LegendItem icon="1–8" label={t('legend_numbers')} color="text-blue-600" />
          </div>
          <div className="px-5 pb-3">
            <p className="text-[11.5px] text-muted/50 italic">{t('learn_lesson')}</p>
          </div>
        </div>
      )}

      {/* ══ Stats card ══ */}
      <div className="w-full max-w-[860px] bg-paper border border-line rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-line/50 flex items-center justify-between">
          <p className="text-[11.5px] font-bold text-muted/70 uppercase tracking-widest flex items-center gap-1.5">
            🏆 {t('best_times_heading')}
          </p>
          <div className="flex items-center gap-3 text-[12px] text-muted">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
              <span className="font-bold text-emerald-600">{wins}</span>
              {t('wins_label')}
            </span>
            <span className="text-line/80">|</span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
              <span className="font-bold text-red-500">{losses}</span>
              {t('losses_label')}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-3 divide-x divide-line/50">
          {(['easy', 'medium', 'hard'] as Difficulty[]).map((d, i) => {
            const colors = [
              { dot: 'bg-emerald-400', label: 'text-emerald-700', bg: difficulty === d ? 'bg-emerald-50/60' : '' },
              { dot: 'bg-amber-400',   label: 'text-amber-700',   bg: difficulty === d ? 'bg-amber-50/60'   : '' },
              { dot: 'bg-red-400',     label: 'text-red-700',     bg: difficulty === d ? 'bg-red-50/40'     : '' },
            ][i]
            return (
              <div key={d} className={`flex flex-col items-center gap-1 px-4 py-4 ${colors.bg} transition-colors`}>
                <span className={`w-2.5 h-2.5 rounded-full ${colors.dot}`} />
                <p className={`text-[10.5px] font-bold uppercase tracking-widest ${colors.label}`}>
                  {diffLabels[d]}
                </p>
                <p className="font-mono font-bold text-[20px] text-ink leading-none">
                  {bestTimes[d] !== undefined
                    ? formatTime(bestTimes[d]!)
                    : <span className="text-[13px] font-medium text-muted/35">{t('no_best')}</span>
                  }
                </p>
                <p className="text-[10px] text-muted/50">
                  {DIFFICULTY_CONFIG[d].cols}×{DIFFICULTY_CONFIG[d].rows} · {DIFFICULTY_CONFIG[d].mines}💣
                </p>
              </div>
            )
          })}
        </div>
      </div>

    </div>
  )
}

// ── LegendItem ────────────────────────────────────────────────────────────────
function LegendItem({ icon, label, color }: { icon: string; label: string; color?: string }) {
  return (
    <div className="flex items-center gap-2 text-[12px]">
      <span className={`text-[14px] leading-none min-w-[20px] font-bold ${color ?? ''}`}>{icon}</span>
      <span className="text-muted/70">{label}</span>
    </div>
  )
}

// ── BoardCell ─────────────────────────────────────────────────────────────────
type CellProps = {
  cell:          Cell
  size:          number
  onClick:       () => void
  onContextMenu: (e: React.MouseEvent) => void
  onTouchStart:  () => void
  onTouchEnd:    () => void
  gameStatus:    GameStatus
  isExploded:    boolean
}

function BoardCell({ cell, size, onClick, onContextMenu, onTouchStart, onTouchEnd, gameStatus, isExploded }: CellProps) {
  const fontSize = size >= 40 ? 15 : size >= 30 ? 13 : 11
  const iconSize = size >= 40 ? 18 : size >= 30 ? 15 : 12

  let content: React.ReactNode = null
  let cls = ''

  // ── Lost-state rendering (map review) ──────────────────────────────────────
  if (gameStatus === 'lost') {
    if (isExploded) {
      // The mine the player clicked — most prominent
      cls = 'bg-red-500 border-red-400 cursor-default'
      content = <span style={{ fontSize: iconSize + 2 }}>💥</span>

    } else if (cell.isMine && cell.isFlagged) {
      // Correctly flagged mine ✓
      cls = 'bg-emerald-100 border-emerald-300 cursor-default'
      content = (
        <span style={{ fontSize: iconSize }} className="relative">
          🚩
          <span className="absolute -top-0.5 -right-1 text-[8px] font-black text-emerald-600">✓</span>
        </span>
      )

    } else if (cell.isMine && !cell.isFlagged) {
      // Unrevealed mine
      cls = 'bg-orange-50 border-orange-200 cursor-default'
      content = <span style={{ fontSize: iconSize }}>💣</span>

    } else if (!cell.isMine && cell.isFlagged) {
      // Wrongly placed flag ✗
      cls = 'bg-red-50 border-red-200 cursor-default'
      content = <span style={{ fontSize: iconSize }}>❌</span>

    } else if (cell.isRevealed) {
      // Already-opened safe cell — keep normal look
      cls = 'bg-[#e8ddcf]/50 border-[#e8ddcf]/30 cursor-default shadow-[inset_0_1px_3px_rgba(0,0,0,0.08)]'
      if (cell.adjacentMines > 0) {
        const color = NUM_COLOR[cell.adjacentMines] ?? 'text-ink'
        content = (
          <span className={`font-black select-none ${color}`} style={{ fontSize }}>
            {cell.adjacentMines}
          </span>
        )
      }

    } else {
      // Safe cell not yet opened — show adjacent mines dimly to help review
      cls = 'bg-cream/50 border-[#e8ddcf]/40 cursor-default'
      if (cell.adjacentMines > 0) {
        const color = NUM_COLOR[cell.adjacentMines] ?? 'text-ink'
        content = (
          <span className={`font-black select-none opacity-35 ${color}`} style={{ fontSize }}>
            {cell.adjacentMines}
          </span>
        )
      }
    }

    return (
      <div
        className={`flex items-center justify-center border transition-none select-none ${cls}`}
        style={{ width: size, height: size }}
      >
        {content}
      </div>
    )
  }

  // ── Normal game rendering ──────────────────────────────────────────────────
  if (cell.isRevealed) {
    if (cell.isMine) {
      cls = 'bg-red-400 border-red-300'
      content = <span style={{ fontSize: iconSize }}>💣</span>
    } else {
      cls = 'bg-[#e8ddcf]/50 border-[#e8ddcf]/30 cursor-default shadow-[inset_0_1px_3px_rgba(0,0,0,0.08)]'
      if (cell.adjacentMines > 0) {
        const color = NUM_COLOR[cell.adjacentMines] ?? 'text-ink'
        content = (
          <span className={`font-black select-none ${color}`} style={{ fontSize }}>
            {cell.adjacentMines}
          </span>
        )
      }
    }
  } else if (cell.isFlagged) {
    cls = 'bg-rose/15 border-rose/40 hover:bg-rose/20 cursor-pointer'
    content = <span style={{ fontSize: iconSize }}>🚩</span>
  } else {
    cls = [
      'bg-gradient-to-br from-[#fdf8f1] to-[#f0e8db]',
      'border-[#ddd0be]',
      'hover:from-[#fbeef5] hover:to-[#f5d9e8] hover:border-rose/30',
      'cursor-pointer active:scale-90 active:brightness-95',
      'shadow-[0_1px_2px_rgba(0,0,0,0.07),inset_0_1px_0_rgba(255,255,255,0.8)]',
    ].join(' ')
  }

  return (
    <button
      onClick={onClick}
      onContextMenu={onContextMenu}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchMove={onTouchEnd}
      className={`flex items-center justify-center border transition-all duration-75 select-none ${cls}`}
      style={{ width: size, height: size }}
      tabIndex={-1}
    >
      {content}
    </button>
  )
}
