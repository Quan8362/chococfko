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
type Pattern   = 'diagonal' | 'horizontal' | 'dots' | 'swirl' | 'sparkle' | 'plain'
type WrapShape = 'standard' | 'rounded' | 'sharp'

type CandyDef = {
  id: number
  label: string
  from: string      // body gradient light
  to: string        // body gradient dark
  wrap: string      // wrapper petal color
  border: string    // ring/stroke color
  shadow: string    // drop-shadow color
  pattern: Pattern
  wrapShape: WrapShape
}

// Each candy maps to tile.color index 0–5
const CANDY: CandyDef[] = [
  { id: 0, label: 'pink',   from: '#fda4af', to: '#f43f5e', wrap: '#fecdd3', border: '#e11d48', shadow: 'rgba(244,63,94,0.50)',   pattern: 'diagonal',   wrapShape: 'standard' },
  { id: 1, label: 'blue',   from: '#93c5fd', to: '#2563eb', wrap: '#bfdbfe', border: '#1d4ed8', shadow: 'rgba(37,99,235,0.45)',   pattern: 'plain',      wrapShape: 'rounded'  },
  { id: 2, label: 'green',  from: '#6ee7b7', to: '#059669', wrap: '#a7f3d0', border: '#047857', shadow: 'rgba(5,150,105,0.45)',   pattern: 'dots',       wrapShape: 'standard' },
  { id: 3, label: 'amber',  from: '#fde68a', to: '#d97706', wrap: '#fef08a', border: '#b45309', shadow: 'rgba(217,119,6,0.50)',   pattern: 'horizontal', wrapShape: 'sharp'    },
  { id: 4, label: 'purple', from: '#c4b5fd', to: '#7c3aed', wrap: '#ddd6fe', border: '#5b21b6', shadow: 'rgba(124,58,237,0.45)', pattern: 'swirl',      wrapShape: 'sharp'    },
  { id: 5, label: 'teal',   from: '#5eead4', to: '#0d9488', wrap: '#99f6e4', border: '#0f766e', shadow: 'rgba(13,148,136,0.45)', pattern: 'sparkle',    wrapShape: 'rounded'  },
]

// ── Wrapper petal SVG paths (in 64×64 viewBox) ────────────────────────────────
// Each set: [left-upper, left-lower, right-upper, right-lower]
const WRAP_PATHS: Record<WrapShape, string[]> = {
  // Teardrop petals — balanced, mid-length
  standard: [
    'M17,30 C12,22 5,15 2,12 C6,18 11,25 16,30 Z',
    'M17,34 C12,42 5,49 2,52 C6,46 11,39 16,34 Z',
    'M47,30 C52,22 59,15 62,12 C58,18 53,25 48,30 Z',
    'M47,34 C52,42 59,49 62,52 C58,46 53,39 48,34 Z',
  ],
  // Wider, softer petals that fan out more
  rounded: [
    'M17,30 C13,23 7,17 3,15 C5,20 10,26 15,30 Z',
    'M17,34 C13,41 7,47 3,49 C5,44 10,38 15,34 Z',
    'M47,30 C51,23 57,17 61,15 C59,20 54,26 49,30 Z',
    'M47,34 C51,41 57,47 61,49 C59,44 54,38 49,34 Z',
  ],
  // Narrow, pointy petals
  sharp: [
    'M17,30 C10,20 3,12 1,10 C3,17 9,24 15,30 Z',
    'M17,34 C10,44 3,52 1,54 C3,47 9,40 15,34 Z',
    'M47,30 C54,20 61,12 63,10 C61,17 55,24 49,30 Z',
    'M47,34 C54,44 61,52 63,54 C61,47 55,40 49,34 Z',
  ],
}

