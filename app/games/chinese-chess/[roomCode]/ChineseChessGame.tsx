'use client'

import { useEffect, useState, useTransition, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import {
  makeChessMove, resignGame, offerDraw, respondDraw, claimTimeout,
  type ChessRoom, type MoveEntry,
} from '../actions'
import {
  getLegalMoves, isInCheck,
  createInitialChineseChessBoard,
  type Board, type Side, type Pos,
} from '@/lib/games/chineseChess/rules'
import ChineseChessChat from './ChineseChessChat'

// ── Constants ─────────────────────────────────────────────────────────────────
const PIECE_CHARS: Record<string, string> = {
  rG: '帥', rA: '仕', rE: '相', rN: '馬', rR: '車', rC: '炮', rP: '兵',
  bG: '將', bA: '士', bE: '象', bN: '馬', bR: '車', bC: '砲', bP: '卒',
}
const TURN_TIMEOUT_SECS = 60    // default: 1 minute per turn (DB field overrides)
const WARN_SECS = 20            // progress bar turns amber/red below this

// ── Types ──────────────────────────────────────────────────────────────────────
export type Props = {
  initialRoom:   ChessRoom
  userId:        string | null
  myRole:        'red' | 'black' | 'spectator'
  playerRedName: string
  playerBlackName: string | null
  initialMoves:  MoveEntry[]
}
type LastMove    = { from: [number, number]; to: [number, number] }
type StatusVariant = 'win' | 'lose' | 'check' | 'myturn' | 'wait' | 'waiting'

// ── Helpers ────────────────────────────────────────────────────────────────────
function parseBoard(raw: unknown): Board {
  if (!Array.isArray(raw)) return createInitialChineseChessBoard()
  return (raw as unknown[][]).map(row =>
    Array.isArray(row) ? (row as (string | null)[]) : Array<string | null>(9).fill(null),
  )
}
const toChar = (s: 'red' | 'black'): Side => s === 'red' ? 'r' : 'b'

// Convert between actual board coords and display coords under flip
const flipRow = (r: number) => 9 - r
const flipCol = (c: number) => 8 - c

// Convert (row, col) to algebraic notation: e.g. (9,4) → "e1", (0,4) → "e10"
const COLS = ['a','b','c','d','e','f','g','h','i']
function posNotation(row: number, col: number): string {
  return `${COLS[col] ?? col}${10 - row}`
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function ChineseChessGame({
  initialRoom, userId, myRole, playerRedName, playerBlackName, initialMoves,
}: Props) {
  const t = useTranslations('games.chinese_chess')

  // ── State ──────────────────────────────────────────────────────────────────
  const [room, setRoom]             = useState<ChessRoom>(initialRoom)
  const [selected, setSelected]     = useState<Pos | null>(null)
  const [validMoves, setValidMoves] = useState<Pos[]>([])
  const [isPending, startTransition] = useTransition()
  const [error, setError]           = useState<string | null>(null)
  const [copied, setCopied]         = useState(false)
  const [confirmResign, setConfirmResign] = useState(false)
  const [moveLog, setMoveLog]       = useState<MoveEntry[]>(initialMoves)
  // Flip state: default based on role, persisted in localStorage per room+user
  const flipLsKey = `chess-flip-${initialRoom.room_code}-${userId ?? 'anon'}`
  const [flipped, setFlipped]       = useState(myRole === 'black')
  const [timeLeft, setTimeLeft]     = useState(TURN_TIMEOUT_SECS)

  // ── Refs ───────────────────────────────────────────────────────────────────
  const resignTimer    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const errorTimer     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const timerInterval  = useRef<ReturnType<typeof setInterval> | null>(null)
  const moveLogEnd     = useRef<HTMLDivElement>(null)
  // Keep latest values accessible inside interval callbacks
  const isMyTurnRef    = useRef(false)
  const isPendingRef   = useRef(false)
  const roomCodeRef    = useRef(room.room_code)

  // ── Derived ────────────────────────────────────────────────────────────────
  const board       = parseBoard(room.board)
  const mySide      = myRole === 'spectator' ? null : myRole
  const mySideChar  = mySide ? toChar(mySide) : null
  const isMyTurn    = room.status === 'playing' && room.current_turn === mySide
  const lastMove    = room.last_move as LastMove | null
  const curChar: Side = toChar(room.current_turn as 'red' | 'black')
  const genInCheck  = room.status === 'playing' && isInCheck(board, curChar)

  const myDrawOffered  = (mySide === 'red'   && room.red_offered_draw)   ||
                         (mySide === 'black' && room.black_offered_draw)
  const oppDrawOffered = (mySide === 'red'   && room.black_offered_draw) ||
                         (mySide === 'black' && room.red_offered_draw)

  const myName = myRole === 'red'
    ? playerRedName
    : myRole === 'black'
    ? (playerBlackName ?? '—')
    : '—'

  const generalPos: Pos | null = (() => {
    if (!genInCheck) return null
    const target = `${curChar}G`
    for (let r = 0; r < 10; r++)
      for (let c = 0; c < 9; c++)
        if (board[r]?.[c] === target) return [r, c]
    return null
  })()

  // ── Sync refs ──────────────────────────────────────────────────────────────
  isMyTurnRef.current   = isMyTurn
  isPendingRef.current  = isPending
  roomCodeRef.current   = room.room_code

  // ── Realtime: rooms + moves ────────────────────────────────────────────────
  useEffect(() => {
    const sb = createClient()
    const ch = sb
      .channel(`chess:${room.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public',
        table: 'chinese_chess_rooms', filter: `id=eq.${room.id}`,
      }, payload => {
        setRoom(payload.new as ChessRoom)
        setSelected(null); setValidMoves([])
        setError(null)
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public',
        table: 'chinese_chess_moves', filter: `room_id=eq.${room.id}`,
      }, payload => {
        const entry = payload.new as MoveEntry
        setMoveLog(prev => {
          if (prev.some(m => m.id === entry.id)) return prev
          return [...prev, entry].sort((a, b) => a.move_number - b.move_number)
        })
      })
      .subscribe()
    return () => { sb.removeChannel(ch) }
  }, [room.id])

  // ── Timer: server-authoritative countdown from turn_started_at ────────────
  // Computed from DB field so both clients always agree on remaining time.
  // Either player can call claimTimeout once it hits 0 (RPC validates server-side).
  useEffect(() => {
    if (timerInterval.current) clearInterval(timerInterval.current)

    const maxSecs = room.turn_timeout_seconds ?? TURN_TIMEOUT_SECS

    const computeLeft = (): number => {
      if (room.status !== 'playing') return maxSecs
      if (!room.turn_started_at)    return maxSecs
      const elapsed = Math.floor((Date.now() - new Date(room.turn_started_at).getTime()) / 1000)
      return Math.max(0, maxSecs - elapsed)
    }

    setTimeLeft(computeLeft())
    if (room.status !== 'playing') return

    timerInterval.current = setInterval(() => {
      const left = computeLeft()
      setTimeLeft(left)
      if (left <= 0 && !isPendingRef.current) {
        clearInterval(timerInterval.current!)
        // Any client can claim — the RPC validates expiry server-side
        startTransition(async () => { await claimTimeout(roomCodeRef.current) })
      }
    }, 1000)

    return () => {
      if (timerInterval.current) clearInterval(timerInterval.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.turn_started_at, room.status, room.turn_timeout_seconds])

  // ── Sync resign confirm with game status ───────────────────────────────────
  useEffect(() => {
    if (room.status !== 'playing') setConfirmResign(false)
  }, [room.status])

  // ── Flip board: read saved preference from localStorage on mount ──────────
  // Overrides the role-based default if user has previously toggled manually.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(flipLsKey)
      if (saved !== null) setFlipped(saved === '1')
    } catch { /* localStorage unavailable (SSR/private browsing) */ }
  }, [flipLsKey])

  // ── Mount: auto-claim timeout if page loaded after turn already expired ────
  // Handles: user refreshes browser mid-game after being away too long.
  // TODO (future): add a server-side cron/pg_cron job to handle timeouts when
  // BOTH clients are offline — that requires no client at all to be open.
  useEffect(() => {
    if (initialRoom.status !== 'playing' || !initialRoom.turn_started_at) return
    const elapsed = (Date.now() - new Date(initialRoom.turn_started_at).getTime()) / 1000
    if (elapsed >= (initialRoom.turn_timeout_seconds ?? TURN_TIMEOUT_SECS)) {
      claimTimeout(initialRoom.room_code).catch(() => {})
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-scroll move log ───────────────────────────────────────────────────
  useEffect(() => {
    moveLogEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [moveLog.length])

  // ── Handlers ──────────────────────────────────────────────────────────────
  const showError = (msg: string) => {
    setError(msg)
    if (errorTimer.current) clearTimeout(errorTimer.current)
    errorTimer.current = setTimeout(() => setError(null), 3500)
  }

  const handleCellClick = useCallback((row: number, col: number) => {
    if (!isMyTurn || isPending) return
    const piece   = board[row]?.[col] ?? null
    const isVDest = validMoves.some(([r, c]) => r === row && c === col)

    if (isVDest && selected) {
      const [fr, fc] = selected
      setSelected(null); setValidMoves([])
      startTransition(async () => {
        const res = await makeChessMove(room.room_code, fr, fc, row, col)
        if (res?.error) showError(res.error)
      })
      return
    }
    if (piece && piece[0] === mySideChar) {
      setSelected([row, col])
      setValidMoves(getLegalMoves(board, row, col))
      setError(null)
      return
    }
    setSelected(null); setValidMoves([])
  }, [isMyTurn, isPending, validMoves, selected, board, mySideChar, room.room_code])

  const handleResign = () => {
    if (!confirmResign) {
      setConfirmResign(true)
      resignTimer.current = setTimeout(() => setConfirmResign(false), 4000)
      return
    }
    if (resignTimer.current) clearTimeout(resignTimer.current)
    setConfirmResign(false)
    startTransition(async () => {
      const res = await resignGame(room.room_code)
      if (res?.error) showError(res.error)
    })
  }

  const handleOfferDraw = () => {
    startTransition(async () => {
      const res = await offerDraw(room.room_code)
      if (res?.error) showError(res.error)
    })
  }

  const handleRespondDraw = (accepted: boolean) => {
    startTransition(async () => {
      const res = await respondDraw(room.room_code, accepted)
      if (res?.error) showError(res.error)
    })
  }

  const toggleFlip = () => {
    setFlipped(prev => {
      const next = !prev
      try { localStorage.setItem(flipLsKey, next ? '1' : '0') } catch {}
      return next
    })
  }

  const copyInvite = async () => {
    const url = `${window.location.origin}/games/chinese-chess/${room.room_code}`
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ── Status ─────────────────────────────────────────────────────────────────
  type StatusInfo = { text: string; sub?: string; variant: StatusVariant }

  const statusInfo: StatusInfo | null = (() => {
    if (room.status === 'waiting') return {
      text: t('status_waiting'),
      sub: t('waiting_status_detail', { code: room.room_code }),
      variant: 'waiting',
    }
    if (room.status === 'finished') {
      const endSub = room.end_reason
        ? t(`end_${room.end_reason}` as Parameters<typeof t>[0])
        : ''
      if (room.winner === 'draw') return { text: t('status_draw'), sub: endSub, variant: 'win' }
      // Timeout special messages
      if (room.end_reason === 'timeout') {
        const msg = room.winner === 'red' ? t('timeout_red_wins') : t('timeout_black_wins')
        if (room.winner === mySide) return { text: msg, sub: endSub, variant: 'win' }
        if (mySide)                 return { text: msg, sub: endSub, variant: 'lose' }
        return { text: msg, sub: endSub, variant: 'win' }
      }
      if (room.winner === mySide) return { text: t('status_you_win'), sub: endSub, variant: 'win' }
      if (room.winner && mySide && room.winner !== mySide)
        return { text: t('status_you_lose'), sub: endSub, variant: 'lose' }
      const n = room.winner === 'red'
        ? t('status_red_win',   { name: playerRedName })
        : t('status_black_win', { name: playerBlackName ?? '' })
      return { text: n, sub: endSub, variant: 'win' }
    }
    if (genInCheck) {
      const n = room.current_turn === 'red' ? playerRedName : (playerBlackName ?? '…')
      return { text: t('in_check_player', { name: n }), variant: 'check' }
    }
    if (isMyTurn) return { text: t('status_your_turn'), variant: 'myturn' }
    const wn = room.current_turn === 'red' ? playerRedName : (playerBlackName ?? '…')
    return { text: t('status_opp_turn', { name: wn }), variant: 'wait' }
  })()

  const statusCls: Record<StatusVariant, string> = {
    win:     'bg-emerald-50 border-emerald-200 text-emerald-700',
    lose:    'bg-zinc-100 border-zinc-200 text-zinc-600',
    check:   'bg-red-50 border-red-300 text-red-700',
    myturn:  'bg-teal/10 border-teal/30 text-teal',
    wait:    'bg-paper border-line text-muted',
    waiting: 'bg-amber-50 border-amber-200 text-amber-800',
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col lg:grid lg:grid-cols-[minmax(300px,520px)_360px] gap-5 lg:gap-6 items-start">

      {/* ── Column 1: Board ── */}
      <div className="w-full">
        <ChessBoard
          board={board}
          selected={selected}
          validMoves={validMoves}
          lastMove={lastMove}
          generalPos={generalPos}
          interactive={isMyTurn && !isPending}
          isPending={isPending}
          mySideChar={mySideChar}
          gameStatus={room.status}
          flipped={flipped}
          onCellClick={handleCellClick}
        />

        {/* Flip board button */}
        <div className="mt-2.5 flex justify-center">
          <button
            onClick={toggleFlip}
            className={`text-[11.5px] font-medium px-3.5 py-1.5 rounded-xl border transition-colors ${
              flipped
                ? 'border-rose/40 text-rose bg-rose/5'
                : 'border-line text-muted hover:border-rose/30 hover:text-rose'
            }`}
          >
            ↕ {t('flip_board')}
          </button>
        </div>
      </div>

      {/* ── Column 2: Info panel ── */}
      <div className="w-full flex flex-col gap-3">

        {/* Room header */}
        <div className="bg-paper border border-line rounded-2xl px-4 py-3.5 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10.5px] font-semibold text-muted uppercase tracking-[2px]">
              {t('room_label')}
            </p>
            <p className="font-mono font-bold text-[24px] text-ink tracking-[5px] leading-tight">
              {room.room_code}
            </p>
          </div>
          <div className="flex flex-col gap-1.5 items-end">
            {room.status !== 'finished' && (
              <button
                onClick={copyInvite}
                className="text-[12px] font-semibold px-3.5 py-1.5 rounded-xl border border-rose/30 text-rose hover:bg-rose/5 transition-colors whitespace-nowrap"
              >
                {copied ? `✓ ${t('copied')}` : t('copy_link_short')}
              </button>
            )}
            <Link href="/games/chinese-chess" className="text-[11.5px] text-muted hover:text-ink transition-colors">
              ← {t('back_lobby')}
            </Link>
          </div>
        </div>

        {/* Player cards with timer */}
        <div className="grid grid-cols-2 gap-2.5">
          {([
            {
              side:   'red'   as const,
              name:   playerRedName,
              label:  t('player_red_label'),
              bg:     'bg-red-50',
              border: room.current_turn === 'red' && room.status === 'playing'
                ? 'border-red-400 ring-2 ring-red-300/40'
                : 'border-red-200',
              dot:    'bg-red-500',
              text:   'text-red-700',
            },
            {
              side:   'black' as const,
              name:   playerBlackName ?? (room.status === 'waiting' ? `— ${t('waiting_player')}` : '—'),
              label:  t('player_black_label'),
              bg:     'bg-zinc-100',
              border: room.current_turn === 'black' && room.status === 'playing'
                ? 'border-zinc-500 ring-2 ring-zinc-400/30'
                : 'border-zinc-200',
              dot:    'bg-zinc-700',
              text:   'text-zinc-600',
            },
          ] as const).map(({ side, name, label, bg, border, dot, text }) => {
            const isCurrentTurn = room.current_turn === side && room.status === 'playing'
            const showTimer = isCurrentTurn && timeLeft <= WARN_SECS
            return (
              <div key={side} className={`${bg} border ${border} rounded-xl px-3 py-2.5 transition-all`}>
                <p className={`text-[10px] font-bold ${text} uppercase tracking-widest mb-0.5 flex items-center gap-1`}>
                  <span className={`inline-block w-2 h-2 rounded-full ${dot}`} />
                  {label}
                </p>
                <p className="text-[13px] font-semibold text-ink truncate">
                  {name}
                  {myRole === side && <span className="ml-1 text-[11px] text-muted/60">{t('self_label')}</span>}
                </p>
                <div className="flex items-center justify-between mt-0.5">
                  {isCurrentTurn && (
                    <p className="text-[10px] text-muted/55 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-teal animate-pulse inline-block" />
                      {t('playing_turn')}
                    </p>
                  )}
                  {isCurrentTurn && (
                    <span className={`text-[11px] font-bold ml-auto tabular-nums ${
                      timeLeft <= 10 ? 'text-red-600 animate-pulse' :
                      timeLeft <= WARN_SECS ? 'text-amber-600' : 'text-muted/50'
                    }`}>
                      {timeLeft}s
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Timer progress bar */}
        {room.status === 'playing' && (
          <div className="h-1.5 bg-line/40 rounded-full overflow-hidden -mt-1">
            <div
              className={`h-full rounded-full transition-all duration-1000 ease-linear ${
                timeLeft <= 10 ? 'bg-red-500' :
                timeLeft <= WARN_SECS ? 'bg-amber-500' : 'bg-teal/50'
              }`}
              style={{
                width: `${Math.max(0, Math.min(100,
                  (timeLeft / (room.turn_timeout_seconds ?? TURN_TIMEOUT_SECS)) * 100
                ))}%`,
              }}
            />
          </div>
        )}

        {/* Status bar */}
        {statusInfo && (
          <div className={`rounded-xl px-4 py-3 text-center border transition-all ${statusCls[statusInfo.variant]}`}>
            <p className="text-[13.5px] font-bold">{statusInfo.text}</p>
            {statusInfo.sub && (
              <p className="text-[11.5px] mt-0.5 opacity-70 leading-snug">{statusInfo.sub}</p>
            )}
          </div>
        )}

        {/* Opponent draw offer banner */}
        {oppDrawOffered && room.status === 'playing' && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-3">
            <p className="text-[13px] font-semibold text-amber-800 mb-2.5">
              🤝 {t('draw_offered_by_opp')}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => handleRespondDraw(true)}
                disabled={isPending}
                className="flex-1 py-2 rounded-lg bg-emerald-600 text-white text-[12.5px] font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                {t('accept_draw_btn')}
              </button>
              <button
                onClick={() => handleRespondDraw(false)}
                disabled={isPending}
                className="flex-1 py-2 rounded-lg border border-zinc-300 text-zinc-600 text-[12.5px] font-semibold hover:border-zinc-400 transition-colors disabled:opacity-50"
              >
                {t('decline_draw_btn')}
              </button>
            </div>
          </div>
        )}

        {/* Error toast */}
        {error && (
          <div className="text-[12px] font-medium text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-center flex items-center justify-center gap-1.5">
            <svg className="w-3.5 h-3.5 flex-none" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {error}
          </div>
        )}

        {/* Controls */}
        <div className="flex flex-col gap-2">
          {room.status === 'playing' && myRole !== 'spectator' && (
            <>
              {/* Draw offer button */}
              {!oppDrawOffered && (
                <button
                  onClick={handleOfferDraw}
                  disabled={isPending || myDrawOffered}
                  className={`w-full py-2.5 rounded-xl text-[12.5px] font-semibold transition-all disabled:opacity-60 ${
                    myDrawOffered
                      ? 'bg-amber-50 border border-amber-200 text-amber-700 cursor-default'
                      : 'bg-paper border border-muted/25 text-muted hover:border-teal/40 hover:text-teal'
                  }`}
                >
                  {myDrawOffered ? t('draw_offered_waiting') : `🤝 ${t('offer_draw_btn')}`}
                </button>
              )}

              {/* Resign button */}
              <button
                onClick={handleResign}
                disabled={isPending}
                className={`w-full py-2.5 rounded-xl text-[13px] font-semibold transition-all disabled:opacity-50 ${
                  confirmResign
                    ? 'bg-red-600 text-white shadow-[0_2px_12px_-2px_rgba(220,38,38,0.5)]'
                    : 'bg-paper border border-muted/25 text-muted hover:border-red-400 hover:text-red-600'
                }`}
              >
                {confirmResign ? t('resign_btn_confirm') : t('resign_btn')}
              </button>
            </>
          )}
          {room.status === 'finished' && (
            <div className="flex flex-col gap-2">
              {/* End summary */}
              <div className="bg-cream border border-line rounded-xl px-4 py-3 text-center space-y-0.5">
                {room.end_reason && (
                  <p className="text-[12px] text-muted">
                    <span className="font-medium">{t('result_end_reason_label')}:</span>{' '}
                    {t(`end_${room.end_reason}` as Parameters<typeof t>[0])}
                  </p>
                )}
                {room.move_count > 0 && (
                  <p className="text-[12px] text-muted">
                    <span className="font-medium">{t('move_count_label')}:</span>{' '}
                    {room.move_count}
                  </p>
                )}
              </div>
              {/* Action buttons */}
              <Link
                href="/games/chinese-chess"
                className="w-full py-2.5 rounded-xl text-[13px] font-semibold text-center bg-rose text-white hover:bg-rose-deep transition-all shadow-[0_2px_12px_-2px_rgba(194,24,91,0.4)] inline-block"
              >
                {t('play_again')}
              </Link>
              {myRole !== 'spectator' && userId && (
                <Link
                  href="/games/chinese-chess/history"
                  className="w-full py-2.5 rounded-xl text-[13px] font-semibold text-center bg-paper border border-rose/30 text-rose hover:bg-rose/5 transition-colors inline-block"
                >
                  📜 {t('result_view_history')}
                </Link>
              )}
            </div>
          )}
          {myRole === 'spectator' && room.status === 'playing' && (
            <p className="text-[12px] text-muted text-center py-1.5 italic">{t('watching_note')}</p>
          )}
          {isPending && (
            <p className="text-[11.5px] text-teal text-center flex items-center justify-center gap-1.5">
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {t('move_pending')}
            </p>
          )}
        </div>

        {/* Move count */}
        {room.move_count > 0 && (
          <p className="text-[11px] text-muted/45 text-center -mb-1">
            {t('move_number', { n: room.move_count })}
          </p>
        )}

        {/* ── Chat ── */}
        <div style={{ height: 'clamp(280px, 36vh, 360px)' }}>
          <ChineseChessChat
            roomId={room.id}
            userId={userId}
            myRole={myRole}
            myName={myName}
          />
        </div>

        {/* ── Move log ── */}
        {(moveLog.length > 0 || room.status === 'playing') && (
          <div className="bg-paper border border-line rounded-2xl overflow-hidden">
            <p className="text-[11px] font-bold text-muted uppercase tracking-widest px-4 py-2.5 border-b border-line bg-cream/50">
              📋 {t('move_log_heading')}
            </p>
            <div className="max-h-[180px] overflow-y-auto px-3 py-2 space-y-0.5" style={{ scrollbarWidth: 'thin' }}>
              {moveLog.length === 0 ? (
                <p className="text-[12px] text-muted/50 italic py-1.5 text-center">{t('move_log_empty')}</p>
              ) : (
                moveLog.map(m => {
                  const isRed     = m.side === 'red'
                  const pieceChar = m.piece ? (PIECE_CHARS[m.piece] ?? m.piece) : '?'
                  const capChar   = m.captured_piece ? (PIECE_CHARS[m.captured_piece] ?? m.captured_piece) : ''
                  const from      = posNotation(m.from_row, m.from_col)
                  const to        = posNotation(m.to_row,   m.to_col)
                  return (
                    <div key={m.id} className={`flex items-center gap-1.5 py-1 border-b border-line/30 last:border-0 ${
                      isRed ? 'text-red-700' : 'text-zinc-700'
                    }`}>
                      {/* Move number */}
                      <span className="text-[10px] text-muted/40 flex-none font-mono w-[18px] text-right">
                        {m.move_number}.
                      </span>
                      {/* Side dot */}
                      <span className={`w-2 h-2 rounded-full flex-none ${isRed ? 'bg-red-500' : 'bg-zinc-700'}`} />
                      {/* Piece char */}
                      <span className="font-serif font-bold text-[13px] flex-none w-[18px] text-center leading-none">
                        {pieceChar}
                      </span>
                      {/* Position: from → to */}
                      <span className="text-[11px] font-mono flex-none">
                        {from}<span className="text-muted/40 mx-0.5">→</span>{to}
                      </span>
                      {/* Captured piece */}
                      {capChar && (
                        <span className="ml-auto text-[10.5px] font-semibold text-rose/70 flex items-center gap-0.5 flex-none">
                          ×<span className="font-serif">{capChar}</span>
                        </span>
                      )}
                    </div>
                  )
                })
              )}
              <div ref={moveLogEnd} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── ChessBoard ─────────────────────────────────────────────────────────────────

type BoardProps = {
  board:       Board
  selected:    Pos | null
  validMoves:  Pos[]
  lastMove:    LastMove | null
  generalPos:  Pos | null
  interactive: boolean
  isPending:   boolean
  mySideChar:  Side | null
  gameStatus:  ChessRoom['status']
  flipped:     boolean
  onCellClick: (r: number, c: number) => void
}

function ChessBoard({
  board, selected, validMoves, lastMove, generalPos,
  interactive, isPending, mySideChar, gameStatus, flipped, onCellClick,
}: BoardProps) {
  const validSet = new Set(validMoves.map(([r, c]) => `${r},${c}`))

  // Convert actual → display coordinates
  const ad = (r: number, c: number): [number, number] =>
    flipped ? [flipRow(r), flipCol(c)] : [r, c]

  // Highlight keys in DISPLAY space
  const dispKey = (r: number, c: number) => { const [dr, dc] = ad(r, c); return `${dr},${dc}` }

  const lfDisp = lastMove ? dispKey(lastMove.from[0], lastMove.from[1]) : ''
  const ltDisp = lastMove ? dispKey(lastMove.to[0],   lastMove.to[1])   : ''
  const gpDisp = generalPos ? dispKey(generalPos[0], generalPos[1]) : ''
  const spDisp = selected   ? dispKey(selected[0],   selected[1])   : ''

  const parseKey = (k: string): [number, number] | null => {
    if (!k) return null
    const [r, c] = k.split(',').map(Number)
    return [r, c]
  }

  return (
    <div className="w-full max-w-[520px] mx-auto select-none">
      {/* Wooden frame */}
      <div
        className="relative rounded-2xl p-2 sm:p-[10px]"
        style={{
          background: 'linear-gradient(145deg,#b8782a,#8c5215)',
          boxShadow: '0 8px 40px -8px rgba(90,40,5,0.55), inset 0 1px 0 rgba(255,220,130,0.35), inset 0 -1px 0 rgba(0,0,0,0.25)',
        }}
      >
        <div
          className="relative w-full rounded-xl overflow-hidden"
          style={{ aspectRatio: '9/10', background: '#e8b75a' }}
        >
          {/* SVG: board lines */}
          <svg
            className="absolute inset-0 w-full h-full"
            viewBox="0 0 9 10"
            preserveAspectRatio="none"
            style={{ pointerEvents: 'none', zIndex: 1 }}
          >
            <defs>
              <linearGradient id="boardBg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#f2cc72" />
                <stop offset="100%" stopColor="#d4a040" />
              </linearGradient>
            </defs>
            <rect x="0" y="0" width="9" height="10" fill="url(#boardBg)" />
            {/* 10 horizontal lines */}
            {Array.from({ length: 10 }, (_, r) => (
              <line key={`h${r}`} x1="0.5" y1={r+0.5} x2="8.5" y2={r+0.5}
                stroke="#4a2800" strokeWidth="0.022" opacity="0.72" />
            ))}
            {/* Outer vertical lines */}
            <line x1="0.5" y1="0.5" x2="0.5" y2="9.5" stroke="#4a2800" strokeWidth="0.022" opacity="0.72" />
            <line x1="8.5" y1="0.5" x2="8.5" y2="9.5" stroke="#4a2800" strokeWidth="0.022" opacity="0.72" />
            {/* Inner vertical lines — split at river */}
            {[1,2,3,4,5,6,7].map(c => (
              <g key={`v${c}`}>
                <line x1={c+0.5} y1="0.5" x2={c+0.5} y2="4.5" stroke="#4a2800" strokeWidth="0.022" opacity="0.72" />
                <line x1={c+0.5} y1="5.5" x2={c+0.5} y2="9.5" stroke="#4a2800" strokeWidth="0.022" opacity="0.72" />
              </g>
            ))}
            {/* Palace diagonals — top (rows 0-2, cols 3-5) */}
            <line x1="3.5" y1="0.5" x2="5.5" y2="2.5" stroke="#4a2800" strokeWidth="0.022" opacity="0.68" />
            <line x1="5.5" y1="0.5" x2="3.5" y2="2.5" stroke="#4a2800" strokeWidth="0.022" opacity="0.68" />
            {/* Palace diagonals — bottom (rows 7-9, cols 3-5) */}
            <line x1="3.5" y1="7.5" x2="5.5" y2="9.5" stroke="#4a2800" strokeWidth="0.022" opacity="0.68" />
            <line x1="5.5" y1="7.5" x2="3.5" y2="9.5" stroke="#4a2800" strokeWidth="0.022" opacity="0.68" />
            {/* River text */}
            <text x="2.5" y="5.0" textAnchor="middle" dominantBaseline="middle"
              fill="#4a2800" fillOpacity="0.42" fontSize="0.50" fontFamily="serif" letterSpacing="0.12">
              {flipped ? '漢 界' : '楚 河'}
            </text>
            <text x="6.5" y="5.0" textAnchor="middle" dominantBaseline="middle"
              fill="#4a2800" fillOpacity="0.42" fontSize="0.50" fontFamily="serif" letterSpacing="0.12">
              {flipped ? '楚 河' : '漢 界'}
            </text>
          </svg>

          {/* SVG: highlights in DISPLAY coordinates */}
          <svg
            className="absolute inset-0 w-full h-full"
            viewBox="0 0 9 10"
            preserveAspectRatio="none"
            style={{ pointerEvents: 'none', zIndex: 2 }}
          >
            {[lfDisp, ltDisp].map((key, i) => {
              const p = parseKey(key)
              if (!p) return null
              return <rect key={`lm${i}`} x={p[1]} y={p[0]} width="1" height="1"
                fill="#fbbf24" fillOpacity={i === 1 ? 0.50 : 0.38} rx="0.06" />
            })}
            {(() => { const p = parseKey(gpDisp); return p ? <rect x={p[1]} y={p[0]} width="1" height="1" fill="#ef4444" fillOpacity="0.42" rx="0.06" /> : null })()}
            {(() => { const p = parseKey(spDisp); return p ? <rect x={p[1]} y={p[0]} width="1" height="1" fill="#3b82f6" fillOpacity="0.28" rx="0.06" /> : null })()}
            {/* Valid move indicators in display space */}
            {validMoves.map(([ar, ac]) => {
              const [dr, dc] = ad(ar, ac)
              const isEmpty = !board[ar]?.[ac]
              return isEmpty
                ? <circle key={`vd${ar},${ac}`} cx={dc+0.5} cy={dr+0.5} r="0.16" fill="#2563eb" fillOpacity="0.60" />
                : <circle key={`vr${ar},${ac}`} cx={dc+0.5} cy={dr+0.5} r="0.42" fill="none" stroke="#2563eb" strokeWidth="0.05" strokeOpacity="0.70" />
            })}
          </svg>

          {/* Pending overlay */}
          {isPending && (
            <div className="absolute inset-0 bg-black/10 z-30 flex items-center justify-center rounded-xl">
              <div className="bg-white/90 rounded-2xl px-4 py-2 flex items-center gap-2 text-[12px] font-semibold text-ink shadow-lg">
                <svg className="w-4 h-4 animate-spin text-rose" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Đang xử lý…
              </div>
            </div>
          )}

          {/* Interactive piece grid */}
          <div
            className="absolute inset-0"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(9, 1fr)',
              gridTemplateRows: 'repeat(10, 1fr)',
              zIndex: 10,
            }}
          >
            {Array.from({ length: 10 }, (_, displayRow) =>
              Array.from({ length: 9 }, (_, displayCol) => {
                // Map display cell to actual board position
                const actualRow = flipped ? flipRow(displayRow) : displayRow
                const actualCol = flipped ? flipCol(displayCol) : displayCol

                const piece  = board[actualRow]?.[actualCol] ?? null
                const isSel  = spDisp === `${displayRow},${displayCol}`
                const isVld  = validSet.has(`${actualRow},${actualCol}`)
                const isOwn  = piece !== null && mySideChar !== null && piece[0] === mySideChar
                const canClk = interactive && (isOwn || isVld)
                const isRed  = piece ? piece[0] === 'r' : false

                return (
                  <div
                    key={`${displayRow},${displayCol}`}
                    role={canClk ? 'button' : undefined}
                    tabIndex={canClk ? 0 : -1}
                    onClick={() => onCellClick(actualRow, actualCol)}
                    onKeyDown={e => e.key === 'Enter' && onCellClick(actualRow, actualCol)}
                    className={`relative flex items-center justify-center ${canClk ? 'cursor-pointer' : 'cursor-default'}`}
                  >
                    {piece && (
                      <div
                        className={[
                          'relative flex items-center justify-center rounded-full font-bold transition-all duration-100',
                          isRed
                            ? 'bg-gradient-to-br from-red-400 via-red-600 to-red-800 text-white border-[1.5px] border-red-900/70'
                            : 'bg-gradient-to-br from-zinc-500 via-zinc-700 to-zinc-900 text-amber-100 border-[1.5px] border-zinc-950/80',
                          isSel ? 'scale-[1.12] ring-[3px] ring-blue-400 ring-offset-[2px] z-20' : '',
                          interactive && isOwn && !isSel && gameStatus !== 'finished'
                            ? 'hover:scale-[1.07] hover:brightness-110'
                            : '',
                        ].join(' ')}
                        style={{
                          width: '82%', height: '82%',
                          fontSize: 'clamp(10px, 2.4vw, 18px)',
                          fontFamily: '"Noto Serif SC","SimSun","FangSong",serif',
                          boxShadow: isRed
                            ? '0 2px 8px -2px rgba(160,20,20,0.7),inset 0 1px 0 rgba(255,190,190,0.3)'
                            : '0 2px 8px -2px rgba(0,0,0,0.7),inset 0 1px 0 rgba(255,255,255,0.12)',
                        }}
                      >
                        {PIECE_CHARS[piece] ?? piece}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* Board legend */}
      <div className="mt-2 flex justify-center gap-6 text-[11px] text-muted/60 select-none">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full bg-gradient-to-br from-red-400 to-red-700 border border-red-900/50 flex-none" />
          Đỏ đi trước
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full bg-gradient-to-br from-zinc-600 to-zinc-900 border border-zinc-950/50 flex-none" />
          Đen
        </span>
      </div>
    </div>
  )
}
