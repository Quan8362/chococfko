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

// ── Candy definitions ─────────────────────────────────────────────────────────
type Pattern = 'diagonal' | 'horizontal' | 'dots' | 'swirl' | 'waves' | 'plain'

type CandyDef = {
  id: number
  label: string
  from: string
  to: string
  wrap: string
  border: string
  shadow: string
  pattern: Pattern
}

// tile.color index 0–5
const CANDY: CandyDef[] = [
  { id: 0, label: 'pink',   from: '#fda4af', to: '#f43f5e', wrap: '#fecdd3', border: '#e11d48', shadow: 'rgba(244,63,94,0.50)',   pattern: 'diagonal'   },
  { id: 1, label: 'blue',   from: '#93c5fd', to: '#2563eb', wrap: '#bfdbfe', border: '#1d4ed8', shadow: 'rgba(37,99,235,0.45)',   pattern: 'plain'      },
  { id: 2, label: 'green',  from: '#6ee7b7', to: '#059669', wrap: '#a7f3d0', border: '#047857', shadow: 'rgba(5,150,105,0.45)',   pattern: 'dots'       },
  { id: 3, label: 'amber',  from: '#fde68a', to: '#d97706', wrap: '#fef08a', border: '#b45309', shadow: 'rgba(217,119,6,0.50)',   pattern: 'horizontal' },
  { id: 4, label: 'purple', from: '#c4b5fd', to: '#7c3aed', wrap: '#ddd6fe', border: '#5b21b6', shadow: 'rgba(124,58,237,0.45)', pattern: 'swirl'      },
  { id: 5, label: 'teal',   from: '#5eead4', to: '#0d9488', wrap: '#99f6e4', border: '#0f766e', shadow: 'rgba(13,148,136,0.45)', pattern: 'waves'      },
]

