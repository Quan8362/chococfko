'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import {
  createInitialBoard, addRandomTile, applyMove, hasWon, canMove,
  type Board, type Direction,
} from '@/lib/games/game2048'

// ── localStorage keys ─────────────────────────────────────────────────────────
const LS_BEST    = 'chococfko-2048-best-score'
const LS_PLAYED  = 'chococfko-2048-games-played'
const LS_WINS    = 'chococfko-2048-wins'

function lsGet(key: string): number { try { return Number(localStorage.getItem(key) ?? 0) } catch { return 0 } }
function lsSet(key: string, val: number) { try { localStorage.setItem(key, String(val)) } catch {} }

// ── Tile colours ──────────────────────────────────────────────────────────────
const TILE_STYLE: Record<number, { bg: string; color: string; font: string }> = {
  0:    { bg: '#e8ddcf', color: 'transparent',  font: '700' },
  2:    { bg: '#faf4ea', color: '#241a17',       font: '700' },
  4:    { bg: '#f0e4c8', color: '#241a17',       font: '700' },
  8:    { bg: '#f5c97a', color: '#241a17',       font: '700' },
  16:   { bg: '#f5a623', color: '#fff',          font: '700' },
  32:   { bg: '#f08030', color: '#fff',          font: '700' },
  64:   { bg: '#e05f1a', color: '#fff',          font: '700' },
  128:  { bg: '#c99a3d', color: '#fff',          font: '800' },
  256:  { bg: '#b8891c', color: '#fff',          font: '800' },
  512:  { bg: '#1f8fa6', color: '#fff',          font: '800' },
  1024: { bg: '#1a7a8f', color: '#fff',          font: '800' },
  2048: { bg: '#c2185b', color: '#fff',          font: '900' },
}

function getTileStyle(val: number) {
  return TILE_STYLE[val] ?? { bg: '#9d1248', color: '#fff', font: '900' }
}

function getTileFontSize(val: number): string {
  if (val < 100)   return 'clamp(22px, 6vw, 36px)'
  if (val < 1000)  return 'clamp(18px, 5vw, 28px)'
  if (val < 10000) return 'clamp(14px, 4vw, 22px)'
  return 'clamp(11px, 3.5vw, 18px)'
}

// ── Types ─────────────────────────────────────────────────────────────────────
type Status = 'playing' | 'won' | 'game_over'

// Track per-cell animation keys so CSS animation re-triggers on value change
type AnimKeys = number[][]

