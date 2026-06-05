'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import {
  createPuzzle,
  getConflicts,
  checkBoardComplete,
  type Difficulty,
  type Puzzle,
  type Board,
  type CellValue,
} from '@/lib/games/sudoku'

// ── localStorage ──────────────────────────────────────────────────────────────
const LS_BEST   = (d: Difficulty) => `chococfko-sudoku-best-${d}`
const LS_PLAYED = 'chococfko-sudoku-games-played'
const LS_WINS   = 'chococfko-sudoku-wins'

function lsGet(key: string): number { try { return Number(localStorage.getItem(key) ?? 0) } catch { return 0 } }
function lsSet(key: string, val: number) { try { localStorage.setItem(key, String(val)) } catch {} }

type Status = 'loading' | 'playing' | 'won'

// ── Main component ────────────────────────────────────────────────────────────
export default function SudokuGame() {
  const t = useTranslations('games.sudoku')

  const [puzzle, setPuzzle]         = useState<Puzzle>([])
  const [solution, setSolution]     = useState<Board>([])
  const [selected, setSelected]     = useState<[number, number] | null>(null)
  const [conflicts, setConflicts]   = useState<Set<string>>(new Set())
  const [difficulty, setDifficulty] = useState<Difficulty>('easy')
  const [status, setStatus]         = useState<Status>('loading')
  const [elapsed, setElapsed]       = useState(0)
  const [boardFullWrong, setBoardFullWrong] = useState(false)
  const [bestTimes, setBestTimes]   = useState<Record<Difficulty, number>>({
    easy: 0, medium: 0, hard: 0,
  })
  const [wins, setWins]             = useState(0)
  const [gamesPlayed, setGamesPlayed] = useState(0)

  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null)
  const genKeyRef     = useRef(0)

  // Always-current refs so effects/callbacks never see stale values
  const solutionRef   = useRef<Board>([])
  const elapsedRef    = useRef(0)
  const diffRef       = useRef<Difficulty>('easy')
  const statusRef     = useRef<Status>('loading')
  const selectedRef   = useRef<[number, number] | null>(null)
  const puzzleRef     = useRef<Puzzle>([])

  useEffect(() => { solutionRef.current  = solution  }, [solution])
  useEffect(() => { elapsedRef.current   = elapsed   }, [elapsed])
  useEffect(() => { diffRef.current      = difficulty }, [difficulty])
  useEffect(() => { statusRef.current    = status    }, [status])
  useEffect(() => { selectedRef.current  = selected  }, [selected])
  useEffect(() => { puzzleRef.current    = puzzle    }, [puzzle])

  // ── Load localStorage ─────────────────────────────────────────────────────
  useEffect(() => {
    setBestTimes({
      easy:   lsGet(LS_BEST('easy')),
      medium: lsGet(LS_BEST('medium')),
      hard:   lsGet(LS_BEST('hard')),
    })
    setWins(lsGet(LS_WINS))
    setGamesPlayed(lsGet(LS_PLAYED))
  }, [])

  // ── Generate new puzzle ───────────────────────────────────────────────────
  const startNewGame = useCallback((diff: Difficulty, countPlayed = false) => {
    if (timerRef.current) clearInterval(timerRef.current)
    setStatus('loading')
    statusRef.current = 'loading'
    setSelected(null)
    setConflicts(new Set())
    setElapsed(0)
    elapsedRef.current = 0
    setBoardFullWrong(false)
    genKeyRef.current++
    const key = genKeyRef.current

    setTimeout(() => {
      if (genKeyRef.current !== key) return
      const { puzzle: p, solution: s } = createPuzzle(diff)
      solutionRef.current = s
      setPuzzle(p)
      setSolution(s)
      setStatus('playing')
      statusRef.current = 'playing'
      if (countPlayed) {
        const n = lsGet(LS_PLAYED) + 1
        lsSet(LS_PLAYED, n)
        setGamesPlayed(n)
      }
    }, 30)
  }, [])

  // Initial game on mount
  useEffect(() => { startNewGame('easy', true) }, []) // eslint-disable-line

  // ── Timer ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (status === 'playing') {
      timerRef.current = setInterval(() => {
        setElapsed(e => {
          const next = e + 1
          elapsedRef.current = next
          return next
        })
      }, 1000)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [status])

  // ── Win detection — runs after every puzzle update ────────────────────────
  // Separated from enterNumber to avoid stale-closure issues.
  useEffect(() => {
    if (statusRef.current !== 'playing') return
    if (!puzzle.length || !solutionRef.current.length) return

    // Only check when all cells are filled
    const allFilled = puzzle.every(row => row.every(cell => cell.value !== 0))
    if (!allFilled) {
      setBoardFullWrong(false)
      return
    }

    const currentConflicts = getConflicts(puzzle)
    if (currentConflicts.size > 0) {
      // Board full but has conflicts — show hint, don't reset
      setBoardFullWrong(true)
      return
    }

    if (checkBoardComplete(puzzle, solutionRef.current)) {
      setBoardFullWrong(false)

      // Stop timer BEFORE state updates so elapsed is accurate
      if (timerRef.current) clearInterval(timerRef.current)

      const currentElapsed = elapsedRef.current
      const currentDiff    = diffRef.current

      // Persist results before changing status
      const prev = lsGet(LS_BEST(currentDiff))
      if (!prev || currentElapsed < prev) {
        lsSet(LS_BEST(currentDiff), currentElapsed)
        setBestTimes(p => ({ ...p, [currentDiff]: currentElapsed }))
      }
      const w = lsGet(LS_WINS) + 1
      lsSet(LS_WINS, w)
      setWins(w)

      // Set won LAST so overlay shows the correct time
      setStatus('won')
      statusRef.current = 'won'
    }
  }, [puzzle]) // eslint-disable-line react-hooks/exhaustive-deps
  // Note: deliberately omitting `status` from deps — this effect should only
  // fire on puzzle changes. The `statusRef.current` guard handles the check.

  // ── Number entry — ONLY updates board state, win detection is in useEffect ─
  const enterNumber = useCallback((n: CellValue | 0) => {
    if (statusRef.current !== 'playing') return

    const sel = selectedRef.current
    if (!sel) return
    const [r, c] = sel

    const currentPuzzle = puzzleRef.current
    if (!currentPuzzle[r]?.[c] || currentPuzzle[r][c].isGiven) return

    const next = currentPuzzle.map(row => row.map(cell => ({ ...cell })))
    next[r][c].value = n as CellValue

    const newConflicts = getConflicts(next)
    setConflicts(newConflicts)
    setPuzzle(next)
    // Win detection happens automatically in the useEffect above
  }, []) // no deps needed — all values accessed via refs

  // ── Keyboard input ────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (statusRef.current !== 'playing') return

      const n = parseInt(e.key)
      if (n >= 1 && n <= 9) {
        e.preventDefault()
        enterNumber(n as CellValue)
        return
      }
      if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
        e.preventDefault()
        enterNumber(0)
        return
      }

      const cur = selectedRef.current
      if (!cur) return
      const [r, c] = cur
      if (e.key === 'ArrowUp')    { e.preventDefault(); setSelected([Math.max(0, r - 1), c]) }
      if (e.key === 'ArrowDown')  { e.preventDefault(); setSelected([Math.min(8, r + 1), c]) }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); setSelected([r, Math.max(0, c - 1)]) }
      if (e.key === 'ArrowRight') { e.preventDefault(); setSelected([r, Math.min(8, c + 1)]) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enterNumber])

  // ── Helpers ───────────────────────────────────────────────────────────────
  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  const diffLabels: Record<Difficulty, string> = {
    easy:   t('difficulty_easy'),
    medium: t('difficulty_medium'),
    hard:   t('difficulty_hard'),
  }

  // Highlight derived values
  const selR    = selected?.[0] ?? -1
  const selC    = selected?.[1] ?? -1
  const selBoxR = selR >= 0 ? Math.floor(selR / 3) : -1
  const selBoxC = selC >= 0 ? Math.floor(selC / 3) : -1
  const selVal  = (selR >= 0 && puzzle[selR]?.[selC]?.value) || 0

  const getCellStyle = (r: number, c: number, val: CellValue, isGiven: boolean, isConflict: boolean) => {
    const isSel     = r === selR && c === selC
    const sameGroup = !isSel && selR >= 0 && (
      r === selR || c === selC ||
      (Math.floor(r / 3) === selBoxR && Math.floor(c / 3) === selBoxC)
    )
    const sameNum = !isSel && selVal !== 0 && val === selVal

    let bg = 'bg-paper'
    if (isSel)           bg = 'bg-rose/20'
    else if (isConflict) bg = 'bg-red-50'
    else if (sameNum)    bg = 'bg-rose/8'
    else if (sameGroup)  bg = 'bg-amber-50/60'

    const textColor = isGiven
      ? 'text-ink font-extrabold'
      : isConflict ? 'text-red-500 font-bold' : 'text-rose-800 font-bold'

    const ring = isSel ? 'ring-2 ring-inset ring-rose/50 z-10' : ''
    return `${bg} ${textColor} ${ring}`
  }

  const getCellBorders = (r: number, c: number) => {
    const right  = c === 8 ? '' : (c === 2 || c === 5) ? 'border-r-[2px] border-r-ink/25' : 'border-r border-r-line/20'
    const bottom = r === 8 ? '' : (r === 2 || r === 5) ? 'border-b-[2px] border-b-ink/25' : 'border-b border-b-line/20'
    return `${right} ${bottom}`
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col items-center gap-5 w-full">

      {/* ══ Toolbar ══ */}
      <div className="w-full max-w-[500px] bg-paper border border-line rounded-2xl px-4 py-3 flex items-center gap-2 flex-wrap">
        <div className="flex gap-1.5 flex-1 min-w-0">
          {(['easy', 'medium', 'hard'] as Difficulty[]).map(d => (
            <button
              key={d}
              onClick={() => { setDifficulty(d); startNewGame(d, true) }}
              className={`text-[11.5px] font-bold px-3 py-1.5 rounded-full border transition-all whitespace-nowrap ${
                difficulty === d
                  ? 'bg-rose text-white border-rose shadow-[0_2px_8px_-2px_rgba(194,24,91,0.45)]'
                  : 'bg-paper border-line text-muted hover:border-rose/40 hover:text-rose'
              }`}
            >
              {diffLabels[d]}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 text-muted/70 shrink-0">
          <span className="text-[13px]">⏱</span>
          <span className="font-mono font-bold text-[18px] text-ink tabular-nums min-w-[52px]">
            {formatTime(elapsed)}
          </span>
        </div>

        <button
          onClick={() => startNewGame(difficulty, true)}
          title={t('restart_btn')}
          className="w-8 h-8 shrink-0 rounded-xl border border-line bg-paper hover:border-rose/40 hover:bg-rose/5 flex items-center justify-center text-[15px] transition-all hover:scale-110 active:scale-95"
        >
          🔄
        </button>
      </div>

      {/* ══ Board card ══ */}
      <div className="relative w-full max-w-[500px] bg-paper border border-line rounded-3xl shadow-[0_8px_40px_-12px_rgba(36,26,23,0.12)] overflow-hidden">

        {status === 'loading' ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-muted/50">
            <div className="w-8 h-8 border-2 border-rose/30 border-t-rose rounded-full animate-spin" />
            <span className="text-[13px] font-medium">{t('generating')}</span>
          </div>
        ) : (
          <>
            {/* ── Board grid ── */}
            <div className="p-3 sm:p-4">
              <div
                className="border-2 border-ink/25 rounded-xl overflow-hidden w-full"
                style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)' }}
              >
                {puzzle.map((row, r) =>
                  row.map((cell, c) => {
                    const isConflict = conflicts.has(`${r},${c}`)
                    const cellStyle  = getCellStyle(r, c, cell.value, cell.isGiven, isConflict)
                    const borders    = getCellBorders(r, c)

                    return (
                      <button
                        key={`${r}-${c}`}
                        onClick={() => {
                          if (status !== 'playing') return
                          if (!cell.isGiven) setSelected([r, c])
                        }}
                        className={[
                          'aspect-square flex items-center justify-center relative',
                          'text-[clamp(11px,3.5vw,19px)] transition-colors duration-75',
                          borders,
                          cellStyle,
                          cell.isGiven ? 'cursor-default' : 'cursor-pointer hover:brightness-95',
                        ].join(' ')}
                      >
                        {cell.value !== 0 ? cell.value : null}
                      </button>
                    )
                  })
                )}
              </div>
            </div>

            {/* ── Board full but wrong banner ── */}
            {boardFullWrong && status === 'playing' && (
              <div className="mx-3 sm:mx-4 mb-2 px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
                <span className="text-[16px] flex-none">⚠️</span>
                <p className="text-[12.5px] font-semibold text-red-700">{t('board_full_wrong')}</p>
              </div>
            )}

            {/* ── Number pad ── */}
            <div className="px-3 sm:px-4 pb-3 sm:pb-4">
              <div className="grid grid-cols-5 gap-2">
                {([1, 2, 3, 4, 5, 6, 7, 8, 9] as CellValue[]).map(n => {
                  const isHighlit = selVal === n
                  return (
                    <button
                      key={n}
                      onClick={() => enterNumber(n)}
                      disabled={status !== 'playing'}
                      className={[
                        'aspect-square flex items-center justify-center rounded-xl font-bold text-[20px] border transition-all active:scale-90',
                        isHighlit
                          ? 'bg-rose text-white border-rose shadow-[0_2px_8px_-2px_rgba(194,24,91,0.4)]'
                          : 'bg-cream border-line text-ink hover:border-rose/40 hover:bg-rose/5',
                        status !== 'playing' ? 'opacity-40 cursor-default' : '',
                      ].join(' ')}
                    >
                      {n}
                    </button>
                  )
                })}
                <button
                  onClick={() => enterNumber(0)}
                  disabled={status !== 'playing'}
                  className={[
                    'aspect-square flex items-center justify-center rounded-xl border border-line bg-cream text-[16px] text-muted/70',
                    'hover:border-rose/40 hover:bg-rose/5 hover:text-rose transition-all active:scale-90 font-bold',
                    status !== 'playing' ? 'opacity-40 cursor-default' : '',
                  ].join(' ')}
                >
                  ✕
                </button>
              </div>

              <p className="hidden sm:block text-center text-[11px] text-muted/40 mt-2.5 font-medium">
                {t('keyboard_hint')}
              </p>
            </div>
          </>
        )}

        {/* ── Win overlay — shown on top, board stays visible underneath ── */}
        {status === 'won' && (
          <div
            className="absolute inset-0 flex items-center justify-center z-20 rounded-3xl"
            style={{ background: 'rgba(250,244,234,0.95)', backdropFilter: 'blur(12px)' }}
          >
            <div className="text-center px-8 py-8 max-w-[300px]">
              <p className="text-[52px] mb-3 leading-none">🎉</p>
              <p className="font-serif font-bold text-[22px] text-ink mb-3 leading-tight">
                {t('you_win')}
              </p>
              <div className="flex flex-col gap-1.5 mb-6 text-[13px] text-muted">
                <span>
                  {t('difficulty_label')}:{' '}
                  <span className="font-semibold text-ink">{diffLabels[difficulty]}</span>
                </span>
                <span>
                  {t('time_label')}:{' '}
                  <span className="font-mono font-bold text-rose text-[15px]">{formatTime(elapsed)}</span>
                </span>
                <span className="text-[12px] text-muted/60">
                  {t('wins_label')}: <span className="font-bold text-emerald-600">{wins}</span>
                </span>
              </div>
              <button
                onClick={() => startNewGame(difficulty, true)}
                className="w-full px-8 py-2.5 rounded-2xl bg-rose text-white font-bold text-[13.5px] hover:bg-rose-deep transition-all shadow-[0_4px_18px_-4px_rgba(194,24,91,0.5)] active:scale-95"
              >
                {t('restart_btn')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ══ Stats card ══ */}
      <div className="w-full max-w-[500px] bg-paper border border-line rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-line/50">
          <p className="text-[11px] font-bold text-muted/60 uppercase tracking-widest">
            🏆 {t('best_times_heading')}
          </p>
        </div>
        <div className="grid grid-cols-3 divide-x divide-line/50">
          {(['easy', 'medium', 'hard'] as Difficulty[]).map(d => (
            <div
              key={d}
              className={`flex flex-col items-center gap-0.5 px-3 py-3.5 transition-colors ${
                difficulty === d ? 'bg-rose/5' : ''
              }`}
            >
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted/50">
                {diffLabels[d]}
              </p>
              <p className="font-mono font-bold text-[18px] text-ink leading-none mt-0.5">
                {bestTimes[d] > 0
                  ? formatTime(bestTimes[d])
                  : <span className="text-[12px] font-medium text-muted/30">{t('no_record')}</span>
                }
              </p>
            </div>
          ))}
        </div>
        <div className="border-t border-line/50 px-5 py-2.5 flex gap-4 text-[12px] text-muted flex-wrap">
          <span className="flex items-center gap-1.5">
            <span className="font-bold text-emerald-600">{wins}</span>
            {t('wins_label')}
          </span>
          <span className="text-line/60">|</span>
          <span className="flex items-center gap-1.5">
            <span className="font-bold text-ink">{gamesPlayed}</span>
            {t('games_played')}
          </span>
        </div>
      </div>

    </div>
  )
}