// ── CandyIcon ─────────────────────────────────────────────────────────────────
// viewBox 0 0 64 64
// Body  : cx=32 cy=32 rx=20 ry=13  (bigger oval — fills ~62% of cell width)
// Left body edge x=12, right x=52
// Wrapper: 3 lobes per side — upper (diagonal up-left), middle (horizontal), lower (diagonal down-left)
// Middle lobe breaks the X-shape and reads clearly as twisted candy wrapper 🍬
function CandyIcon({ candy, isDragging }: { candy: CandyDef; isDragging: boolean }) {
  const gId    = `cg${candy.id}`
  const clipId = `cc${candy.id}`

  return (
    <svg
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-full block"
      style={{
        filter: isDragging
          ? `drop-shadow(0 0 7px ${candy.border}) drop-shadow(0 3px 14px ${candy.shadow})`
          : `drop-shadow(0 2px 8px ${candy.shadow})`,
      }}
    >
      <defs>
        <radialGradient id={gId} cx="35%" cy="28%" r="72%">
          <stop offset="0%"   stopColor={candy.from} />
          <stop offset="100%" stopColor={candy.to}   />
        </radialGradient>
        <clipPath id={clipId}>
          <ellipse cx="32" cy="32" rx="20" ry="13" />
        </clipPath>
      </defs>

      {/* ═══ Left wrapper — 3 lobes, all behind body ═══ */}
      {/* Upper: fans diagonally up-left */}
      <path d="M 12,28 Q 4,18 1,13 Q 8,20 12,24 Z"
        fill={candy.wrap} stroke={candy.border} strokeWidth="0.9" opacity="0.96" />
      {/* Middle: goes straight left — breaks X shape, reads as candy wrapper */}
      <path d="M 12,30 Q 2,28 0,32 Q 2,36 12,34 Z"
        fill={candy.wrap} stroke={candy.border} strokeWidth="0.9" opacity="0.96" />
      {/* Lower: fans diagonally down-left */}
      <path d="M 12,36 Q 4,46 1,51 Q 8,44 12,40 Z"
        fill={candy.wrap} stroke={candy.border} strokeWidth="0.9" opacity="0.96" />

      {/* Gloss on left upper/lower lobes */}
      <path d="M 12,28 Q 5,19 2,15 Q 9,21 12,25 Z" fill="rgba(255,255,255,0.30)" />
      <path d="M 12,36 Q 5,45 2,49 Q 9,45 12,41 Z" fill="rgba(255,255,255,0.30)" />

      {/* ═══ Right wrapper — 3 lobes mirrored ═══ */}
      {/* Upper */}
      <path d="M 52,28 Q 60,18 63,13 Q 56,20 52,24 Z"
        fill={candy.wrap} stroke={candy.border} strokeWidth="0.9" opacity="0.96" />
      {/* Middle */}
      <path d="M 52,30 Q 62,28 64,32 Q 62,36 52,34 Z"
        fill={candy.wrap} stroke={candy.border} strokeWidth="0.9" opacity="0.96" />
      {/* Lower */}
      <path d="M 52,36 Q 60,46 63,51 Q 56,44 52,40 Z"
        fill={candy.wrap} stroke={candy.border} strokeWidth="0.9" opacity="0.96" />

      {/* Gloss on right upper/lower lobes */}
      <path d="M 52,28 Q 59,19 62,15 Q 55,21 52,25 Z" fill="rgba(255,255,255,0.30)" />
      <path d="M 52,36 Q 59,45 62,49 Q 55,45 52,41 Z" fill="rgba(255,255,255,0.30)" />

      {/* Pinch shadow at wrapper-body junction */}
      <ellipse cx="12" cy="32" rx="1.5" ry="8" fill={candy.border} opacity="0.18" />
      <ellipse cx="52" cy="32" rx="1.5" ry="8" fill={candy.border} opacity="0.18" />

      {/* ═══ Body ═══ */}
      <ellipse cx="32" cy="32" rx="20" ry="13" fill={`url(#${gId})`} />

      {/* Bottom depth */}
      <g clipPath={`url(#${clipId})`}>
        <ellipse cx="32" cy="41" rx="18" ry="8" fill="rgba(0,0,0,0.12)" />
      </g>

      {/* ═══ Pattern — clipped to body ═══ */}
      <g clipPath={`url(#${clipId})`}>
        {candy.pattern === 'diagonal' && (
          <g transform="translate(32,32) rotate(42)">
            <rect x="-22" y="-11" width="44" height="5"   rx="2.5" fill="rgba(255,255,255,0.26)" />
            <rect x="-22" y="-2"  width="44" height="5"   rx="2.5" fill="rgba(255,255,255,0.26)" />
            <rect x="-22" y="7"   width="44" height="5"   rx="2.5" fill="rgba(255,255,255,0.26)" />
          </g>
        )}
        {candy.pattern === 'horizontal' && (
          <>
            <rect x="12" y="27" width="40" height="4.5" rx="2.2" fill="rgba(255,255,255,0.28)" />
            <rect x="12" y="35" width="40" height="4.5" rx="2.2" fill="rgba(255,255,255,0.28)" />
          </>
        )}
        {candy.pattern === 'dots' && (
          <>
            <circle cx="26" cy="29" r="3.2" fill="rgba(255,255,255,0.30)" />
            <circle cx="38" cy="35" r="3.2" fill="rgba(255,255,255,0.30)" />
            <circle cx="29" cy="37" r="2.6" fill="rgba(255,255,255,0.24)" />
            <circle cx="40" cy="25" r="2.6" fill="rgba(255,255,255,0.24)" />
          </>
        )}
        {candy.pattern === 'swirl' && (
          <path
            d="M32,21 C40,23 43,31 37,37 C31,43 22,39 21,33 C20,27 26,23 30,26 C34,29 33,35 30,36"
            stroke="rgba(255,255,255,0.40)" strokeWidth="2.8" fill="none" strokeLinecap="round"
          />
        )}
        {candy.pattern === 'waves' && (
          <>
            <path d="M13,27 Q20,22 27,27 Q34,32 41,27 Q47,22 51,27"
              stroke="rgba(255,255,255,0.34)" strokeWidth="2.4" fill="none" strokeLinecap="round" />
            <path d="M13,37 Q20,32 27,37 Q34,42 41,37 Q47,32 51,37"
              stroke="rgba(255,255,255,0.34)" strokeWidth="2.4" fill="none" strokeLinecap="round" />
          </>
        )}
        {candy.pattern === 'plain' && (
          <>
            <ellipse cx="27" cy="26" rx="10" ry="5.5" fill="rgba(255,255,255,0.28)" transform="rotate(-10 27 26)" />
            <ellipse cx="37" cy="38" rx="7"  ry="3.5" fill="rgba(0,0,0,0.06)"       transform="rotate(10 37 38)" />
          </>
        )}
      </g>

      {/* ═══ Glossy shine — clipped to body ═══ */}
      <g clipPath={`url(#${clipId})`}>
        <ellipse cx="24" cy="24" rx="9" ry="5.5"
          fill="rgba(255,255,255,0.55)"
          transform="rotate(-22 24 24)" />
        <circle cx="20" cy="21" r="3.5" fill="rgba(255,255,255,0.78)" />
      </g>

      {/* ═══ Body border ═══ */}
      <ellipse cx="32" cy="32" rx="20" ry="13"
        fill="none" stroke={candy.border} strokeWidth="1.5" />

      {isDragging && (
        <ellipse cx="32" cy="32" rx="20" ry="13" fill="rgba(255,255,255,0.22)" />
      )}
    </svg>
  )
}