function makeAnimKeys(): AnimKeys {
  return Array.from({ length: 4 }, () => Array(4).fill(0))
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function Game2048() {
  const t = useTranslations('games.game2048')

  const [board, setBoard]           = useState<Board>(() => createInitialBoard())
  const [score, setScore]           = useState(0)
  const [bestScore, setBestScore]   = useState(0)
  const [status, setStatus]         = useState<Status>('playing')
  const [keepPlaying, setKeepPlaying] = useState(false)
  const [gamesPlayed, setGamesPlayed] = useState(0)
  const [wins, setWins]             = useState(0)
  const [animKeys, setAnimKeys]     = useState<AnimKeys>(() => makeAnimKeys())

  // Load localStorage on mount
  useEffect(() => {
    setBestScore(lsGet(LS_BEST))
    setGamesPlayed(lsGet(LS_PLAYED))
    setWins(lsGet(LS_WINS))
  }, [])

  // ── Core move handler ──────────────────────────────────────────────────────
  const handleMove = useCallback((dir: Direction) => {
    if (status === 'game_over') return
    if (status === 'won' && !keepPlaying) return

    setBoard(prev => {
      const { board: moved, score: gained, changed } = applyMove(prev, dir)
      if (!changed) return prev

      const withTile = addRandomTile(moved)

      // Update score
      setScore(s => {
        const next = s + gained
        setBestScore(best => {
          const newBest = Math.max(best, next)
          lsSet(LS_BEST, newBest)
          return newBest
        })
        return next
      })

      // Update animation keys for changed cells
      setAnimKeys(keys => {
        const next = keys.map(row => [...row])
        for (let r = 0; r < 4; r++)
          for (let c = 0; c < 4; c++)
            if (withTile[r][c] !== prev[r][c]) next[r][c]++
        return next
      })

      // Check win / game over
      if (!keepPlaying && hasWon(withTile)) {
        setStatus('won')
        setWins(w => { const n = w + 1; lsSet(LS_WINS, n); return n })
        setGamesPlayed(g => { const n = g + 1; lsSet(LS_PLAYED, n); return n })
      } else if (!canMove(withTile)) {
        setStatus('game_over')
        setGamesPlayed(g => { const n = g + 1; lsSet(LS_PLAYED, n); return n })
      }

      return withTile
    })
  }, [status, keepPlaying])

  // ── Keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const KEY_MAP: Record<string, Direction> = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      w: 'up', s: 'down', a: 'left', d: 'right',
      W: 'up', S: 'down', A: 'left', D: 'right',
    }
    const onKey = (e: KeyboardEvent) => {
      const dir = KEY_MAP[e.key]
      if (!dir) return
      e.preventDefault()
      handleMove(dir)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleMove])

  // ── Touch / Swipe ─────────────────────────────────────────────────────────
  const touchStart = useRef<{ x: number; y: number } | null>(null)

  const onTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }

  const onTouchMove = (e: React.TouchEvent) => {
    // Prevent page scroll while swiping on board
    if (touchStart.current) e.preventDefault()
  }

  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current) return
    const dx = e.changedTouches[0].clientX - touchStart.current.x
    const dy = e.changedTouches[0].clientY - touchStart.current.y
    const adx = Math.abs(dx), ady = Math.abs(dy)
    if (Math.max(adx, ady) < 30) { touchStart.current = null; return }
    if (adx > ady) handleMove(dx > 0 ? 'right' : 'left')
    else handleMove(dy > 0 ? 'down' : 'up')
    touchStart.current = null
  }

  // ── New game ──────────────────────────────────────────────────────────────
  const newGame = () => {
    setBoard(createInitialBoard())
    setScore(0)
    setStatus('playing')
    setKeepPlaying(false)
    setAnimKeys(makeAnimKeys())
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col items-center gap-5 w-full max-w-[420px] mx-auto px-3 sm:px-0 py-6">

      {/* ── Header ── */}
      <div className="w-full flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* 2×2 tile grid icon — avoids repeating "2048" text */}
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-none bg-cream border border-line shadow-sm">
            <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
              <rect x="1"  y="1"  width="10" height="10" rx="2.5" fill="#c2185b"/>
              <rect x="15" y="1"  width="10" height="10" rx="2.5" fill="#c99a3d"/>
              <rect x="1"  y="15" width="10" height="10" rx="2.5" fill="#f5a623"/>
              <rect x="15" y="15" width="10" height="10" rx="2.5" fill="#1f8fa6"/>
            </svg>
          </div>
          <div>
            <h1
              className="font-sans font-black text-[28px] leading-none text-ink"
              style={{ fontVariantNumeric: 'lining-nums tabular-nums' }}
            >
              2048
            </h1>
            <p className="text-[12px] text-muted mt-1.5 leading-snug max-w-[160px]">{t('subtitle')}</p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2">
            <div className="bg-[#c2185b] text-white rounded-xl px-3.5 py-2 text-center min-w-[72px]">
              <div className="text-[9.5px] font-bold uppercase tracking-[1.5px] opacity-80">{t('score_label')}</div>
              <div className="font-bold text-[20px] leading-tight">{score}</div>
            </div>
            <div className="bg-[#5c4d44] text-white rounded-xl px-3.5 py-2 text-center min-w-[72px]">
              <div className="text-[9.5px] font-bold uppercase tracking-[1.5px] opacity-80">{t('best_label')}</div>
              <div className="font-bold text-[20px] leading-tight">{bestScore}</div>
            </div>
          </div>
          <button
            onClick={newGame}
            className="text-[12px] font-semibold px-4 py-1.5 rounded-full bg-rose text-white hover:bg-rose-deep transition-colors"
          >
            {t('restart_btn')}
          </button>
        </div>
      </div>

      {/* ── Board ── */}
      <div
        className="relative w-full select-none touch-none"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{ touchAction: 'none' }}
      >
        {/* Board background grid */}
        <div
          className="w-full rounded-2xl p-2 sm:p-2.5"
          style={{ background: '#b8a898' }}
        >
          <div className="grid gap-2 sm:gap-2.5" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            {board.map((row, r) =>
              row.map((val, c) => {
                const style = getTileStyle(val)
                const animKey = animKeys[r][c]
                return (
                  <div
                    key={`${r}-${c}-${animKey}`}
                    className="rounded-xl flex items-center justify-center aspect-square"
                    style={{
                      background: style.bg,
                      animation: val !== 0 ? (animKey > 0 ? 'tile-pop 0.12s ease-out' : undefined) : undefined,
                    }}
                  >
                    {val !== 0 && (
                      <span
                        style={{
                          color: style.color,
                          fontWeight: style.font,
                          fontSize: getTileFontSize(val),
                          lineHeight: 1,
                          fontFamily: 'inherit',
                        }}
                      >
                        {val}
                      </span>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* ── Overlay: Won ── */}
        {status === 'won' && !keepPlaying && (
          <div className="absolute inset-0 rounded-2xl bg-[#c2185b]/88 flex flex-col items-center justify-center gap-4 backdrop-blur-[2px]">
            <div className="text-[40px]">🎉</div>
            <p className="font-serif font-black text-white text-[22px] text-center px-4">{t('you_win')}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setKeepPlaying(true)}
                className="px-5 py-2.5 rounded-full bg-white text-rose font-bold text-[14px] hover:bg-rose-soft transition-colors"
              >
                {t('continue_btn')}
              </button>
              <button
                onClick={newGame}
                className="px-5 py-2.5 rounded-full bg-rose-deep text-white font-bold text-[14px] hover:bg-rose transition-colors border border-white/30"
              >
                {t('restart_btn')}
              </button>
            </div>
          </div>
        )}

        {/* ── Overlay: Game over ── */}
        {status === 'game_over' && (
          <div className="absolute inset-0 rounded-2xl bg-[#241a17]/80 flex flex-col items-center justify-center gap-4 backdrop-blur-[2px]">
            <div className="text-[40px]">😔</div>
            <p className="font-serif font-black text-white text-[22px] text-center px-4">{t('you_lose')}</p>
            <button
              onClick={newGame}
              className="px-6 py-2.5 rounded-full bg-rose text-white font-bold text-[15px] hover:bg-rose-deep transition-colors"
            >
              {t('restart_btn')}
            </button>
          </div>
        )}
      </div>

      {/* ── Hint ── */}
      <p className="text-[12px] text-muted/70 text-center">{t('hint')}</p>

      {/* ── Stats ── */}
      <div className="w-full grid grid-cols-3 gap-2.5">
        {[
          { label: t('score_label'),       value: score },
          { label: t('games_played'),      value: gamesPlayed },
          { label: t('wins_label'),        value: wins },
        ].map(({ label, value }) => (
          <div key={label} className="bg-paper border border-line rounded-xl py-3 px-2 text-center">
            <div className="font-bold text-[18px] text-ink leading-none mb-1">{value}</div>
            <div className="text-[10.5px] text-muted leading-tight">{label}</div>
          </div>
        ))}
      </div>

      {/* ── CSS keyframes ── */}
      <style>{`
        @keyframes tile-pop {
          0%   { transform: scale(0.5); }
          60%  { transform: scale(1.08); }
          100% { transform: scale(1); }
        }
      `}</style>
    </div>
  )
}
