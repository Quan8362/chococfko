'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import {
  createInitialBoard,
  swapTiles,
  findMatches,
  removeMatches,
  collapseBoard,
  fillBoard,
  hasPossibleMoves,
  calculateScore,
  BOARD_ROWS,
  BOARD_COLS,
  type Board,
  type MatchSet,
} from '@/lib/games/match3'

// ── localStorage ──────────────────────────────────────────────────────────────
const LS_BEST   = 'chococfko-match3-best-score'
const LS_PLAYED = 'chococfko-match3-games-played'

function lsGet(key: string): number { try { return Number(localStorage.getItem(key) ?? 0) } catch { return 0 } }
function lsSet(key: string, val: number) { try { localStorage.setItem(key, String(val)) } catch {} }

// ── Candy visual styles (CSS-only, no external assets) ────────────────────────
const CANDY: Array<{ from: string; to: string; border: string; shadow: string; label: string }> = [
  { from: '#fda4af', to: '#f43f5e', border: '#e11d48', shadow: 'rgba(244,63,94,0.45)',  label: 'pink'   },
  { from: '#93c5fd', to: '#2563eb', border: '#1d4ed8', shadow: 'rgba(37,99,235,0.40)',  label: 'blue'   },
  { from: '#6ee7b7', to: '#059669', border: '#047857', shadow: 'rgba(5,150,105,0.40)',  label: 'green'  },
  { from: '#fde68a', to: '#d97706', border: '#b45309', shadow: 'rgba(217,119,6,0.45)',  label: 'amber'  },
  { from: '#c4b5fd', to: '#7c3aed', border: '#5b21b6', shadow: 'rgba(124,58,237,0.40)', label: 'purple' },
  { from: '#5eead4', to: '#0d9488', border: '#0f766e', shadow: 'rgba(13,148,136,0.40)', label: 'teal'   },
]

type Phase = 'idle' | 'animating' | 'no_moves'
type DragState = { r: number; c: number; x: number; y: number } | null