// ── Types ─────────────────────────────────────────────────────────────────────
type Phase    = 'idle' | 'animating' | 'no_moves'
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

  const boardRef = useRef<Board>([])
  const scoreRef = useRef(0)
  const phaseRef = useRef<Phase>('idle')
  const dragRef  = useRef<DragState>(null)

  useEffect(() => { boardRef.current = board }, [board])
  useEffect(() => { scoreRef.current = score }, [score])
  useEffect(() => { phaseRef.current = phase }, [phase])

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
    if (matches.size === 0) { onDone(currentBoard); return }

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
        setTimeout(() => { processChain(filled, newScore, onDone) }, 280)
      }, 280)
    }, 480)
  }, [])

  // ── Execute swap ──────────────────────────────────────────────────────────
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
        const restored = swapTiles(swapped, sr, sc, tr, tc)
        setBoard(restored)
        boardRef.current = restored
        setTimeout(() => { setPhase('idle'); phaseRef.current = 'idle' }, 280)
        return
      }
      processChain(swapped, currentScore, (finalBoard) => {
        if (!hasPossibleMoves(finalBoard)) {
          setPhase('no_moves'); phaseRef.current = 'no_moves'
        } else {
          setPhase('idle'); phaseRef.current = 'idle'
        }
      })
    }, 220)
  }, [processChain])

  // ── Pointer events ────────────────────────────────────────────────────────
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
    if (absDx < 8 && absDy < 8) return

    let tr = drag.r, tc = drag.c
    if (absDx >= absDy) { tc = dx > 0 ? drag.c + 1 : drag.c - 1 }
    else                 { tr = dy > 0 ? drag.r + 1 : drag.r - 1 }

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
          <span className="text-[10.5px] font-bold uppercase tracking-wider text-muted/60">🏆 {t('best_label')}</span>
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

        {/* Board grid */}
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
                  <div
                    key={`empty-${r}-${c}`}
                    className="aspect-square rounded-xl"
                    style={{ background: 'rgba(0,0,0,0.05)' }}
                  />
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
                      'aspect-square relative',
                      'focus:outline-none transition-all duration-150',
                      isDragging
                        ? 'scale-110 z-10 cursor-grabbing'
                        : 'cursor-grab hover:scale-105 active:scale-95',
                      isMatched ? 'scale-125 opacity-0 duration-300' : '',
                      isAnimating ? 'cursor-default' : '',
                    ].join(' ')}
                  >
                    <CandyIcon candy={candy} isDragging={isDragging} />
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
