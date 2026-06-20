'use client'

import { useEffect, useRef, useState, useCallback, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { makeMove, surrenderGame, heartbeatWaitingRoom, refetchRoom, type CaroRoom } from '../actions'
import { mergeRoomUpdate, parseBoard, parseWinningCells } from '@/lib/caro/realtimePayload'
import { setCaroRuntime } from '@/lib/caro/runtimeState'
import CaroChat from './CaroChat'

const SIZE = 15
const TURN_SECONDS = 15

type Props = {
  initialRoom: CaroRoom
  userId: string | null
  myName: string
  playerXName: string
  playerOName: string | null
}

export default function CaroGame({ initialRoom, userId, myName, playerXName, playerOName }: Props) {
  const t = useTranslations('games.caro')
  const [room, setRoom] = useState<CaroRoom>(initialRoom)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [pendingCell, setPendingCell] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  const [timeLeft, setTimeLeft] = useState(TURN_SECONDS)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const opponentJoinedNotifiedRef = useRef(initialRoom.player_o !== null)
  const opponentToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [showOpponentToast, setShowOpponentToast] = useState(false)
  // 'connected' once subscribed; 'reconnecting' if the channel drops mid-match.
  const [connState, setConnState] = useState<'connecting' | 'connected' | 'reconnecting'>('connecting')
  const mountedRef = useRef(true)

  const board = parseBoard(room.board)
  const winCells = new Set<number>(parseWinningCells(room.winning_cells))

  const mySymbol: 'X' | 'O' | null =
    userId === room.player_x ? 'X' : userId === room.player_o ? 'O' : null
  const isMyTurn = room.status === 'playing' && room.current_turn === mySymbol

  const inviteUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/games/caro/${room.room_code}`
      : ''

  // ── Sound: two-tone chime for opponent joining ────────────────────────────
  const playJoinSound = () => {
    try {
      const ctx = new AudioContext()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.setValueAtTime(660, ctx.currentTime)
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12)
      gain.gain.setValueAtTime(0.25, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.5)
    } catch {}
  }

  // Track mount status so async realtime / refetch callbacks never set state
  // after unmount. Also publish a diagnostics snapshot for the error boundary.
  useEffect(() => {
    mountedRef.current = true
    setCaroRuntime({
      roomCode: initialRoom.room_code,
      matchStatus: initialRoom.status,
      loaded: { room: true, player: initialRoom.player_o !== null, game: true },
    })
    return () => {
      mountedRef.current = false
      if (opponentToastTimerRef.current) clearTimeout(opponentToastTimerRef.current)
    }
  }, [initialRoom.room_code, initialRoom.status, initialRoom.player_o])

  // ── Realtime subscription ──────────────────────────────────────────────────
  // A single channel per room.id. Payloads are MERGED onto the last known state
  // (mergeRoomUpdate) so a partial/empty/TOAST UPDATE can never wipe the board or
  // players mid-match. On every (re)subscribe we refetch the authoritative row to
  // reconcile any events missed between the initial server render and the channel
  // being established, or after a dropped connection.
  useEffect(() => {
    const roomId = room.id
    const supabase = createClient()

    const reconcile = () => {
      refetchRoom(roomId)
        .then((fresh) => {
          if (!fresh || !mountedRef.current) return
          setRoom((prev) => {
            const next = mergeRoomUpdate(prev, fresh)
            setCaroRuntime({ matchStatus: next.status })
            return next
          })
        })
        .catch(() => { /* transient — next reconnect will retry */ })
    }

    const channel = supabase
      .channel(`caro:${roomId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'caro_rooms', filter: `id=eq.${roomId}` },
        (payload) => {
          if (!mountedRef.current) return
          setCaroRuntime({ lastRealtimeEvent: payload.eventType ?? 'UPDATE' })
          setRoom((prev) => {
            const next = mergeRoomUpdate(prev, payload.new)
            setCaroRuntime({ matchStatus: next.status })
            // Host-only: notify once when the first opponent actually joins.
            if (
              userId &&
              userId === next.player_x &&
              !opponentJoinedNotifiedRef.current &&
              prev.player_o === null &&
              next.player_o !== null
            ) {
              opponentJoinedNotifiedRef.current = true
              queueMicrotask(() => {
                if (!mountedRef.current) return
                setShowOpponentToast(true)
                playJoinSound()
                if (opponentToastTimerRef.current) clearTimeout(opponentToastTimerRef.current)
                opponentToastTimerRef.current = setTimeout(() => setShowOpponentToast(false), 4000)
              })
            }
            return next
          })
          setPendingCell(null)
          setError(null)
        },
      )
      .subscribe((status) => {
        setCaroRuntime({ channelStatus: status })
        if (!mountedRef.current) return
        if (status === 'SUBSCRIBED') {
          setConnState('connected')
          reconcile()
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setConnState('reconnecting')
        }
      })

    return () => { supabase.removeChannel(channel) }
  }, [room.id, userId])

  // ── Heartbeat: keep waiting room alive in lobby ───────────────────────────
  // Fires every 25s while room is 'waiting' and current user is host (player X).
  // Stops automatically when room transitions to playing/finished.
  useEffect(() => {
    if (room.status !== 'waiting' || mySymbol !== 'X') return
    heartbeatWaitingRoom(room.id)
    const interval = setInterval(() => heartbeatWaitingRoom(room.id), 25000)
    return () => clearInterval(interval)
  }, [room.id, room.status, mySymbol])

  // ── Auto-move on timeout ──────────────────────────────────────────────────
  const boardRef = useRef(board)
  boardRef.current = board
  const roomRef = useRef(room)
  roomRef.current = room
  const mySymbolRef = useRef(mySymbol)
  mySymbolRef.current = mySymbol

  const doAutoMove = useCallback(() => {
    const currentBoard = boardRef.current
    const currentRoom = roomRef.current
    const symbol = mySymbolRef.current
    if (!symbol || currentRoom.status !== 'playing') return
    const emptyCells = currentBoard
      .map((c, i) => (c === null ? i : -1))
      .filter((i) => i !== -1)
    if (emptyCells.length === 0) return
    const idx = emptyCells[Math.floor(Math.random() * emptyCells.length)]
    setPendingCell(idx)
    startTransition(async () => {
      const result = await makeMove(currentRoom.id, idx)
      if (result?.error) setPendingCell(null)
    })
  }, [])

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)

    if (!isMyTurn || room.status !== 'playing') {
      setTimeLeft(TURN_SECONDS)
      return
    }

    setTimeLeft(TURN_SECONDS)
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!)
          timerRef.current = null
          doAutoMove()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMyTurn, room.status, room.current_turn])

  // ── Cell click ────────────────────────────────────────────────────────────
  const handleClick = useCallback((index: number) => {
    if (!isMyTurn || isPending || board[index] || room.status !== 'playing') return
    setPendingCell(index)
    setError(null)
    startTransition(async () => {
      const result = await makeMove(room.id, index)
      if (result?.error) {
        setError(t('error_move'))
        setPendingCell(null)
      }
    })
  }, [isMyTurn, isPending, board, room.id, room.status])

  // ── Surrender ────────────────────────────────────────────────────────────
  const handleSurrender = () => {
    if (!window.confirm(t('surrender_confirm'))) return
    startTransition(async () => { await surrenderGame(room.id) })
  }

  // ── Copy link ─────────────────────────────────────────────────────────────
  const copyLink = () => {
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // ── Status label ──────────────────────────────────────────────────────────
  const statusLabel = (() => {
    if (room.status === 'waiting') return t('status_waiting')
    if (room.status === 'finished') {
      if (room.winner === 'draw') return t('status_draw')
      if (room.winner === mySymbol) return t('status_you_win')
      if (room.winner && mySymbol) return t('status_you_lose')
      const winnerName = room.winner === 'X' ? playerXName : (playerOName ?? 'O')
      return t('status_x_win', { name: winnerName })
    }
    if (isMyTurn) return t('status_your_turn')
    const oppName = room.current_turn === 'X' ? playerXName : (playerOName ?? 'O')
    return t('status_opp_turn', { name: oppName })
  })()

  const timerPct = (timeLeft / TURN_SECONDS) * 100
  const timerDanger = timeLeft <= 5 && isMyTurn && room.status === 'playing'

  return (
    <>
      {/* ── Opponent joined toast ──────────────────────────────────────────── */}
      {showOpponentToast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2.5 bg-ink text-white px-5 py-3.5 rounded-2xl shadow-2xl text-[14px] font-semibold whitespace-nowrap pointer-events-none select-none border border-white/10">
          <span className="text-lg">⚔️</span>
          {t('opponent_joined')}
        </div>
      )}
    <div className="flex flex-col lg:flex-row gap-5 items-start pb-10">

      {/* ── LEFT: game area ─────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col items-center gap-4 w-full">

        {/* Room code banner */}
        <div className="w-full bg-gradient-to-r from-ink to-[#3a2d22] rounded-2xl px-5 py-4 flex items-center justify-between gap-3 shadow-lg">
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-[2px] text-white/50 mb-0.5">{t('room_code_label')}</p>
            <p className="font-mono font-black text-[28px] text-white tracking-[0.2em] leading-none">
              {room.room_code}
            </p>
          </div>
          <button
            onClick={copyLink}
            className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all border border-white/15"
          >
            {copied ? (
              <><svg className="w-3.5 h-3.5 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>{t('copied')}</>
            ) : (
              <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>{t('copy_link')}</>
            )}
          </button>
        </div>

        {/* Players row — includes undo status */}
        <div className="w-full flex items-center gap-2">
          <PlayerCard
            symbol="X" name={playerXName}
            active={room.status === 'playing' && room.current_turn === 'X'}
            winner={room.winner === 'X'}
          />
          <span className="text-[13px] font-black text-muted/30 flex-none">VS</span>
          <PlayerCard
            symbol="O" name={playerOName ?? (room.player_o ? '…' : null)}
            active={room.status === 'playing' && room.current_turn === 'O'}
            winner={room.winner === 'O'}
          />
        </div>

        {/* Status + timer */}
        <div className="w-full overflow-hidden rounded-xl border border-line">
          {room.status === 'playing' && room.player_o && (
            <div className="h-1.5 w-full bg-line/50">
              <div
                className={`h-full transition-all duration-1000 ease-linear rounded-full ${
                  timerDanger ? 'bg-red-500' : isMyTurn ? 'bg-rose' : 'bg-blue-400'
                }`}
                style={{ width: `${timerPct}%` }}
              />
            </div>
          )}
          <div className={`flex items-center justify-between px-4 py-2.5 text-[13.5px] font-semibold ${
            room.status === 'finished'
              ? room.winner === mySymbol
                ? 'bg-emerald-50 text-emerald-700'
                : room.winner === 'draw'
                ? 'bg-amber-50 text-amber-700'
                : 'bg-red-50 text-red-600'
              : 'bg-cream text-ink'
          }`}>
            <span>{statusLabel}</span>
            {isMyTurn && room.status === 'playing' && room.player_o && (
              <span className={`font-mono text-[15px] font-black tabular-nums ${timerDanger ? 'text-red-500 animate-pulse' : 'text-ink/50'}`}>
                {timeLeft}s
              </span>
            )}
          </div>
        </div>

        {/* Waiting hint */}
        {room.status === 'waiting' && mySymbol === 'X' && (
          <div className="w-full bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-[13px] text-amber-800 text-center">
            {t('waiting_hint', { code: room.room_code })}
          </div>
        )}

        {connState === 'reconnecting' && room.status === 'playing' && (
          <p className="text-[13px] text-amber-700 bg-amber-50 px-4 py-2 rounded-xl border border-amber-200 w-full text-center flex items-center justify-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            {t('reconnecting')}
          </p>
        )}

        {error && (
          <p className="text-[13px] text-red-600 bg-red-50 px-4 py-2 rounded-xl border border-red-100 w-full text-center">
            {error}
          </p>
        )}

        {/* Board */}
        <div className="overflow-x-auto w-full flex justify-center pb-1">
          <div
            className={`inline-grid border-2 rounded-xl select-none shadow-md ${
              room.status === 'finished' ? 'border-line/60'
              : timerDanger ? 'border-red-400'
              : isMyTurn ? 'border-rose/50'
              : 'border-line'
            }`}
            style={{ gridTemplateColumns: `repeat(${SIZE}, 1fr)`, background: '#f0d4a0' }}
          >
            {Array.from({ length: 225 }, (_, i) => {
              const cell = i === pendingCell && !board[i] ? mySymbol : board[i]
              const isWin = winCells.has(i)
              // Highlight the undo-able cell (last move, if canUndo)
              const canClick = isMyTurn && !board[i] && i !== pendingCell && room.status === 'playing'
              return (
                <button
                  key={i}
                  onClick={() => handleClick(i)}
                  disabled={!canClick || isPending}
                  className={`w-9 h-9 sm:w-10 sm:h-10 border border-[#c8a870]/50 flex items-center justify-center transition-colors
                    ${isWin ? 'bg-yellow-300' : ''}
                    ${canClick ? 'hover:bg-rose/20 cursor-pointer' : 'cursor-default'}
                    ${i === pendingCell ? 'opacity-50' : ''}
                  `}
                >
                  {cell === 'X' && <span className="font-black text-[17px] sm:text-[20px] text-blue-700 leading-none select-none">✕</span>}
                  {cell === 'O' && <span className="font-black text-[17px] sm:text-[20px] text-rose leading-none select-none">○</span>}
                </button>
              )
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 flex-wrap justify-center">

          {room.status === 'playing' && mySymbol && (
            <button
              onClick={handleSurrender}
              disabled={isPending}
              className="text-[13px] font-semibold px-5 py-2.5 rounded-xl border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 transition-all disabled:opacity-50"
            >
              {t('surrender')}
            </button>
          )}
          {room.status === 'finished' && (
            <a
              href="/games/caro"
              className="inline-flex items-center gap-2 text-[13.5px] font-semibold px-5 py-2.5 rounded-xl bg-rose text-white hover:bg-rose-deep transition-all shadow-[0_2px_12px_-2px_rgba(194,24,91,0.4)]"
            >
              {t('play_again')}
            </a>
          )}
          <a
            href="/games/caro"
            className="text-[13px] font-medium px-5 py-2.5 rounded-xl border border-line text-muted hover:bg-line transition-all"
          >
            {t('back_lobby')}
          </a>
        </div>
      </div>

      {/* ── RIGHT: chat ─────────────────────────────────────────────────── */}
      <div className="w-full lg:w-[300px] lg:flex-none lg:sticky lg:top-[80px]" style={{ height: 'clamp(360px, 60vh, 560px)' }}>
        <CaroChat
          roomId={room.id}
          userId={userId}
          mySymbol={mySymbol}
          myName={myName}
        />
      </div>
    </div>
    </>
  )
}

// ── PlayerCard ────────────────────────────────────────────────────────────────
function PlayerCard({
  symbol, name, active, winner,
}: {
  symbol: 'X' | 'O'
  name: string | null
  active: boolean
  winner: boolean
}) {
  const t = useTranslations('games.caro')
  const isX = symbol === 'X'
  return (
    <div className={`flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-all ${
      active
        ? isX ? 'border-blue-300 bg-blue-50 shadow-sm' : 'border-rose/40 bg-rose/5 shadow-sm'
        : 'border-line bg-cream/50'
    }`}>
      <span className={`text-[18px] font-black flex-none ${isX ? 'text-blue-600' : 'text-rose'}`}>
        {isX ? '✕' : '○'}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-muted/50">{isX ? t('player_x_label') : t('player_o_label')}</p>
        <p className="text-[13px] font-semibold text-ink truncate">
          {name ?? <span className="text-muted/40 italic text-[12px]">{t('waiting_player')}</span>}
        </p>
      </div>
      {active && (
        <span className={`ml-auto text-[9.5px] font-bold px-1.5 py-0.5 rounded-full flex-none ${
          isX ? 'bg-blue-500 text-white' : 'bg-rose text-white'
        }`}>
          {t('turn_badge')}
        </span>
      )}
      {winner && <span className="ml-auto text-[16px] flex-none">🏆</span>}
    </div>
  )
}