// ── Main component ────────────────────────────────────────────────────────────
export default function Match3Game() {
  const t = useTranslations('games.match3')

  const [board, setBoard]             = useState<Board>([])
  const [dragging, setDragging]       = useState<{ r: number; c: number } | null>(null)
  const [matched, setMatched]         = useState<MatchSet>(new Set())
  const [score, setScore]             = useState(0)
  const [bestScore, setBestScore]     = useState(0)
  const [gamesPlayed, setGamesPlayed] = useState(0)
  const [phase, setPhase]             = useState<Phase>('idle')

  // Refs for latest values — avoids stale closures in setTimeout callbacks
  const boardRef  = useRef<Board>([])
  const scoreRef  = useRef(0)
  const phaseRef  = useRef<Phase>('idle')
  const dragRef   = useRef<DragState>(null)

  useEffect(() => { boardRef.current  = board  }, [board])
  useEffect(() => { scoreRef.current  = score  }, [score])
  useEffect(() => { phaseRef.current  = phase  }, [phase])

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    setBestScore(lsGet(LS_BEST))
    setGamesPlayed(lsGet(LS_PLAYED))
    const b = createInitialBoard()
    setBoard(b)
    boardRef.current = b
  }, [])

  // ── Process match chain ───────────────────────────────────────────────────
  const processChain = useCallback((
    currentBoard: Board,
    currentScore: number,
    onDone: (finalBoard: Board) => void,
  ) => {
    const matches = findMatches(currentBoard)

    if (matches.size === 0) {
      onDone(currentBoard)
      return
    }

    const pts = calculateScore(matches.size)
    setMatched(new Set(matches))

    setTimeout(() => {
      setMatched(new Set())
      const collapsed = collapseBoard(removeMatches(currentBoard, matches))
      setBoard(collapsed)
      boardRef.current = collapsed

      setTimeout(() => {
        const filled   = fillBoard(collapsed)
        const newScore = currentScore + pts
        setBoard(filled)
        boardRef.current = filled
        setScore(newScore)
        scoreRef.current = newScore
        setBestScore(prev => {
          const next = Math.max(prev, newScore)
          lsSet(LS_BEST, next)
          return next
        })

        setTimeout(() => {
          processChain(filled, newScore, onDone)
        }, 280)
      }, 280)
    }, 480)
  }, [])

  // ── Execute swap (shared by drag and any future input method) ─────────────
  const executeSwap = useCallback((sr: number, sc: number, tr: number, tc: number) => {
    if (phaseRef.current !== 'idle') return

    setPhase('animating')
    phaseRef.current = 'animating'

    const currentBoard = boardRef.current
    const currentScore = scoreRef.current

    const swapped = swapTiles(currentBoard, sr, sc, tr, tc)
    setBoard(swapped)
    boardRef.current = swapped

    setTimeout(() => {
      const matches = findMatches(swapped)

      if (matches.size === 0) {
        // No match → swap back
        const restored = swapTiles(swapped, sr, sc, tr, tc)
        setBoard(restored)
        boardRef.current = restored
        setTimeout(() => {
          setPhase('idle')
          phaseRef.current = 'idle'
        }, 280)
        return
      }

      processChain(swapped, currentScore, (finalBoard) => {
        if (!hasPossibleMoves(finalBoard)) {
          setPhase('no_moves')
          phaseRef.current = 'no_moves'
        } else {
          setPhase('idle')
          phaseRef.current = 'idle'
        }
      })
    }, 220)
  }, [processChain])

  // ── Pointer events (mouse drag + touch swipe) ─────────────────────────────
  const onPointerDown = useCallback((r: number, c: number, e: React.PointerEvent<HTMLButtonElement>) => {
    if (phaseRef.current !== 'idle') return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { r, c, x: e.clientX, y: e.clientY }
    setDragging({ r, c })
  }, [])

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    dragRef.current = null
    setDragging(null)

    if (!drag || phaseRef.current !== 'idle') return

    const dx    = e.clientX - drag.x
    const dy    = e.clientY - drag.y
    const absDx = Math.abs(dx)
    const absDy = Math.abs(dy)

    // Minimum 8px drag to count as a swap intent
    if (absDx < 8 && absDy < 8) return

    let tr = drag.r, tc = drag.c
    if (absDx >= absDy) {
      tc = dx > 0 ? drag.c + 1 : drag.c - 1
    } else {
      tr = dy > 0 ? drag.r + 1 : drag.r - 1
    }

    if (tr < 0 || tr >= BOARD_ROWS || tc < 0 || tc >= BOARD_COLS) return

    executeSwap(drag.r, drag.c, tr, tc)
  }, [executeSwap])

  const onPointerCancel = useCallback(() => {
    dragRef.current = null
    setDragging(null)
  }, [])

  // ── Restart ───────────────────────────────────────────────────────────────
  const handleRestart = useCallback(() => {
    const b = createInitialBoard()
    setBoard(b)
    boardRef.current = b
    setScore(0)
    scoreRef.current = 0
    setDragging(null)
    setMatched(new Set())
    setPhase('idle')
    phaseRef.current = 'idle'

    const n = lsGet(LS_PLAYED) + 1
    lsSet(LS_PLAYED, n)
    setGamesPlayed(n)
  }, [])

  // ── Render ────────────────────────────────────────────────────────────────
  const isAnimating = phase === 'animating'
  const isNoMoves   = phase === 'no_moves'

  return (
    <div className="flex flex-col items-center gap-5 w-full">

      {/* ══ Stats bar ══ */}
      <div className="w-full max-w-[520px] grid grid-cols-3 bg-paper border border-line rounded-2xl overflow-hidden shadow-sm">
        <div className="flex flex-col items-center gap-0.5 px-4 py-3 border-r border-line/50">
          <span className="text-[10.5px] font-bold uppercase tracking-wider text-muted/60">{t('score_label')}</span>
          <span className="font-mono font-bold text-[22px] text-ink tabular-nums leading-none">{score}</span>
        </div>
        <div className="flex flex-col items-center gap-0.5 px-4 py-3 border-r border-line/50">
          <span className="text-[10.5px] font-bold uppercase tracking-wider text-muted/60">
            🏆 {t('best_label')}
          </span>
          <span className="font-mono font-bold text-[22px] text-rose tabular-nums leading-none">{bestScore}</span>
        </div>
        <div className="flex flex-col items-center gap-0.5 px-4 py-3">
          <span className="text-[10.5px] font-bold uppercase tracking-wider text-muted/60">{t('games_played')}</span>
          <span className="font-mono font-bold text-[22px] text-ink tabular-nums leading-none">{gamesPlayed}</span>
        </div>
      </div>

      {/* ══ Game board card ══ */}
      <div className="w-full max-w-[520px] bg-paper border border-line rounded-3xl shadow-[0_8px_40px_-12px_rgba(36,26,23,0.12)] overflow-hidden">

        {/* Board header */}
        <div className="bg-cream/70 border-b border-line px-4 py-2.5 flex items-center justify-between">
          <p className="text-[12px] font-semibold text-muted/70">
            {isAnimating ? '⏳ …' : isNoMoves ? `⚠️ ${t('no_moves')}` : `👆 ${t('hint_drag')}`}
          </p>
          <button
            onClick={handleRestart}
            className="text-[12px] font-bold px-3.5 py-1.5 rounded-xl bg-rose text-white hover:bg-rose-deep transition-all shadow-[0_2px_8px_-2px_rgba(194,24,91,0.40)] active:scale-95"
          >
            {t('restart_btn')}
          </button>
        </div>

        {/* Board grid — touch-action:none prevents browser scroll interference */}
        <div className="relative p-3 sm:p-4">
          <div
            className="grid w-full select-none"
            style={{
              gridTemplateColumns: `repeat(${BOARD_COLS}, 1fr)`,
              gap: '4px',
              touchAction: 'none',
            }}
          >
            {board.map((row, r) =>
              row.map((tile, c) => {
                if (!tile) return (
                  <div key={`empty-${r}-${c}`} className="aspect-square rounded-xl bg-cream/60" />
                )

                const candy      = CANDY[tile.color]
                const isDragging = dragging?.r === r && dragging?.c === c
                const isMatched  = matched.has(`${r},${c}`)

                return (
                  <button
                    key={tile.id}
                    onPointerDown={e => onPointerDown(r, c, e)}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerCancel}
                    disabled={isAnimating}
                    aria-label={candy.label}
                    className={[
                      'aspect-square rounded-xl border-2 relative overflow-hidden',
                      'focus:outline-none transition-all duration-150',
                      isDragging
                        ? 'scale-110 z-10 ring-2 ring-offset-1 ring-white/80 cursor-grabbing'
                        : 'cursor-grab hover:scale-105 active:scale-95',
                      isMatched
                        ? 'scale-125 opacity-0 duration-300'
                        : '',
                      isAnimating ? 'cursor-default' : '',
                    ].join(' ')}
                    style={{
                      background: `radial-gradient(ellipse at 35% 30%, ${candy.from}, ${candy.to})`,
                      borderColor: isDragging ? '#fff' : candy.border,
                      boxShadow: isDragging
                        ? `0 0 0 3px ${candy.border}, 0 4px 16px -4px ${candy.shadow}`
                        : `0 2px 6px -2px ${candy.shadow}`,
                    }}
                  >
                    {/* Shine spot */}
                    <div
                      className="absolute top-1.5 left-1.5 w-[35%] h-[30%] rounded-full opacity-40 pointer-events-none"
                      style={{ background: 'rgba(255,255,255,0.9)' }}
                    />
                  </button>
                )
              })
            )}
          </div>

          {/* No-moves overlay */}
          {isNoMoves && (
            <div
              className="absolute inset-3 sm:inset-4 flex items-center justify-center rounded-2xl z-20"
              style={{ background: 'rgba(250,244,234,0.90)', backdropFilter: 'blur(8px)' }}
            >
              <div className="text-center px-6 py-6">
                <p className="text-[44px] mb-3 leading-none">🍬</p>
                <p className="font-serif font-bold text-[20px] text-ink mb-1">{t('no_moves')}</p>
                <p className="text-[13px] text-muted mb-5 leading-relaxed max-w-[200px] mx-auto">
                  {t('no_moves_sub')}
                </p>
                <button
                  onClick={handleRestart}
                  className="px-8 py-2.5 rounded-2xl bg-rose text-white font-bold text-[13.5px] hover:bg-rose-deep transition-all shadow-[0_4px_18px_-4px_rgba(194,24,91,0.5)] active:scale-95"
                >
                  {t('restart_btn')}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Scoring hint */}
        <div className="border-t border-line/40 px-4 py-2 flex items-center gap-3 text-[11px] text-muted/50 flex-wrap">
          <span>3 ✦ = 30pts</span>
          <span className="text-line">|</span>
          <span>4 ✦ = 40pts</span>
          <span className="text-line">|</span>
          <span>5 ✦ = 50pts</span>
          <span className="text-line">|</span>
          <span className="text-muted/40 italic">{t('chain_hint')}</span>
        </div>
      </div>

    </div>
  )
}