// ── Candy icon — inline SVG wrapped-candy shape ───────────────────────────────
function CandyIcon({ candy, isDragging }: { candy: CandyDef; isDragging: boolean }) {
  const gId    = `cg${candy.id}`
  const clipId = `ccp${candy.id}`
  const paths  = WRAP_PATHS[candy.wrapShape]

  return (
    <svg
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-full block"
      style={{
        filter: isDragging
          ? `drop-shadow(0 0 5px ${candy.border}) drop-shadow(0 3px 10px ${candy.shadow})`
          : `drop-shadow(0 2px 7px ${candy.shadow})`,
      }}
    >
      <defs>
        <radialGradient id={gId} cx="38%" cy="32%" r="62%">
          <stop offset="0%"   stopColor={candy.from} />
          <stop offset="100%" stopColor={candy.to}   />
        </radialGradient>
        {/* Clip path for pattern + shine — scoped per candy type */}
        <clipPath id={clipId}>
          <circle cx="32" cy="32" r="15" />
        </clipPath>
      </defs>

      {/* Wrapper petals — rendered behind body */}
      {paths.map((d, i) => (
        <path
          key={i}
          d={d}
          fill={candy.wrap}
          stroke={candy.border}
          strokeWidth="0.7"
          opacity="0.92"
        />
      ))}

      {/* Body circle */}
      <circle cx="32" cy="32" r="15" fill={`url(#${gId})`} />

      {/* Pattern — clipped to body circle */}
      <g clipPath={`url(#${clipId})`}>
        {candy.pattern === 'diagonal' && (
          <g transform="translate(32,32) rotate(42)">
            <rect x="-18" y="-11" width="36" height="3.5" rx="1.5" fill="rgba(255,255,255,0.28)" />
            <rect x="-18" y="-3"  width="36" height="3.5" rx="1.5" fill="rgba(255,255,255,0.28)" />
            <rect x="-18" y="5"   width="36" height="3.5" rx="1.5" fill="rgba(255,255,255,0.28)" />
          </g>
        )}
        {candy.pattern === 'horizontal' && (
          <>
            <rect x="17" y="23" width="30" height="3.5" rx="1.5" fill="rgba(255,255,255,0.30)" />
            <rect x="17" y="30" width="30" height="3.5" rx="1.5" fill="rgba(255,255,255,0.30)" />
            <rect x="17" y="37" width="30" height="3.5" rx="1.5" fill="rgba(255,255,255,0.30)" />
          </>
        )}
        {candy.pattern === 'dots' && (
          <>
            <circle cx="26" cy="29" r="3"   fill="rgba(255,255,255,0.30)" />
            <circle cx="37" cy="34" r="3"   fill="rgba(255,255,255,0.30)" />
            <circle cx="29" cy="38" r="2.5" fill="rgba(255,255,255,0.30)" />
            <circle cx="38" cy="25" r="2.5" fill="rgba(255,255,255,0.30)" />
            <circle cx="25" cy="24" r="2"   fill="rgba(255,255,255,0.25)" />
          </>
        )}
        {candy.pattern === 'swirl' && (
          <path
            d="M32,20 C40,22 42,30 37,35 C32,40 24,38 22,33 C20,28 24,23 28,26 C32,29 33,33 30,34"
            stroke="rgba(255,255,255,0.38)"
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
          />
        )}
        {candy.pattern === 'sparkle' && (
          <>
            <line x1="32" y1="19" x2="32" y2="45" stroke="rgba(255,255,255,0.28)" strokeWidth="1.5" />
            <line x1="19" y1="32" x2="45" y2="32" stroke="rgba(255,255,255,0.28)" strokeWidth="1.5" />
            <line x1="23" y1="23" x2="41" y2="41" stroke="rgba(255,255,255,0.20)" strokeWidth="1.5" />
            <line x1="41" y1="23" x2="23" y2="41" stroke="rgba(255,255,255,0.20)" strokeWidth="1.5" />
          </>
        )}
        {candy.pattern === 'plain' && (
          // Extra-large shine for the plain glossy jelly
          <ellipse cx="30" cy="28" rx="9" ry="6" fill="rgba(255,255,255,0.22)" />
        )}
      </g>

      {/* Glossy shine highlight — clipped to body */}
      <g clipPath={`url(#${clipId})`}>
        <ellipse
          cx="26" cy="25" rx="6" ry="4"
          fill="rgba(255,255,255,0.50)"
          transform="rotate(-20 26 25)"
        />
        <circle cx="24" cy="23" r="2.5" fill="rgba(255,255,255,0.72)" />
      </g>

      {/* Body ring border */}
      <circle cx="32" cy="32" r="15" fill="none" stroke={candy.border} strokeWidth="1.5" />

      {/* Dragging white flash */}
      {isDragging && (
        <circle cx="32" cy="32" r="15" fill="rgba(255,255,255,0.20)" />
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
